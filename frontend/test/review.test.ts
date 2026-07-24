import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  pollReceipt,
  ReceiptPollTimeoutError,
} from "../src/review/poll";
import type { Receipt, RawExtraction } from "../src/api/types";

function makeReceipt(overrides: Partial<Receipt>): Receipt {
  return {
    id: 1,
    status: "processing",
    source_engine: null,
    raw_extraction: null,
    store_id: null,
    total: null,
    currency: null,
    ...overrides,
  };
}

const readyExtraction: RawExtraction = {
  store: "Corner Shop",
  address: null,
  city: null,
  country: null,
  tax_id: null,
  date_text: "2026-07-20",
  currency: "USD",
  subtotal: 10,
  tax_amount: 0,
  total: 10,
  items: [],
  reconciliation: { items_sum: 10, expected_total: 10, delta: 0, matches: true },
  purchased_at: "2026-07-20T00:00:00Z",
};

describe("pollReceipt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls GET /receipts/{id} on an interval while status is processing", async () => {
    const getReceiptMock = vi
      .fn()
      .mockResolvedValueOnce(makeReceipt({ status: "processing" }))
      .mockResolvedValueOnce(makeReceipt({ status: "processing" }))
      .mockResolvedValueOnce(
        makeReceipt({ status: "ready", raw_extraction: readyExtraction }),
      );

    const promise = pollReceipt(getReceiptMock, 1, { intervalMs: 1000 });

    // first attempt fires immediately, no wait
    await vi.advanceTimersByTimeAsync(0);
    expect(getReceiptMock).toHaveBeenCalledTimes(1);
    expect(getReceiptMock).toHaveBeenCalledWith(1);

    // still processing -> nothing happens before the interval elapses
    await vi.advanceTimersByTimeAsync(999);
    expect(getReceiptMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(getReceiptMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(getReceiptMock).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toEqual(readyExtraction);
  });

  it("resolves with the raw_extraction draft as soon as status is ready", async () => {
    const getReceiptMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeReceipt({ status: "ready", raw_extraction: readyExtraction }),
      );

    const promise = pollReceipt(getReceiptMock, 42, { intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(0);

    await expect(promise).resolves.toEqual(readyExtraction);
    expect(getReceiptMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an error when status is failed", async () => {
    const getReceiptMock = vi
      .fn()
      .mockResolvedValueOnce(makeReceipt({ status: "processing" }))
      .mockResolvedValueOnce(
        makeReceipt({
          status: "failed",
          raw_extraction: { error: "the image was too blurry to read" },
        }),
      );

    const promise = pollReceipt(getReceiptMock, 1, { intervalMs: 1000 });
    const assertion = expect(promise).rejects.toThrow(/blurry/);

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
  });

  it("gives up after maxAttempts so it can never poll forever", async () => {
    const getReceiptMock = vi
      .fn()
      .mockResolvedValue(makeReceipt({ status: "processing" }));

    const promise = pollReceipt(getReceiptMock, 1, {
      intervalMs: 1000,
      maxAttempts: 3,
    });
    const assertion = expect(promise).rejects.toBeInstanceOf(
      ReceiptPollTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    await assertion;
    // exactly 3 calls: no request scheduled after the final attempt
    expect(getReceiptMock).toHaveBeenCalledTimes(3);
  });

  it("stops polling and rejects immediately when the caller aborts", async () => {
    const getReceiptMock = vi
      .fn()
      .mockResolvedValue(makeReceipt({ status: "processing" }));
    const controller = new AbortController();

    const promise = pollReceipt(getReceiptMock, 1, {
      intervalMs: 1000,
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toThrow(/cancel/i);

    await vi.advanceTimersByTimeAsync(0);
    expect(getReceiptMock).toHaveBeenCalledTimes(1);

    controller.abort();
    await assertion;

    // no further request is made even if time moves on
    await vi.advanceTimersByTimeAsync(5000);
    expect(getReceiptMock).toHaveBeenCalledTimes(1);
  });
});
