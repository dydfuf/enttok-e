from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional, TypedDict

from fastapi import Depends, FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
APP_DATA_DIR = os.environ.get("APP_DATA_DIR", os.path.join(os.getcwd(), "data"))
LOG_DIR = os.environ.get("LOG_DIR", os.path.join(APP_DATA_DIR, "logs"))
BACKEND_WORKERS = int(os.environ.get("BACKEND_WORKERS", "2"))
SESSION_MAX_MESSAGES = int(os.environ.get("CLAUDE_SESSION_MAX_MESSAGES", "20"))
SESSION_MAX_CHARS = int(os.environ.get("CLAUDE_SESSION_MAX_CHARS", "12000"))
SESSION_OUTPUT_LINES = int(os.environ.get("CLAUDE_SESSION_OUTPUT_LINES", "200"))

os.makedirs(APP_DATA_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

DB_PATH = os.path.join(APP_DATA_DIR, "index.db")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("enttok-backend")


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


class JobCreate(BaseModel):
    type: str = Field(..., min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobRecord(BaseModel):
    job_id: str
    type: str
    status: str
    created_at: str
    updated_at: str
    progress: Optional[float] = None
    message: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None


class ClaudeSpawnRequest(BaseModel):
    args: List[str] = Field(default_factory=list)
    prompt: Optional[str] = None
    stdin: Optional[str] = None
    session_id: Optional[str] = None
    timeout_ms: Optional[int] = None


class ClaudeSessionResponse(BaseModel):
    session_id: str


app = FastAPI(title="Enttok Backend", version="0.1.0")

connections: set[WebSocket] = set()
job_queue: asyncio.Queue[str] = asyncio.Queue()
active_jobs: set[str] = set()
started_at = time.time()

db_lock = asyncio.Lock()
db_conn: sqlite3.Connection | None = None


class SessionMessage(TypedDict):
    role: str
    content: str


session_lock = asyncio.Lock()
sessions: Dict[str, List[SessionMessage]] = {}


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        create table if not exists jobs (
          job_id text primary key,
          type text not null,
          status text not null,
          created_at text not null,
          updated_at text not null,
          progress real,
          message text,
          payload_json text,
          result_json text,
          error_json text
        );
        """
    )
    conn.execute(
        """
        create table if not exists job_events (
          event_id integer primary key,
          job_id text not null,
          created_at text not null,
          level text not null,
          message text not null,
          meta_json text
        );
        """
    )
    conn.execute(
        """
        create table if not exists sync_state (
          connector text primary key,
          cursor text,
          last_sync_at text
        );
        """
    )
    conn.commit()


def row_to_job(row: sqlite3.Row) -> Dict[str, Any]:
    return {
        "job_id": row["job_id"],
        "type": row["type"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "progress": row["progress"],
        "message": row["message"],
        "payload": json.loads(row["payload_json"]) if row["payload_json"] else {},
        "result": json.loads(row["result_json"]) if row["result_json"] else None,
        "error": json.loads(row["error_json"]) if row["error_json"] else None,
    }


async def db_execute(query: str, params: tuple[Any, ...] = ()) -> None:
    async with db_lock:
        await asyncio.to_thread(_db_execute_sync, query, params)


def _db_execute_sync(query: str, params: tuple[Any, ...]) -> None:
    if db_conn is None:
        raise RuntimeError("database not initialized")
    db_conn.execute(query, params)
    db_conn.commit()


async def db_fetchone(
    query: str, params: tuple[Any, ...] = ()
) -> Optional[sqlite3.Row]:
    async with db_lock:
        return await asyncio.to_thread(_db_fetchone_sync, query, params)


def _db_fetchone_sync(
    query: str, params: tuple[Any, ...]
) -> Optional[sqlite3.Row]:
    if db_conn is None:
        raise RuntimeError("database not initialized")
    cur = db_conn.execute(query, params)
    return cur.fetchone()


async def db_fetchall(
    query: str, params: tuple[Any, ...] = ()
) -> List[sqlite3.Row]:
    async with db_lock:
        return await asyncio.to_thread(_db_fetchall_sync, query, params)


def _db_fetchall_sync(
    query: str, params: tuple[Any, ...]
) -> List[sqlite3.Row]:
    if db_conn is None:
        raise RuntimeError("database not initialized")
    cur = db_conn.execute(query, params)
    return cur.fetchall()


async def create_job(job_type: str, payload: Dict[str, Any]) -> str:
    job_id = f"job_{uuid.uuid4().hex}"
    now = utc_now()
    await db_execute(
        """
        insert into jobs (
          job_id, type, status, created_at, updated_at, progress, message,
          payload_json, result_json, error_json
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            job_id,
            job_type,
            "queued",
            now,
            now,
            None,
            None,
            json.dumps(payload),
            None,
            None,
        ),
    )
    return job_id


async def update_job(job_id: str, **fields: Any) -> None:
    if not fields:
        return
    fields["updated_at"] = utc_now()
    columns = []
    values: List[Any] = []
    for key, value in fields.items():
        if key in {"payload", "result", "error"}:
            columns.append(f"{key}_json = ?")
            values.append(json.dumps(value) if value is not None else None)
        else:
            columns.append(f"{key} = ?")
            values.append(value)
    values.append(job_id)
    await db_execute(
        f"update jobs set {', '.join(columns)} where job_id = ?",
        tuple(values),
    )


async def fetch_job(job_id: str) -> Optional[Dict[str, Any]]:
    row = await db_fetchone("select * from jobs where job_id = ?", (job_id,))
    if row is None:
        return None
    return row_to_job(row)


async def fetch_jobs(limit: int = 200) -> List[Dict[str, Any]]:
    rows = await db_fetchall(
        "select * from jobs order by created_at desc limit ?", (limit,)
    )
    return [row_to_job(row) for row in rows]


async def record_event(
    job_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None
) -> None:
    await db_execute(
        """
        insert into job_events (job_id, created_at, level, message, meta_json)
        values (?, ?, ?, ?, ?)
        """,
        (job_id, utc_now(), level, message, json.dumps(meta) if meta else None),
    )


async def broadcast(payload: Dict[str, Any]) -> None:
    dead: List[WebSocket] = []
    for conn in connections:
        try:
            await conn.send_json(payload)
        except RuntimeError:
            dead.append(conn)
    for conn in dead:
        connections.discard(conn)


async def emit_log(level: str, message: str, meta: Optional[Dict[str, Any]] = None):
    log_message = message.strip()
    if not log_message:
        return
    if level == "error":
        logger.error(log_message)
    elif level == "warn":
        logger.warning(log_message)
    else:
        logger.info(log_message)
    await broadcast(
        {
            "type": "log",
            "level": level,
            "message": log_message,
            "timestamp": utc_now(),
            "meta": meta,
        }
    )


async def process_job(job_id: str) -> None:
    job = await fetch_job(job_id)
    if not job:
        return
    if job["status"] == "canceled":
        return

    if job["type"] == "claude.spawn":
        await run_claude_job(job_id, job.get("payload", {}))
        return

    await update_job(job_id, status="running", progress=0.0)
    await broadcast(
        {"type": "job.status", "job_id": job_id, "status": "running"}
    )

    try:
        payload = job.get("payload", {})
        duration_ms = payload.get("simulate_ms", 0)
        duration = max(0.0, float(duration_ms) / 1000.0)
        steps = 1 if duration <= 0 else min(5, max(1, int(duration / 0.2)))
        for step in range(steps):
            if duration > 0:
                await asyncio.sleep(duration / steps)
            progress = round((step + 1) / steps, 2)
            await update_job(
                job_id, progress=progress, message=f"progress {progress:.2f}"
            )
            await broadcast(
                {
                    "type": "job.progress",
                    "job_id": job_id,
                    "progress": progress,
                }
            )

        await update_job(job_id, status="succeeded", progress=1.0)
        await record_event(job_id, "info", "job completed")
        await broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    except Exception as exc:  # pragma: no cover - safety net
        await update_job(
            job_id,
            status="failed",
            error={"message": str(exc)},
        )
        await record_event(job_id, "error", "job failed", {"error": str(exc)})
        await broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )


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
        await emit_log(level, f"{prefix}{text}")
        collector.append(text)
        if len(collector) > limit:
            collector.pop(0)


async def get_session_messages(session_id: str) -> List[SessionMessage]:
    async with session_lock:
        return list(sessions.get(session_id, []))


async def append_session_message(
    session_id: str, role: str, content: str
) -> None:
    if not content.strip():
        return
    async with session_lock:
        messages = sessions.setdefault(session_id, [])
        messages.append({"role": role, "content": content})
        while len(messages) > SESSION_MAX_MESSAGES:
            messages.pop(0)
        total_chars = sum(len(msg["content"]) for msg in messages)
        while total_chars > SESSION_MAX_CHARS and messages:
            removed = messages.pop(0)
            total_chars -= len(removed["content"])


def format_session_prompt(
    history: List[SessionMessage], prompt: str
) -> str:
    transcript: List[str] = []
    for message in history:
        role_label = "User" if message["role"] == "user" else "Assistant"
        transcript.append(f"{role_label}: {message['content']}")
    transcript.append(f"User: {prompt}")
    return "\n\n".join(transcript)


async def run_claude_job(job_id: str, payload: Dict[str, Any]) -> None:
    claude_path = resolve_claude_path()
    if not claude_path:
        await update_job(
            job_id,
            status="failed",
            error={"message": "claude cli not found"},
        )
        await record_event(job_id, "error", "claude cli not found")
        await broadcast(
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
        await update_job(
            job_id,
            status="failed",
            error={"message": "no args provided for claude cli"},
        )
        await record_event(job_id, "error", "claude cli args missing")
        await broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
        return

    timeout_ms = payload.get("timeout_ms")
    timeout_sec = None if timeout_ms is None else max(timeout_ms / 1000.0, 1.0)
    stdin_payload = payload.get("stdin")

    await update_job(job_id, status="running", progress=0.05, message="spawning")
    await broadcast({"type": "job.status", "job_id": job_id, "status": "running"})

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
        await update_job(
            job_id,
            status="failed",
            error={"message": "claude cli timeout"},
        )
        await record_event(job_id, "error", "claude cli timeout")
        await broadcast(
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
        await update_job(
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
        await record_event(job_id, "info", "claude cli finished")
        await broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    else:
        await update_job(
            job_id,
            status="failed",
            error={
                "message": "claude cli failed",
                "exit_code": exit_code,
                "stdout_tail": stdout_tail,
                "stderr_tail": stderr_tail,
            },
        )
        await record_event(job_id, "error", "claude cli failed")
        await broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )


async def worker_loop(worker_id: int) -> None:
    await emit_log("info", f"worker {worker_id} ready")
    while True:
        job_id = await job_queue.get()
        active_jobs.add(job_id)
        try:
            job = await fetch_job(job_id)
            if not job or job["status"] == "canceled":
                await emit_log("info", f"job {job_id} canceled")
            else:
                await process_job(job_id)
        finally:
            active_jobs.discard(job_id)
            job_queue.task_done()


async def verify_token(request: Request) -> None:
    if BACKEND_TOKEN and request.headers.get("X-Backend-Token") != BACKEND_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


async def verify_ws_token(websocket: WebSocket) -> bool:
    if BACKEND_TOKEN and websocket.headers.get("x-backend-token") != BACKEND_TOKEN:
        await websocket.close(code=1008)
        return False
    return True


@app.on_event("startup")
async def on_startup() -> None:
    global db_conn
    db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    db_conn.row_factory = sqlite3.Row
    init_db(db_conn)
    for worker_id in range(BACKEND_WORKERS):
        asyncio.create_task(worker_loop(worker_id))
    await emit_log("info", "backend started")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    if db_conn:
        db_conn.close()


@app.get("/health")
async def health(_: None = Depends(verify_token)) -> Dict[str, Any]:
    return {"status": "ok", "time": utc_now()}


@app.get("/status")
async def status(_: None = Depends(verify_token)) -> Dict[str, Any]:
    return {
        "uptime_sec": int(time.time() - started_at),
        "queue_depth": job_queue.qsize(),
        "workers": {
            "active": len(active_jobs),
            "idle": max(BACKEND_WORKERS - len(active_jobs), 0),
        },
        "scheduler": {"running": False, "jobs": 0},
    }


@app.post("/jobs", response_model=JobResponse)
async def create_job_api(
    request: JobCreate, _: None = Depends(verify_token)
) -> JobResponse:
    job_id = await create_job(request.type, request.payload)
    await job_queue.put(job_id)
    await emit_log("info", f"job queued {job_id} ({request.type})")
    return JobResponse(job_id=job_id, status="queued")


@app.post("/claude/spawn", response_model=JobResponse)
async def spawn_claude_api(
    request: ClaudeSpawnRequest, _: None = Depends(verify_token)
) -> JobResponse:
    payload = request.model_dump()
    job_id = await create_job("claude.spawn", payload)
    await job_queue.put(job_id)
    await emit_log("info", f"claude job queued {job_id}")
    return JobResponse(job_id=job_id, status="queued")


@app.post("/claude/session", response_model=ClaudeSessionResponse)
async def create_claude_session(
    _: None = Depends(verify_token),
) -> ClaudeSessionResponse:
    session_id = f"session_{uuid.uuid4().hex}"
    async with session_lock:
        sessions[session_id] = []
    await emit_log("info", f"claude session created {session_id}")
    return ClaudeSessionResponse(session_id=session_id)


@app.get("/jobs")
async def list_jobs(_: None = Depends(verify_token)) -> Dict[str, Any]:
    return {"jobs": await fetch_jobs()}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str, _: None = Depends(verify_token)) -> Dict[str, Any]:
    job = await fetch_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, _: None = Depends(verify_token)) -> Dict[str, Any]:
    job = await fetch_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job["status"] in {"succeeded", "failed"}:
        return {"job_id": job_id, "status": job["status"]}
    await update_job(job_id, status="canceled")
    await record_event(job_id, "info", "job canceled")
    await broadcast({"type": "job.status", "job_id": job_id, "status": "canceled"})
    return {"job_id": job_id, "status": "canceled"}


@app.websocket("/events")
async def events(websocket: WebSocket) -> None:
    if not await verify_ws_token(websocket):
        return
    await websocket.accept()
    connections.add(websocket)
    await websocket.send_json({"type": "connected", "timestamp": utc_now()})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        connections.discard(websocket)


def run() -> None:
    import uvicorn

    port = int(os.environ.get("BACKEND_PORT", "49671"))
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    run()
