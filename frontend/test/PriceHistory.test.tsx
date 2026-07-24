import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import PriceHistory from "../src/products/PriceHistory";
import * as client from "../src/api/client";
import type { PriceObservation } from "../src/api/types";

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    productPrices: vi.fn(),
  };
});

function renderPriceHistory(id = "1") {
  return render(
    <MemoryRouter initialEntries={[`/products/${id}`]}>
      <Routes>
        <Route path="/products/:id" element={<PriceHistory />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PriceHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders observations newest-first as table rows and a chart line", async () => {
    const observations: PriceObservation[] = [
      {
        store_id: 5,
        price: 4.2,
        currency: "USD",
        observed_at: "2026-07-20T10:00:00Z",
      },
      {
        store_id: 5,
        price: 3.9,
        currency: "USD",
        observed_at: "2026-07-01T10:00:00Z",
      },
    ];
    vi.mocked(client.productPrices).mockResolvedValue(observations);

    const { container } = renderPriceHistory();

    expect(await screen.findByText("4.2 USD")).toBeInTheDocument();
    expect(screen.getByText("3.9 USD")).toBeInTheDocument();

    // newest-first table order: 4.2 row appears before 3.9 row
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // header + 2 observations
    expect(rows[1]).toHaveTextContent("4.2 USD");
    expect(rows[2]).toHaveTextContent("3.9 USD");

    // chart: two points connected by one line
    expect(container.querySelectorAll("circle")).toHaveLength(2);
    expect(container.querySelectorAll("polyline")).toHaveLength(1);
    expect(
      screen.getByRole("img", { name: /price over time/i }),
    ).toBeInTheDocument();
  });

  it("renders a single dot for one observation without crashing", async () => {
    const observations: PriceObservation[] = [
      { store_id: null, price: 5, currency: null, observed_at: null },
    ];
    vi.mocked(client.productPrices).mockResolvedValue(observations);

    const { container } = renderPriceHistory();

    await screen.findByText("5");
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.querySelectorAll("polyline")).toHaveLength(0);
    // null observed_at and null store_id both fall back to the em dash
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("shows the empty state when there is no price history", async () => {
    vi.mocked(client.productPrices).mockResolvedValue([]);

    renderPriceHistory();

    expect(
      await screen.findByText(/no price history yet/i),
    ).toBeInTheDocument();
  });

  it("links back to the products list", async () => {
    vi.mocked(client.productPrices).mockResolvedValue([]);

    renderPriceHistory();

    await screen.findByText(/no price history yet/i);
    expect(
      screen.getByRole("link", { name: /back to products/i }),
    ).toHaveAttribute("href", "/products");
  });
});
