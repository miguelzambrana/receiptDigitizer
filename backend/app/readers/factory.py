from app.config import settings
from app.schemas import ReceiptData, ItemData
from app.readers.base import ReceiptReader
from app.readers.fake import FakeReader

_CANNED = ReceiptData(
    store="Centros Comerciales Carrefour S.A.", country="ES", currency="EUR",
    date_text="21/07/26", total=45.53,
    items=[ItemData(raw_name="CARNE VIEIRA 320 G", total_price=13.49)],
)

def get_reader(engine: str | None = None) -> ReceiptReader:
    engine = engine or settings.reader_engine
    if engine == "fake":
        return FakeReader(_CANNED)
    if engine == "minicpm":
        from app.readers.minicpm import MiniCPMReader
        return MiniCPMReader()
    raise ValueError(f"unknown reader engine: {engine}")
