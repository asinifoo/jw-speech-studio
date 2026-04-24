"""db_delete 엔드포인트 — 존재 검증 (Doc-50).

ChromaDB col.delete 가 silent success 하는 문제 차단 검증.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


def test_delete_nonexistent_id_returns_404(client):
    """존재하지 않는 doc_id 로 삭제 시도 → 404 (silent success 차단)."""
    r = client.post("/api/db/delete", json={
        "collection": "speech_expressions",
        "doc_id": "nonexistent_id_doc50_test_12345",
    })
    assert r.status_code == 404
    detail = r.json().get("detail", "")
    assert "not found" in detail.lower() or "id" in detail.lower()


def test_delete_invalid_collection_returns_400(client):
    """존재하지 않는 컬렉션 → 400."""
    r = client.post("/api/db/delete", json={
        "collection": "nonexistent_collection_xyz",
        "doc_id": "any_id",
    })
    assert r.status_code == 400


def test_delete_existing_id_succeeds(client):
    """정상 삭제: 테스트 레코드 setup → 삭제 → 200."""
    from db import get_db, get_embedding
    col = get_db().get_or_create_collection("speech_expressions")
    test_id = "test_doc50_delete_existing_id"
    col.add(
        ids=[test_id],
        documents=["doc-50 test doc"],
        metadatas=[{"source": "memo", "outline_title": "doc-50 test"}],
        embeddings=[get_embedding("doc-50 test doc")],
    )
    try:
        r = client.post("/api/db/delete", json={
            "collection": "speech_expressions",
            "doc_id": test_id,
        })
        assert r.status_code == 200
        body = r.json()
        assert body.get("id") == test_id
        assert col.get(ids=[test_id]).get("ids") == []
    finally:
        # 실패 시 테스트 데이터 잔존 방지
        try: col.delete(ids=[test_id])
        except Exception: pass
