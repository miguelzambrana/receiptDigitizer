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

def test_minicpm_raises_on_non_json_response(monkeypatch):
    request = httpx.Request("POST", "http://localhost:11434/api/generate")
    def fake_post(self, url, **kw):
        return httpx.Response(200, json={"response": "here is your receipt: ..."}, request=request)
    monkeypatch.setattr(httpx.Client, "post", fake_post)
    with pytest.raises(ReaderError):
        MiniCPMReader().extract(b"img")

def test_minicpm_raises_on_top_level_array(monkeypatch):
    request = httpx.Request("POST", "http://localhost:11434/api/generate")
    def fake_post(self, url, **kw):
        return httpx.Response(200, json={"response": json.dumps([{"store": "Lidl"}])}, request=request)
    monkeypatch.setattr(httpx.Client, "post", fake_post)
    with pytest.raises(ReaderError):
        MiniCPMReader().extract(b"img")

def test_minicpm_raises_on_items_as_strings(monkeypatch):
    payload = {"store": "Lidl", "items": ["AGUA", "PROMO"]}
    request = httpx.Request("POST", "http://localhost:11434/api/generate")
    def fake_post(self, url, **kw):
        return httpx.Response(200, json={"response": json.dumps(payload)}, request=request)
    monkeypatch.setattr(httpx.Client, "post", fake_post)
    with pytest.raises(ReaderError):
        MiniCPMReader().extract(b"img")

def test_minicpm_raises_clear_error_on_truncated_output(monkeypatch):
    # Ollama reports done_reason "length" when it hit num_predict: the JSON is
    # cut off mid-object. We should surface a clear message, not a cryptic parse
    # error, and never attempt to parse the truncated body.
    request = httpx.Request("POST", "http://localhost:11434/api/generate")
    def fake_post(self, url, **kw):
        return httpx.Response(
            200,
            json={"response": '{"store":"Lidl","items":[{"name":"AGUA","total_pri',
                  "done_reason": "length"},
            request=request,
        )
    monkeypatch.setattr(httpx.Client, "post", fake_post)
    with pytest.raises(ReaderError) as exc:
        MiniCPMReader().extract(b"img")
    msg = str(exc.value).lower()
    assert "truncated" in msg or "too long" in msg
