"""Test fixtures: isolated SQLite database + seeded demo dataset."""
import os
import tempfile

import pytest

os.environ.setdefault("DATABASE_URL", "sqlite:///" + tempfile.mkstemp(suffix=".db")[1])

from fastapi.testclient import TestClient  # noqa: E402

from app import models  # noqa: E402
from app.database import SessionLocal, engine, get_db  # noqa: E402
from app.detection import synthetic  # noqa: E402
from app.detection.pipeline import run_detection  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.admin import load_dataset  # noqa: E402
from app.seed import create_schema, seed_users  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    models.Base.metadata.drop_all(engine)
    create_schema()
    with SessionLocal() as db:
        seed_users(db)
        load_dataset(db, synthetic.generate_dataset(num_constituencies=6, works_per_constituency=25))
        run_detection(db)
    yield


@pytest.fixture
def db():
    with SessionLocal() as session:
        yield session


@pytest.fixture(scope="session")
def client(database):
    # The app's startup hook re-seeds; the session fixture already did the work.
    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def _override_db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def login(client, username: str, password: str) -> dict:
    response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture
def admin_headers(client):
    return login(client, "admin", "Admin@1234")


@pytest.fixture
def ministry_headers(client):
    return login(client, "ministry_user", "Ministry@1234")


@pytest.fixture
def state_headers(client):
    return login(client, "state_user", "State@1234")


@pytest.fixture
def mp_headers(client):
    return login(client, "mp_user", "Mp@12345")


@pytest.fixture
def public_headers(client):
    return login(client, "public_user", "Public@1234")
