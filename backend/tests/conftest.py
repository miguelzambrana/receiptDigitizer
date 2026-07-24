import os
os.environ["DATABASE_URL"] = "sqlite:///./data/test.db"

import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)


from app.db import Base, engine, SessionLocal
from app import models  # noqa: F401  (register models; avoids rebinding `app` above)

@pytest.fixture
def db_session():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=engine)
