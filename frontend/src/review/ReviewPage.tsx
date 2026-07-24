import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { confirmReceipt, getReceipt } from "../api/client";
import { pollReceipt, ReceiptPollAbortedError } from "./poll";
import type { ItemData, ReceiptData } from "../api/types";
import ErrorBanner from "../components/ErrorBanner";

type LoadState =
  | { phase: "processing" }
  | { phase: "ready" }
  | { phase: "failed"; message: string };

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseNumber(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

/** Rounds to 2 decimal places, avoiding common floating-point sums like
 * 0.1 + 0.2 printing as 0.30000000000000004. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>({ phase: "processing" });
  const [draft, setDraft] = useState<ReceiptData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let cancelled = false;

    pollReceipt(getReceipt, id, { signal: controller.signal })
      .then((raw) => {
        if (cancelled) return;
        // The backend's reconciliation snapshot is frozen at extraction
        // time and doesn't recompute as the user edits items below, so it's
        // deliberately dropped here in favor of a live computation (see
        // itemsSum/matches/delta below). purchased_at isn't editable either.
        const { reconciliation: _reconciliation, purchased_at: _purchasedAt, ...rest } =
          raw;
        setDraft(rest);
        setState({ phase: "ready" });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ReceiptPollAbortedError) return;
        setState({
          phase: "failed",
          message:
            err instanceof Error
              ? err.message
              : "Failed to load the receipt.",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id]);

  function updateField<K extends keyof ReceiptData>(
    field: K,
    value: ReceiptData[K],
  ) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateItem<K extends keyof ItemData>(
    index: number,
    field: K,
    value: ItemData[K],
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((item, i) =>
        i === index ? { ...item, [field]: value } : item,
      );
      return { ...prev, items };
    });
  }

  function removeItem(index: number) {
    setDraft((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== index) };
    });
  }

  async function handleConfirm() {
    if (!id || !draft) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await confirmReceipt(id, draft);
      navigate("/products");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to confirm the receipt.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (state.phase === "processing") {
    return (
      <div className="review-page">
        <p role="status">Reading your receipt…</p>
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className="review-page">
        <ErrorBanner message={state.message} />
        <Link to="/">Try again</Link>
      </div>
    );
  }

  if (!draft) {
    // "ready" always sets draft; this is unreachable in practice but keeps
    // the render below type-safe.
    return null;
  }

  // Live reconciliation, recomputed from the current (possibly edited)
  // draft on every render -- never from the backend's frozen snapshot.
  // Discount rows carry a negative total_price, so a plain sum already
  // nets them out; no need to special-case is_discount here.
  const itemsSum = round2(
    draft.items.reduce((sum, item) => sum + item.total_price, 0),
  );
  const total = draft.total;
  const currency = draft.currency ?? "";
  const delta = total != null ? round2(itemsSum - total) : null;
  const matches = total != null && Math.abs(itemsSum - total) <= 0.02;

  function useItemsTotal() {
    updateField("total", itemsSum);
  }

  return (
    <div className="review-page">
      <h1>Review receipt</h1>

      <p className="items-total-line">
        Line items total: {itemsSum} {currency}
      </p>

      {total == null && (
        <div className="reconciliation-banner reconciliation-info" role="status">
          <p>
            No total detected on the receipt — line items add up to{" "}
            {itemsSum} {currency}.
          </p>
          <button type="button" onClick={useItemsTotal}>
            Use items total
          </button>
        </div>
      )}

      {total != null && matches && (
        <p className="reconciliation-banner reconciliation-ok" role="status">
          ✓ Items match the total ({total} {currency})
        </p>
      )}

      {total != null && !matches && (
        <div
          className="reconciliation-banner reconciliation-mismatch"
          role="alert"
        >
          <p>
            Line items sum to {itemsSum} but the total says {total} (Δ{" "}
            {delta}) — please review.
          </p>
          <button type="button" onClick={useItemsTotal}>
            Use items total
          </button>
        </div>
      )}

      <section className="card">
        <h2>Receipt details</h2>
        <div className="review-form">
          <label>
            Store
            <input
              aria-label="Store"
              value={draft.store ?? ""}
              onChange={(e) => updateField("store", e.target.value)}
            />
          </label>
          <label>
            Date
            <input
              aria-label="Date"
              value={draft.date_text ?? ""}
              onChange={(e) => updateField("date_text", e.target.value)}
            />
          </label>
          <label>
            Currency
            <input
              aria-label="Currency"
              value={draft.currency ?? ""}
              onChange={(e) => updateField("currency", e.target.value)}
            />
          </label>
          <label>
            Total
            <input
              aria-label="Total"
              type="number"
              value={draft.total ?? ""}
              onChange={(e) =>
                updateField("total", parseOptionalNumber(e.target.value))
              }
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Items</h2>
        <div className="table-scroll">
          <table className="items-table">
            <thead>
              <tr>
                <th className="col-name">Item</th>
                <th className="col-numeric">Qty</th>
                <th className="col-numeric">Unit price</th>
                <th className="col-numeric">Total price</th>
                <th className="col-action">Discount</th>
                <th className="col-action" />
              </tr>
            </thead>
            <tbody>
            {draft.items.map((item, index) => (
              <tr key={index} data-testid={`item-row-${index}`}>
                <td className="col-name">
                  <input
                    aria-label={`Item ${index + 1} name`}
                    value={item.raw_name}
                    onChange={(e) =>
                      updateItem(index, "raw_name", e.target.value)
                    }
                  />
                </td>
                <td className="col-numeric">
                  <input
                    aria-label={`Item ${index + 1} quantity`}
                    type="number"
                    value={item.quantity ?? ""}
                    onChange={(e) =>
                      updateItem(
                        index,
                        "quantity",
                        parseOptionalNumber(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="col-numeric">
                  <input
                    aria-label={`Item ${index + 1} unit price`}
                    type="number"
                    value={item.unit_price ?? ""}
                    onChange={(e) =>
                      updateItem(
                        index,
                        "unit_price",
                        parseOptionalNumber(e.target.value),
                      )
                    }
                  />
                </td>
                <td className="col-numeric">
                  <input
                    aria-label={`Item ${index + 1} total price`}
                    type="number"
                    value={item.total_price}
                    onChange={(e) =>
                      updateItem(
                        index,
                        "total_price",
                        parseNumber(e.target.value, item.total_price),
                      )
                    }
                  />
                </td>
                <td className="col-action">
                  <input
                    aria-label={`Item ${index + 1} is discount`}
                    type="checkbox"
                    checked={item.is_discount}
                    onChange={(e) =>
                      updateItem(index, "is_discount", e.target.checked)
                    }
                  />
                </td>
                <td className="col-action">
                  <button type="button" onClick={() => removeItem(index)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </section>

      <ErrorBanner message={submitError} />

      <button type="button" onClick={handleConfirm} disabled={submitting}>
        {submitting ? "Confirming…" : "Confirm"}
      </button>
    </div>
  );
}
