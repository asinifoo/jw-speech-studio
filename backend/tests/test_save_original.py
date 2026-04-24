"""save-original 업로드 엔드포인트 — Doc-52.

POST /api/preprocess/save-original
path traversal 방어 + 한글 파일명 + meta fallback 조립.
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


def _make_request(filename, content="test content"):
    """save-original 요청 body 생성 헬퍼."""
    return {
        "files": [{
            "filename": filename,
            "_raw_content": content,
            "meta": {},
        }],
        "overwrite": True,
    }


# ── 정상 경로 ──
def test_save_valid_filename_succeeds(client):
    from config import SPEECHES_DIR
    test_fname = "test_doc52_valid.md"
    fpath = Path(SPEECHES_DIR) / test_fname
    try:
        r = client.post("/api/preprocess/save-original", json=_make_request(test_fname))
        assert r.status_code == 200
        assert r.json().get("saved") == 1
        assert fpath.exists()
    finally:
        if fpath.exists(): fpath.unlink()


def test_save_korean_filename_succeeds(client):
    from config import SPEECHES_DIR
    test_fname = "test_doc52_한글파일.md"
    fpath = Path(SPEECHES_DIR) / test_fname
    try:
        r = client.post("/api/preprocess/save-original", json=_make_request(test_fname, "한글 내용"))
        assert r.status_code == 200
        assert fpath.exists()
        assert fpath.read_text(encoding="utf-8") == "한글 내용"
    finally:
        if fpath.exists(): fpath.unlink()


# ── 400 (path traversal / 검증 실패) ──
def test_save_relative_path_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request("../etc/passwd"))
    assert r.status_code == 400


def test_save_slash_separator_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request("subdir/file.md"))
    assert r.status_code == 400


def test_save_backslash_separator_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request("subdir\\file.md"))
    assert r.status_code == 400


def test_save_absolute_path_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request("/etc/passwd"))
    assert r.status_code == 400


def test_save_dotdot_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request(".."))
    assert r.status_code == 400


def test_save_wrong_extension_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request("file.txt"))
    assert r.status_code == 400


def test_save_no_extension_returns_400(client):
    r = client.post("/api/preprocess/save-original", json=_make_request("file"))
    assert r.status_code == 400


# ── 경계 케이스 ──
def test_save_empty_filename(client):
    """filename 빈값 + meta 빈값 — fallback '____원문.md' 조립 시 200, 방어 시 400 양쪽 허용."""
    body = {
        "files": [{"filename": "", "_raw_content": "test", "meta": {}}],
        "overwrite": True,
    }
    r = client.post("/api/preprocess/save-original", json=body)
    assert r.status_code in (200, 400)
    # 200인 경우 조립 파일명 cleanup
    if r.status_code == 200:
        from config import SPEECHES_DIR
        fallback = Path(SPEECHES_DIR) / "____원문.md"
        if fallback.exists(): fallback.unlink()


def test_save_fallback_filename_from_meta(client):
    """filename 없으면 meta 에서 조립. 정상 fallback 경로 확인."""
    from config import SPEECHES_DIR
    body = {
        "files": [{
            "filename": "",
            "_raw_content": "meta fallback test",
            "meta": {
                "outline_type": "S-34",
                "outline_num": "999",
                "speaker": "테스트",
                "date": "2604",
            },
        }],
        "overwrite": True,
    }
    expected_fname = "S-34_999_테스트_2604_원문.md"
    fpath = Path(SPEECHES_DIR) / expected_fname
    try:
        r = client.post("/api/preprocess/save-original", json=body)
        assert r.status_code == 200
        assert fpath.exists()
    finally:
        if fpath.exists(): fpath.unlink()
