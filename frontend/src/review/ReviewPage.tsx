import { useParams } from "react-router-dom";

// Placeholder for FE-3 (poll, edit, reconcile, confirm).
export default function ReviewPage() {
  const { id } = useParams();
  return (
    <div className="review-page">
      <h1>Review receipt {id}</h1>
    </div>
  );
}
