from datetime import datetime, timezone
import re
import time


_OFFSET_NO_COLON = re.compile(r"([+-])(\d{2})(\d{2})$")


def utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def parse_iso_to_epoch(value: str) -> int:
    normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
    if _OFFSET_NO_COLON.search(normalized):
        normalized = _OFFSET_NO_COLON.sub(r"\1\2:\3", normalized)
    if len(normalized) == 10:
        normalized = f"{normalized}T00:00:00+00:00"
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())
