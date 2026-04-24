"""파일 시스템 관련 공용 유틸 (보안 검증 포함)."""
from pathlib import Path
import os
from fastapi import HTTPException
from config import SPEECHES_DIR

ALLOWED_TRANSCRIPT_EXT = {".md"}


def validate_transcript_filename(filename: str) -> Path:
    """원문 파일명 검증. 6단 방어. 통과 시 resolved Path 반환.

    Doc-47 에서 도입, Doc-52 에서 save-original 업로드에도 재사용 위해
    services/file_utils.py 로 이관.

    Raises:
        HTTPException(400): 검증 실패
    """
    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Empty filename")
    if "\x00" in filename:
        raise HTTPException(status_code=400, detail="Null byte in filename")
    if "/" in filename or "\\" in filename or os.path.basename(filename) != filename:
        raise HTTPException(status_code=400, detail="Path separator not allowed")
    if filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Relative path not allowed")
    if Path(filename).suffix.lower() not in ALLOWED_TRANSCRIPT_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Extension not allowed (only {ALLOWED_TRANSCRIPT_EXT})",
        )
    speeches_dir = Path(SPEECHES_DIR).resolve()
    candidate = (speeches_dir / filename).resolve()
    if candidate.parent != speeches_dir:
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return candidate
