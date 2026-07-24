import { useParams } from "react-router-dom";

// Placeholder for FE-4 (per-product price history chart).
export default function PriceHistory() {
  const { id } = useParams();
  return (
    <div className="price-history-page">
      <h1>Price history for product {id}</h1>
    </div>
  );
}
