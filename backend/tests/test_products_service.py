from app.services.products import normalize_name, find_or_create_product

def test_normalize_name():
    assert normalize_name("  Leche   Entera 1L! ") == "LECHE ENTERA 1L"

def test_find_or_create_is_idempotent(db_session):
    p1 = find_or_create_product(db_session, "Leche Entera 1L")
    p2 = find_or_create_product(db_session, "leche  entera 1l")
    db_session.flush()
    assert p1.id == p2.id
