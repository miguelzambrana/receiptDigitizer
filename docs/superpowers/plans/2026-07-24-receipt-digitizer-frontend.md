# Receipt Digitizer — Frontend PWA Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to execute task-by-task. Steps use checkbox (`- [ ]`) tracking. UI tasks are verified by BOTH component tests (logic) AND a visual check (dev server + browser screenshot) — a task isn't done until its screen renders correctly.

**Goal:** A React/TypeScript PWA where a user uploads a receipt photo, rotates it live, drags a box to select the invoice region, runs the local AI to extract the data, reviews/corrects it, and browses their products with per-product price history.

**Architecture:** Vite + React + TS single-page PWA, talking to the existing FastAPI backend over REST with a JWT bearer token. Client-side canvas does the rotate + crop, exporting a JPEG blob that is POSTed to the backend (whose own preprocess then normalizes it). State is minimal (auth token in localStorage; per-screen local state). No global store needed for the MVP.

**Tech Stack:** Vite, React 18, TypeScript, react-router-dom, a tiny fetch wrapper (no axios), vitest + @testing-library/react + jsdom, vite-plugin-pwa. Charts: lightweight inline SVG or Recharts (see Task FE-4).

## Global Constraints

- Frontend lives under `frontend/`. Backend stays untouched EXCEPT the one CORS change in FE-1.
- Backend base URL from `import.meta.env.VITE_API_URL`, default `http://localhost:8000`.
- Auth: `POST /auth/login` / `POST /auth/register` → `{access_token, token_type}`; store token in `localStorage` under `receipts_token`; send `Authorization: Bearer <token>` on every API call; on 401, clear token and route to login.
- Money shown with the receipt's `currency`; never hardcode € or a locale.
- TDD for pure logic (API client, canvas transform math, reducers). UI screens get a component test for their key behavior + a visual verification screenshot.
- Node ≥ 20 (v22 present). Never commit `node_modules` (gitignore it). Feature branch only — never `main`/`master`.

## Backend API contract (already built & tested — do not change except CORS)

- `POST /auth/register` `{email,password}` → 200 `{access_token, token_type}` (400 if email exists)
- `POST /auth/login` `{email,password}` → 200 `{access_token, token_type}` (401 bad creds)
- `POST /receipts` (multipart `file`, Bearer) → 202 `{id, status}` (status `"processing"`)
- `GET /receipts/{id}` (Bearer) → `{id, status, source_engine, raw_extraction, store_id, total, currency}`
  - `status` ∈ `processing|ready|failed|confirmed`
  - `raw_extraction` (when ready) = `{store, address, city, country, tax_id, date_text, currency, subtotal, tax_amount, total, items:[{raw_name, quantity, unit_price, total_price, is_discount, tax_class}], reconciliation:{items_sum, expected_total, delta, matches}, purchased_at}`
- `PUT /receipts/{id}` (Bearer, body = ReceiptData: `{store, address, city, country, tax_id, date_text, currency, subtotal, tax_amount, total, items:[{raw_name, quantity, unit_price, total_price, is_discount, tax_class}]}`) → `{id, status:"confirmed", store_id}`
- `GET /receipts` (Bearer) → `[{id, status, store_id, total, currency, purchased_at}]`
- `GET /products` (Bearer) → `[{id, display_name, last_price, currency, observations}]`
- `GET /products/{id}/prices` (Bearer) → `[{store_id, price, currency, observed_at}]` (newest first)

## File structure

```
frontend/
  index.html
  package.json
  vite.config.ts
  .env.example                 # VITE_API_URL=http://localhost:8000
  src/
    main.tsx                   # router + app shell
    api/client.ts              # typed fetch wrapper, token handling
    api/types.ts               # ReceiptData, Product, PriceObservation, etc.
    auth/AuthContext.tsx       # token state + login/register/logout
    auth/LoginPage.tsx
    components/RequireAuth.tsx
    capture/CapturePage.tsx    # upload + rotate + crop
    capture/canvas.ts          # pure rotate/crop → Blob (unit-tested)
    review/ReviewPage.tsx      # poll + editable draft + reconciliation banner + confirm
    products/ProductsPage.tsx  # list
    products/PriceHistory.tsx  # chart for one product
  test/                        # vitest setup + tests
```

---

### Task FE-1: Scaffold + API client + CORS + auth + routing

**Files:** create `frontend/*` scaffold, `src/api/client.ts`, `src/api/types.ts`, `src/auth/*`, `src/components/RequireAuth.tsx`, `src/main.tsx`; modify `backend/app/main.py` (CORS only); tests under `frontend/test/`.

**Interfaces produced:**
- `api/client.ts`: `setToken(t|null)`, `getToken()`, and `api.post/get/put` that inject the bearer header and JSON-encode; `login(email,pw)`, `register(email,pw)`, `uploadReceipt(blob)`, `getReceipt(id)`, `confirmReceipt(id, data)`, `listReceipts()`, `listProducts()`, `productPrices(id)`. On 401 → clear token + throw `Unauthorized`.
- `auth/AuthContext.tsx`: `useAuth()` → `{token, login, register, logout}`.

- [ ] **Step 1: Add CORS to the backend.** In `backend/app/main.py` add `from fastapi.middleware.cors import CORSMiddleware` and `app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])`. Run backend suite (`backend/.venv/bin/python -m pytest -q`) — still 59 green.
- [ ] **Step 2: Scaffold Vite React-TS** (`npm create vite@latest frontend -- --template react-ts`, then `npm install`, add react-router-dom, vitest, @testing-library/react, jsdom, vite-plugin-pwa). Add `.gitignore` for `node_modules`, `dist`.
- [ ] **Step 3: TDD the API client** — write `test/client.test.ts` mocking `fetch`: asserts (a) `login` posts creds and stores the returned token; (b) an authed GET sends `Authorization: Bearer <token>`; (c) a 401 clears the token and throws. Run → RED. Implement `api/client.ts` + `api/types.ts` → GREEN.
- [ ] **Step 4: Auth context + LoginPage + RequireAuth + router** in `main.tsx` (routes: `/login`, `/` capture, `/review/:id`, `/products`, `/products/:id`). Component test: LoginPage calls `login` and redirects on success.
- [ ] **Step 5: Visual verify.** Run backend (`uvicorn app.main:app`) + `npm run dev`; in a browser, register a user and confirm you land on the (empty) capture screen. Screenshot it.
- [ ] **Step 6: Commit** (`feat(frontend): scaffold PWA, API client, auth`; include the backend CORS change).

### Task FE-2: Capture — upload, live rotate, crop-zone select

**Files:** `src/capture/CapturePage.tsx`, `src/capture/canvas.ts`, tests.

**Interfaces produced:**
- `capture/canvas.ts`: `renderToBlob(img: HTMLImageElement|ImageBitmap, rotationDeg: number, crop: {x,y,w,h}, opts?) => Promise<Blob>` — pure-ish function that rotates by `rotationDeg` and crops the given rectangle (in image coordinates) to a JPEG Blob. Also `cropRectToImageCoords(displayRect, scale, rotationDeg)` helper (unit-testable math).

- [ ] **Step 1: TDD the transform math** — `test/canvas.test.ts`: given a known 100×60 source, `rotationDeg=90` swaps to 60×100; a crop rect maps to expected pixel region. Use an offscreen canvas (jsdom + a canvas shim or a pure-math function that computes output dimensions/regions without needing real pixels). RED → implement `canvas.ts` → GREEN.
- [ ] **Step 2: CapturePage UI** — file input (accept `image/*`, `capture="environment"` for mobile); draw the image on a `<canvas>`; a **rotation slider** (−180..180, plus quick 90° buttons) that re-renders live; a **draggable + resizable crop rectangle** overlay (pointer events) defaulting to ~80% centered; an "Extract" button that calls `renderToBlob(...)` then `api.uploadReceipt(blob)` and navigates to `/review/:id`.
- [ ] **Step 3: Component test** — mount CapturePage, simulate selecting a file (a small fixture data-URL), moving the rotation slider, and clicking Extract → asserts `uploadReceipt` was called with a Blob.
- [ ] **Step 4: Visual verify** — dev server; upload one of `../invoices/41827.jpg`; confirm the image shows, the slider rotates it live, the crop box drags/resizes. Screenshot.
- [ ] **Step 5: Commit** (`feat(frontend): capture with live rotate + crop-zone select`).

### Task FE-3: Extract & review — poll, edit, reconcile, confirm

**Files:** `src/review/ReviewPage.tsx`, tests.

- [ ] **Step 1: TDD polling logic** — a `useReceiptDraft(id)` hook (or pure `pollReceipt(getReceipt, id)`), tested: polls `GET /receipts/{id}` until status leaves `processing`, returns `ready` data or a `failed` error. RED → implement → GREEN (fake timers, mocked client).
- [ ] **Step 2: ReviewPage UI** — while `processing`, show a spinner ("Reading your receipt…"); on `ready`, render an editable form bound to `raw_extraction` (store, date_text, currency, total, and an editable **items table**: raw_name, quantity, unit_price, total_price, is_discount toggle). Show a **reconciliation banner**: green "Items match total" when `reconciliation.matches`, else amber "Items sum {items_sum} vs total {total} (Δ {delta}) — please check". A "Confirm" button PUTs the edited ReceiptData and navigates to `/products`. On `failed`, show the error + a "try again" link back to capture.
- [ ] **Step 3: Component test** — with a mocked client returning a `ready` draft, ReviewPage renders the items, editing a field updates state, Confirm calls `confirmReceipt(id, editedData)`. Also test the mismatch banner appears when `matches:false`.
- [ ] **Step 4: Visual verify** — full path with backend running (`READER_ENGINE=fake` for a deterministic draft, or real minicpm): capture → extract → review shows fields → confirm. Screenshot the review screen.
- [ ] **Step 5: Commit** (`feat(frontend): extract polling + review/correct + confirm`).

### Task FE-4: Products list + per-product price history

**Files:** `src/products/ProductsPage.tsx`, `src/products/PriceHistory.tsx`, tests.

- [ ] **Step 1: ProductsPage** — `GET /products`; render a list of `{display_name, last_price + currency, observations count}`; click routes to `/products/:id`.
- [ ] **Step 2: PriceHistory** — `GET /products/{id}/prices`; render the observations newest-first as a simple table AND a small line/scatter chart of price over `observed_at` (inline SVG is fine; if using Recharts, add the dep). Handle single-point / empty gracefully.
- [ ] **Step 3: Component tests** — ProductsPage lists a mocked product; PriceHistory renders points from mocked observations (and an empty-state).
- [ ] **Step 4: Visual verify** — after confirming a receipt, open Products, click a product, see its price history. Screenshot.
- [ ] **Step 5: Commit** (`feat(frontend): products list + price-history chart`).

### Task FE-5: End-to-end run + polish

- [ ] **Step 1:** Start backend (real `READER_ENGINE=minicpm`, Ollama up) + `npm run dev`. Register/login.
- [ ] **Step 2:** Push a real sample (`../invoices/41827.jpg`) through capture→rotate→crop→extract→review→confirm; then view it under Products with price history. Screenshot each screen.
- [ ] **Step 3:** Fix any wiring/UX issues found (loading states, error toasts on API failure, mobile viewport meta, basic styling pass so it's presentable).
- [ ] **Step 4:** Run the full frontend test suite (`npm run test`) — all green — and the backend suite (59 green). Commit (`chore(frontend): e2e polish`).

## Self-Review (fill after writing)
- Every spec feature from the user's request maps to a task: upload → FE-2; live rotate → FE-2; select invoice zone → FE-2; apply AI to get values → FE-3; review values → FE-3; show products → FE-4; price history per product → FE-4. Auth + plumbing → FE-1; prove-it-works → FE-5.
- No placeholders; API contract copied verbatim from the built backend.
- CORS is the only backend change and is explicit (FE-1 Step 1).
