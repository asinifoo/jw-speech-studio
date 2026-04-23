"""STT 엔드포인트 (Phase 4 Build-1 / 2 / 2.1 / 3)"""
import json
import re
import shutil
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException

from services.stt_service import (
    get_audio_duration,
    load_whisper_model,
    unload_whisper_model,
    transcribe_file,
    ALL_EXTS,
)
from services.stt_corrections_service import (
    apply_local_corrections,
    load_data,
    save_data,
    validate_data,
    list_backups,
    reload_cache,
    format_skip_words_for_prompt,
    format_verses_for_prompt,
    add_variants,
    add_skip_words,
)
from services.llm import call_llm


router = APIRouter()

_HOME = Path.home() / "jw-system"
_UPLOADS_DIR = _HOME / "stt_uploads"
_DRAFTS_DIR = _HOME / "stt_drafts"
_SAVED_DIR = _HOME / "stt_saved"
_JOBS_FILE = _HOME / "stt_jobs.json"
_MAX_STT_FILE_SIZE = 300 * 1024 * 1024  # 300MB

_jobs_lock = threading.Lock()

# 폴더 자동 생성
for d in (_UPLOADS_DIR, _DRAFTS_DIR, _SAVED_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_jobs_unsafe() -> dict:
    """lock 없이 파일 읽기 (이미 lock 보유 시 사용)."""
    if not _JOBS_FILE.exists():
        return {}
    try:
        return json.loads(_JOBS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_jobs_unsafe(jobs: dict):
    """lock 없이 atomic write (이미 lock 보유 시 사용)."""
    tmp = _JOBS_FILE.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(jobs, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(_JOBS_FILE)


def _load_jobs() -> dict:
    """stt_jobs.json 읽기 (lock 보호)."""
    with _jobs_lock:
        return _load_jobs_unsafe()


def _save_jobs(jobs: dict):
    """atomic write: tempfile → rename (lock 보호)."""
    with _jobs_lock:
        _save_jobs_unsafe(jobs)


def _update_job(job_id: str, updates: dict):
    with _jobs_lock:
        jobs = _load_jobs_unsafe()
        if job_id in jobs:
            jobs[job_id].update(updates)
            jobs[job_id]["updated_at"] = _now_iso()
            _save_jobs_unsafe(jobs)


def _gen_job_id() -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    rnd = uuid.uuid4().hex[:6]
    return f"stt_{ts}_{rnd}"


def _safe_filename(name: str) -> str:
    return re.sub(r"[^\w.\-]", "_", name or "file")


def _parse_outline_id(outline_id: str):
    """outline_id → (outline_type, outline_num, outline_year, version).

    예:
      ""                   → ("ETC", "", "", "")
      "S-34_150"           → ("S-34", "150", "", "")
      "S-34_150_y26_v3-18" → ("S-34", "150", "26", "3-18")
      "CO_C_001_y26"       → ("CO_C", "001", "26", "")  (type 자체에 _ 포함)
    """
    if not outline_id or not outline_id.strip():
        return ("ETC", "", "", "")

    parts = outline_id.split("_")
    # CO_C / CO_R 등 type 자체에 _ 포함 — 첫 2토큰 결합 처리
    if parts and parts[0] in ("CO",) and len(parts) >= 2 and parts[1] in ("C", "R"):
        outline_type = f"{parts[0]}_{parts[1]}"
        rest = parts[2:]
    else:
        outline_type = parts[0] if parts else "ETC"
        rest = parts[1:]

    if not rest:
        return (outline_type, "", "", "")

    outline_num = rest[0]
    outline_year = ""
    version = ""

    for p in rest[1:]:
        if p.startswith("y") and len(p) > 1 and p[1:].isdigit():
            outline_year = p[1:]
        elif p.startswith("v") and len(p) > 1:
            version = p[1:]

    return (outline_type, outline_num, outline_year, version)


# ─── 자동 정리 (Build-3) ───

def _cleanup_uploads(max_count: int = 10) -> int:
    """stt_uploads/ 10개 초과 시 오래된 것부터 삭제. 진행 중 파일 보호."""
    if not _UPLOADS_DIR.exists():
        return 0
    files = [f for f in sorted(_UPLOADS_DIR.glob("*"), key=lambda p: p.stat().st_mtime) if f.is_file()]
    if len(files) <= max_count:
        return 0

    jobs = _load_jobs()
    active_paths = set()
    for j in jobs.values():
        if j.get("status") in ("transcribing", "correcting"):
            p = j.get("upload_path", "")
            if p:
                active_paths.add(p)

    to_remove = len(files) - max_count
    removed = 0
    for f in files:
        if removed >= to_remove:
            break
        if str(f) in active_paths:
            continue
        try:
            f.unlink()
            removed += 1
        except Exception:
            pass
    return removed


def _cleanup_saved(max_count: int = 30) -> int:
    """stt_saved/ 30개 초과 시 오래된 것부터 삭제."""
    if not _SAVED_DIR.exists():
        return 0
    files = [f for f in sorted(_SAVED_DIR.glob("*"), key=lambda p: p.stat().st_mtime) if f.is_file()]
    if len(files) <= max_count:
        return 0

    to_remove = len(files) - max_count
    removed = 0
    for f in files[:to_remove]:
        try:
            f.unlink()
            removed += 1
        except Exception:
            pass
    return removed


def _cleanup_drafts_aged(max_days: int = 60) -> int:
    """stt_drafts/*.json 60일 방치 시 삭제. 검토 대기 중이면 보호.
    삭제된 draft의 job은 failed 전환."""
    if not _DRAFTS_DIR.exists():
        return 0

    cutoff = time.time() - (max_days * 86400)

    jobs = _load_jobs()
    protected = set()
    for j in jobs.values():
        if j.get("status") in ("transcribed", "correcting", "reviewing"):
            dp = j.get("draft_path", "")
            if dp:
                protected.add(dp)

    removed = 0
    for f in _DRAFTS_DIR.glob("*.json"):
        try:
            if f.stat().st_mtime > cutoff:
                continue
        except Exception:
            continue
        if str(f) in protected:
            continue
        try:
            f.unlink()
            removed += 1
        except Exception:
            pass

    # 고아 상태 job failed 전환
    with _jobs_lock:
        current = _load_jobs_unsafe()
        changed = False
        for _jid, j in current.items():
            dp = j.get("draft_path", "")
            if dp and not Path(dp).exists() and j.get("status") in ("transcribed", "reviewing"):
                j["status"] = "failed"
                j["error_message"] = "draft 60일 방치 자동 삭제됨"
                j["updated_at"] = _now_iso()
                changed = True
        if changed:
            _save_jobs_unsafe(current)

    return removed


# ─── startup hook ───
def reset_stuck_jobs():
    """서버 시작 시 transcribing/correcting 상태 → failed."""
    jobs = _load_jobs()
    changed = False
    for _jid, job in jobs.items():
        if job.get("status") in ("transcribing", "correcting"):
            job["status"] = "failed"
            job["error_message"] = "서버 재시작으로 중단됨"
            job["updated_at"] = _now_iso()
            changed = True
    if changed:
        _save_jobs(jobs)


# ─── 엔드포인트 ───

@router.post("/api/stt/upload")
async def stt_upload(file: UploadFile = File(...)):
    """음성/동영상 파일 업로드 → job 생성."""
    # 자동 정리 (업로드 전 실행, 실패해도 업로드는 진행)
    try:
        _cleanup_uploads(10)
        _cleanup_drafts_aged(60)
    except Exception:
        pass

    if not file.filename:
        raise HTTPException(400, "파일이 없습니다")

    ext = Path(file.filename).suffix.lower()
    if ext not in ALL_EXTS:
        raise HTTPException(400, f"지원하지 않는 확장자: {ext}")

    content = await file.read()
    if len(content) > _MAX_STT_FILE_SIZE:
        raise HTTPException(
            400,
            f"파일 크기 초과 (최대 300MB, 현재 {len(content) / 1024 / 1024:.1f}MB)",
        )

    job_id = _gen_job_id()
    safe_name = _safe_filename(file.filename)
    upload_path = _UPLOADS_DIR / f"{job_id}_{safe_name}"
    upload_path.write_bytes(content)

    try:
        duration = get_audio_duration(str(upload_path))
    except Exception:
        duration = 0.0

    # 예상 변환 시간: duration / 12 + 10 (Whisper turbo + RTX 3090 실측 기반)
    # 9~16분 영상 기준 21~57초 소요. 젬마4 GPU 경합 시 여유분 +10초.
    estimated = (duration / 12 + 10) if duration > 0 else 0.0

    jobs = _load_jobs()
    now = _now_iso()
    jobs[job_id] = {
        "job_id": job_id,
        "original_filename": file.filename,
        "file_size_bytes": len(content),
        "status": "uploaded",
        "progress": 0.0,
        "upload_path": str(upload_path),
        "draft_path": "",
        "saved_path": "",
        "duration_seconds": duration,
        "estimated_transcribe_seconds": estimated,
        "created_at": now,
        "updated_at": now,
        "transcribe_started_at": "",
        "transcribe_completed_at": "",
        "error_message": "",
        "raw_text": "",
        "raw_chunks": [],
        "corrected_text": "",
        "correction_method": "",
        "correction_model": "",
        "final_text": "",
        "final_meta": {},
    }
    _save_jobs(jobs)

    return {
        "job_id": job_id,
        "status": "uploaded",
        "duration_seconds": duration,
        "estimated_transcribe_seconds": estimated,
    }


def _transcribe_background(job_id: str, upload_path: str):
    """threading.Thread 대상 — 모델 로드 → 변환 → draft 저장 → 언로드."""
    pipe = None
    try:
        _update_job(job_id, {
            "status": "transcribing",
            "transcribe_started_at": _now_iso(),
            "progress": 0.05,
            "error_message": "",
        })

        pipe = load_whisper_model()
        _update_job(job_id, {"progress": 0.1})

        result = transcribe_file(pipe, upload_path)

        draft_path = _DRAFTS_DIR / f"{job_id}.json"
        draft_data = {
            "job_id": job_id,
            "raw_text": result["raw_text"],
            "raw_chunks": result["raw_chunks"],
            "corrected_text": "",
            "correction_method": "",
            "correction_model": "",
            "created_at": _now_iso(),
        }
        draft_path.write_text(
            json.dumps(draft_data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        _update_job(job_id, {
            "status": "transcribed",
            "progress": 1.0,
            "draft_path": str(draft_path),
            "raw_text": result["raw_text"],
            "raw_chunks": result["raw_chunks"],
            "transcribe_completed_at": _now_iso(),
        })

    except Exception as e:
        _update_job(job_id, {
            "status": "failed",
            "error_message": str(e),
        })
    finally:
        if pipe is not None:
            unload_whisper_model(pipe)


@router.post("/api/stt/jobs/{job_id}/transcribe")
def stt_transcribe(job_id: str):
    """변환 시작 (threading.Thread, daemon=True)."""
    jobs = _load_jobs()
    if job_id not in jobs:
        raise HTTPException(404, f"Job 없음: {job_id}")

    job = jobs[job_id]
    if job["status"] not in ("uploaded", "failed"):
        raise HTTPException(400, f"변환 가능 상태 아님: {job['status']}")

    t = threading.Thread(
        target=_transcribe_background,
        args=(job_id, job["upload_path"]),
        daemon=True,
    )
    t.start()

    return {"status": "transcribing", "job_id": job_id}


# ─── stt_corrections.json 규칙 관리 (Build-2.5A) ───

@router.get("/api/stt/corrections")
def stt_corrections_get():
    """전체 JSON + 검증 결과 + 백업 목록."""
    data = load_data()
    return {
        "data": data,
        "validation": validate_data(data),
        "backups": list_backups(),
    }


@router.post("/api/stt/corrections/save")
def stt_corrections_save(req: dict):
    """전체 JSON 저장 (덮어쓰기 + 자동 백업 + 재로드)."""
    data = req.get("data")
    if not data or not isinstance(data, dict):
        raise HTTPException(400, "data 필드 필수 (객체)")
    try:
        return save_data(data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"저장 오류: {str(e)}")


@router.get("/api/stt/corrections/validate")
def stt_corrections_validate():
    """검증 결과만 반환."""
    return validate_data()


@router.post("/api/stt/corrections/reload")
def stt_corrections_reload():
    """파일 직접 수정 후 강제 재로드."""
    return reload_cache()


@router.post("/api/stt/corrections/variants")
def stt_corrections_add_variants(req: dict):
    """증분 API — 특정 section+target 에 error variant 추가 (백업 skip).

    req: {section_id, target, variants: [{text, note?, source_stt_job_id?}, ...]}
    """
    section_id = (req.get("section_id") or "").strip()
    target = (req.get("target") or "").strip()
    variants = req.get("variants") or []

    if not section_id:
        raise HTTPException(400, "section_id 필수")
    if not target:
        raise HTTPException(400, "target 필수")
    if not isinstance(variants, list):
        raise HTTPException(400, "variants는 list여야 합니다")

    try:
        return add_variants(section_id=section_id, target=target, variants=variants)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"add_variants 실패: {e}")


@router.post("/api/stt/corrections/skip_words")
def stt_corrections_add_skip_words(req: dict):
    """증분 API — skip_words 추가 (백업 skip).

    req: {words: [{word, reason?}, ...]}
    """
    words = req.get("words") or []
    if not isinstance(words, list):
        raise HTTPException(400, "words는 list여야 합니다")

    try:
        return add_skip_words(words=words)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"add_skip_words 실패: {e}")


@router.get("/api/stt/jobs")
def stt_jobs_list():
    """전체 작업 목록 (created_at 내림차순)."""
    jobs = _load_jobs()
    items = sorted(
        jobs.values(),
        key=lambda j: j.get("created_at", ""),
        reverse=True,
    )
    return {"jobs": items, "total": len(items)}


def _load_raw_text(job: dict) -> str:
    """draft JSON 우선, 없으면 job 메타의 raw_text 폴백."""
    dp = job.get("draft_path") or ""
    if dp and Path(dp).exists():
        try:
            draft = json.loads(Path(dp).read_text(encoding="utf-8"))
            raw = draft.get("raw_text", "")
            if raw:
                return raw
        except Exception:
            pass
    return job.get("raw_text", "") or ""


def _write_draft(job: dict, **updates) -> str:
    """draft JSON을 updates로 병합 저장. 없으면 생성. 경로 반환."""
    dp = job.get("draft_path") or ""
    if dp and Path(dp).exists():
        try:
            draft = json.loads(Path(dp).read_text(encoding="utf-8"))
        except Exception:
            draft = {}
    else:
        draft = {}
        dp = str(_DRAFTS_DIR / f"{job['job_id']}.json")

    if "job_id" not in draft:
        draft["job_id"] = job["job_id"]
    if "raw_text" not in draft:
        draft["raw_text"] = job.get("raw_text", "")
    if "raw_chunks" not in draft:
        draft["raw_chunks"] = job.get("raw_chunks", [])

    draft.update(updates)
    Path(dp).write_text(
        json.dumps(draft, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return dp


def _llm_platform_from_model(model: str) -> str:
    """모델명에서 플랫폼 추출."""
    m = (model or "").lower().strip()
    if m.startswith("gemini"):
        return "Gemini"
    if m.startswith("claude"):
        return "Claude"
    if m.startswith("gpt"):
        return "OpenAI"
    return ""


def _correct_pipeline_background(
    job_id: str,
    use_local: bool,
    local_model: str,
    use_cloud: bool,
    cloud_model: str,
    verses: list = None,
):
    """3단계 파이프라인: 파서 → 로컬 LLM → 클라우드 LLM.
    단계별 _update_job 호출하여 프론트 폴링 시 실시간 반영.

    verses: 선택. 클라우드 프롬프트의 {verses} 에 주입될 성구 목록.
    """
    elapsed = {}
    try:
        # 재교정 시 이전 단계 결과 완전 초기화 (파이프라인 새로 시작)
        _update_job(job_id, {
            "status": "correcting",
            "error_message": "",
            "parsed_text": "",
            "local_text": "",
            "local_model": "",
            "cloud_text": "",
            "cloud_platform": "",
            "cloud_model": "",
            "final_text": "",
            "correction_elapsed": {},
        })

        jobs = _load_jobs()
        if job_id not in jobs:
            return
        job = jobs[job_id]

        raw_text = _load_raw_text(job)
        if not raw_text:
            _update_job(job_id, {
                "status": "failed",
                "error_message": "교정할 원문이 없습니다",
            })
            return

        from config import PROMPT_TEMPLATES

        # ── 단계 1: 파서 (항상) ──
        t0 = time.time()
        parsed_text = apply_local_corrections(raw_text)
        elapsed["parser"] = round(time.time() - t0, 2)
        _update_job(job_id, {
            "parsed_text": parsed_text,
            "correction_elapsed": dict(elapsed),
        })

        current_text = parsed_text
        local_result = ""
        cloud_result = ""

        # ── 단계 2: 로컬 LLM (선택) ──
        if use_local:
            t0 = time.time()
            template = PROMPT_TEMPLATES.get("stt_local_cleanup", "")
            if not template:
                _update_job(job_id, {
                    "status": "failed",
                    "error_message": "stt_local_cleanup 프롬프트가 설정되지 않았습니다",
                })
                return
            prompt = (
                template.replace("{text}", current_text)
                if "{text}" in template
                else template + "\n\n원문:\n" + current_text
            )
            result = call_llm(prompt, model=local_model or "gemma4:e4b")
            if not result or not result.strip():
                _update_job(job_id, {
                    "status": "failed",
                    "error_message": "로컬 LLM 응답이 비어 있습니다",
                })
                return
            local_result = result.strip()
            elapsed["local"] = round(time.time() - t0, 2)
            current_text = local_result
            _update_job(job_id, {
                "local_text": local_result,
                "local_model": local_model or "gemma4:e4b",
                "correction_elapsed": dict(elapsed),
            })

        # ── 단계 3: 클라우드 LLM (선택) ──
        if use_cloud:
            t0 = time.time()
            template = PROMPT_TEMPLATES.get("stt_correction", "")
            if not template:
                _update_job(job_id, {
                    "status": "failed",
                    "error_message": "stt_correction 프롬프트가 설정되지 않았습니다",
                })
                return
            skip_words_list = load_data().get("skip_words", [])
            skip_words_block = format_skip_words_for_prompt(skip_words_list)
            verses_block = format_verses_for_prompt(verses or [])
            prompt = (
                template
                .replace("{verses}", verses_block)
                .replace("{skip_words}", skip_words_block)
                .replace("{text}", current_text)
                if "{text}" in template
                else template.replace("{verses}", verses_block).replace("{skip_words}", skip_words_block) + "\n\n원문:\n" + current_text
            )
            result = call_llm(prompt, model=cloud_model)
            if not result or not result.strip():
                _update_job(job_id, {
                    "status": "failed",
                    "error_message": "클라우드 LLM 응답이 비어 있습니다",
                })
                return
            cloud_result = result.strip()
            elapsed["cloud"] = round(time.time() - t0, 2)
            current_text = cloud_result
            _update_job(job_id, {
                "cloud_text": cloud_result,
                "cloud_platform": _llm_platform_from_model(cloud_model),
                "cloud_model": cloud_model,
                "correction_elapsed": dict(elapsed),
            })

        # ── 최종: 마지막 실행 단계 결과가 final_text ──
        final_text = current_text
        dp = _write_draft(
            job,
            parsed_text=parsed_text,
            local_text=local_result,
            cloud_text=cloud_result,
            final_text=final_text,
            correction_elapsed=dict(elapsed),
        )

        _update_job(job_id, {
            "status": "reviewing",
            "final_text": final_text,
            "draft_path": dp,
            "error_message": "",
            "correction_elapsed": dict(elapsed),
        })

    except Exception as e:
        _update_job(job_id, {
            "status": "failed",
            "error_message": f"교정 오류: {str(e)[:300]}",
        })


@router.post("/api/stt/jobs/{job_id}/correct")
def stt_correct(job_id: str, req: dict):
    """3단계 파이프라인 교정.

    req: {
      use_parser: bool = True,       # 항상 True (무시됨, 호환용)
      use_local: bool = False,
      local_model: str = "gemma4:e4b",
      use_cloud: bool = False,
      cloud_model: str = "",
      verses: list[str] = [],        # 클라우드 프롬프트 {verses} 주입용 (선택)
    }
    """
    jobs = _load_jobs()
    if job_id not in jobs:
        raise HTTPException(404, f"Job 없음: {job_id}")

    job = jobs[job_id]
    if job["status"] not in ("transcribed", "reviewing", "correcting", "failed"):
        raise HTTPException(400, f"교정 가능 상태 아님: {job['status']}")

    use_local = bool(req.get("use_local", False))
    local_model = (req.get("local_model") or "gemma4:e4b").strip()
    use_cloud = bool(req.get("use_cloud", False))
    cloud_model = (req.get("cloud_model") or "").strip()
    verses_raw = req.get("verses") or []
    verses = [str(v).strip() for v in verses_raw if isinstance(v, (str, int, float)) and str(v).strip()] if isinstance(verses_raw, list) else []

    # 파서만 단독 실행 (동기)
    if not use_local and not use_cloud:
        raw_text = _load_raw_text(job)
        if not raw_text:
            raise HTTPException(400, "교정할 원문이 없습니다")

        t0 = time.time()
        parsed = apply_local_corrections(raw_text)
        elapsed = {"parser": round(time.time() - t0, 2)}

        dp = _write_draft(
            job,
            parsed_text=parsed,
            local_text="",
            cloud_text="",
            final_text=parsed,
            correction_elapsed=elapsed,
        )

        _update_job(job_id, {
            "status": "reviewing",
            "parsed_text": parsed,
            "local_text": "",
            "local_model": "",
            "cloud_text": "",
            "cloud_platform": "",
            "cloud_model": "",
            "final_text": parsed,
            "correction_elapsed": elapsed,
            "draft_path": dp,
            "error_message": "",
        })

        return {
            "status": "reviewing",
            "parsed_text": parsed,
            "final_text": parsed,
            "elapsed": elapsed,
        }

    # LLM 포함 → 비동기
    t = threading.Thread(
        target=_correct_pipeline_background,
        args=(job_id, use_local, local_model, use_cloud, cloud_model, verses),
        daemon=True,
    )
    t.start()

    return {
        "status": "correcting",
        "use_local": use_local,
        "local_model": local_model,
        "use_cloud": use_cloud,
        "cloud_model": cloud_model,
    }


# ─── 저장 / 삭제 / 정리 (Build-3) ───

@router.post("/api/stt/jobs/{job_id}/save")
def stt_save(job_id: str, req: dict):
    """STT 검토 → 임시저장(Draft) 생성. 실제 DB 저장은 임시저장 탭에서 수행.

    req: {
        speaker: str (필수),
        date: str (필수),
        final_text: str (필수, 프론트 편집본),
    }
    """
    jobs = _load_jobs()
    if job_id not in jobs:
        raise HTTPException(404, f"Job 없음: {job_id}")

    job = jobs[job_id]
    if job["status"] not in ("reviewing", "transcribed", "draft_sent"):
        raise HTTPException(400, f"저장 가능 상태 아님: {job['status']}")

    speaker = (req.get("speaker") or "").strip()
    date = (req.get("date") or "").strip()
    final_text = (req.get("final_text") or job.get("final_text") or "").strip()
    source = (req.get("source") or "speech").strip() or "speech"
    topic = (req.get("topic") or "").strip()

    if not final_text:
        # 폴백: 파이프라인 결과에서 (클라우드 > 로컬 > 파서 > 원본)
        final_text = (
            job.get("cloud_text")
            or job.get("local_text")
            or job.get("parsed_text")
            or job.get("raw_text")
            or ""
        ).strip()

    if not speaker:
        raise HTTPException(400, "speaker 필수")
    if not date:
        raise HTTPException(400, "date 필수")
    if not final_text:
        raise HTTPException(400, "저장할 텍스트가 없습니다")

    # Draft 생성 (자유 입력 모드 + STT 링크)
    draft_payload = {
        "outline_type": "ETC",
        "outline_num": "",
        "outline_title": topic,
        "version": "",
        "speaker": speaker,
        "date": date,
        "mode": "quick",
        "notes": {},
        "details": {},
        "subtopics": {},
        "free_text": final_text,
        "free_topic": topic,
        "free_subtopics": [],
        "free_mode": "bulk",
        "no_outline": True,
        "source_stt_job_id": job_id,
        "source_type": source,
        "stt_original_text": final_text,  # Phase 5-2 후속: 원본 필드 명시 저장
    }

    try:
        from routers.draft import save_draft_internal
        draft_result = save_draft_internal(draft_payload)
    except Exception as e:
        raise HTTPException(500, f"Draft 저장 오류: {str(e)[:300]}")

    draft_id = draft_result.get("draft_id", "")

    # job 상태 업데이트 (파일은 유지 — DB 저장 시점에 stt_saved/ 이동)
    _update_job(job_id, {
        "status": "draft_sent",
        "linked_draft_id": draft_id,
        "final_text": final_text,
        "final_meta": {"speaker": speaker, "date": date, "source": source, "topic": topic},
        "error_message": "",
    })

    return {
        "status": "draft_sent",
        "draft_id": draft_id,
        "job_id": job_id,
        "message": "임시저장으로 전달되었습니다",
    }


@router.delete("/api/stt/jobs/{job_id}")
def stt_delete(job_id: str):
    """모든 상태에서 삭제 가능. upload/draft/saved 파일 모두 제거."""
    jobs = _load_jobs()
    if job_id not in jobs:
        raise HTTPException(404, f"Job 없음: {job_id}")

    job = jobs[job_id]
    files_removed = 0

    for key in ("upload_path", "draft_path", "saved_path"):
        p = Path(job.get(key, "") or "")
        if p.exists():
            try:
                p.unlink()
                files_removed += 1
            except Exception:
                pass

    with _jobs_lock:
        current = _load_jobs_unsafe()
        current.pop(job_id, None)
        _save_jobs_unsafe(current)

    return {
        "deleted": True,
        "job_id": job_id,
        "files_removed": files_removed,
    }


@router.post("/api/stt/cleanup")
def stt_cleanup(req: dict = None):
    """수동 정리 트리거 (uploads 10개 / saved 30개 / drafts 60일)."""
    req = req or {}
    u = _cleanup_uploads(int(req.get("uploads_max", 10)))
    s = _cleanup_saved(int(req.get("saved_max", 30)))
    d = _cleanup_drafts_aged(int(req.get("drafts_days", 60)))
    return {
        "uploads_removed": u,
        "saved_removed": s,
        "drafts_removed": d,
    }


@router.get("/api/stt/jobs/{job_id}")
def stt_job_detail(job_id: str):
    """단일 작업 상세 — draft JSON 병합."""
    jobs = _load_jobs()
    if job_id not in jobs:
        raise HTTPException(404, f"Job 없음: {job_id}")

    job = jobs[job_id].copy()

    dp = job.get("draft_path") or ""
    if dp and Path(dp).exists():
        try:
            draft = json.loads(Path(dp).read_text(encoding="utf-8"))
            job["raw_text"] = draft.get("raw_text", "")
            job["raw_chunks"] = draft.get("raw_chunks", [])
            job["corrected_text"] = draft.get("corrected_text", "")
            job["correction_method"] = draft.get("correction_method", "")
            job["correction_model"] = draft.get("correction_model", "")
        except Exception:
            pass

    return job
