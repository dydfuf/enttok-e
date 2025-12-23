import os

BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
APP_DATA_DIR = os.environ.get("APP_DATA_DIR", os.path.join(os.getcwd(), "data"))
LOG_DIR = os.environ.get("LOG_DIR", os.path.join(APP_DATA_DIR, "logs"))
BACKEND_WORKERS = int(os.environ.get("BACKEND_WORKERS", "2"))
SESSION_MAX_MESSAGES = int(os.environ.get("CLAUDE_SESSION_MAX_MESSAGES", "20"))
SESSION_MAX_CHARS = int(os.environ.get("CLAUDE_SESSION_MAX_CHARS", "12000"))
SESSION_OUTPUT_LINES = int(os.environ.get("CLAUDE_SESSION_OUTPUT_LINES", "200"))

DB_PATH = os.path.join(APP_DATA_DIR, "index.db")


def ensure_dirs() -> None:
    os.makedirs(APP_DATA_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)

