import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ProductsPage from "../src/products/ProductsPage";
import * as client from "../src/api/client";
import type { Product } from "../src/api/types";

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    listProducts: vi.fn(),
  };
});

function renderProductsPage() {
  return render(
    <MemoryRouter>
      <ProductsPage />
    </MemoryRouter>,
  );
}

describe("ProductsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a product row with name, price, currency, and observation count", async () => {
    const products: Product[] = [
      {
        id: 1,
        display_name: "Milk 1L",
        last_price: 3.5,
        currency: "USD",
        observations: 4,
      },
    ];
    vi.mocked(client.listProducts).mockResolvedValue(products);

    renderProductsPage();

    const link = await screen.findByRole("link", { name: "Milk 1L" });
    expect(link).toHaveAttribute("href", "/products/1");
    expect(screen.getByText("3.5 USD")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders a dash for a null price and handles a null currency", async () => {
    const products: Product[] = [
      {
        id: 2,
        display_name: "Mystery item",
        last_price: null,
        currency: null,
        observations: 0,
      },
    ];
    vi.mocked(client.listProducts).mockResolvedValue(products);

    renderProductsPage();

    await screen.findByRole("link", { name: "Mystery item" });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the empty state when there are no products", async () => {
    vi.mocked(client.listProducts).mockResolvedValue([]);

    renderProductsPage();

    expect(
      await screen.findByText(/no products yet.*scan a receipt/i),
    ).toBeInTheDocument();
  });

  it("links back to the capture screen", async () => {
    vi.mocked(client.listProducts).mockResolvedValue([]);

    renderProductsPage();

    await screen.findByText(/no products yet/i);
    expect(screen.getByRole("link", { name: /back to capture/i })).toHaveAttribute(
      "href",
      "/",
    );
  });
});
