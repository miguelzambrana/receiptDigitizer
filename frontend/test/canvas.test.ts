import { describe, it, expect, vi, afterEach } from "vitest";
import {
  rotatedSize,
  defaultCropRect,
  cropRectToImageCoords,
  renderToBlob,
} from "../src/capture/canvas";

describe("rotatedSize", () => {
  it("keeps dimensions unchanged at 0 degrees", () => {
    expect(rotatedSize({ width: 100, height: 60 }, 0)).toEqual({
      width: 100,
      height: 60,
    });
  });

  it("swaps width and height at 90 degrees", () => {
    expect(rotatedSize({ width: 100, height: 60 }, 90)).toEqual({
      width: 60,
      height: 100,
    });
  });

  it("swaps width and height at -90 degrees", () => {
    expect(rotatedSize({ width: 100, height: 60 }, -90)).toEqual({
      width: 60,
      height: 100,
    });
  });

  it("keeps dimensions unchanged at 180 degrees", () => {
    expect(rotatedSize({ width: 100, height: 60 }, 180)).toEqual({
      width: 100,
      height: 60,
    });
  });
});

describe("defaultCropRect", () => {
  it("centers an 80% rectangle by default", () => {
    expect(defaultCropRect({ width: 100, height: 60 })).toEqual({
      x: 10,
      y: 6,
      width: 80,
      height: 48,
    });
  });

  it("supports a custom fraction", () => {
    expect(defaultCropRect({ width: 200, height: 100 }, 0.5)).toEqual({
      x: 50,
      y: 25,
      width: 100,
      height: 50,
    });
  });
});

describe("cropRectToImageCoords", () => {
  it("scales a display rect into image pixel coordinates", () => {
    const displayRect = { x: 10, y: 20, width: 30, height: 40 };
    expect(cropRectToImageCoords(displayRect, 2, 0)).toEqual({
      x: 20,
      y: 40,
      width: 60,
      height: 80,
    });
  });

  it("is the identity mapping at scale 1", () => {
    const displayRect = { x: 5, y: 5, width: 48, height: 80 };
    expect(cropRectToImageCoords(displayRect, 1, 0)).toEqual(displayRect);
  });

  it("maps a default-centered crop of a rotated image to the expected pixel region", () => {
    const source = { width: 100, height: 60 };
    const rotated = rotatedSize(source, 90); // {width: 60, height: 100}
    const displayCrop = defaultCropRect(rotated);
    const imageCrop = cropRectToImageCoords(displayCrop, 1, 90);
    expect(imageCrop).toEqual({ x: 6, y: 10, width: 48, height: 80 });
  });
});

describe("renderToBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rotates the source onto a bounding-box canvas, then crops it into a JPEG blob", async () => {
    const rotateCalls: number[] = [];
    const drawImageCalls: unknown[][] = [];
    const fakeCtx = {
      translate: vi.fn(),
      rotate: (rad: number) => rotateCalls.push(rad),
      drawImage: (...args: unknown[]) => drawImageCalls.push(args),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeCtx as unknown as CanvasRenderingContext2D,
    );
    const fakeBlob = new Blob(["fake-jpeg"], { type: "image/jpeg" });
    const toBlobSpy = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation(function (callback: BlobCallback) {
        callback(fakeBlob);
      });

    const source = {
      naturalWidth: 100,
      naturalHeight: 60,
    } as unknown as HTMLImageElement;
    const crop = { x: 6, y: 10, width: 48, height: 80 };

    const blob = await renderToBlob(source, 90, crop);

    expect(blob).toBe(fakeBlob);
    expect(rotateCalls[0]).toBeCloseTo((90 * Math.PI) / 180);
    // one drawImage to paint the rotated source, one to crop from it
    expect(drawImageCalls).toHaveLength(2);
    expect(toBlobSpy).toHaveBeenCalledWith(
      expect.any(Function),
      "image/jpeg",
      0.92,
    );
  });
});
