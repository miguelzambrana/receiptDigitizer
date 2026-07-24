import pytest

from app.storage import save_image, read_image

def test_save_and_read_roundtrip(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    p = save_image(b"hello-bytes")
    assert read_image(p) == b"hello-bytes"

def test_read_image_rejects_parent_traversal(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    with pytest.raises(ValueError):
        read_image("../etc/passwd")

def test_read_image_rejects_deeper_parent_traversal(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    with pytest.raises(ValueError):
        read_image("../../secrets")

def test_save_image_sanitizes_malicious_ext(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    name = save_image(b"x", ext="../../evil")
    assert "/" not in name
    assert ".." not in name
    assert (tmp_path / name).exists()
    assert (tmp_path / name).resolve().parent == tmp_path.resolve()

def test_save_image_is_deterministic(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    first = save_image(b"same-bytes")
    second = save_image(b"same-bytes")
    assert first == second

def test_save_image_creates_nested_missing_storage_dir(tmp_path, monkeypatch):
    from app.config import settings
    nested = tmp_path / "sub" / "dir"
    monkeypatch.setattr(settings, "storage_dir", str(nested))
    name = save_image(b"nested-bytes")
    assert (nested / name).read_bytes() == b"nested-bytes"
