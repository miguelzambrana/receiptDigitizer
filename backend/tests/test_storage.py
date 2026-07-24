from app.storage import save_image, read_image

def test_save_and_read_roundtrip(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    p = save_image(b"hello-bytes")
    assert read_image(p) == b"hello-bytes"
