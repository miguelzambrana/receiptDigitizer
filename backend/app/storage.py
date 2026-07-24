import hashlib
import re
from pathlib import Path
from app.config import settings

def save_image(image_bytes: bytes, ext: str = "jpg") -> str:
    digest = hashlib.sha256(image_bytes).hexdigest()[:16]
    safe_ext = re.sub(r"[^a-z0-9]", "", ext.lower()) or "jpg"
    root = Path(settings.storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    name = f"{digest}.{safe_ext}"
    (root / name).write_bytes(image_bytes)
    return name

def read_image(path: str) -> bytes:
    if "/" in path or "\\" in path or ".." in path:
        raise ValueError(f"Invalid path: {path!r}")
    root = Path(settings.storage_dir).resolve()
    candidate = (root / path).resolve()
    if candidate.parent != root:
        raise ValueError(f"Invalid path: {path!r}")
    return candidate.read_bytes()
