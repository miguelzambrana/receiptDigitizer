import io
from pathlib import Path
from PIL import Image
from app.preprocess import preprocess, resize_max, crop_receipt

FIX = Path(__file__).parent / "fixtures" / "receipt_carrefour.jpg"

def _jpeg_bytes(size, orientation=None):
    img = Image.new("RGB", size, "white")
    buf = io.BytesIO()
    if orientation is not None:
        exif = Image.Exif()
        exif[0x0112] = orientation  # Orientation tag
        img.save(buf, format="JPEG", exif=exif)
    else:
        img.save(buf, format="JPEG")
    return buf.getvalue()

def test_resize_caps_long_side():
    img = Image.new("RGB", (4000, 2000))
    out = resize_max(img, 1400)
    assert max(out.size) == 1400

def test_crop_receipt_reduces_area_on_dark_background():
    img = Image.open(FIX).convert("RGB")
    cropped = crop_receipt(img)
    assert cropped.size[0] * cropped.size[1] < img.size[0] * img.size[1]

def test_preprocess_returns_valid_jpeg_within_max_side():
    out = preprocess(FIX.read_bytes(), max_side=1400)
    img = Image.open(io.BytesIO(out))
    assert img.format == "JPEG"
    assert max(img.size) <= 1400

def test_preprocess_applies_exif_orientation():
    # taller-than-wide source image with EXIF orientation=6 (rotate 90) should
    # come out with swapped width/height compared to the same image with no
    # orientation tag at all.
    plain_bytes = _jpeg_bytes((60, 100))
    rotated_bytes = _jpeg_bytes((60, 100), orientation=6)

    plain_out = Image.open(io.BytesIO(preprocess(plain_bytes, max_side=1400)))
    rotated_out = Image.open(io.BytesIO(preprocess(rotated_bytes, max_side=1400)))

    assert plain_out.size == (60, 100)
    assert rotated_out.size == (100, 60)
