# Smoke tests for GET /api/dataset/schema and POST /api/dataset/query.
from __future__ import annotations

from fastapi.testclient import TestClient


# Confirm schema endpoint returns HTTP 200 with columns and total_rows.
def test_dataset_schema_smoke(client: TestClient) -> None:
    resp = client.get("/api/dataset/schema")
    assert resp.status_code == 200
    body = resp.json()
    assert "columns" in body
    assert "total_rows" in body
    assert body["total_rows"] > 0


# Confirm schema columns have required descriptor fields.
def test_dataset_schema_column_fields(client: TestClient) -> None:
    resp = client.get("/api/dataset/schema")
    for col in resp.json()["columns"]:
        assert "name" in col
        assert "kind" in col
        assert "has_entities" in col
        assert col["kind"] in ("string", "int", "float", "date", "category")


# Confirm query endpoint returns rows with expected structure.
def test_dataset_query_smoke(client: TestClient) -> None:
    resp = client.post("/api/dataset/query", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert "rows" in body
    assert "total_matched" in body
    assert body["total_matched"] > 0


# Confirm each row has a row_id and cells dict.
def test_dataset_query_row_structure(client: TestClient) -> None:
    resp = client.post("/api/dataset/query", json={"page_size": 5})
    rows = resp.json()["rows"]
    assert len(rows) <= 5
    for row in rows:
        assert "row_id" in row
        assert "cells" in row
        assert isinstance(row["cells"], dict)


# Confirm page_size=1 returns exactly one row.
def test_dataset_query_page_size_one(client: TestClient) -> None:
    resp = client.post("/api/dataset/query", json={"page_size": 1})
    assert len(resp.json()["rows"]) == 1


# Confirm invalid page_size (0) is rejected with HTTP 422.
def test_dataset_query_rejects_zero_page_size(client: TestClient) -> None:
    resp = client.post("/api/dataset/query", json={"page_size": 0})
    assert resp.status_code == 422


# Confirm entity-bearing columns have annotation on cells that contain values.
def test_dataset_query_entity_annotations(client: TestClient) -> None:
    resp = client.post("/api/dataset/query", json={"page_size": 10})
    rows = resp.json()["rows"]
    for row in rows:
        site_cell = row["cells"].get("site")
        if site_cell and site_cell.get("entity"):
            assert "placeholder" in site_cell["entity"]
            assert "category" in site_cell["entity"]
