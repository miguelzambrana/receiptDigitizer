import json
from pathlib import Path
from app.preprocess import preprocess
from app.readers.factory import get_reader
from app.schemas import ReceiptData

GOLD = Path(__file__).parent / "golden"

def score_extraction(expected: dict, got: ReceiptData) -> dict:
    store_ok = bool(got.store and expected["store_contains"].lower() in got.store.lower())
    total_ok = got.total is not None and abs(got.total - expected["total"]) <= 0.02
    exp_n = expected["item_count"]; got_n = len(got.items)
    recall = min(got_n, exp_n) / exp_n if exp_n else 0.0
    return {"store_ok": store_ok, "total_ok": total_ok,
            "item_count_expected": exp_n, "item_count_got": got_n, "item_recall": recall}

def main():
    reader = get_reader()
    scores = []
    for exp_file in sorted(GOLD.glob("expected_*.json")):
        stem = exp_file.stem.replace("expected_", "")
        img = GOLD / f"{stem}.jpg"
        if not img.exists():
            continue
        expected = json.loads(exp_file.read_text())
        got = reader.extract(preprocess(img.read_bytes()))
        s = score_extraction(expected, got)
        scores.append(s)
        print(f"{stem}: store={s['store_ok']} total={s['total_ok']} "
              f"items={s['item_count_got']}/{s['item_count_expected']} recall={s['item_recall']:.2f}")
    if scores:
        print(f"\nstore_acc={sum(x['store_ok'] for x in scores)/len(scores):.2f} "
              f"total_acc={sum(x['total_ok'] for x in scores)/len(scores):.2f} "
              f"mean_recall={sum(x['item_recall'] for x in scores)/len(scores):.2f}")

if __name__ == "__main__":
    main()
