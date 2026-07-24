import io
import numpy as np
from PIL import Image, ImageOps

def resize_max(img: Image.Image, max_side: int) -> Image.Image:
    if max(img.size) <= max_side:
        return img
    s = max_side / max(img.size)
    return img.resize((int(img.width * s), int(img.height * s)))

def crop_receipt(img: Image.Image) -> Image.Image:
    g = np.asarray(img.convert("L"))
    mask = g > 100
    cols = np.where(mask.mean(axis=0) > 0.02)[0]
    rows = np.where(mask.mean(axis=1) > 0.02)[0]
    if len(cols) == 0 or len(rows) == 0:
        return img
    x0, x1, y0, y1 = cols[0], cols[-1], rows[0], rows[-1]
    padx = int((x1 - x0) * 0.03) + 5
    pady = int((y1 - y0) * 0.03) + 5
    return img.crop((max(0, x0 - padx), max(0, y0 - pady),
                     min(img.width, x1 + padx), min(img.height, y1 + pady)))

def preprocess(image_bytes: bytes, max_side: int = 1400) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = ImageOps.exif_transpose(img)
    img = resize_max(crop_receipt(img), max_side)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()
