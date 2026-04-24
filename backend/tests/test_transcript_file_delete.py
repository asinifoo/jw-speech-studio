"""원문 파일 삭제 엔드포인트 — Doc-47.

POST /api/transcript/file/delete
6단 검증: 빈값/null byte/경로분리자/상대경로/확장자/resolve prefix.
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


@pytest.fixture
def temp_speech_file():
    """임시 원문 파일 생성 + cleanup."""
    from config import SPEECHES_DIR
    test_fname = "test_doc47_delete_sample.md"
    fpath = Path(SPEECHES_DIR) / test_fname
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_text("doc-47 test content", encoding="utf-8")
    yield test_fname
    try: fpath.unlink()
    except FileNotFoundError: pass


# ── 정상 경로 ──
def test_delete_existing_file_succeeds(client, temp_speech_file):
    from config import SPEECHES_DIR
    r = client.post("/api/transcript/file/delete", json={"filename": temp_speech_file})
    assert r.status_code == 200
    assert r.json().get("filename") == temp_speech_file
    assert not (Path(SPEECHES_DIR) / temp_speech_file).exists()


def test_delete_korean_filename_succeeds(client):
    from config import SPEECHES_DIR
    test_fname = "test_doc47_한글파일.md"
    fpath = Path(SPEECHES_DIR) / test_fname
    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_text("한글 테스트", encoding="utf-8")
    try:
        r = client.post("/api/transcript/file/delete", json={"filename": test_fname})
        assert r.status_code == 200
        assert not fpath.exists()
    finally:
        if fpath.exists(): fpath.unlink()


# ── 404 (파일 없음) ──
def test_nonexistent_file_returns_404(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "nonexistent_doc47_xxx.md"})
    assert r.status_code == 404


# ── 400 (path traversal / 검증 실패) ──
def test_relative_path_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "../etc/passwd"})
    assert r.status_code == 400


def test_slash_separator_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "subdir/file.md"})
    assert r.status_code == 400


def test_backslash_separator_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "subdir\\file.md"})
    assert r.status_code == 400


def test_empty_filename_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": ""})
    assert r.status_code == 400


def test_whitespace_only_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "   "})
    assert r.status_code == 400


def test_wrong_extension_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "file.txt"})
    assert r.status_code == 400


def test_no_extension_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "filename"})
    assert r.status_code == 400


def test_dot_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": "."})
    assert r.status_code == 400


def test_dotdot_returns_400(client):
    r = client.post("/api/transcript/file/delete", json={"filename": ".."})
    assert r.status_code == 400
