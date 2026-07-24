# tests/test_models.py
from app.models import User, Receipt

def test_can_create_user_and_receipt(db_session):
    u = User(email="a@b.com")
    db_session.add(u); db_session.flush()
    r = Receipt(user_id=u.id, image_path="/x.jpg", status="processing")
    db_session.add(r); db_session.flush()
    assert r.id is not None
    assert r.status == "processing"
