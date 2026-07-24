# Receipt Digitizer

Photograph a supermarket receipt, let a local vision-language model extract the
store, date, and line items, review/correct the result, and confirm it — building
up a per-product price history over time so you can track how prices change
across stores and visits.

## Architecture

- **`frontend/`** — React + TypeScript PWA (Vite). Capture/upload a receipt photo,
  poll for extraction status, review and correct the parsed items, confirm, and
  browse products with a price-history chart.
- **`backend/`** — FastAPI + SQLite service. Handles auth, receipt upload and
  extraction, review/confirm, and product/price-observation persistence.
- **Pluggable receipt reader** — extraction is behind a small reader interface
  (`backend/app/readers/`), selected at runtime via the `READER_ENGINE` env var:
  - `minicpm` (default) — a local MiniCPM-V model served through
    [Ollama](https://ollama.com).
  - `fake` — returns canned data with no external dependency, for deterministic
    tests and local runs without Ollama.

## Prerequisites

- Python 3.10+
- Node 20+
- [Ollama](https://ollama.com) running locally with the `minicpm-v` model pulled:

  ```bash
  ollama pull minicpm-v
  ```

  (Not needed if you run the backend with `READER_ENGINE=fake`.)

## Running the backend

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
```

Database tables are created automatically on startup (idempotent — safe on an
existing DB), so a fresh clone works without a manual migration step. Alembic
migrations are still available if you prefer to manage schema changes
explicitly:

```bash
.venv/bin/alembic upgrade head
```

For a deterministic run with no Ollama dependency (e.g. local demos or CI-like
checks), set `READER_ENGINE=fake`:

```bash
READER_ENGINE=fake .venv/bin/uvicorn app.main:app --port 8000
```

Copy `backend/.env.example` to `backend/.env` to customize settings
(`DATABASE_URL`, `OLLAMA_URL`, `READER_ENGINE`, `READER_MODEL`, `STORAGE_DIR`,
`JWT_SECRET`).

## Running the frontend

```bash
cd frontend
npm install
VITE_API_URL=http://localhost:8000 npm run dev
```

Then open http://localhost:5173. The backend's CORS is configured to allow
requests from that origin.

## Testing

```bash
# Backend (59 tests)
cd backend
.venv/bin/python -m pytest -q

# Frontend
cd frontend
npm run test
```

## Docs

- Specs: [`docs/superpowers/specs`](docs/superpowers/specs)
- Plans: [`docs/superpowers/plans`](docs/superpowers/plans)
