import type { Receipt, RawExtraction } from "../api/types";

export interface PollReceiptOptions {
  /** Delay between polls while status stays "processing". Default 2000ms. */
  intervalMs?: number;
  /** Hard cap on attempts so a stuck receipt can't be polled forever. Default 30. */
  maxAttempts?: number;
  /** Lets the caller cancel an in-flight poll (e.g. on component unmount). */
  signal?: AbortSignal;
}

export class ReceiptPollAbortedError extends Error {
  constructor() {
    super("Receipt polling was cancelled");
    this.name = "ReceiptPollAborted";
  }
}

export class ReceiptProcessingFailedError extends Error {
  constructor(message = "Receipt processing failed") {
    super(message);
    this.name = "ReceiptProcessingFailed";
  }
}

export class ReceiptPollTimeoutError extends Error {
  constructor() {
    super("Timed out waiting for the receipt to finish processing");
    this.name = "ReceiptPollTimeout";
  }
}

const DEFAULT_INTERVAL_MS = 2000;
const DEFAULT_MAX_ATTEMPTS = 30;

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ReceiptPollAbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new ReceiptPollAbortedError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Polls `GET /receipts/{id}` (via the injected `getReceiptFn`) while the
 * receipt's status is "processing". Resolves with the `raw_extraction` draft
 * once status is "ready", and rejects with a `ReceiptProcessingFailedError`
 * (carrying the backend's error message) once status is "failed".
 *
 * Bounded by `maxAttempts` (default 30, ~1 minute at the default 2s interval)
 * so a receipt stuck in "processing" can never be polled forever; once
 * exhausted it rejects with `ReceiptPollTimeoutError`.
 */
export async function pollReceipt(
  getReceiptFn: (id: number | string) => Promise<Receipt>,
  id: number | string,
  options: PollReceiptOptions = {},
): Promise<RawExtraction> {
  const {
    intervalMs = DEFAULT_INTERVAL_MS,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    signal,
  } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new ReceiptPollAbortedError();
    }

    const receipt = await getReceiptFn(id);

    if (receipt.status === "failed") {
      const extraction = receipt.raw_extraction;
      const message =
        extraction && "error" in extraction
          ? extraction.error
          : "Receipt processing failed";
      throw new ReceiptProcessingFailedError(message);
    }

    if (receipt.status === "ready" || receipt.status === "confirmed") {
      const extraction = receipt.raw_extraction;
      if (!extraction || "error" in extraction) {
        throw new ReceiptProcessingFailedError(
          "Receipt finished processing but has no extraction data",
        );
      }
      return extraction;
    }

    // status === "processing": wait and try again, unless this was the last attempt.
    if (attempt === maxAttempts) {
      break;
    }
    await delay(intervalMs, signal);
  }

  throw new ReceiptPollTimeoutError();
}
