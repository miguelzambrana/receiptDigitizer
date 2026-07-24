import json
import httpx
import pytest
from app.readers.minicpm import MiniCPMReader
from app.readers.base import ReaderError

def _resp(payload):
    request = httpx.Request("POST", "http://localhost:11434/api/generate")
    return httpx.Response(200, json={"response": json.dumps(payload)}, request=request)

def test_minicpm_parses_and_normalizes(monkeypatch):
    payload = {"store": "Lidl", "date": "01/02/26", "currency": "EUR",
               "total": "63,28",
               "items": [{"name": "AGUA", "total_price": "1,34"},
                         {"name": "PROMO", "total_price": "-0,10"}]}
    def fake_post(self, url, **kw):
        return _resp(payload)
    monkeypatch.setattr(httpx.Client, "post", fake_post)
    out = MiniCPMReader().extract(b"img")
    assert out.store == "Lidl"
    assert out.total == 63.28
    assert out.items[0].total_price == 1.34
    assert out.items[1].total_price == -0.10

def test_minicpm_raises_on_http_error(monkeypatch):
    def boom(self, url, **kw):
        raise httpx.ConnectError("no server")
    monkeypatch.setattr(httpx.Client, "post", boom)
    with pytest.raises(ReaderError):
        MiniCPMReader().extract(b"img")
