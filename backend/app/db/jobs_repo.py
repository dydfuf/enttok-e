import json
import uuid
from typing import Any, Dict, List, Optional

from app.db.connection import execute, fetchall, fetchone
from app.utils.time import utc_now


def _row_to_job(row: Any) -> Dict[str, Any]:
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


async def create_job(job_type: str, payload: Dict[str, Any]) -> str:
    job_id = f"job_{uuid.uuid4().hex}"
    now = utc_now()
    await execute(
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
    await execute(
        f"update jobs set {', '.join(columns)} where job_id = ?",
        tuple(values),
    )


async def fetch_job(job_id: str) -> Optional[Dict[str, Any]]:
    row = await fetchone("select * from jobs where job_id = ?", (job_id,))
    if row is None:
        return None
    return _row_to_job(row)


async def fetch_jobs(limit: int = 200) -> List[Dict[str, Any]]:
    rows = await fetchall(
        "select * from jobs order by created_at desc limit ?", (limit,)
    )
    return [_row_to_job(row) for row in rows]


async def record_event(
    job_id: str, level: str, message: str, meta: Optional[Dict[str, Any]] = None
) -> None:
    await execute(
        """
        insert into job_events (job_id, created_at, level, message, meta_json)
        values (?, ?, ?, ?, ?)
        """,
        (job_id, utc_now(), level, message, json.dumps(meta) if meta else None),
    )
