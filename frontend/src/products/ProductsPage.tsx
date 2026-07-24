import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProducts } from "../api/client";
import type { Product } from "../api/types";
import ErrorBanner from "../components/ErrorBanner";

type LoadState =
  | { phase: "loading" }
  | { phase: "loaded" }
  | { phase: "error"; message: string };

function formatPrice(price: number | null, currency: string | null): string {
  if (price === null) return "—";
  return currency ? `${price} ${currency}` : String(price);
}

export default function ProductsPage() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    let cancelled = false;

    listProducts()
      .then((data) => {
        if (cancelled) return;
        setProducts(data);
        setState({ phase: "loaded" });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          phase: "error",
          message:
            err instanceof Error ? err.message : "Failed to load products.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="products-page">
      <p className="page-nav">
        <Link to="/">Back to capture</Link>
      </p>
      <h1>Products</h1>

      {state.phase === "loading" && (
        <p role="status">Loading products…</p>
      )}

      <ErrorBanner message={state.phase === "error" ? state.message : null} />

      {state.phase === "loaded" && (
        <section className="card">
          {products.length === 0 ? (
            <p>No products yet — scan a receipt</p>
          ) : (
            <div className="table-scroll">
              <table className="products-table">
                <thead>
                  <tr>
                    <th className="col-name">Product</th>
                    <th className="col-numeric">Last price</th>
                    <th className="col-numeric">Observations</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td className="col-name">
                        <Link to={`/products/${product.id}`}>
                          {product.display_name}
                        </Link>
                      </td>
                      <td className="col-numeric">
                        {formatPrice(product.last_price, product.currency)}
                      </td>
                      <td className="col-numeric">{product.observations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
