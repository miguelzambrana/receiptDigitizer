from datetime import datetime, timedelta, timezone
from jose import jwt
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

def test_register_duplicate_email_returns_400():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    assert c.post("/auth/register", json={"email": "dup@example.com", "password": "pw12345"}).status_code == 200
    r = c.post("/auth/register", json={"email": "dup@example.com", "password": "pw12345"})
    assert r.status_code == 400
    Base.metadata.drop_all(bind=engine)

def test_login_wrong_password_returns_401():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    assert c.post("/auth/register", json={"email": "wrongpw@example.com", "password": "pw12345"}).status_code == 200
    r = c.post("/auth/login", json={"email": "wrongpw@example.com", "password": "not-the-password"})
    assert r.status_code == 401
    Base.metadata.drop_all(bind=engine)

def test_login_nonexistent_email_returns_401():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    r = c.post("/auth/login", json={"email": "nosuchuser@example.com", "password": "pw12345"})
    assert r.status_code == 401
    Base.metadata.drop_all(bind=engine)

def test_protected_endpoint_rejects_malformed_bearer_token():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    r = c.get("/receipts", headers={"Authorization": "Bearer not.a.jwt"})
    assert r.status_code == 401
    Base.metadata.drop_all(bind=engine)

def test_protected_endpoint_rejects_expired_token():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    assert c.post("/auth/register", json={"email": "expired@example.com", "password": "pw12345"}).status_code == 200
    from app.config import settings
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired_token = jwt.encode({"sub": "1", "exp": past}, settings.jwt_secret, algorithm="HS256")
    r = c.get("/receipts", headers={"Authorization": f"Bearer {expired_token}"})
    assert r.status_code == 401
    Base.metadata.drop_all(bind=engine)

def test_email_is_case_insensitive_for_register_and_login():
    Base.metadata.create_all(bind=engine)
    c = TestClient(app)
    assert c.post("/auth/register", json={"email": "A@Example.com", "password": "pw12345"}).status_code == 200
    r = c.post("/auth/login", json={"email": "a@example.com", "password": "pw12345"})
    assert r.status_code == 200
    assert r.json()["access_token"]
    Base.metadata.drop_all(bind=engine)
