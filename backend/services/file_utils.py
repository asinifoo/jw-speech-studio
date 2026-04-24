"""파일 시스템 관련 공용 유틸 (보안 검증 포함)."""
from pathlib import Path
import os
from fastapi import HTTPException
from config import SPEECHES_DIR

ALLOWED_TRANSCRIPT_EXT = {".md"}

# STT txt 업로드용 확장자 (신규)
ALLOWED_TEXT_UPLOAD_EXT = {".txt"}


def validate_transcript_filename(
    filename: str,
    allowed_ext: set = None,
    base_dir: Path = None,
) -> Path:
    """파일명 검증. 6단 방어. 통과 시 resolved Path 반환.

    Doc-47 에서 도입, Doc-52 에서 save-original 에 재사용.
    STT txt 업로드 대응 위해 allowed_ext / base_dir 범용화.

    Args:
        filename: 검증할 파일명
        allowed_ext: 허용 확장자 집합. None 시 ALLOWED_TRANSCRIPT_EXT (.md) 사용.
        base_dir: 기준 디렉토리 Path. None 시 SPEECHES_DIR 사용.

    Raises:
        HTTPException(400): 검증 실패
    """
    allowed = allowed_ext if allowed_ext is not None else ALLOWED_TRANSCRIPT_EXT

    if not filename or not filename.strip():
        raise HTTPException(status_code=400, detail="Empty filename")
    if "\x00" in filename:
        raise HTTPException(status_code=400, detail="Null byte in filename")
    if "/" in filename or "\\" in filename or os.path.basename(filename) != filename:
        raise HTTPException(status_code=400, detail="Path separator not allowed")
    if filename in (".", ".."):
        raise HTTPException(status_code=400, detail="Relative path not allowed")
    if Path(filename).suffix.lower() not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Extension not allowed (only {allowed})",
        )

    target_dir = Path(base_dir).resolve() if base_dir is not None else Path(SPEECHES_DIR).resolve()
    candidate = (target_dir / filename).resolve()
    if candidate.parent != target_dir:
        raise HTTPException(status_code=400, detail="Path traversal detected")
    return candidate
