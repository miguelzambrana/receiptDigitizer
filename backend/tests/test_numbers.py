import pytest
from app.numbers import normalize_number

@pytest.mark.parametrize("raw,expected", [
    ("45,53", 45.53), ("1.234,50", 1234.50), ("29.00", 29.00),
    (45.53, 45.53), ("-0,10", -0.10), ("  1,20 €", 1.20),
    ("", None), (None, None), ("abc", None),
])
def test_normalize_number(raw, expected):
    assert normalize_number(raw) == expected
