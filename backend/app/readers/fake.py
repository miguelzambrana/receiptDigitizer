from app.schemas import ReceiptData

class FakeReader:
    name = "fake"
    def __init__(self, payload: ReceiptData):
        self._payload = payload
    def extract(self, image_bytes: bytes) -> ReceiptData:
        return self._payload
