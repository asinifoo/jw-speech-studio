"""연설 입력 draft 관리 API"""
import os
import json
import re
from datetime import datetime
from fastapi import APIRouter
from db import get_db, get_embedding
from services.outline_parser import _TYPE_NAMES, _outline_prefix, _ver_safe

router = APIRouter()

_DRAFTS_DIR = os.path.expanduser("~/jw-system/speech_drafts")
os.makedirs(_DRAFTS_DIR, exist_ok=True)


def _count_draft(data):
    """모드별 filled/total 계산. 자유 입력=요점 기준, quick=소주제 기준, detail=요점 기준"""
    # 자유 입력 (Build-7): free_subtopics points 기준
    if data.get("no_outline"):
        free_subs = data.get("free_subtopics") or []
        total = 0
        filled = 0
        for st in free_subs:
            pts = (st or {}).get("points") or []
            total += len(pts)
            for pt in pts:
                if any((pt.get(k) or "").strip() for k in ("text", "scriptures", "publications", "keywords", "tags")):
                    filled += 1
        return filled, total
    mode = data.get("mode", "quick")
    subtopics = data.get("subtopics") or {}
    if mode == "quick":
        total = len(subtopics)
        filled = sum(1 for v in (data.get("notes") or {}).values() if isinstance(v, str) and v.strip())
    else:
        total = sum(len(pts) for pts in subtopics.values() if isinstance(pts, list))
        filled = sum(1 for v in (data.get("details") or {}).values() if isinstance(v, dict) and (v.get("text") or "").strip())
    return filled, total


def _draft_id(outline_type, outline_num, speaker, date, source_stt_job_id=""):
    prefix = _outline_prefix(outline_type, outline_num) if outline_num else "ETC"
    base = f"{prefix}_{speaker}_{date}"
    # STT 출처 있으면 해시 suffix 추가 (기존 골자 draft와 충돌 방지)
    if source_stt_job_id:
        parts = source_stt_job_id.split("_")
        stt_suffix = parts[-1][:6] if len(parts) >= 2 else source_stt_job_id[:6]
        base += f"_stt{stt_suffix}"
    return base


def _draft_path(draft_id):
    safe = re.sub(r'[^\w가-힣_\-]', '_', draft_id)
    return os.path.join(_DRAFTS_DIR, f"{safe}.json")


def save_draft_internal(req: dict) -> dict:
    """draft JSON 저장 — 내부 호출 가능 (STT → draft 이관에서도 사용).
    같은 source_stt_job_id 가진 다른 draft는 자동 삭제 (1:1 매핑 보장)."""
    source_stt_id = req.get("source_stt_job_id", "")
    draft_id = _draft_id(
        req.get("outline_type", ""),
        req.get("outline_num", ""),
        req.get("speaker", ""),
        req.get("date", ""),
        source_stt_id,
    )
    data = {
        "draft_id": draft_id,
        "outline_type": req.get("outline_type", ""),
        "outline_num": req.get("outline_num", ""),
        "outline_title": req.get("outline_title", ""),
        "version": req.get("version", ""),
        "speaker": req.get("speaker", ""),
        "date": req.get("date", ""),
        "mode": req.get("mode", "quick"),  # quick | detail
        "notes": req.get("notes", {}),
        "details": req.get("details", {}),
        "subtopics": req.get("subtopics", {}),
        # 자유 입력 모드 (Phase 4 Build-5C)
        "free_text": req.get("free_text", ""),
        "free_topic": req.get("free_topic", ""),
        "free_subtopics": req.get("free_subtopics", []),
        "free_mode": req.get("free_mode", "subtopic"),
        "no_outline": bool(req.get("no_outline", False)),
        # 빠른 입력 모드 (Phase 5-1)
        "quick_type": req.get("quick_type", ""),
        "speech_type": req.get("speech_type", ""),
        "target": req.get("target", ""),
        "pub_code": req.get("pub_code", ""),
        "pub_title": req.get("pub_title", ""),
        # STT 링크
        "source_stt_job_id": source_stt_id,
        "source_type": req.get("source_type", ""),
        # Build-5D-2: STT 원본 (골자 모드에서도 보존, 상단 고정 UI용)
        "stt_original_text": req.get("stt_original_text", ""),
        "saved_at": datetime.now().isoformat(),
    }

    # 1:1 매핑 보장: 같은 STT ID 가진 다른 draft 파일 제거
    if source_stt_id:
        try:
            for fname in os.listdir(_DRAFTS_DIR):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(_DRAFTS_DIR, fname)
                try:
                    with open(fpath, "r", encoding="utf-8") as f:
                        other = json.load(f)
                    if other.get("source_stt_job_id") == source_stt_id and other.get("draft_id") != draft_id:
                        os.remove(fpath)
                except Exception:
                    continue
        except Exception:
            pass

    path = _draft_path(draft_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # SttJob linked_draft_id 갱신
    if source_stt_id:
        try:
            from routers.stt import _update_job
            _update_job(source_stt_id, {"linked_draft_id": draft_id})
        except Exception:
            pass

    return {"status": "ok", "draft_id": draft_id}


@router.post("/api/speech-draft/save")
def save_draft(req: dict):
    """draft JSON 저장 (DB 안 넣음)"""
    return save_draft_internal(req)


def _resolve_draft_path(outline_type, outline_num, speaker, date, source_stt_job_id=""):
    """기본 draft_id로 파일 찾고, 없으면 STT 접미사 붙은 파일도 glob로 탐색."""
    base_id = _draft_id(outline_type, outline_num, speaker, date, source_stt_job_id)
    path = _draft_path(base_id)
    if os.path.exists(path):
        return path, base_id
    # Fallback: source_stt_job_id 없이 호출된 경우 해당 prefix로 STT 접미사 파일 검색
    if not source_stt_job_id:
        prefix = _draft_id(outline_type, outline_num, speaker, date, "")
        safe = re.sub(r'[^\w가-힣_\-]', '_', prefix)
        try:
            for fname in os.listdir(_DRAFTS_DIR):
                if not fname.endswith(".json"):
                    continue
                if fname.startswith(safe + "_stt"):
                    fpath = os.path.join(_DRAFTS_DIR, fname)
                    return fpath, fname[:-5]  # 확장자 제거
        except Exception:
            pass
    return None, base_id


@router.get("/api/speech-draft/check")
def check_draft(outline_num: str = "", speaker: str = "", date: str = "", outline_type: str = "", source_stt_job_id: str = ""):
    """draft 존재 여부 + 간단 정보"""
    path, draft_id = _resolve_draft_path(outline_type, outline_num, speaker, date, source_stt_job_id)
    if not path:
        return {"exists": False}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        filled, total = _count_draft(data)
        return {
            "exists": True,
            "draft_id": data.get("draft_id", draft_id),
            "mode": data.get("mode", "quick"),
            "filled": filled,
            "total": total,
            "saved_at": data.get("saved_at", ""),
        }
    except Exception:
        return {"exists": False}


@router.get("/api/speech-draft/load")
def load_draft(outline_num: str = "", speaker: str = "", date: str = "", outline_type: str = "", source_stt_job_id: str = ""):
    """draft 로드"""
    path, _ = _resolve_draft_path(outline_type, outline_num, speaker, date, source_stt_job_id)
    if not path:
        return {"exists": False}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return {"exists": True, **json.load(f)}
    except Exception:
        return {"exists": False}


@router.post("/api/speech-draft/complete")
def complete_draft(req: dict):
    """입력된 요점만 DB 저장 + draft 삭제"""
    from routers.preprocess import save_speech

    ot = req.get("outline_type", "")
    on = req.get("outline_num", "")
    title = req.get("outline_title", "")
    version = req.get("version", "")
    speaker = req.get("speaker", "")
    date = req.get("date", "")
    mode = req.get("mode", "detail")
    notes = req.get("notes", {})
    details = req.get("details", {})
    subtopics_raw = req.get("subtopics", {})

    # subtopics 구성
    subtopics = []
    for st_key, points in subtopics_raw.items():
        st_num = 0
        m = re.match(r'^(\d+)', st_key)
        if m:
            st_num = int(m.group(1))
        pts = []
        for pt in (points if isinstance(points, list) else []):
            pt_num = pt.get("point_num", "")
            pt_key = f"{st_key.split('.')[0]}_{pt_num}"

            if mode == "quick":
                note_text = (notes.get(st_key) or "").strip()
                if not note_text:
                    continue
                # 간단 입력: 소주제당 하나의 노트
                pts.append({
                    "num": pt.get("point_num", "01"),
                    "text": st_key,
                    "level": "L1",
                    "scriptures": "",
                    "scripture_usage": "",
                    "speech_text": note_text,
                    "keywords": "",
                    "tags": "",
                    "usage": "사용",
                })
                break  # 소주제당 1개
            else:
                d = details.get(pt_key, {})
                text = (d.get("text") or "").strip()
                tags = d.get("tags") or ""
                if not text and not tags:
                    continue
                pts.append({
                    "num": pt_num,
                    "text": pt.get("content", ""),
                    "level": pt.get("level", "L1"),
                    "scriptures": pt.get("scriptures", ""),
                    "scripture_usage": d.get("scripture_usage", ""),
                    "speech_text": text,
                    "keywords": d.get("keywords", ""),
                    "tags": tags,
                    "usage": d.get("usage", "사용"),
                })
        if pts:
            subtopics.append({"title": st_key, "num": st_num, "points": pts})

    if not subtopics:
        return {"status": "error", "message": "입력된 요점이 없습니다."}

    source = "note" if mode == "quick" else "speech"
    files = [{
        "meta": {"outline_type": ot, "outline_num": on, "title": title, "version": version, "speaker": speaker, "date": date, "source": source},
        "subtopics": subtopics,
    }]
    result = save_speech({"files": files, "overwrite": True})

    # draft 삭제
    draft_id = _draft_id(ot, on, speaker, date)
    path = _draft_path(draft_id)
    try:
        os.remove(path)
    except Exception:
        pass

    total = sum((r.get("saved", 0) + r.get("updated", 0)) for r in result.get("results", []))
    return {"status": "ok", "total": total, "draft_id": draft_id}


@router.delete("/api/speech-draft/{draft_id}")
def delete_draft(draft_id: str):
    """draft 삭제"""
    path = _draft_path(draft_id)
    if os.path.exists(path):
        os.remove(path)
        return {"status": "ok"}
    return {"status": "not_found"}


@router.get("/api/speech-draft/list")
def list_drafts():
    """draft 목록"""
    drafts = []
    for fname in os.listdir(_DRAFTS_DIR):
        if not fname.endswith(".json"):
            continue
        try:
            with open(os.path.join(_DRAFTS_DIR, fname), "r", encoding="utf-8") as f:
                data = json.load(f)
            filled, total = _count_draft(data)
            drafts.append({
                "draft_id": data.get("draft_id", fname.replace(".json", "")),
                "outline_type": data.get("outline_type", ""),
                "outline_num": data.get("outline_num", ""),
                "outline_title": data.get("outline_title", ""),
                "speaker": data.get("speaker", ""),
                "date": data.get("date", ""),
                "mode": data.get("mode", "quick"),
                "filled": filled,
                "total": total,
                "saved_at": data.get("saved_at", ""),
                "no_outline": bool(data.get("no_outline", False)),
                "source_stt_job_id": data.get("source_stt_job_id", ""),
                "source_type": data.get("source_type", ""),
                "free_topic": data.get("free_topic", ""),
                "free_text": data.get("free_text", ""),  # Hotfix 9: 카드 글자수 표시용
                "stt_original_text": data.get("stt_original_text", ""),  # Phase 5-2 후속: STT/Quick 원본
            })
        except Exception:
            continue
    drafts.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
    return {"drafts": drafts}
