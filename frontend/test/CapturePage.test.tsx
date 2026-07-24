import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CapturePage from "../src/capture/CapturePage";
import * as client from "../src/api/client";
import * as canvasApi from "../src/capture/canvas";

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    uploadReceipt: vi.fn(),
  };
});

// jsdom has no real image-decoding backend, so `new Image()` never fires
// `load`/`error` for a genuine data URL (verified experimentally). Stubbing
// the global constructor lets us simulate a successfully decoded photo
// without needing a real canvas/image pipeline in the test environment.
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = "";

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      this.naturalWidth = 200;
      this.naturalHeight = 100;
      this.onload?.();
    });
  }

  get src() {
    return this._src;
  }
}

// jsdom also has no real <canvas> 2D backend (getContext('2d') returns
// null), so the actual pixel-drawing half of renderToBlob can't run here.
// The math (rotatedSize/defaultCropRect/cropRectToImageCoords) is already
// covered directly in test/canvas.test.ts; here we only need to prove
// CapturePage wires rotation + crop into a renderToBlob call and forwards
// the resulting Blob to uploadReceipt.
vi.mock("../src/capture/canvas", async () => {
  const actual = await vi.importActual<typeof import("../src/capture/canvas")>(
    "../src/capture/canvas",
  );
  return {
    ...actual,
    renderToBlob: vi.fn(),
  };
});

describe("CapturePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", FakeImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the chosen image, rotates live, and extracts a rotated/cropped blob", async () => {
    vi.mocked(canvasApi.renderToBlob).mockResolvedValue(
      new Blob(["fake-jpeg"], { type: "image/jpeg" }),
    );
    vi.mocked(client.uploadReceipt).mockResolvedValue({
      id: 123,
      status: "processing",
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<CapturePage />} />
          <Route path="/review/:id" element={<div>Review Screen</div>} />
        </Routes>
      </MemoryRouter>,
    );

    const file = new File(["fake-bytes"], "receipt.jpg", {
      type: "image/jpeg",
    });
    const input = screen.getByLabelText(/choose a photo/i);
    fireEvent.change(input, { target: { files: [file] } });

    const extractButton = await screen.findByRole("button", {
      name: /extract/i,
    });

    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "90" } });
    expect(slider).toHaveValue("90");

    fireEvent.click(extractButton);

    await waitFor(() =>
      expect(client.uploadReceipt).toHaveBeenCalledTimes(1),
    );

    expect(canvasApi.renderToBlob).toHaveBeenCalledTimes(1);
    const [, rotationArg, cropArg] = vi.mocked(canvasApi.renderToBlob).mock
      .calls[0];
    expect(rotationArg).toBe(90);
    expect(cropArg).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
      }),
    );

    const [blobArg] = vi.mocked(client.uploadReceipt).mock.calls[0];
    expect(blobArg).toBeInstanceOf(Blob);

    await waitFor(() =>
      expect(screen.getByText("Review Screen")).toBeInTheDocument(),
    );
  });
});
