// Pure rotate/crop -> Blob transform for the Capture screen. The math here
// (rotatedSize, defaultCropRect, cropRectToImageCoords) is intentionally
// pixel-free so it can be unit-tested without a real <canvas> backend; only
// renderToBlob itself touches the DOM canvas APIs, and it stays a thin
// wrapper around that math.

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderToBlobOptions {
  mimeType?: string;
  quality?: number;
}

type ImageSource = HTMLImageElement | ImageBitmap;

function getSourceSize(source: ImageSource): Size {
  if ("naturalWidth" in source) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

/**
 * Pure math: the pixel dimensions of the axis-aligned bounding box that
 * contains `size` after rotating it by `rotationDeg` (degrees). At 0/180
 * degrees the size is unchanged; at +-90/270 width and height swap; other
 * angles produce the bounding box of the rotated rectangle.
 */
export function rotatedSize(size: Size, rotationDeg: number): Size {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: Math.round(size.width * cos + size.height * sin),
    height: Math.round(size.width * sin + size.height * cos),
  };
}

/**
 * Pure math: a centered crop rectangle covering `fraction` (default ~80%)
 * of the given size.
 */
export function defaultCropRect(size: Size, fraction = 0.8): Rect {
  const width = size.width * fraction;
  const height = size.height * fraction;
  return {
    x: (size.width - width) / 2,
    y: (size.height - height) / 2,
    width,
    height,
  };
}

/**
 * Pure math: maps a crop rectangle expressed in on-screen "display" pixel
 * coordinates (the crop-box overlay dragged over the, possibly CSS-scaled,
 * preview <canvas>) into the pixel coordinates of the full-resolution,
 * already-rotated canvas that renderToBlob operates on. `scale` is
 * fullResolutionPixels / displayedCssPixels (a single uniform factor, since
 * aspect ratio is preserved). `rotationDeg` is accepted for API
 * completeness / future use (e.g. bounds clamping against the rotated
 * canvas) — the mapping itself is a plain scale because the display canvas
 * is already rendered in the rotated orientation, so no further rotation is
 * needed here.
 */
export function cropRectToImageCoords(
  displayRect: Rect,
  scale: number,
  rotationDeg: number,
): Rect {
  void rotationDeg;
  return {
    x: displayRect.x * scale,
    y: displayRect.y * scale,
    width: displayRect.width * scale,
    height: displayRect.height * scale,
  };
}

/**
 * Rotates `source` by `rotationDeg` onto an offscreen canvas sized to the
 * rotated bounding box, then crops `crop` (in that rotated canvas's pixel
 * coordinates) into a JPEG Blob.
 */
export async function renderToBlob(
  source: ImageSource,
  rotationDeg: number,
  crop: Rect,
  opts: RenderToBlobOptions = {},
): Promise<Blob> {
  const sourceSize = getSourceSize(source);
  const rotated = rotatedSize(sourceSize, rotationDeg);

  const rotationCanvas = document.createElement("canvas");
  rotationCanvas.width = Math.max(1, rotated.width);
  rotationCanvas.height = Math.max(1, rotated.height);
  const rctx = rotationCanvas.getContext("2d");
  if (!rctx) {
    throw new Error("2D canvas context unavailable");
  }
  rctx.translate(rotationCanvas.width / 2, rotationCanvas.height / 2);
  rctx.rotate((rotationDeg * Math.PI) / 180);
  rctx.drawImage(
    source as CanvasImageSource,
    -sourceSize.width / 2,
    -sourceSize.height / 2,
    sourceSize.width,
    sourceSize.height,
  );

  const outWidth = Math.max(1, Math.round(crop.width));
  const outHeight = Math.max(1, Math.round(crop.height));
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outWidth;
  outputCanvas.height = outHeight;
  const octx = outputCanvas.getContext("2d");
  if (!octx) {
    throw new Error("2D canvas context unavailable");
  }
  octx.drawImage(
    rotationCanvas,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    outWidth,
    outHeight,
  );

  return new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Failed to encode image"));
        }
      },
      opts.mimeType ?? "image/jpeg",
      opts.quality ?? 0.92,
    );
  });
}
