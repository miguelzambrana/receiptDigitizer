import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { confirmReceipt, getReceipt } from "../api/client";
import { pollReceipt, ReceiptPollAbortedError } from "./poll";
import type { ItemData, ReceiptData, Reconciliation } from "../api/types";
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

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [state, setState] = useState<LoadState>({ phase: "processing" });
  const [draft, setDraft] = useState<ReceiptData | null>(null);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let cancelled = false;

    pollReceipt(getReceipt, id, { signal: controller.signal })
      .then((raw) => {
        if (cancelled) return;
        const { reconciliation: recon, purchased_at: _purchasedAt, ...rest } =
          raw;
        setDraft(rest);
        setReconciliation(recon);
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

  if (!draft || !reconciliation) {
    // "ready" always sets both draft and reconciliation together; this is
    // unreachable in practice but keeps the render below type-safe.
    return null;
  }

  return (
    <div className="review-page">
      <h1>Review receipt</h1>

      {reconciliation.matches ? (
        <p className="reconciliation-banner reconciliation-ok" role="status">
          ✓ Items match the total
        </p>
      ) : (
        <p
          className="reconciliation-banner reconciliation-mismatch"
          role="alert"
        >
          Items sum {reconciliation.items_sum} vs total{" "}
          {reconciliation.expected_total ?? "—"} (Δ{" "}
          {reconciliation.delta ?? "—"}) — please review
        </p>
      )}

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

      <div className="table-scroll">
        <table className="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit price</th>
              <th>Total price</th>
              <th>Discount</th>
              <th />
            </tr>
          </thead>
          <tbody>
          {draft.items.map((item, index) => (
            <tr key={index} data-testid={`item-row-${index}`}>
              <td>
                <input
                  aria-label={`Item ${index + 1} name`}
                  value={item.raw_name}
                  onChange={(e) =>
                    updateItem(index, "raw_name", e.target.value)
                  }
                />
              </td>
              <td>
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
              <td>
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
              <td>
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
              <td>
                <input
                  aria-label={`Item ${index + 1} is discount`}
                  type="checkbox"
                  checked={item.is_discount}
                  onChange={(e) =>
                    updateItem(index, "is_discount", e.target.checked)
                  }
                />
              </td>
              <td>
                <button type="button" onClick={() => removeItem(index)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
          </tbody>
        </table>
      </div>

      <ErrorBanner message={submitError} />

      <button type="button" onClick={handleConfirm} disabled={submitting}>
        {submitting ? "Confirming…" : "Confirm"}
      </button>
    </div>
  );
}
