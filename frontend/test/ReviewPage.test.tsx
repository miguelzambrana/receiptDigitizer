import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReviewPage from "../src/review/ReviewPage";
import * as client from "../src/api/client";
import type { Receipt, RawExtraction } from "../src/api/types";

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    getReceipt: vi.fn(),
    confirmReceipt: vi.fn(),
  };
});

function makeReadyReceipt(overrides: Partial<RawExtraction> = {}): Receipt {
  const raw: RawExtraction = {
    store: "Corner Shop",
    address: "1 Main St",
    city: "Springfield",
    country: "US",
    tax_id: null,
    date_text: "2026-07-20",
    currency: "USD",
    subtotal: 9,
    tax_amount: 1,
    total: 10,
    items: [
      {
        raw_name: "Milk",
        quantity: 1,
        unit_price: 3,
        total_price: 3,
        is_discount: false,
        tax_class: null,
      },
      {
        raw_name: "Bread",
        quantity: 2,
        unit_price: 3.5,
        total_price: 7,
        is_discount: false,
        tax_class: null,
      },
    ],
    reconciliation: {
      items_sum: 10,
      expected_total: 10,
      delta: 0,
      matches: true,
    },
    purchased_at: "2026-07-20T00:00:00Z",
    ...overrides,
  };
  return {
    id: 1,
    status: "ready",
    source_engine: "fake",
    raw_extraction: raw,
    store_id: null,
    total: 10,
    currency: "USD",
  };
}

function renderReviewPage(id = "1") {
  return render(
    <MemoryRouter initialEntries={[`/review/${id}`]}>
      <Routes>
        <Route path="/review/:id" element={<ReviewPage />} />
        <Route path="/products" element={<div>Products Screen</div>} />
        <Route path="/" element={<div>Capture Screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a spinner while the receipt is processing", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue({
      id: 1,
      status: "processing",
      source_engine: null,
      raw_extraction: null,
      store_id: null,
      total: null,
      currency: null,
    });

    renderReviewPage();

    expect(
      await screen.findByText(/reading your receipt/i),
    ).toBeInTheDocument();
  });

  it("renders the editable items table, lets editing update state, and confirms with the edited data", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue(makeReadyReceipt());
    vi.mocked(client.confirmReceipt).mockResolvedValue({
      id: 1,
      status: "confirmed",
      store_id: 5,
    });

    renderReviewPage();

    expect(await screen.findByDisplayValue("Milk")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bread")).toBeInTheDocument();
    expect(screen.getByText(/items match the total/i)).toBeInTheDocument();

    const totalInput = screen.getByLabelText("Total");
    fireEvent.change(totalInput, { target: { value: "12" } });
    expect(totalInput).toHaveValue(12);

    const milkQuantity = screen.getByLabelText("Item 1 quantity");
    fireEvent.change(milkQuantity, { target: { value: "4" } });
    expect(milkQuantity).toHaveValue(4);

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() =>
      expect(client.confirmReceipt).toHaveBeenCalledTimes(1),
    );

    const [idArg, dataArg] = vi.mocked(client.confirmReceipt).mock.calls[0];
    expect(idArg).toBe("1");
    expect(dataArg.total).toBe(12);
    expect(dataArg.items[0]).toMatchObject({ raw_name: "Milk", quantity: 4 });
    expect(dataArg).not.toHaveProperty("reconciliation");
    expect(dataArg).not.toHaveProperty("purchased_at");

    await waitFor(() =>
      expect(screen.getByText("Products Screen")).toBeInTheDocument(),
    );
  });

  it("lets a row be removed from the items table before confirming", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue(makeReadyReceipt());
    vi.mocked(client.confirmReceipt).mockResolvedValue({
      id: 1,
      status: "confirmed",
      store_id: null,
    });

    renderReviewPage();

    await screen.findByDisplayValue("Milk");
    fireEvent.click(screen.getAllByRole("button", { name: /remove/i })[0]);

    expect(screen.queryByDisplayValue("Milk")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Bread")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() =>
      expect(client.confirmReceipt).toHaveBeenCalledTimes(1),
    );
    const [, dataArg] = vi.mocked(client.confirmReceipt).mock.calls[0];
    expect(dataArg.items).toHaveLength(1);
    expect(dataArg.items[0].raw_name).toBe("Bread");
  });

  it("shows a live items total that updates as an item's total price is edited", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue(makeReadyReceipt());

    renderReviewPage();

    await screen.findByDisplayValue("Milk");
    expect(screen.getByText(/line items total: 10 USD/i)).toBeInTheDocument();

    const milkTotalPrice = screen.getByLabelText("Item 1 total price");
    fireEvent.change(milkTotalPrice, { target: { value: "5" } });

    // Milk 5 + Bread 7 = 12, recomputed live from the edited items.
    expect(screen.getByText(/line items total: 12 USD/i)).toBeInTheDocument();
    expect(
      screen.getByText(/line items sum to 12 but the total says 10/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/items match the total/i),
    ).not.toBeInTheDocument();
  });

  it("shows an info banner with a 'Use items total' button when no total was detected, and applies it", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue(
      makeReadyReceipt({ total: null }),
    );

    renderReviewPage();

    await screen.findByDisplayValue("Milk");

    expect(
      screen.getByText(/no total detected on the receipt/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/line items add up to 10 USD/i)).toBeInTheDocument();

    const totalInput = screen.getByLabelText("Total");
    expect(totalInput).toHaveValue(null);

    fireEvent.click(screen.getByRole("button", { name: /use items total/i }));

    expect(totalInput).toHaveValue(10);
    expect(
      screen.getByText(/items match the total \(10 USD\)/i),
    ).toBeInTheDocument();
  });

  it("flips the banner from mismatch to match when the total is edited to equal the live items sum", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue(
      makeReadyReceipt({ total: 12 }),
    );

    renderReviewPage();

    await screen.findByDisplayValue("Milk");

    // Items still sum to 10 (3 + 7), total says 12 -> mismatch, Δ -2.
    expect(
      screen.getByText(/line items sum to 10 but the total says 12/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Δ -2/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /use items total/i }),
    ).toBeInTheDocument();

    const totalInput = screen.getByLabelText("Total");
    fireEvent.change(totalInput, { target: { value: "10" } });

    expect(
      screen.getByText(/items match the total \(10 USD\)/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /use items total/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the error and a retry link when status is failed", async () => {
    vi.mocked(client.getReceipt).mockResolvedValue({
      id: 1,
      status: "failed",
      source_engine: null,
      raw_extraction: { error: "the image was too blurry to read" },
      store_id: null,
      total: null,
      currency: null,
    });

    renderReviewPage();

    expect(
      await screen.findByText(/too blurry to read/i),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /try again/i });
    expect(link).toHaveAttribute("href", "/");
  });
});
