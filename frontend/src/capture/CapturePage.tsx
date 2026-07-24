import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { uploadReceipt } from "../api/client";
import {
  cropRectToImageCoords,
  defaultCropRect,
  renderToBlob,
  rotatedSize,
  type Rect,
  type Size,
} from "./canvas";

const MIN_ROTATION = -180;
const MAX_ROTATION = 180;
const MIN_CROP_SIZE = 20;

type DragState =
  | { kind: "move"; pointerId: number; startX: number; startY: number; startRect: Rect }
  | { kind: "resize"; pointerId: number; startX: number; startY: number; startRect: Rect };

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// Falls back to the canvas's own intrinsic size when the layout engine can't
// report a real on-screen size (e.g. jsdom in tests, or before first paint).
// In that fallback the "display" coordinate space and the canvas's own
// pixel space are identical, i.e. scale 1 — a safe, correct default.
function getDisplaySize(canvas: HTMLCanvasElement): Size {
  const rect = canvas.getBoundingClientRect();
  return {
    width: rect.width || canvas.width,
    height: rect.height || canvas.height,
  };
}

export default function CapturePage() {
  const navigate = useNavigate();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const [naturalSize, setNaturalSize] = useState<Size | null>(null);
  const [rotationDeg, setRotationDeg] = useState(0);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasSize = useMemo(
    () => (naturalSize ? rotatedSize(naturalSize, rotationDeg) : null),
    [naturalSize, rotationDeg],
  );

  // Redraw the rotated image live whenever the source image or rotation
  // changes, and reset the crop box to a centered ~80% default for the new
  // orientation. jsdom (and any environment without a real canvas 2D
  // backend) returns a null context here; drawing is simply skipped in
  // that case, but the crop-box reset still runs.
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !canvasSize) return;

    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotationDeg * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      ctx.restore();
    }

    setCrop(defaultCropRect(canvasSize));
  }, [canvasSize, rotationDeg]);

  const resetForNewImage = useCallback((size: Size) => {
    setNaturalSize(size);
    setRotationDeg(0);
  }, []);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        resetForNewImage({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => setError("Could not load that image.");
      img.src = dataUrl;
    };
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsDataURL(file);

    // allow re-selecting the same file later
    e.target.value = "";
  }

  function rotateBy(delta: number) {
    setRotationDeg((prev) => {
      let next = prev + delta;
      while (next > MAX_ROTATION) next -= 360;
      while (next < MIN_ROTATION) next += 360;
      return next;
    });
  }

  function handleCropPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!crop) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: "move",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startRect: crop,
    };
  }

  function handleResizePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!crop) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      kind: "resize",
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startRect: crop,
    };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || drag.pointerId !== e.pointerId || !canvas) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const bounds = getDisplaySize(canvas);

    if (drag.kind === "move") {
      const maxX = Math.max(0, bounds.width - drag.startRect.width);
      const maxY = Math.max(0, bounds.height - drag.startRect.height);
      setCrop({
        ...drag.startRect,
        x: clamp(drag.startRect.x + dx, 0, maxX),
        y: clamp(drag.startRect.y + dy, 0, maxY),
      });
    } else {
      const maxWidth = Math.max(MIN_CROP_SIZE, bounds.width - drag.startRect.x);
      const maxHeight = Math.max(MIN_CROP_SIZE, bounds.height - drag.startRect.y);
      setCrop({
        ...drag.startRect,
        width: clamp(drag.startRect.width + dx, MIN_CROP_SIZE, maxWidth),
        height: clamp(drag.startRect.height + dy, MIN_CROP_SIZE, maxHeight),
      });
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  }

  async function handleExtract() {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !crop) return;

    setUploading(true);
    setError(null);
    try {
      const displaySize = getDisplaySize(canvas);
      const scale = displaySize.width > 0 ? canvas.width / displaySize.width : 1;
      const imageCrop = cropRectToImageCoords(crop, scale, rotationDeg);
      const blob = await renderToBlob(img, rotationDeg, imageCrop);
      const result = await uploadReceipt(blob);
      navigate(`/review/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload the receipt.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="capture-page">
      <h1>Capture a receipt</h1>
      <label className="file-input">
        Choose a photo
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
        />
      </label>

      {naturalSize && canvasSize && (
        <>
          <div
            className="capture-stage"
            ref={stageRef}
            style={{
              position: "relative",
              display: "inline-block",
              maxWidth: "100%",
              marginTop: 12,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ display: "block", maxWidth: "100%", height: "auto" }}
            />
            {crop && (
              <div
                data-testid="crop-box"
                onPointerDown={handleCropPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                style={{
                  position: "absolute",
                  left: crop.x,
                  top: crop.y,
                  width: crop.width,
                  height: crop.height,
                  border: "2px solid #22d3ee",
                  boxSizing: "border-box",
                  touchAction: "none",
                  cursor: "move",
                }}
              >
                <div
                  data-testid="crop-resize-handle"
                  onPointerDown={handleResizePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  style={{
                    position: "absolute",
                    right: -7,
                    bottom: -7,
                    width: 14,
                    height: 14,
                    background: "#22d3ee",
                    borderRadius: 2,
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                />
              </div>
            )}
          </div>

          <div className="rotation-controls" style={{ marginTop: 12 }}>
            <label>
              Rotation: {rotationDeg}°
              <input
                type="range"
                min={MIN_ROTATION}
                max={MAX_ROTATION}
                value={rotationDeg}
                onChange={(e) => setRotationDeg(Number(e.target.value))}
              />
            </label>
            <button type="button" onClick={() => rotateBy(-90)}>
              -90°
            </button>
            <button type="button" onClick={() => rotateBy(90)}>
              +90°
            </button>
          </div>

          {error && <p role="alert">{error}</p>}

          <button
            type="button"
            onClick={handleExtract}
            disabled={uploading || !crop}
            style={{ marginTop: 12 }}
          >
            {uploading ? "Uploading…" : "Extract"}
          </button>
        </>
      )}

      {!naturalSize && error && <p role="alert">{error}</p>}
    </div>
  );
}
