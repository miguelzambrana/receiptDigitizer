from app.readers.factory import get_reader
from app.schemas import ReceiptData, ItemData

def test_fake_reader_from_factory():
    reader = get_reader("fake")
    out = reader.extract(b"ignored")
    assert isinstance(out, ReceiptData)
    assert out.store is not None
    assert len(out.items) >= 1
