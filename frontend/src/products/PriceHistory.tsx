import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { productPrices } from "../api/client";
import type { PriceObservation } from "../api/types";
import ErrorBanner from "../components/ErrorBanner";

type LoadState =
  | { phase: "loading" }
  | { phase: "loaded" }
  | { phase: "error"; message: string };

function formatPrice(price: number, currency: string | null): string {
  return currency ? `${price} ${currency}` : String(price);
}

function formatObservedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

const CHART_WIDTH = 480;
const CHART_HEIGHT = 180;
const PAD_X = 24;
const PAD_Y = 16;

interface ChartPoint {
  x: number;
  y: number;
}

// The API returns observations newest-first, but a "price over time" chart
// reads left-to-right as oldest-to-newest, so plot in chronological order.
// observed_at may be null for any observation, so x-position is based on
// array index (i.e. insertion order) rather than a parsed timestamp -- this
// degrades gracefully instead of crashing or mis-plotting on missing/
// unparseable dates. A single point (or a flat price series) is centered
// rather than divided-by-zero.
function buildChartPoints(observations: PriceObservation[]): ChartPoint[] {
  const chronological = [...observations].reverse();
  const prices = chronological.map((o) => o.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice;

  return chronological.map((observation, index) => {
    const x =
      chronological.length > 1
        ? PAD_X +
          (index / (chronological.length - 1)) * (CHART_WIDTH - 2 * PAD_X)
        : CHART_WIDTH / 2;
    const y =
      priceRange > 0
        ? PAD_Y +
          (1 - (observation.price - minPrice) / priceRange) *
            (CHART_HEIGHT - 2 * PAD_Y)
        : CHART_HEIGHT / 2;
    return { x, y };
  });
}

export default function PriceHistory() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [observations, setObservations] = useState<PriceObservation[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    productPrices(id)
      .then((data) => {
        if (cancelled) return;
        setObservations(data);
        setState({ phase: "loaded" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          phase: "error",
          message:
            err instanceof Error
              ? err.message
              : "Failed to load price history.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const points = state.phase === "loaded" ? buildChartPoints(observations) : [];
  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="price-history-page">
      <p className="page-nav">
        <Link to="/products">Back to products</Link>
      </p>
      <h1>Price history</h1>

      {state.phase === "loading" && (
        <p role="status">Loading price history…</p>
      )}

      <ErrorBanner message={state.phase === "error" ? state.message : null} />

      {state.phase === "loaded" && observations.length === 0 && (
        <p>No price history yet</p>
      )}

      {state.phase === "loaded" && observations.length > 0 && (
        <section className="card">
          <svg
            role="img"
            aria-label={`Price over time, ${observations.length} observation${
              observations.length === 1 ? "" : "s"
            }`}
            viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
            style={{ width: "100%", height: "auto" }}
          >
            <title>Price over time</title>
            {points.length > 1 && (
              <polyline
                points={linePoints}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={2}
              />
            )}
            {points.map((point, index) => (
              <circle
                key={index}
                cx={point.x}
                cy={point.y}
                r={4}
                fill="var(--color-primary)"
              />
            ))}
          </svg>

          <div className="table-scroll">
            <table className="price-history-table">
              <thead>
                <tr>
                  <th className="col-numeric">Price</th>
                  <th>Observed at</th>
                  <th className="col-numeric">Store</th>
                </tr>
              </thead>
              <tbody>
                {observations.map((observation, index) => (
                  <tr key={index}>
                    <td className="col-numeric">
                      {formatPrice(observation.price, observation.currency)}
                    </td>
                    <td>{formatObservedAt(observation.observed_at)}</td>
                    <td className="col-numeric">{observation.store_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
