"""STT 교정 규칙 서비스 (JSON 기반, Phase 4 Build-2.5A)."""
import json
import re
import shutil
import threading
from datetime import datetime
from pathlib import Path


_JSON_PATH = Path.home() / "jw-system" / "stt_corrections.json"
_BACKUPS_DIR = Path.home() / "jw-system" / "stt_corrections_backups"
_MAX_BACKUPS = 10

_cache_lock = threading.Lock()
_cache = {"mtime": 0.0, "data": None, "rules": []}


def _empty_data() -> dict:
    return {
        "version": "6.0",
        "updated_at": datetime.now().isoformat(),
        "sections": [],
        "special_rules": {
            "remove_timestamps": {"enabled": True, "description": "타임스탬프 삭제"},
            "fix_newline_literal": {"enabled": True, "description": "\\n 리터럴 변환"},
            "protect_number_comma": {"enabled": True, "description": "숫자 쉼표 보호"},
            "collapse_spaces": {"enabled": True, "description": "연속 공백 정리"},
        },
        "skip_words": [],
    }


def _load_json_unsafe() -> dict:
    """lock 밖에서 호출 금지. 파일 읽기만."""
    if not _JSON_PATH.exists():
        return _empty_data()
    try:
        return json.loads(_JSON_PATH.read_text(encoding="utf-8"))
    except Exception:
        return _empty_data()


def _build_rules(data: dict) -> list:
    """JSON → [(orig, replacement), ...] 평면 규칙. 긴 것 먼저 정렬, 중복 제거."""
    rules = []
    seen = set()
    for section in data.get("sections", []) or []:
        if not section.get("enabled", True):
            continue
        for group in section.get("groups", []) or []:
            target = (group.get("target") or "").strip()
            if not target:
                continue
            for err in group.get("errors", []) or []:
                text = (err.get("text") or "").strip()
                if not text or text == target:
                    continue
                key = (text, target)
                if key in seen:
                    continue
                seen.add(key)
                rules.append((text, target))
    rules.sort(key=lambda r: -len(r[0]))
    return rules


def load_data() -> dict:
    """mtime 기반 캐시. JSON 전체 데이터 반환."""
    with _cache_lock:
        if not _JSON_PATH.exists():
            empty = _empty_data()
            _cache["mtime"] = 0.0
            _cache["data"] = empty
            _cache["rules"] = []
            return empty

        current_mtime = _JSON_PATH.stat().st_mtime
        if _cache["mtime"] == current_mtime and _cache["data"] is not None:
            return _cache["data"]

        data = _load_json_unsafe()
        _cache["mtime"] = current_mtime
        _cache["data"] = data
        _cache["rules"] = _build_rules(data)
        return data


def get_rules() -> list:
    """캐시된 평면 규칙 반환. 캐시 만료 시 자동 재로드."""
    load_data()
    with _cache_lock:
        return list(_cache["rules"])


def get_rules_count() -> int:
    """디버그용."""
    return len(get_rules())


_TIMESTAMP_RE = re.compile(
    r"\[\d{1,2}:\d{2}(?::\d{2})?\s*(?:→|->|-)\s*\d{1,2}:\d{2}(?::\d{2})?\]"
)

_COMMA_SENTINEL = "\x00COMMA\x00"


def apply_local_corrections(text: str) -> str:
    """로컬 교정: special_rules 우선 적용 → 테이블 치환 → 복원 + 공백 정돈.
    순서: 숫자 쉼표 보호 → 타임스탬프 삭제 → \\n 리터럴 → 규칙 치환 → 쉼표 복원 → 공백."""
    if not text:
        return text

    data = load_data()
    sr = data.get("special_rules", {}) or {}

    protect_comma = sr.get("protect_number_comma", {}).get("enabled", True)
    remove_ts = sr.get("remove_timestamps", {}).get("enabled", True)
    fix_nl = sr.get("fix_newline_literal", {}).get("enabled", True)
    collapse = sr.get("collapse_spaces", {}).get("enabled", True)

    # 1. 숫자 쉼표 보호 (규칙 치환 중 간섭 방지)
    if protect_comma:
        text = re.sub(r"(\d),(\d)", lambda m: m.group(1) + _COMMA_SENTINEL + m.group(2), text)

    # 2. 타임스탬프 삭제 (규칙 치환 전 — 숫자 간섭 방지)
    if remove_ts:
        text = _TIMESTAMP_RE.sub("", text)

    # 3. \n 리터럴
    if fix_nl:
        text = text.replace("\\n", "\n")

    # 4. 규칙 치환
    for orig, repl in get_rules():
        text = text.replace(orig, repl)

    # 5. 숫자 쉼표 복원
    if protect_comma:
        text = text.replace(_COMMA_SENTINEL, ",")

    # 6. 공백 정리
    if collapse:
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)

    return text.strip()


def validate_data(data: dict = None) -> dict:
    """JSON 구조 검증. 경고 수집."""
    if data is None:
        data = load_data()

    warnings = []
    stats = {
        "total_sections": 0,
        "enabled_sections": 0,
        "total_groups": 0,
        "total_errors": 0,
    }

    for section in data.get("sections", []) or []:
        stats["total_sections"] += 1
        if section.get("enabled", True):
            stats["enabled_sections"] += 1

        section_id = section.get("id", "?")

        if not section.get("name"):
            warnings.append({"section_id": section_id, "issue": "섹션 이름 누락"})

        targets_seen = set()
        for g_idx, group in enumerate(section.get("groups", []) or []):
            stats["total_groups"] += 1
            target = (group.get("target") or "").strip()

            if not target:
                warnings.append({
                    "section_id": section_id,
                    "group_index": g_idx,
                    "issue": "target 비어있음",
                })
                continue

            if target in targets_seen:
                warnings.append({
                    "section_id": section_id,
                    "group_index": g_idx,
                    "target": target,
                    "issue": "target 중복",
                })
            targets_seen.add(target)

            errors = group.get("errors", []) or []
            if not errors:
                warnings.append({
                    "section_id": section_id,
                    "target": target,
                    "issue": "오류 목록 비어있음",
                })

            texts_seen = set()
            for e_idx, err in enumerate(errors):
                stats["total_errors"] += 1
                text = (err.get("text") or "").strip()
                if not text:
                    warnings.append({
                        "section_id": section_id,
                        "target": target,
                        "error_index": e_idx,
                        "issue": "오류 텍스트 비어있음",
                    })
                elif text in texts_seen:
                    warnings.append({
                        "section_id": section_id,
                        "target": target,
                        "error_text": text,
                        "issue": "오류 텍스트 중복",
                    })
                texts_seen.add(text)

                if text and text == target:
                    warnings.append({
                        "section_id": section_id,
                        "target": target,
                        "error_text": text,
                        "issue": "오류 == target (무의미)",
                    })

    blocking_keywords = ("누락", "비어있음")
    valid = not any(any(kw in w.get("issue", "") for kw in blocking_keywords) for w in warnings)

    return {
        "valid": valid,
        "warnings": warnings,
        "stats": stats,
    }


def _cleanup_old_backups():
    if not _BACKUPS_DIR.exists():
        return
    backups = sorted(
        _BACKUPS_DIR.glob("stt_corrections_*.json"),
        key=lambda p: p.stat().st_mtime,
    )
    while len(backups) > _MAX_BACKUPS:
        try:
            backups[0].unlink()
        except Exception:
            pass
        backups = backups[1:]


def save_data(data: dict) -> dict:
    """전체 JSON 저장. 자동 백업 + 캐시 무효화 + 재로드."""
    if not isinstance(data, dict):
        raise ValueError("data는 dict여야 합니다")
    if "sections" not in data:
        raise ValueError("sections 필드 필수")

    _BACKUPS_DIR.mkdir(parents=True, exist_ok=True)

    if _JSON_PATH.exists():
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = _BACKUPS_DIR / f"stt_corrections_{ts}.json"
        idx = 0
        while backup_path.exists():
            idx += 1
            backup_path = _BACKUPS_DIR / f"stt_corrections_{ts}_{idx}.json"
        shutil.copy2(_JSON_PATH, backup_path)
        _cleanup_old_backups()

    data["updated_at"] = datetime.now().isoformat()

    tmp = _JSON_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(_JSON_PATH)

    with _cache_lock:
        _cache["mtime"] = 0.0
        _cache["data"] = None
        _cache["rules"] = []

    reloaded = load_data()
    validation = validate_data(reloaded)
    backup_count = len(list(_BACKUPS_DIR.glob("stt_corrections_*.json"))) if _BACKUPS_DIR.exists() else 0

    return {
        "saved": True,
        "backup_count": backup_count,
        "total_rules": len(get_rules()),
        "validation": validation,
    }


def list_backups() -> list:
    if not _BACKUPS_DIR.exists():
        return []
    items = []
    for p in sorted(
        _BACKUPS_DIR.glob("stt_corrections_*.json"),
        key=lambda x: x.stat().st_mtime,
        reverse=True,
    ):
        st = p.stat()
        items.append({
            "filename": p.name,
            "size_bytes": st.st_size,
            "created_at": datetime.fromtimestamp(st.st_mtime).isoformat(),
        })
    return items


def reload_cache() -> dict:
    with _cache_lock:
        _cache["mtime"] = 0.0
        _cache["data"] = None
        _cache["rules"] = []
    data = load_data()
    return {
        "reloaded": True,
        "total_rules": len(get_rules()),
        "total_sections": len(data.get("sections", [])),
    }


def format_skip_words_for_prompt(words: list) -> str:
    """skip_words 리스트를 STT 클라우드 프롬프트용 문자열로 변환.

    빈 리스트: "(없음)"
    1건 이상: bullet + 따옴표, 줄바꿈 구분

    reason 필드는 UI 전용 (사용자가 단어 등록 이유 판단용).
    프롬프트에는 word 만 주입 (LLM 혼동 방지 + 토큰 절약).
    """
    if not words:
        return "(없음)"
    lines = []
    for w in words:
        word = (w.get("word") or "").strip()
        if word:
            lines.append(f'- "{word}"')
    return "\n".join(lines) if lines else "(없음)"


def save_data_without_backup(data: dict) -> None:
    """백업 생성 없이 atomic 저장 + 캐시 무효화. 증분 API 전용.

    save_data() 와 동일한 validation/atomic-write/cache 로직을 공유하되,
    백업 디렉토리 복사와 cleanup 단계를 생략한다.
    """
    if not isinstance(data, dict):
        raise ValueError("data는 dict여야 합니다")
    if "sections" not in data:
        raise ValueError("sections 필드 필수")

    data["updated_at"] = datetime.now().isoformat()

    tmp = _JSON_PATH.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(_JSON_PATH)

    with _cache_lock:
        _cache["mtime"] = 0.0
        _cache["data"] = None
        _cache["rules"] = []


def add_variants(
    section_id: str,
    target: str,
    variants: list,
) -> dict:
    """섹션의 target 그룹에 error variant 증분 추가. 동일 text 는 중복 skip.

    variants: [{text, note?, source_stt_job_id?}, ...]

    Returns:
        {"added": N, "skipped": N, "total_variants": N, "section_id": ..., "target": ...}

    Raises:
        ValueError: section_id/target 없음, variants 아닌 타입
    """
    if not isinstance(variants, list):
        raise ValueError("variants는 list여야 합니다")

    data = load_data()

    section = None
    for s in data.get("sections", []) or []:
        if s.get("id") == section_id:
            section = s
            break
    if not section:
        raise ValueError(f"section not found: {section_id}")

    group = None
    for g in section.get("groups", []) or []:
        if g.get("target") == target:
            group = g
            break
    if not group:
        raise ValueError(f"target not found in section {section_id}: {target}")

    existing_texts = {e.get("text") for e in group.get("errors", []) or []}

    added = 0
    skipped = 0
    for v in variants:
        if not isinstance(v, dict):
            skipped += 1
            continue
        text = (v.get("text") or "").strip()
        if not text:
            skipped += 1
            continue
        if text in existing_texts:
            skipped += 1
            continue
        entry = {"text": text, "note": v.get("note", "") or ""}
        if v.get("source_stt_job_id"):
            entry["source_stt_job_id"] = v["source_stt_job_id"]
        group.setdefault("errors", []).append(entry)
        existing_texts.add(text)
        added += 1

    if added > 0:
        save_data_without_backup(data)

    return {
        "added": added,
        "skipped": skipped,
        "total_variants": len(group.get("errors", []) or []),
        "section_id": section_id,
        "target": target,
    }


def add_skip_words(words: list) -> dict:
    """skip_words 배열에 증분 추가. 동일 word 는 중복 skip.

    words: [{word, reason?}, ...]

    Returns:
        {"added": N, "skipped": N, "total": N}
    """
    if not isinstance(words, list):
        raise ValueError("words는 list여야 합니다")

    data = load_data()
    skip_list = data.setdefault("skip_words", [])
    existing_words = {w.get("word") for w in skip_list}

    added = 0
    skipped = 0
    for item in words:
        if not isinstance(item, dict):
            skipped += 1
            continue
        word = (item.get("word") or "").strip()
        if not word:
            skipped += 1
            continue
        if word in existing_words:
            skipped += 1
            continue
        skip_list.append({"word": word, "reason": item.get("reason", "") or ""})
        existing_words.add(word)
        added += 1

    if added > 0:
        save_data_without_backup(data)

    return {
        "added": added,
        "skipped": skipped,
        "total": len(skip_list),
    }
