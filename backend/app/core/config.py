import os

BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
APP_DATA_DIR = os.environ.get("APP_DATA_DIR", os.path.join(os.getcwd(), "data"))
LOG_DIR = os.environ.get("LOG_DIR", os.path.join(APP_DATA_DIR, "logs"))
BACKEND_WORKERS = int(os.environ.get("BACKEND_WORKERS", "2"))
SESSION_MAX_MESSAGES = int(os.environ.get("CLAUDE_SESSION_MAX_MESSAGES", "20"))
SESSION_MAX_CHARS = int(os.environ.get("CLAUDE_SESSION_MAX_CHARS", "12000"))
SESSION_OUTPUT_LINES = int(os.environ.get("CLAUDE_SESSION_OUTPUT_LINES", "200"))

DB_PATH = os.path.join(APP_DATA_DIR, "index.db")

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_PORT_MIN = int(os.environ.get("GOOGLE_REDIRECT_PORT_MIN", "49800"))
GOOGLE_REDIRECT_PORT_MAX = int(os.environ.get("GOOGLE_REDIRECT_PORT_MAX", "49899"))


def ensure_dirs() -> None:
    os.makedirs(APP_DATA_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)

