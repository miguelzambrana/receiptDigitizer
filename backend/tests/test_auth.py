from fastapi.testclient import TestClient
from app.main import app
from app.db import Base, engine
from app import models  # noqa: F401  (avoids rebinding `app` above, cf. conftest.py)

def test_register_login_and_protected_access():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    assert c.post("/auth/register", json={"email": "u@e.com", "password": "pw12345"}).status_code == 200
    tok = c.post("/auth/login", json={"email": "u@e.com", "password": "pw12345"}).json()["access_token"]
    # protected endpoint rejects without token
    assert c.get("/receipts", headers={}).status_code == 401
    # accepts with token
    ok = c.get("/receipts", headers={"Authorization": f"Bearer {tok}"})
    assert ok.status_code == 200
    Base.metadata.drop_all(bind=engine)
