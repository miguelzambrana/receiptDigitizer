import hashlib
from pathlib import Path
from app.config import settings

def save_image(image_bytes: bytes, ext: str = "jpg") -> str:
    digest = hashlib.sha256(image_bytes).hexdigest()[:16]
    root = Path(settings.storage_dir)
    root.mkdir(parents=True, exist_ok=True)
    name = f"{digest}.{ext}"
    (root / name).write_bytes(image_bytes)
    return name

def read_image(path: str) -> bytes:
    return (Path(settings.storage_dir) / path).read_bytes()
