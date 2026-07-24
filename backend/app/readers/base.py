from typing import Protocol
from app.schemas import ReceiptData

class ReaderError(Exception):
    pass

class ReceiptReader(Protocol):
    name: str
    def extract(self, image_bytes: bytes) -> ReceiptData: ...
