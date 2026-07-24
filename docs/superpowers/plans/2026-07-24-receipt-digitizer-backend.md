# Receipt Digitizer — Backend Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A FastAPI backend that takes a photographed supermarket receipt, preprocesses it, extracts structured line-item data with a pluggable local VLM (MiniCPM-V via Ollama), lets the client correct it, and persists it — writing a `price_observations` row per confirmed item so the price-history dataset builds from day one.

**Architecture:** Sync FastAPI app. An upload endpoint stores the image and kicks off extraction in a background task (preprocess → reader → validate). The client polls for the draft, corrects it, and confirms; confirmation persists the receipt, its items, and price observations. The reader is behind a `ReceiptReader` interface so the engine is a config switch.

**Tech Stack:** Python 3.10+, FastAPI, Uvicorn, SQLAlchemy 2.0 (ORM), Alembic, Pydantic v2, SQLite (file-based, local prototype), httpx (Ollama client), Pillow + numpy (preprocessing), pytest.

## Global Constraints

- Python **3.10+** (target 3.10 — available on the dev machine).
- Database is **SQLite** (file-based, `sqlite:///./data/receipts.db`) for the local prototype — no server, no sudo. Use portable SQLAlchemy types (generic `JSON`, not Postgres `JSONB`) so switching to Postgres later is only a connection-URL change.
- Ollama runs at **`http://localhost:11434`**; default reader model is **`minicpm-v`**.
- Reader engine is selected by env var **`READER_ENGINE`** (`minicpm` | `fake`); default `minicpm`.
- All monetary values stored as **`Numeric(10,2)`**; parsing must accept comma decimals (`45,53`) and normalize to dot.
- Data model is **locale-agnostic**: `currency`, `country`, `city` are fields, never hardcoded.
- Every endpoint that reads/writes user data depends on **`get_current_user`** (a stub seeded dev user until Task 14 replaces it with real auth). Write all endpoints user-scoped from the start.
- TDD: failing test first, minimal implementation, frequent commits. Pure-logic modules (preprocess, validation, readers-with-mock) must have **no DB dependency**.
- All code lives under **`backend/`**. Feature branch only — never commit on `main`/`master`.

---

## File Structure

```
backend/
  requirements.txt
  (no docker — SQLite file at ./data/receipts.db)
  .env.example
  alembic.ini                   # (added in Task 3)
  alembic/                      # migrations
  app/
    __init__.py
    config.py                   # Settings from env
    db.py                       # engine, SessionLocal, Base, get_db
    main.py                     # FastAPI app + router wiring
    models.py                   # SQLAlchemy models
    schemas.py                  # Pydantic: ItemData, ReceiptData, API DTOs
    numbers.py                  # normalize_number()
    preprocess.py               # rotate-upright + crop + resize
    validation.py               # reconcile(), normalize_receipt()
    storage.py                  # save/read receipt images
    readers/
      __init__.py
      base.py                   # ReceiptReader protocol + errors
      fake.py                   # FakeReader (deterministic, for tests)
      minicpm.py                # MiniCPMReader (Ollama)
      factory.py                # get_reader()
    services/
      __init__.py
      extraction.py             # run_extraction(receipt_id)
      persistence.py            # confirm_receipt(...)
      products.py               # find_or_create_product(...)
    deps.py                     # get_current_user (stub), get_reader dep
    api/
      __init__.py
      receipts.py               # POST /receipts, GET /receipts, GET /receipts/{id}, PUT /receipts/{id}
      products.py               # GET /products, GET /products/{id}/prices
      auth.py                   # (Task 14)
  eval/
    golden/                     # sample images + expected_*.json
    run_eval.py                 # accuracy harness
  tests/
    conftest.py                 # test DB, client, sample-image fixtures
    test_numbers.py
    test_preprocess.py
    test_validation.py
    test_readers_fake.py
    test_readers_minicpm.py     # httpx mocked — no GPU needed
    test_extraction_service.py
    test_persistence.py
    test_api_receipts.py
    test_api_products.py
    test_auth.py                # (Task 14)
```

---

### Task 1: Project scaffold, config, health endpoint

**Files:**
- Create: `backend/requirements.txt`, `backend/.env.example`, `backend/app/__init__.py`, `backend/app/config.py`, `backend/app/main.py`
- Test: `backend/tests/test_health.py`, `backend/tests/conftest.py`

**Interfaces:**
- Produces: `app.main:app` (FastAPI instance); `app.config.settings` with attrs `database_url: str`, `ollama_url: str`, `reader_engine: str`, `storage_dir: str`.

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.*
uvicorn[standard]==0.32.*
sqlalchemy==2.0.*
alembic==1.14.*
psycopg[binary]==3.2.*
pydantic==2.9.*
pydantic-settings==2.6.*
python-multipart==0.0.*
httpx==0.27.*
pillow==10.*
numpy==1.26.*
python-jose[cryptography]==3.3.*
passlib[bcrypt]==1.7.*
pytest==8.*
pytest-cov==5.*
```

- [ ] **Step 2: Write config.py**

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./data/receipts.db"
    ollama_url: str = "http://localhost:11434"
    reader_engine: str = "minicpm"
    reader_model: str = "minicpm-v"
    storage_dir: str = "./data/images"
    jwt_secret: str = "dev-secret-change-me"

settings = Settings()
```

- [ ] **Step 3: Write the failing health test**

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)
```
```python
# tests/test_health.py
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 4: Run it, verify it fails**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: FAIL (cannot import `app.main` / 404).

- [ ] **Step 5: Write main.py**

```python
from fastapi import FastAPI

app = FastAPI(title="Receipt Digitizer")

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 6: Run it, verify it passes**

Run: `cd backend && python -m pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/requirements.txt backend/.env.example backend/app backend/tests
git commit -m "feat(backend): scaffold FastAPI app with health check"
```

---

### Task 2: Database engine and session (SQLite)

**Files:**
- Create: `backend/app/db.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_db.py`

**Interfaces:**
- Produces: `app.db.Base` (DeclarativeBase); `app.db.engine`; `app.db.SessionLocal`; `app.db.get_db()` (FastAPI dependency yielding a `Session`).

- [ ] **Step 1: Force a separate test DB at the TOP of conftest.py (before any `from app...` import)**

The app defaults to `sqlite:///./data/receipts.db`; tests must not clobber it. `pydantic-settings` reads env at import time, so these two lines MUST be the very first lines of `tests/conftest.py`, above every existing import:

```python
# tests/conftest.py — MUST be the first two lines, above all app imports
import os
os.environ["DATABASE_URL"] = "sqlite:///./data/test.db"

# ...existing imports (from app.main import app, the client fixture, etc.) follow unchanged...
```

- [ ] **Step 2: Write db.py**

```python
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase, Session
from app.config import settings

class Base(DeclarativeBase):
    pass

# SQLite needs the parent dir to exist and cross-thread access (BackgroundTasks run in a thread)
if settings.database_url.startswith("sqlite:///"):
    Path(settings.database_url.replace("sqlite:///", "")).parent.mkdir(parents=True, exist_ok=True)
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 3: Write the failing test**

```python
# tests/test_db.py
from sqlalchemy import text
from app.db import engine

def test_db_connects():
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1
```

- [ ] **Step 4: Run the test**

Run: `cd backend && python -m pytest tests/test_db.py -v`
Expected: PASS (SQLite connects; `./data/test.db` is created).

- [ ] **Step 5: Commit**

```bash
git add backend/app/db.py backend/tests/conftest.py backend/tests/test_db.py
git commit -m "feat(backend): SQLite engine and SQLAlchemy session"
```

---

### Task 3: Data model + Alembic migration

**Files:**
- Create: `backend/app/models.py`, `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/versions/0001_initial.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Produces SQLAlchemy models with these columns (used by all later tasks):
  - `User(id: int, email: str unique, password_hash: str|None, created_at)`
  - `Store(id, chain_name: str, address: str|None, city: str|None, country: str|None, tax_id: str|None, created_at)`
  - `Product(id, normalized_name: str unique, display_name: str, brand: str|None, size: str|None, created_at)`
  - `Receipt(id, user_id fk, store_id fk|None, purchased_at: datetime|None, currency: str|None, subtotal: Numeric|None, tax_amount: Numeric|None, total: Numeric|None, image_path: str, source_engine: str|None, status: str, raw_extraction: JSON|None, created_at)` — `status` in {`processing`,`ready`,`failed`,`confirmed`}
  - `ReceiptItem(id, receipt_id fk, line_no: int, raw_name: str, product_id fk|None, quantity: Numeric|None, unit_price: Numeric|None, total_price: Numeric, is_discount: bool, tax_class: str|None)`
  - `PriceObservation(id, product_id fk, store_id fk|None, user_id fk, receipt_item_id fk, price: Numeric, currency: str|None, observed_at: datetime|None, created_at)`
- Test fixture `db_session` (function-scoped, creates all tables via `Base.metadata.create_all`, rolls back per test).

- [ ] **Step 1: Write models.py**

```python
from datetime import datetime
from sqlalchemy import String, Integer, ForeignKey, Numeric, Boolean, DateTime, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Store(Base):
    __tablename__ = "stores"
    id: Mapped[int] = mapped_column(primary_key=True)
    chain_name: Mapped[str] = mapped_column(String, index=True)
    address: Mapped[str | None] = mapped_column(String, nullable=True)
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    country: Mapped[str | None] = mapped_column(String, nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Product(Base):
    __tablename__ = "products"
    id: Mapped[int] = mapped_column(primary_key=True)
    normalized_name: Mapped[str] = mapped_column(String, unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String)
    brand: Mapped[str | None] = mapped_column(String, nullable=True)
    size: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Receipt(Base):
    __tablename__ = "receipts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True)
    purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    subtotal: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    tax_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    total: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    image_path: Mapped[str] = mapped_column(String)
    source_engine: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="processing", index=True)
    raw_extraction: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    items: Mapped[list["ReceiptItem"]] = relationship(cascade="all, delete-orphan")

class ReceiptItem(Base):
    __tablename__ = "receipt_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_id: Mapped[int] = mapped_column(ForeignKey("receipts.id"), index=True)
    line_no: Mapped[int] = mapped_column(Integer)
    raw_name: Mapped[str] = mapped_column(String)
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id"), nullable=True)
    quantity: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    unit_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    total_price: Mapped[float] = mapped_column(Numeric(10, 2))
    is_discount: Mapped[bool] = mapped_column(Boolean, default=False)
    tax_class: Mapped[str | None] = mapped_column(String, nullable=True)

class PriceObservation(Base):
    __tablename__ = "price_observations"
    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    store_id: Mapped[int | None] = mapped_column(ForeignKey("stores.id"), nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    receipt_item_id: Mapped[int] = mapped_column(ForeignKey("receipt_items.id"))
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    currency: Mapped[str | None] = mapped_column(String, nullable=True)
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

- [ ] **Step 2: Add the `db_session` fixture to conftest.py**

```python
# append to tests/conftest.py
import pytest
from app.db import Base, engine, SessionLocal
import app.models  # noqa: F401  (register models)

@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=engine)
```

- [ ] **Step 3: Write the failing test**

```python
# tests/test_models.py
from app.models import User, Receipt

def test_can_create_user_and_receipt(db_session):
    u = User(email="a@b.com")
    db_session.add(u); db_session.flush()
    r = Receipt(user_id=u.id, image_path="/x.jpg", status="processing")
    db_session.add(r); db_session.flush()
    assert r.id is not None
    assert r.status == "processing"
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd backend && python -m pytest tests/test_models.py -v`
Expected: PASS.

- [ ] **Step 5: Initialize Alembic and autogenerate the initial migration**

Run:
```bash
cd backend && alembic init -t generic alembic
```
Then edit `alembic/env.py` to set `target_metadata`:
```python
from app.db import Base
import app.models  # noqa
target_metadata = Base.metadata
from app.config import settings
config.set_main_option("sqlalchemy.url", settings.database_url)
```
Then: `alembic revision --autogenerate -m "initial" && alembic upgrade head`
Expected: migration `0001_*.py` created; `alembic upgrade head` succeeds.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/tests/conftest.py backend/tests/test_models.py backend/alembic.ini backend/alembic
git commit -m "feat(backend): data model and initial migration"
```

---

### Task 4: Number normalization

**Files:**
- Create: `backend/app/numbers.py`
- Test: `backend/tests/test_numbers.py`

**Interfaces:**
- Produces: `normalize_number(value) -> float | None`. Accepts `float`, `int`, or `str`; handles Spanish comma decimals (`"45,53"` → 45.53), thousands separators (`"1.234,50"` → 1234.50), leading/trailing spaces and currency symbols; returns `None` for unparseable/empty input.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_numbers.py
import pytest
from app.numbers import normalize_number

@pytest.mark.parametrize("raw,expected", [
    ("45,53", 45.53), ("1.234,50", 1234.50), ("29.00", 29.00),
    (45.53, 45.53), ("-0,10", -0.10), ("  1,20 €", 1.20),
    ("", None), (None, None), ("abc", None),
])
def test_normalize_number(raw, expected):
    assert normalize_number(raw) == expected
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_numbers.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement numbers.py**

```python
import re

def normalize_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    s = re.sub(r"[^\d,.\-]", "", s)   # drop currency symbols/letters/spaces
    if not re.search(r"\d", s):
        return None
    if "," in s and "." in s:          # 1.234,50 -> 1234.50
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:                     # 45,53 -> 45.53
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_numbers.py -v`
Expected: PASS (all params).

- [ ] **Step 5: Commit**

```bash
git add backend/app/numbers.py backend/tests/test_numbers.py
git commit -m "feat(backend): locale-aware number normalization"
```

---

### Task 5: Image preprocessing (rotate-upright + crop + resize)

**Files:**
- Create: `backend/app/preprocess.py`
- Test: `backend/tests/test_preprocess.py`, plus copy the 3 spike samples to `backend/tests/fixtures/`

**Interfaces:**
- Produces: `preprocess(image_bytes: bytes, max_side: int = 1400) -> bytes` — returns JPEG bytes of the receipt cropped from the background and resized so the longest side ≤ `max_side`. Also exposes `crop_receipt(img: Image.Image) -> Image.Image` and `resize_max(img, max_side) -> Image.Image` for unit testing.

*Note: this reuses the validated spike logic. Orientation auto-detection is out of scope for this task — the client sends an already-uprighted crop (client crop step) or the image as-is; `crop_receipt` handles background removal. A server-side auto-rotate is a future enhancement.*

- [ ] **Step 1: Copy sample fixtures**

Run: `mkdir -p backend/tests/fixtures && cp /home/miki/workspace/newProject4/invoices/41827.jpg backend/tests/fixtures/receipt_carrefour.jpg`

- [ ] **Step 2: Write the failing tests**

```python
# tests/test_preprocess.py
import io
from pathlib import Path
from PIL import Image
from app.preprocess import preprocess, resize_max, crop_receipt

FIX = Path(__file__).parent / "fixtures" / "receipt_carrefour.jpg"

def test_resize_caps_long_side():
    img = Image.new("RGB", (4000, 2000))
    out = resize_max(img, 1400)
    assert max(out.size) == 1400

def test_crop_receipt_reduces_area_on_dark_background():
    img = Image.open(FIX).convert("RGB")
    cropped = crop_receipt(img)
    assert cropped.size[0] * cropped.size[1] < img.size[0] * img.size[1]

def test_preprocess_returns_valid_jpeg_within_max_side():
    out = preprocess(FIX.read_bytes(), max_side=1400)
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert max(img.size) <= 1400
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_preprocess.py -v`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement preprocess.py**

```python
import io
import numpy as np
from PIL import Image

def resize_max(img: Image.Image, max_side: int) -> Image.Image:
    if max(img.size) <= max_side:
        return img
    s = max_side / max(img.size)
    return img.resize((int(img.width * s), int(img.height * s)))

def crop_receipt(img: Image.Image) -> Image.Image:
    g = np.asarray(img.convert("L"))
    mask = g > 100
    cols = np.where(mask.mean(axis=0) > 0.02)[0]
    rows = np.where(mask.mean(axis=1) > 0.02)[0]
    if len(cols) == 0 or len(rows) == 0:
        return img
    x0, x1, y0, y1 = cols[0], cols[-1], rows[0], rows[-1]
    padx = int((x1 - x0) * 0.03) + 5
    pady = int((y1 - y0) * 0.03) + 5
    return img.crop((max(0, x0 - padx), max(0, y0 - pady),
                     min(img.width, x1 + padx), min(img.height, y1 + pady)))

def preprocess(image_bytes: bytes, max_side: int = 1400) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = resize_max(crop_receipt(img), max_side)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_preprocess.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/preprocess.py backend/tests/test_preprocess.py backend/tests/fixtures
git commit -m "feat(backend): receipt preprocessing (crop + resize)"
```

---

### Task 6: Schemas + reader interface + FakeReader + factory

**Files:**
- Create: `backend/app/schemas.py`, `backend/app/readers/__init__.py`, `backend/app/readers/base.py`, `backend/app/readers/fake.py`, `backend/app/readers/factory.py`
- Test: `backend/tests/test_readers_fake.py`

**Interfaces:**
- Produces `app.schemas.ItemData` and `app.schemas.ReceiptData` (Pydantic v2):
  - `ItemData(raw_name: str, quantity: float|None=None, unit_price: float|None=None, total_price: float, is_discount: bool=False, tax_class: str|None=None)`
  - `ReceiptData(store: str|None, address: str|None, city: str|None, country: str|None, tax_id: str|None, date_text: str|None, currency: str|None, subtotal: float|None, tax_amount: float|None, total: float|None, items: list[ItemData]=[])`
- Produces `app.readers.base.ReceiptReader` protocol: attribute `name: str`, method `extract(self, image_bytes: bytes) -> ReceiptData`; and exception `ReaderError(Exception)`.
- Produces `app.readers.fake.FakeReader(payload: ReceiptData)` returning a fixed `ReceiptData`.
- Produces `app.readers.factory.get_reader(engine: str | None = None) -> ReceiptReader` (reads `settings.reader_engine` when `engine is None`; `"fake"` → `FakeReader` with a canned Carrefour payload).

- [ ] **Step 1: Write schemas.py**

```python
from pydantic import BaseModel

class ItemData(BaseModel):
    raw_name: str
    quantity: float | None = None
    unit_price: float | None = None
    total_price: float
    is_discount: bool = False
    tax_class: str | None = None

class ReceiptData(BaseModel):
    store: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    tax_id: str | None = None
    date_text: str | None = None
    currency: str | None = None
    subtotal: float | None = None
    tax_amount: float | None = None
    total: float | None = None
    items: list[ItemData] = []
```

- [ ] **Step 2: Write base.py and fake.py**

```python
# app/readers/base.py
from typing import Protocol
from app.schemas import ReceiptData

class ReaderError(Exception):
    pass

class ReceiptReader(Protocol):
    name: str
    def extract(self, image_bytes: bytes) -> ReceiptData: ...
```
```python
# app/readers/fake.py
from app.schemas import ReceiptData

class FakeReader:
    name = "fake"
    def __init__(self, payload: ReceiptData):
        self._payload = payload
    def extract(self, image_bytes: bytes) -> ReceiptData:
        return self._payload
```

- [ ] **Step 3: Write the failing factory test**

```python
# tests/test_readers_fake.py
from app.readers.factory import get_reader
from app.schemas import ReceiptData, ItemData

def test_fake_reader_from_factory():
    reader = get_reader("fake")
    out = reader.extract(b"ignored")
    assert isinstance(out, ReceiptData)
    assert out.store is not None
    assert len(out.items) >= 1
```

- [ ] **Step 4: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_readers_fake.py -v`
Expected: FAIL (factory missing).

- [ ] **Step 5: Write factory.py**

```python
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
```

- [ ] **Step 6: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_readers_fake.py -v`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/readers backend/tests/test_readers_fake.py
git commit -m "feat(backend): reader interface, schemas, and FakeReader"
```

---

### Task 7: MiniCPMReader (Ollama), HTTP mocked in tests

**Files:**
- Create: `backend/app/readers/minicpm.py`
- Test: `backend/tests/test_readers_minicpm.py`

**Interfaces:**
- Consumes: `app.schemas.ReceiptData/ItemData`, `app.numbers.normalize_number`, `app.config.settings`, `app.readers.base.ReaderError`.
- Produces: `MiniCPMReader(model: str|None=None, ollama_url: str|None=None)` with `name="minicpm"` and `extract(image_bytes) -> ReceiptData`. Posts to `{ollama_url}/api/generate` with `format="json"`; parses the JSON, normalizing all numbers via `normalize_number`; raises `ReaderError` on HTTP failure or unparseable JSON.

- [ ] **Step 1: Write the failing test (mock httpx)**

```python
# tests/test_readers_minicpm.py
import json
import httpx
import pytest
from app.readers.minicpm import MiniCPMReader
from app.readers.base import ReaderError

def _resp(payload):
    return httpx.Response(200, json={"response": json.dumps(payload)})

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
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_readers_minicpm.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement minicpm.py**

```python
import base64
import json
import httpx
from app.config import settings
from app.numbers import normalize_number
from app.schemas import ReceiptData, ItemData
from app.readers.base import ReaderError

PROMPT = (
    "Read this Spanish supermarket receipt (ticket) and return ONLY valid JSON: "
    '{"store":str,"address":str,"city":str,"country":str,"date":str,"currency":str,'
    '"subtotal":number,"tax_amount":number,"total":number,'
    '"items":[{"name":str,"quantity":number,"unit_price":number,"total_price":number}]}. '
    "List EVERY product line. PROMO/Descuento lines are discounts with negative total_price. "
    "Do not invent data; use null when a value is absent."
)

class MiniCPMReader:
    name = "minicpm"
    def __init__(self, model: str | None = None, ollama_url: str | None = None):
        self.model = model or settings.reader_model
        self.ollama_url = ollama_url or settings.ollama_url

    def extract(self, image_bytes: bytes) -> ReceiptData:
        b64 = base64.b64encode(image_bytes).decode()
        payload = {"model": self.model, "prompt": PROMPT, "images": [b64],
                   "stream": False, "format": "json",
                   "options": {"temperature": 0, "num_predict": 2500, "num_ctx": 8192}}
        try:
            with httpx.Client(timeout=240) as c:
                r = c.post(f"{self.ollama_url}/api/generate", json=payload)
                r.raise_for_status()
                raw = r.json()["response"]
                data = json.loads(raw)
        except (httpx.HTTPError, KeyError, json.JSONDecodeError) as e:
            raise ReaderError(str(e)) from e
        return self._to_receipt(data)

    def _to_receipt(self, d: dict) -> ReceiptData:
        items = []
        for it in d.get("items") or []:
            tp = normalize_number(it.get("total_price"))
            if tp is None:
                continue
            items.append(ItemData(
                raw_name=str(it.get("name") or "").strip() or "?",
                quantity=normalize_number(it.get("quantity")),
                unit_price=normalize_number(it.get("unit_price")),
                total_price=tp,
                is_discount=tp < 0,
            ))
        return ReceiptData(
            store=d.get("store"), address=d.get("address"), city=d.get("city"),
            country=d.get("country"), date_text=d.get("date"), currency=d.get("currency"),
            subtotal=normalize_number(d.get("subtotal")),
            tax_amount=normalize_number(d.get("tax_amount")),
            total=normalize_number(d.get("total")),
            items=items,
        )
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_readers_minicpm.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/readers/minicpm.py backend/tests/test_readers_minicpm.py
git commit -m "feat(backend): MiniCPM-V reader via Ollama"
```

---

### Task 8: Validation — reconciliation + date parsing

**Files:**
- Create: `backend/app/validation.py`
- Test: `backend/tests/test_validation.py`

**Interfaces:**
- Consumes: `app.schemas.ReceiptData`.
- Produces:
  - `reconcile(data: ReceiptData) -> dict` returning `{"items_sum": float, "expected_total": float|None, "delta": float|None, "matches": bool}`. `items_sum` = sum of all `total_price` (discounts included, since they are negative). `matches` is True when `total` is present and `abs(items_sum - total) <= 0.02`.
  - `parse_date(text: str | None) -> datetime | None` — tries `%d/%m/%y`, `%d/%m/%Y`, `%Y-%m-%d`, `%d/%b/%y`; returns None if none match.

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_validation.py
from datetime import datetime
from app.schemas import ReceiptData, ItemData
from app.validation import reconcile, parse_date

def test_reconcile_matches_within_tolerance():
    d = ReceiptData(total=10.00, items=[
        ItemData(raw_name="a", total_price=7.00),
        ItemData(raw_name="b", total_price=3.00),
    ])
    r = reconcile(d)
    assert r["items_sum"] == 10.00
    assert r["matches"] is True

def test_reconcile_flags_mismatch():
    d = ReceiptData(total=45.53, items=[ItemData(raw_name="a", total_price=13.49)])
    r = reconcile(d)
    assert r["matches"] is False
    assert round(r["delta"], 2) == round(13.49 - 45.53, 2)

def test_parse_date_variants():
    assert parse_date("21/07/26") == datetime(2026, 7, 21)
    assert parse_date("2026-07-21") == datetime(2026, 7, 21)
    assert parse_date("garbage") is None
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_validation.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement validation.py**

```python
from datetime import datetime
from app.schemas import ReceiptData

_FORMATS = ["%d/%m/%y", "%d/%m/%Y", "%Y-%m-%d", "%d/%b/%y"]

def parse_date(text):
    if not text:
        return None
    t = str(text).strip()
    for fmt in _FORMATS:
        try:
            return datetime.strptime(t, fmt)
        except ValueError:
            continue
    return None

def reconcile(data: ReceiptData) -> dict:
    items_sum = round(sum(i.total_price for i in data.items), 2)
    total = data.total
    delta = round(items_sum - total, 2) if total is not None else None
    matches = total is not None and abs(items_sum - total) <= 0.02
    return {"items_sum": items_sum, "expected_total": total, "delta": delta, "matches": matches}
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_validation.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/validation.py backend/tests/test_validation.py
git commit -m "feat(backend): reconciliation and date parsing"
```

---

### Task 9: Storage module

**Files:**
- Create: `backend/app/storage.py`
- Test: `backend/tests/test_storage.py`

**Interfaces:**
- Consumes: `app.config.settings`.
- Produces: `save_image(image_bytes: bytes, ext: str = "jpg") -> str` (writes under `settings.storage_dir`, returns the relative path) and `read_image(path: str) -> bytes`. Filenames use a monotonic counter + content hash (no `Date.now()`), e.g. `f"{sha256[:16]}.{ext}"`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_storage.py
from app.storage import save_image, read_image

def test_save_and_read_roundtrip(tmp_path, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    p = save_image(b"hello-bytes")
    assert read_image(p) == b"hello-bytes"
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_storage.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement storage.py**

```python
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
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_storage.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/storage.py backend/tests/test_storage.py
git commit -m "feat(backend): image storage module"
```

---

### Task 10: Product resolution service

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/products.py`
- Test: `backend/tests/test_products_service.py`

**Interfaces:**
- Consumes: `app.models.Product`, a SQLAlchemy `Session`.
- Produces: `normalize_name(raw: str) -> str` (uppercase, collapse whitespace, strip punctuation) and `find_or_create_product(db: Session, raw_name: str) -> Product` (looks up by `normalized_name`, creates if missing, `display_name=raw_name`).

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_products_service.py
from app.services.products import normalize_name, find_or_create_product

def test_normalize_name():
    assert normalize_name("  Leche   Entera 1L! ") == "LECHE ENTERA 1L"

def test_find_or_create_is_idempotent(db_session):
    p1 = find_or_create_product(db_session, "Leche Entera 1L")
    p2 = find_or_create_product(db_session, "leche  entera 1l")
    db_session.flush()
    assert p1.id == p2.id
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_products_service.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement products.py**

```python
import re
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Product

def normalize_name(raw: str) -> str:
    s = re.sub(r"[^\w\s]", "", raw, flags=re.UNICODE)
    return re.sub(r"\s+", " ", s).strip().upper()

def find_or_create_product(db: Session, raw_name: str) -> Product:
    norm = normalize_name(raw_name)
    existing = db.execute(select(Product).where(Product.normalized_name == norm)).scalar_one_or_none()
    if existing:
        return existing
    p = Product(normalized_name=norm, display_name=raw_name.strip())
    db.add(p)
    db.flush()
    return p
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_products_service.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services backend/tests/test_products_service.py
git commit -m "feat(backend): product normalization and find-or-create"
```

---

### Task 11: Extraction service

**Files:**
- Create: `backend/app/services/extraction.py`
- Test: `backend/tests/test_extraction_service.py`

**Interfaces:**
- Consumes: `app.preprocess.preprocess`, `app.readers.factory.get_reader`, `app.validation.reconcile/parse_date`, `app.storage.read_image`, `app.models.Receipt`, a `Session`, `app.readers.base.ReaderError`.
- Produces: `run_extraction(db: Session, receipt_id: int, reader=None) -> None` — loads the receipt, reads its image via `read_image(receipt.image_path)`, runs `preprocess` → `reader.extract` → builds `raw_extraction` dict = `ReceiptData.model_dump()` plus `{"reconciliation": reconcile(...), "purchased_at": parse_date(date_text).isoformat() if any}`, sets `receipt.source_engine = reader.name`, `receipt.status = "ready"`, and stores currency/total/subtotal/tax on the receipt. On `ReaderError`, sets `receipt.status = "failed"` and `raw_extraction = {"error": str(e)}`. Commits.

- [ ] **Step 1: Write the failing test (using FakeReader)**

```python
# tests/test_extraction_service.py
from app.models import User, Receipt
from app.readers.fake import FakeReader
from app.schemas import ReceiptData, ItemData
from app.services.extraction import run_extraction
from app.storage import save_image

def _seed(db):
    u = User(email="x@y.com"); db.add(u); db.flush()
    path = save_image(open("tests/fixtures/receipt_carrefour.jpg", "rb").read())
    r = Receipt(user_id=u.id, image_path=path, status="processing")
    db.add(r); db.flush()
    return r

def test_run_extraction_populates_draft(db_session, monkeypatch):
    monkeypatch.setattr("app.config.settings.storage_dir", "./data/images")
    r = _seed(db_session)
    fake = FakeReader(ReceiptData(store="Carrefour", total=13.49, currency="EUR",
                                  items=[ItemData(raw_name="CARNE VIEIRA 320 G", total_price=13.49)]))
    run_extraction(db_session, r.id, reader=fake)
    db_session.refresh(r)
    assert r.status == "ready"
    assert r.source_engine == "fake"
    assert r.total == 13.49
    assert r.raw_extraction["reconciliation"]["matches"] is True

def test_run_extraction_handles_reader_failure(db_session):
    r = _seed(db_session)
    class Boom:
        name = "boom"
        def extract(self, b):
            from app.readers.base import ReaderError
            raise ReaderError("nope")
    run_extraction(db_session, r.id, reader=Boom())
    db_session.refresh(r)
    assert r.status == "failed"
    assert "error" in r.raw_extraction
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_extraction_service.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement extraction.py**

```python
from sqlalchemy.orm import Session
from app.models import Receipt
from app.preprocess import preprocess
from app.storage import read_image
from app.readers.factory import get_reader
from app.readers.base import ReaderError
from app.validation import reconcile, parse_date

def run_extraction(db: Session, receipt_id: int, reader=None) -> None:
    reader = reader or get_reader()
    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        return
    try:
        image = preprocess(read_image(receipt.image_path))
        data = reader.extract(image)
    except ReaderError as e:
        receipt.status = "failed"
        receipt.raw_extraction = {"error": str(e)}
        db.commit()
        return
    rec = reconcile(data)
    purchased = parse_date(data.date_text)
    dump = data.model_dump()
    dump["reconciliation"] = rec
    dump["purchased_at"] = purchased.isoformat() if purchased else None
    receipt.raw_extraction = dump
    receipt.source_engine = reader.name
    receipt.currency = data.currency
    receipt.subtotal = data.subtotal
    receipt.tax_amount = data.tax_amount
    receipt.total = data.total
    receipt.purchased_at = purchased
    receipt.status = "ready"
    db.commit()
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_extraction_service.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/extraction.py backend/tests/test_extraction_service.py
git commit -m "feat(backend): extraction orchestration service"
```

---

### Task 12: Persistence service (confirm → items + price observations)

**Files:**
- Create: `backend/app/services/persistence.py`
- Test: `backend/tests/test_persistence.py`

**Interfaces:**
- Consumes: `app.models.*`, `app.services.products.find_or_create_product`, `app.validation.parse_date`, a `Session`, `app.schemas.ReceiptData`.
- Produces:
  - `find_or_create_store(db, *, chain_name, address, city, country, tax_id) -> Store` (match by `tax_id` if present, else `chain_name`+`city`).
  - `confirm_receipt(db: Session, receipt_id: int, corrected: ReceiptData) -> Receipt` — replaces the receipt's items with `corrected.items`, resolves/creates the store and per-item products, sets receipt totals/currency/purchased_at, sets `status="confirmed"`, and for every **non-discount** item writes a `PriceObservation` (price=`total_price`, store, user, currency, `observed_at=receipt.purchased_at`). Returns the receipt.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_persistence.py
from sqlalchemy import select, func
from app.models import User, Receipt, PriceObservation, ReceiptItem
from app.schemas import ReceiptData, ItemData
from app.services.persistence import confirm_receipt

def test_confirm_writes_items_and_price_observations(db_session):
    u = User(email="p@q.com"); db_session.add(u); db_session.flush()
    r = Receipt(user_id=u.id, image_path="x.jpg", status="ready"); db_session.add(r); db_session.flush()
    corrected = ReceiptData(
        store="Carrefour", country="ES", currency="EUR", date_text="21/07/26", total=13.19,
        items=[ItemData(raw_name="CARNE VIEIRA 320 G", total_price=13.49),
               ItemData(raw_name="PROMO", total_price=-0.30, is_discount=True)],
    )
    confirm_receipt(db_session, r.id, corrected)
    db_session.flush()
    assert r.status == "confirmed"
    assert r.store_id is not None
    n_items = db_session.execute(select(func.count()).select_from(ReceiptItem).where(ReceiptItem.receipt_id == r.id)).scalar()
    assert n_items == 2
    # only the non-discount item becomes a price observation
    obs = db_session.execute(select(PriceObservation).where(PriceObservation.user_id == u.id)).scalars().all()
    assert len(obs) == 1
    assert float(obs[0].price) == 13.49
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_persistence.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement persistence.py**

```python
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Receipt, ReceiptItem, Store, PriceObservation
from app.schemas import ReceiptData
from app.services.products import find_or_create_product
from app.validation import parse_date

def find_or_create_store(db: Session, *, chain_name, address, city, country, tax_id) -> Store:
    stmt = None
    if tax_id:
        stmt = select(Store).where(Store.tax_id == tax_id)
    elif chain_name:
        stmt = select(Store).where(Store.chain_name == chain_name, Store.city == city)
    existing = db.execute(stmt).scalar_one_or_none() if stmt is not None else None
    if existing:
        return existing
    s = Store(chain_name=chain_name or "Unknown", address=address, city=city,
              country=country, tax_id=tax_id)
    db.add(s); db.flush()
    return s

def confirm_receipt(db: Session, receipt_id: int, corrected: ReceiptData) -> Receipt:
    receipt = db.get(Receipt, receipt_id)
    if receipt is None:
        raise ValueError("receipt not found")
    for old in list(receipt.items):
        db.delete(old)
    db.flush()

    store = find_or_create_store(db, chain_name=corrected.store, address=corrected.address,
                                 city=corrected.city, country=corrected.country, tax_id=corrected.tax_id)
    receipt.store_id = store.id
    receipt.currency = corrected.currency
    receipt.subtotal = corrected.subtotal
    receipt.tax_amount = corrected.tax_amount
    receipt.total = corrected.total
    receipt.purchased_at = parse_date(corrected.date_text)

    for i, item in enumerate(corrected.items):
        product = find_or_create_product(db, item.raw_name) if not item.is_discount else None
        ri = ReceiptItem(receipt_id=receipt.id, line_no=i, raw_name=item.raw_name,
                         product_id=product.id if product else None, quantity=item.quantity,
                         unit_price=item.unit_price, total_price=item.total_price,
                         is_discount=item.is_discount, tax_class=item.tax_class)
        db.add(ri); db.flush()
        if product is not None:
            db.add(PriceObservation(product_id=product.id, store_id=store.id, user_id=receipt.user_id,
                                    receipt_item_id=ri.id, price=item.total_price,
                                    currency=corrected.currency, observed_at=receipt.purchased_at))
    receipt.status = "confirmed"
    db.flush()
    return receipt
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_persistence.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/persistence.py backend/tests/test_persistence.py
git commit -m "feat(backend): confirm receipt + write price observations"
```

---

### Task 13: Receipts API (upload, poll, confirm, list)

**Files:**
- Create: `backend/app/deps.py`, `backend/app/api/__init__.py`, `backend/app/api/receipts.py`
- Modify: `backend/app/main.py` (include router)
- Test: `backend/tests/test_api_receipts.py`

**Interfaces:**
- Consumes: `get_db`, `run_extraction`, `confirm_receipt`, `save_image`, models, schemas.
- Produces `app.deps.get_current_user(db=Depends(get_db)) -> User` (stub: returns/creates a user with email `dev@local`).
- Produces endpoints:
  - `POST /receipts` (multipart `file`) → saves image, creates `Receipt(status="processing")`, runs extraction via `BackgroundTasks`, returns `{"id": int, "status": "processing"}` (202).
  - `GET /receipts/{id}` → `{"id","status","source_engine","raw_extraction","store_id","total","currency"}` (404 if not owner).
  - `PUT /receipts/{id}` body `ReceiptData` → calls `confirm_receipt`, returns `{"id","status":"confirmed","store_id"}`.
  - `GET /receipts` → list of `{"id","status","store_id","total","currency","purchased_at"}` for the current user, newest first.

- [ ] **Step 1: Write deps.py**

```python
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User

def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.execute(select(User).where(User.email == "dev@local")).scalar_one_or_none()
    if user is None:
        user = User(email="dev@local"); db.add(user); db.commit(); db.refresh(user)
    return user
```

- [ ] **Step 2: Write the failing API test**

```python
# tests/test_api_receipts.py
import io
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
import app.models  # noqa

def _client():
    Base.metadata.create_all(bind=engine)
    return TestClient(app)

def _png_bytes():
    buf = io.BytesIO(); Image.new("RGB", (50, 50), "white").save(buf, format="PNG"); return buf.getvalue()

def test_upload_confirm_and_list(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    c = _client()
    r = c.post("/receipts", files={"file": ("t.png", _png_bytes(), "image/png")})
    assert r.status_code == 202
    rid = r.json()["id"]
    got = c.get(f"/receipts/{rid}")
    assert got.status_code == 200
    assert got.json()["status"] in ("ready", "processing")
    body = {"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26", "total": 13.49,
            "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]}
    put = c.put(f"/receipts/{rid}", json=body)
    assert put.status_code == 200 and put.json()["status"] == "confirmed"
    lst = c.get("/receipts")
    assert any(x["id"] == rid for x in lst.json())
    Base.metadata.drop_all(bind=engine)
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_api_receipts.py -v`
Expected: FAIL (router missing).

- [ ] **Step 4: Implement receipts.py and wire it into main.py**

```python
# app/api/receipts.py
from fastapi import APIRouter, UploadFile, File, Depends, BackgroundTasks, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db, SessionLocal
from app.deps import get_current_user
from app.models import User, Receipt
from app.schemas import ReceiptData
from app.storage import save_image
from app.services.extraction import run_extraction
from app.services.persistence import confirm_receipt

router = APIRouter(prefix="/receipts", tags=["receipts"])

def _extract_job(receipt_id: int):
    db = SessionLocal()
    try:
        run_extraction(db, receipt_id)
    finally:
        db.close()

@router.post("", status_code=202)
def upload(background: BackgroundTasks, file: UploadFile = File(...),
           db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    path = save_image(file.file.read())
    receipt = Receipt(user_id=user.id, image_path=path, status="processing")
    db.add(receipt); db.commit(); db.refresh(receipt)
    background.add_task(_extract_job, receipt.id)
    return {"id": receipt.id, "status": receipt.status}

@router.get("/{receipt_id}")
def get_one(receipt_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = db.get(Receipt, receipt_id)
    if r is None or r.user_id != user.id:
        raise HTTPException(404)
    return {"id": r.id, "status": r.status, "source_engine": r.source_engine,
            "raw_extraction": r.raw_extraction, "store_id": r.store_id,
            "total": float(r.total) if r.total is not None else None, "currency": r.currency}

@router.put("/{receipt_id}")
def confirm(receipt_id: int, data: ReceiptData, db: Session = Depends(get_db),
            user: User = Depends(get_current_user)):
    r = db.get(Receipt, receipt_id)
    if r is None or r.user_id != user.id:
        raise HTTPException(404)
    confirm_receipt(db, receipt_id, data); db.commit()
    return {"id": r.id, "status": "confirmed", "store_id": r.store_id}

@router.get("")
def list_receipts(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(select(Receipt).where(Receipt.user_id == user.id)
                      .order_by(Receipt.created_at.desc())).scalars().all()
    return [{"id": r.id, "status": r.status, "store_id": r.store_id,
             "total": float(r.total) if r.total is not None else None,
             "currency": r.currency,
             "purchased_at": r.purchased_at.isoformat() if r.purchased_at else None} for r in rows]
```
```python
# add to app/main.py
from app.api.receipts import router as receipts_router
app.include_router(receipts_router)
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_api_receipts.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/deps.py backend/app/api backend/app/main.py backend/tests/test_api_receipts.py
git commit -m "feat(backend): receipts API (upload, poll, confirm, list)"
```

---

### Task 14: Products & price-history API

**Files:**
- Create: `backend/app/api/products.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_api_products.py`

**Interfaces:**
- Consumes: `get_db`, `get_current_user`, models.
- Produces endpoints:
  - `GET /products` → distinct products the current user has bought: `[{"id","display_name","last_price","currency","observations"}]`.
  - `GET /products/{id}/prices` → the user's price observations for that product across stores, newest first: `[{"store_id","price","currency","observed_at"}]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_api_products.py
import io
from PIL import Image
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
import app.models  # noqa

def _png():
    buf = io.BytesIO(); Image.new("RGB", (40, 40), "white").save(buf, "PNG"); return buf.getvalue()

def test_products_and_prices(monkeypatch, tmp_path):
    from app.config import settings
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    monkeypatch.setattr(settings, "reader_engine", "fake")
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    rid = c.post("/receipts", files={"file": ("t.png", _png(), "image/png")}).json()["id"]
    c.put(f"/receipts/{rid}", json={"store": "Carrefour", "currency": "EUR", "date_text": "21/07/26",
          "total": 13.49, "items": [{"raw_name": "CARNE VIEIRA 320 G", "total_price": 13.49}]})
    prods = c.get("/products").json()
    assert len(prods) == 1 and prods[0]["display_name"].startswith("CARNE")
    pid = prods[0]["id"]
    prices = c.get(f"/products/{pid}/prices").json()
    assert prices[0]["price"] == 13.49
    Base.metadata.drop_all(bind=engine)
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_api_products.py -v`
Expected: FAIL (router missing).

- [ ] **Step 3: Implement products.py and wire into main.py**

```python
# app/api/products.py
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.db import get_db
from app.deps import get_current_user
from app.models import User, Product, PriceObservation

router = APIRouter(prefix="/products", tags=["products"])

@router.get("")
def list_products(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Product.id, Product.display_name, func.count(PriceObservation.id),
               func.max(PriceObservation.currency))
        .join(PriceObservation, PriceObservation.product_id == Product.id)
        .where(PriceObservation.user_id == user.id)
        .group_by(Product.id, Product.display_name)
    ).all()
    result = []
    for pid, name, count, currency in rows:
        last = db.execute(select(PriceObservation.price)
            .where(PriceObservation.product_id == pid, PriceObservation.user_id == user.id)
            .order_by(PriceObservation.observed_at.desc().nullslast(),
                      PriceObservation.created_at.desc()).limit(1)).scalar()
        result.append({"id": pid, "display_name": name,
                       "last_price": float(last) if last is not None else None,
                       "currency": currency, "observations": count})
    return result

@router.get("/{product_id}/prices")
def product_prices(product_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(select(PriceObservation)
        .where(PriceObservation.product_id == product_id, PriceObservation.user_id == user.id)
        .order_by(PriceObservation.observed_at.desc().nullslast(),
                  PriceObservation.created_at.desc())).scalars().all()
    return [{"store_id": o.store_id, "price": float(o.price), "currency": o.currency,
             "observed_at": o.observed_at.isoformat() if o.observed_at else None} for o in rows]
```
```python
# add to app/main.py
from app.api.products import router as products_router
app.include_router(products_router)
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd backend && python -m pytest tests/test_api_products.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/products.py backend/app/main.py backend/tests/test_api_products.py
git commit -m "feat(backend): products and price-history API"
```

---

### Task 15: Eval harness (formalized spike)

**Files:**
- Create: `backend/eval/run_eval.py`, `backend/eval/golden/expected_41827.json`
- Copy: the 3 spike samples into `backend/eval/golden/`
- Test: `backend/tests/test_eval.py`

**Interfaces:**
- Consumes: `app.preprocess.preprocess`, `app.readers.factory.get_reader`.
- Produces: `score_extraction(expected: dict, got: ReceiptData) -> dict` returning `{"store_ok": bool, "total_ok": bool, "item_count_expected": int, "item_count_got": int, "item_recall": float}`; and a `main()` that runs a configured reader over `eval/golden/*.jpg`, comparing to `expected_*.json`, printing a per-file + aggregate scoreboard. Enables comparing engines by setting `READER_ENGINE`.

- [ ] **Step 1: Create golden expectation for the Carrefour sample**

```json
{
  "store_contains": "Carrefour",
  "total": 45.53,
  "item_count": 5
}
```

- [ ] **Step 2: Write the failing test for the scorer**

```python
# tests/test_eval.py
from app.schemas import ReceiptData, ItemData
from eval.run_eval import score_extraction

def test_score_extraction():
    expected = {"store_contains": "Carrefour", "total": 45.53, "item_count": 5}
    got = ReceiptData(store="Centros Comerciales Carrefour S.A.", total=45.53,
                      items=[ItemData(raw_name=f"i{i}", total_price=1.0) for i in range(4)])
    s = score_extraction(expected, got)
    assert s["store_ok"] is True
    assert s["total_ok"] is True
    assert s["item_count_got"] == 4
    assert abs(s["item_recall"] - 0.8) < 1e-6
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_eval.py -v`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement run_eval.py**

```python
# eval/run_eval.py
import json
from pathlib import Path
from app.preprocess import preprocess
from app.readers.factory import get_reader
from app.schemas import ReceiptData

GOLD = Path(__file__).parent / "golden"

def score_extraction(expected: dict, got: ReceiptData) -> dict:
    store_ok = bool(got.store and expected["store_contains"].lower() in got.store.lower())
    total_ok = got.total is not None and abs(got.total - expected["total"]) <= 0.02
    exp_n = expected["item_count"]; got_n = len(got.items)
    recall = min(got_n, exp_n) / exp_n if exp_n else 0.0
    return {"store_ok": store_ok, "total_ok": total_ok,
            "item_count_expected": exp_n, "item_count_got": got_n, "item_recall": recall}

def main():
    reader = get_reader()
    scores = []
    for exp_file in sorted(GOLD.glob("expected_*.json")):
        stem = exp_file.stem.replace("expected_", "")
        img = GOLD / f"{stem}.jpg"
        if not img.exists():
            continue
        expected = json.loads(exp_file.read_text())
        got = reader.extract(preprocess(img.read_bytes()))
        s = score_extraction(expected, got)
        scores.append(s)
        print(f"{stem}: store={s['store_ok']} total={s['total_ok']} "
              f"items={s['item_count_got']}/{s['item_count_expected']} recall={s['item_recall']:.2f}")
    if scores:
        print(f"\nstore_acc={sum(x['store_ok'] for x in scores)/len(scores):.2f} "
              f"total_acc={sum(x['total_ok'] for x in scores)/len(scores):.2f} "
              f"mean_recall={sum(x['item_recall'] for x in scores)/len(scores):.2f}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run, verify the scorer test passes**

Run: `cd backend && python -m pytest tests/test_eval.py -v`
Expected: PASS.

- [ ] **Step 6: Copy golden images and do a live smoke run (requires Ollama)**

Run:
```bash
cp /home/miki/workspace/newProject4/invoices/41827.jpg backend/eval/golden/41827.jpg
cd backend && READER_ENGINE=minicpm python -m eval.run_eval
```
Expected: prints a scoreboard line for `41827` (store/total likely OK; recall partial — this is the known MiniCPM baseline).

- [ ] **Step 7: Commit**

```bash
git add backend/eval backend/tests/test_eval.py
git commit -m "feat(backend): eval harness for reader accuracy"
```

---

### Task 16: Real authentication (replaces the stub)

**Files:**
- Create: `backend/app/api/auth.py`, `backend/app/security.py`
- Modify: `backend/app/deps.py` (real `get_current_user`), `backend/app/main.py`
- Test: `backend/tests/test_auth.py`

**Interfaces:**
- Produces: `app.security.hash_password/verify_password/create_token/decode_token`; endpoints `POST /auth/register` and `POST /auth/login` (return `{"access_token","token_type":"bearer"}`); and a new `get_current_user` that reads the `Authorization: Bearer` header, decodes the JWT, and loads the user (401 on failure).
- Note: the receipts/products endpoints do not change — they already depend on `get_current_user`; only its implementation is swapped.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_auth.py
from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
import app.models  # noqa

def test_register_login_and_protected_access():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    assert c.post("/auth/register", json={"email": "u@e.com", "password": "pw12345"}).status_code == 200
    tok = c.post("/auth/login", json={"email": "u@e.com", "password": "pw12345"}).json()["access_token"]
    # protected endpoint rejects without token
    assert c.get("/receipts", headers={}).status_code == 401
    # accepts with token
    ok = c.get("/receipts", headers={"Authorization": f"Bearer {tok}"})
    assert ok.status_code == 200
    Base.metadata.drop_all(bind=engine)
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd backend && python -m pytest tests/test_auth.py -v`
Expected: FAIL (no auth routes; `get_current_user` stub returns dev user → no 401).

- [ ] **Step 3: Implement security.py**

```python
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from app.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(p: str) -> str: return _pwd.hash(p)
def verify_password(p: str, h: str) -> bool: return _pwd.verify(p, h)

def create_token(user_id: int) -> str:
    payload = {"sub": str(user_id), "exp": datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")

def decode_token(token: str) -> int | None:
    try:
        return int(jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])["sub"])
    except (JWTError, KeyError, ValueError):
        return None
```

- [ ] **Step 4: Implement auth.py and swap get_current_user**

```python
# app/api/auth.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.security import hash_password, verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])

class Creds(BaseModel):
    email: EmailStr
    password: str

@router.post("/register")
def register(c: Creds, db: Session = Depends(get_db)):
    if db.execute(select(User).where(User.email == c.email)).scalar_one_or_none():
        raise HTTPException(400, "email exists")
    u = User(email=c.email, password_hash=hash_password(c.password))
    db.add(u); db.commit(); db.refresh(u)
    return {"access_token": create_token(u.id), "token_type": "bearer"}

@router.post("/login")
def login(c: Creds, db: Session = Depends(get_db)):
    u = db.execute(select(User).where(User.email == c.email)).scalar_one_or_none()
    if not u or not u.password_hash or not verify_password(c.password, u.password_hash):
        raise HTTPException(401, "bad credentials")
    return {"access_token": create_token(u.id), "token_type": "bearer"}
```
```python
# replace app/deps.py get_current_user
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import User
from app.security import decode_token

_bearer = HTTPBearer(auto_error=False)

def get_current_user(cred: HTTPAuthorizationCredentials = Depends(_bearer),
                     db: Session = Depends(get_db)) -> User:
    if cred is None:
        raise HTTPException(401, "not authenticated")
    uid = decode_token(cred.credentials)
    if uid is None:
        raise HTTPException(401, "invalid token")
    user = db.get(User, uid)
    if user is None:
        raise HTTPException(401, "unknown user")
    return user
```
```python
# add to app/main.py
from app.api.auth import router as auth_router
app.include_router(auth_router)
```

- [ ] **Step 5: Update earlier API tests to send a token**

In `tests/test_api_receipts.py` and `tests/test_api_products.py`, register+login once and pass `headers={"Authorization": f"Bearer {tok}"}` on every request. (Add a small `_auth(c)` helper returning the header dict.)

- [ ] **Step 6: Run the full suite**

Run: `cd backend && python -m pytest -v`
Expected: PASS (all tests, including updated API tests).

- [ ] **Step 7: Commit**

```bash
git add backend/app/security.py backend/app/api/auth.py backend/app/deps.py backend/app/main.py backend/tests
git commit -m "feat(backend): JWT authentication"
```

---

## Self-Review

**Spec coverage:**
- Preprocessing (spec §3) → Task 5. Pluggable reader (§2, §3) → Tasks 6–7 + factory. MiniCPM local engine → Task 7. Data model (§4), incl. `price_observations` → Task 3 + Task 12. Core flow (§5) → Tasks 11–14. Validation/reconciliation (§6) → Tasks 4, 8, 11. MVP scope auth → Task 16. Eval harness (§8) → Task 15. Locale-agnostic fields → Task 3 models + Task 12 store/currency handling. ✅ All covered.
- Deliberately deferred to the frontend plan / later phases (per spec §7, §10): the PWA UI, cross-user price comparison, canonical cross-language catalog, cloud/bigger-GPU readers (interface is ready via the factory).

**Placeholder scan:** No TBD/TODO; every code step contains runnable code and exact commands. ✅

**Type consistency:** `ReceiptData`/`ItemData` fields are identical across Tasks 6, 7, 11, 12, 13, 15. `get_reader()`, `run_extraction(db, id, reader=None)`, `confirm_receipt(db, id, corrected)`, `find_or_create_product(db, raw_name)`, `normalize_number(value)`, `reconcile(data)`, `save_image/read_image` signatures match every call site. `get_current_user` dependency is stable across Tasks 13–16 (only its body changes). ✅

## Follow-on: Plan 2 (Frontend PWA)

To be written after this plan is approved/underway: React/TS PWA with camera capture + client crop, the review/correction screen (driven by `raw_extraction` + reconciliation banner), receipts/products/price-history browsing, and auth against the endpoints above.
