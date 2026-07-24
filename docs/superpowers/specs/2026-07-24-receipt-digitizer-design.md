# Supermarket Receipt Digitizer — Design Spec

**Date:** 2026-07-24
**Status:** Approved (design), pending spec review → implementation plan

## 1. Vision & MVP wedge

Build a product that turns photographed paper supermarket receipts into structured
digital records, gives each user a browsable history of what they bought and for how
much, and — as a byproduct — accumulates a crowdsourced **product price history per
store** fed by everyone's receipts.

The MVP wedge is **personal receipt digitization**: it delivers value to a single user
on day one (no critical mass needed), and every confirmed receipt quietly builds the
price-history dataset that later powers cross-user price comparison. The crowdsourced
comparison product is therefore *not* a separate build — it is new queries over data the
MVP already collects.

## 2. Locked decisions (with rationale)

| Decision | Choice | Why |
|---|---|---|
| MVP focus | Personal digitization | Works for one user; sidesteps cold-start; still fills the price DB |
| Input | Photos of paper receipts | Most people have these; hardest but highest-value |
| Reading approach | VLM-first (image → structured JSON) | No per-chain templates → works multi-country |
| Reading engine | **Pluggable reader**, local MiniCPM-V for prototype | See spike (§9); swap engine via config, no rewrite |
| Market | Multi-country, locale-agnostic data model | User requirement; parsing stays model-based, prices partition by country |
| Platform | React/TS PWA | One codebase, camera + browse in one place, no app-store friction |
| Backend | Python (FastAPI) | Best ecosystem for the AI/vision pipeline |
| DB | PostgreSQL | Relational fit for price-history/normalization queries |

## 3. Architecture

```
[React/TS PWA]  ──HTTPS──▶  [FastAPI backend]  ──▶  [PostgreSQL]
  camera + crop               ├─ preprocess: rotate-upright + crop-to-receipt + resize
  review/correct UI           ├─ ReceiptReader (pluggable) ──▶ Ollama (MiniCPM-V, local)
  browse history              ├─ validate + normalize + math-reconcile
                              └─ persist + write price_observations
                                   receipt images ──▶ local object storage (filesystem/S3-compatible)
```

- **Frontend:** React + TypeScript PWA (Vite + vite-plugin-pwa), mobile-first. Camera
  capture + client-side crop ("select the invoice").
- **Backend:** FastAPI. Endpoints: auth, upload receipt, fetch draft extraction,
  confirm/correct, list receipts/products, product price history.
- **Reader abstraction:** `ReceiptReader.extract(image) -> ReceiptData`. Implementations:
  `MiniCPMReader` (Ollama, local, now); `CloudVLMReader` and `QwenLocalReader` later.
  Selected via config/env. `receipts.source_engine` records which engine produced a read.
- **Preprocessing (validated as essential in the spike):** auto-rotate to upright +
  crop the receipt out of the background + resize to a legible-but-fast size. Runs before
  the reader regardless of engine.

## 4. Data model (locale-agnostic)

- `users` — id, email, auth fields.
- `stores` — id, chain_name, address, city, **country**, tax_id. A concrete store; shared
  across users (crowdsource-friendly).
- `products` — id, normalized_name, brand, size/unit. Populated as receipts are confirmed.
  MVP keeps normalization light (raw text + best-effort match); a canonical cross-language
  catalog is a later phase.
- `receipts` — id, user_id, store_id, purchased_at, **currency**, subtotal, tax_amount,
  total, image_path, `source_engine`, `status` (draft|confirmed), `raw_extraction` (JSON).
- `receipt_items` — id, receipt_id, line_no, raw_name, product_id (nullable), quantity,
  unit_price, total_price, `is_discount` (bool), tax_class.
- **`price_observations`** — id, product_id, store_id, price, currency, observed_at,
  user_id, receipt_item_id. **Every confirmed line item writes one row.** This table *is*
  the price-history dataset; the personal MVP fills it from day one.

## 5. Core flow

1. User signs in.
2. Snaps/uploads a receipt photo (PWA camera).
3. Client: optional crop, upload to backend.
4. Backend: preprocess → `reader.extract()` → draft `ReceiptData` + per-field confidence +
   math-reconcile result.
5. Client: **review/correction screen** — user fixes store, date, items, prices; a
   reconciliation banner flags if items + tax do not match the printed total.
6. User confirms → backend persists receipt + items and writes `price_observations`.
7. Browse: receipts list, products list, per-product price history (per-user for now).

## 6. Validation & error handling

The spike proved raw model output is not trustworthy, so validation is a first-class part
of the product, not an afterthought:

- Normalize numbers (comma→dot decimal), validate against a strict schema.
- **Math reconciliation:** sum(item totals) + tax vs printed total. Mismatch → flag in the
  UI; never block — the user corrects.
- Per-field confidence to steer the user's attention in the review UI.
- Reader failure → graceful "couldn't read it, enter manually" fallback.
- Duplicate detection (same store + date + total) — surfaced, not auto-blocked. *(Low
  priority; may defer.)*

## 7. MVP scope (YAGNI)

**In:** simple auth; capture + crop; preprocess; local MiniCPM-V extraction; review/correct;
persist; browse receipts/products; **per-user** price history; the pluggable reader interface.

**Out (interface-ready, built in later phases):** cross-*user* price comparison; cross-language
canonical product catalog; cloud / bigger-GPU reader implementations; native mobile app;
insights/analytics; multi-currency conversion.

## 8. Testing

- **Eval harness (formalized spike):** golden set of receipts (the 3 samples + more) with
  expected JSON; measures per-field accuracy for a given reader. Doubles as a regression
  suite and an **engine-comparison tool** when swapping readers.
- Backend unit tests: preprocessing, number normalization, math reconciliation,
  price-observation writes; plus API tests.
- Frontend tests: the review/correction UI (the critical UX surface).

## 9. Spike findings (evidence behind the pluggable-reader decision)

Tested on an 8 GB RTX 4070 Laptop GPU, against three real Spanish receipts
(Carrefour / Hipercor / Lidl; known totals 45,53 / 29,00 / 63,28 €):

| Model | Fits 8 GB GPU? | Speed | Receipt accuracy |
|---|---|---|---|
| qwen2.5vl:3b | ❌ needs ~10 GB → CPU-only | ~177 s | Best items, but too slow (CPU) |
| gemma3:4b | ✅ 4.3 GB | ~7 s | Poor — hallucinated items, wrong total |
| moondream | ✅ 1.7 GB | ~80 s | Worst |
| granite3.2-vision:2b | ✅ 2.0 GB | ~3–8 s | Poor — wrong totals, 1–2 items |
| **minicpm-v (8B)** | ✅ 4.5 GB | ~7–28 s | **Store + total reliable; line items partial/garbled** |

**Conclusions:**
1. Preprocessing (rotate-upright + crop) is mandatory and works well.
2. No local model on 8 GB reliably extracts per-item names/prices (the core need).
   MiniCPM-V is the best *fitting* engine — reliable store + total, fast — but line-item
   detail (names, price/discount row alignment) is not production-grade.
3. Therefore the reader is **pluggable**: prototype the full app on local MiniCPM-V now;
   swap in a stronger engine (cloud VLM, or Qwen2.5-VL 7B on a ≥16 GB GPU) for
   production-grade line items without changing the rest of the system.

## 10. Future phases (not in MVP)

- Cross-user crowdsourced price comparison ("where is product X cheapest / price over time").
- Canonical, cross-language product catalog + fuzzy matching/dedup.
- Stronger reader engine for accurate line items (cloud or bigger local GPU).
- Insights (spend trends, basket comparison), native app, multi-currency.
