import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import CapturePage from "../src/capture/CapturePage";
import * as client from "../src/api/client";
import * as canvasApi from "../src/capture/canvas";

// Regression test for the crop-coordinate-space bug: the crop rectangle must
// be seeded and dragged in on-screen "display" (CSS pixel) space, and
// converted to the canvas's intrinsic pixel space EXACTLY ONCE, at Extract
// time. Before the fix, the default crop was seeded from the intrinsic
// canvasSize and then *also* multiplied by scale in handleExtract, so for
// any photo whose on-screen size is smaller than its intrinsic resolution
// (scale != 1, the normal mobile case) the exported crop was scaled far
// outside the real display box.
//
// Here the fake image reports an 800x600 intrinsic (natural) size, while the
// canvas's on-screen box is stubbed to 400x300 (scale 2). The expected
// default crop is computed from the DISPLAY size (400x300), not the
// intrinsic size:
//   display default crop (80% centered of 400x300):
//     { x: 40, y: 30, width: 320, height: 240 }
//   intrinsic crop passed to renderToBlob (display crop * scale 2):
//     { x: 80, y: 60, width: 640, height: 480 }

vi.mock("../src/api/client", async () => {
  const actual = await vi.importActual<typeof import("../src/api/client")>(
    "../src/api/client",
  );
  return {
    ...actual,
    uploadReceipt: vi.fn(),
  };
});

// Same jsdom limitation as CapturePage.test.tsx: `new Image()` never fires
// load/error for a real data URL, so we stub the global constructor. This
// fake reports an 800x600 natural size (the "real photo" resolution).
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = "";

  set src(value: string) {
    this._src = value;
    queueMicrotask(() => {
      this.naturalWidth = 800;
      this.naturalHeight = 600;
      this.onload?.();
    });
  }

  get src() {
    return this._src;
  }
}

vi.mock("../src/capture/canvas", async () => {
  const actual = await vi.importActual<typeof import("../src/capture/canvas")>(
    "../src/capture/canvas",
  );
  return {
    ...actual,
    renderToBlob: vi.fn(),
  };
});

describe("CapturePage crop coordinate space (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", FakeImage);
    // Simulate a real on-screen canvas box that is smaller than the
    // intrinsic (natural) resolution -- the normal mobile case, and the one
    // jsdom's all-zero getBoundingClientRect() default was hiding.
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 400,
      height: 300,
      top: 0,
      left: 0,
      right: 400,
      bottom: 300,
      x: 0,
      y: 0,
      toJSON() {
        return this;
      },
    } as DOMRect);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("extracts using an intrinsic-space crop equal to the display-space default crop scaled up", async () => {
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

    // The overlay div renders `crop` directly as CSS pixel offsets, so its
    // inline style is the actual display-space crop the user sees.
    const cropBox = await screen.findByTestId("crop-box");
    expect(cropBox.style.left).toBe("40px");
    expect(cropBox.style.top).toBe("30px");
    expect(cropBox.style.width).toBe("320px");
    expect(cropBox.style.height).toBe("240px");

    fireEvent.click(extractButton);

    await waitFor(() =>
      expect(client.uploadReceipt).toHaveBeenCalledTimes(1),
    );

    expect(canvasApi.renderToBlob).toHaveBeenCalledTimes(1);
    const [, rotationArg, cropArg] = vi.mocked(canvasApi.renderToBlob).mock
      .calls[0];
    expect(rotationArg).toBe(0);
    expect(cropArg).toEqual({ x: 80, y: 60, width: 640, height: 480 });
  });
});
