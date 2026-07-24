import re

def normalize_number(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    s = re.sub(r"[^\d,.\-]", "", s)   # drop currency symbols/letters/spaces
    if not re.search(r"\d", s):
        return None
    if "," in s and "." in s:          # 1.234,50 -> 1234.50
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:                     # 45,53 -> 45.53
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None
