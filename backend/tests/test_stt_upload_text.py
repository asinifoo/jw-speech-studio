"""STT txt 업로드 엔드포인트 — 외부 변환 텍스트 재활용.

POST /api/stt/upload-text
- Whisper 단계 생략, transcribed 직행
- UTF-8 엄격 (BOM 자동 제거)
- 10MB 상한, .txt 만 허용
"""
import sys
import json
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from main import app
    return TestClient(app)


def _post_text_file(client, filename, content, mime="text/plain"):
    """txt 업로드 요청 헬퍼. bytes content 전송."""
    if isinstance(content, str):
        content_bytes = content.encode("utf-8")
    else:
        content_bytes = content
    return client.post(
        "/api/stt/upload-text",
        files={"file": (filename, content_bytes, mime)},
    )


def _cleanup_job(job_id):
    """테스트 job + 파일 정리."""
    from routers.stt import _load_jobs, _save_jobs
    jobs = _load_jobs()
    job = jobs.get(job_id)
    if job:
        for key in ("upload_path", "draft_path"):
            p = job.get(key) or ""
            if p:
                try: Path(p).unlink()
                except Exception: pass
        del jobs[job_id]
        _save_jobs(jobs)


# ── 정상 2건 ──

def test_upload_text_utf8_succeeds(client):
    """UTF-8 텍스트 업로드 정상 — transcribed status + source_type='text'."""
    r = _post_text_file(client, "test_stt_sample.txt", "이것은 STT 변환 결과입니다. 한글 테스트.")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "transcribed"
    assert data["source_type"] == "text"
    assert data["duration_seconds"] == 0
    assert data["char_count"] > 0
    _cleanup_job(data["job_id"])


def test_upload_text_with_bom_strips_bom(client):
    """UTF-8 BOM 자동 제거 확인."""
    content_with_bom = b'\xef\xbb\xbf' + "BOM 있는 텍스트".encode("utf-8")
    r = _post_text_file(client, "test_bom.txt", content_with_bom)
    assert r.status_code == 200
    data = r.json()
    from routers.stt import _load_jobs
    jobs = _load_jobs()
    job = jobs[data["job_id"]]
    draft_data = json.loads(Path(job["draft_path"]).read_text(encoding="utf-8"))
    assert not draft_data["raw_text"].startswith("\ufeff")
    assert draft_data["raw_text"] == "BOM 있는 텍스트"
    _cleanup_job(data["job_id"])


# ── 인코딩 실패 2건 ──

def test_upload_text_cp949_returns_400(client):
    """CP949 인코딩 거부."""
    content_cp949 = "한글 텍스트".encode("cp949")
    r = _post_text_file(client, "cp949.txt", content_cp949)
    assert r.status_code == 400
    assert "UTF-8" in r.json()["detail"]


def test_upload_text_binary_returns_400(client):
    """바이너리 파일 거부."""
    content = bytes([0x89, 0x50, 0x4E, 0x47, 0xFF, 0xFE, 0x00, 0x01])
    r = _post_text_file(client, "binary.txt", content)
    assert r.status_code == 400


# ── 보안 400 2건 ──

def test_upload_text_path_traversal_returns_400(client):
    r = _post_text_file(client, "../etc/passwd.txt", "malicious")
    assert r.status_code == 400


def test_upload_text_wrong_extension_returns_400(client):
    """txt 외 확장자 거부."""
    r = _post_text_file(client, "malicious.exe", "content")
    assert r.status_code == 400
    assert "Extension" in r.json()["detail"]


# ── 크기 1건 ──

def test_upload_text_too_large_returns_400(client):
    """10MB 초과 거부."""
    big_content = "A" * (11 * 1024 * 1024)
    r = _post_text_file(client, "big.txt", big_content)
    assert r.status_code == 400
    assert "큽" in r.json()["detail"]


# ── 빈 파일 2건 ──

def test_upload_text_empty_returns_400(client):
    r = _post_text_file(client, "empty.txt", "")
    assert r.status_code == 400


def test_upload_text_whitespace_only_returns_400(client):
    r = _post_text_file(client, "ws.txt", "   \n\t  ")
    assert r.status_code == 400
