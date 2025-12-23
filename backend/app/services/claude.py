import asyncio
import os
import shutil
import time
from typing import Any, Dict, List, Optional

from app.core.config import SESSION_OUTPUT_LINES
from app.db import jobs_repo
from app.services.sessions import (
    append_session_message,
    format_session_prompt,
    get_session_messages,
)
from app.websocket.manager import manager


def resolve_claude_path() -> Optional[str]:
    cli_path = os.environ.get("CLAUDE_CODE_CLI_PATH")
    if cli_path and os.path.exists(cli_path):
        return cli_path
    return shutil.which("claude")


async def read_stream_lines(
    stream: asyncio.StreamReader,
    level: str,
    prefix: str,
    collector: List[str],
    limit: int,
) -> None:
    while True:
        line = await stream.readline()
        if not line:
            break
        text = line.decode(errors="replace").rstrip()
        await manager.emit_log(level, f"{prefix}{text}")
        collector.append(text)
        if len(collector) > limit:
            collector.pop(0)


async def run_claude_job(job_id: str, payload: Dict[str, Any]) -> None:
    claude_path = resolve_claude_path()
    if not claude_path:
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": "claude cli not found"},
        )
        await jobs_repo.record_event(job_id, "error", "claude cli not found")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
        return

    session_id = payload.get("session_id")
    args = payload.get("args") or []
    raw_prompt = payload.get("prompt")
    prompt = raw_prompt
    if session_id and raw_prompt:
        history = await get_session_messages(session_id)
        prompt = format_session_prompt(history, raw_prompt)
    if prompt and not args:
        args = ["--print", prompt]
    if not args:
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": "no args provided for claude cli"},
        )
        await jobs_repo.record_event(job_id, "error", "claude cli args missing")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
        return

    timeout_ms = payload.get("timeout_ms")
    timeout_sec = None if timeout_ms is None else max(timeout_ms / 1000.0, 1.0)
    stdin_payload = payload.get("stdin")

    await jobs_repo.update_job(
        job_id, status="running", progress=0.05, message="spawning"
    )
    await manager.broadcast(
        {"type": "job.status", "job_id": job_id, "status": "running"}
    )

    stdout_lines: List[str] = []
    stderr_lines: List[str] = []
    started = time.time()

    process = await asyncio.create_subprocess_exec(
        claude_path,
        *args,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        env=os.environ.copy(),
    )

    if stdin_payload:
        process.stdin.write(stdin_payload.encode())
        await process.stdin.drain()
    if process.stdin:
        process.stdin.close()

    stdout_task = asyncio.create_task(
        read_stream_lines(
            process.stdout, "info", "claude: ", stdout_lines, SESSION_OUTPUT_LINES
        )
    )
    stderr_task = asyncio.create_task(
        read_stream_lines(
            process.stderr, "error", "claude: ", stderr_lines, SESSION_OUTPUT_LINES
        )
    )

    try:
        if timeout_sec:
            await asyncio.wait_for(process.wait(), timeout=timeout_sec)
        else:
            await process.wait()
    except asyncio.TimeoutError:
        process.kill()
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": "claude cli timeout"},
        )
        await jobs_repo.record_event(job_id, "error", "claude cli timeout")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
        return
    finally:
        await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

    duration_ms = int((time.time() - started) * 1000)
    exit_code = process.returncode
    stdout_tail = stdout_lines[-50:] if stdout_lines else []
    stderr_tail = stderr_lines[-50:] if stderr_lines else []
    if exit_code == 0:
        if session_id and raw_prompt:
            assistant_output = "\n".join(stdout_lines).strip()
            await append_session_message(session_id, "user", raw_prompt)
            await append_session_message(session_id, "assistant", assistant_output)
        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            result={
                "exit_code": exit_code,
                "duration_ms": duration_ms,
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
            },
        )
        await jobs_repo.record_event(job_id, "info", "claude cli finished")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    else:
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={
                "message": "claude cli failed",
                "exit_code": exit_code,
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
            },
        )
        await jobs_repo.record_event(job_id, "error", "claude cli failed")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )

