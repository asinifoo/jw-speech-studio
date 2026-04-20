"""출판물 공용 유틸 — Phase 3 referenced_by 모델.

- _pub_id: 유일 ID (pub_code + reference)
- _ref_key_str: 사람이 읽기 위한 참조 키 문자열 ({outline_id}:{point_num})
- _upsert_referenced_by: 배열 업서트 (같은 key 갱신 / 새 key append)
- _upsert_publication: 레코드 업서트 (신규/갱신/참조 추가, content 충돌 시 기존 유지)
"""
import json
import re
from datetime import datetime

from db import get_embedding
from services.outline_parser import _outline_prefix


def _pub_id(pub_code: str, reference: str) -> str:
    """출판물 유일 ID 생성: pub_{code_safe}_{ref_safe}.

    code: 공백/슬래시 → '-', 그 외 특수문자 제거 (한글/영숫자/_/-/. 허용)
    ref : 공백 → '_', 그 외 특수문자 제거
    """
    code_safe = re.sub(r'[\s/]', '-', pub_code or '').strip()
    ref_safe = re.sub(r'\s+', '_', reference or '').strip()
    code_safe = re.sub(r'[^\w\-.가-힣]', '', code_safe)
    ref_safe = re.sub(r'[^\w\-.가-힣]', '', ref_safe)
    return f"pub_{code_safe}_{ref_safe}"


def _ref_key_str(ot: str, on: str, oy: str, ver: str, pn: str) -> str:
    """referenced_by 항목 사람 가독용 문자열: {outline_id}:{point_num}."""
    prefix = _outline_prefix(ot, on, oy)
    ver_safe = f"_v{ver.replace('/', '-')}" if ver else ""
    return f"{prefix}{ver_safe}:{pn}"


_REF_KEY_FIELDS = ("outline_type", "outline_num", "outline_year", "version", "point_num")


def _is_meaningful_ref(ref: dict) -> bool:
    """outline 참조 정보 중 하나라도 실제 값이 있어야 의미 있는 참조.

    구조적 키(type/num/point_num) 또는 텍스트 키(title/subtopic/text) 중
    하나라도 값 있으면 유효.
    """
    if not isinstance(ref, dict):
        return False
    keys = ("outline_type", "outline_num", "point_num",
            "outline_title", "subtopic_title", "point_text")
    return any((ref.get(k) or "").strip() for k in keys)


def _upsert_referenced_by(existing: list, new_ref: dict):
    """기존 referenced_by 배열에 새 참조 항목 병합.

    유일 키: outline_type + outline_num + outline_year + version + point_num
    반환: (갱신된 배열, "updated"|"appended")
    """
    new_key = tuple(new_ref.get(f, "") for f in _REF_KEY_FIELDS)
    for i, item in enumerate(existing):
        item_key = tuple(item.get(f, "") for f in _REF_KEY_FIELDS)
        if item_key == new_key:
            existing[i] = new_ref
            return existing, "updated"
    existing.append(new_ref)
    return existing, "appended"


def _upsert_publication(col, pub_data: dict) -> dict:
    """출판물 업서트.

    pub_data:
      pub_code, pub_title, pub_type, reference, content,
      keywords (list 또는 str), reference_info (dict)

    반환: {"action": "created"|"updated"|"appended", "id": pub_id}

    규칙:
      - 신규: 임베딩 생성 + 레코드 add
      - 기존 + 같은 참조 키: referenced_by 항목 갱신 (하위 필드 덮어씀)
      - 기존 + 새 참조 키: referenced_by 배열에 append
      - 시나리오 B/C 공통: content는 바꾸지 않음 (기존 유지), 임베딩 재계산 안 함
    """
    pub_id = _pub_id(pub_data["pub_code"], pub_data["reference"])
    now = datetime.utcnow().isoformat()

    try:
        existing = col.get(ids=[pub_id], include=["metadatas", "documents"])
    except Exception:
        existing = {"ids": [], "metadatas": [], "documents": []}

    new_ref = pub_data.get("reference_info", {})
    meaningful = _is_meaningful_ref(new_ref)

    if existing.get("ids"):
        meta = dict(existing["metadatas"][0])
        existing_refs = json.loads(meta.get("referenced_by_json", "[]") or "[]")
        if meaningful:
            updated_refs, action = _upsert_referenced_by(existing_refs, new_ref)
        else:
            # 의미 없는 참조 — 배열 유지, 메타/updated_at만 갱신
            updated_refs = existing_refs
            action = "no_ref_change"
        meta["referenced_by_json"] = json.dumps(updated_refs, ensure_ascii=False)
        meta["updated_at"] = now
        col.update(ids=[pub_id], metadatas=[meta])
        return {"action": action, "id": pub_id}

    keywords = pub_data.get("keywords", [])
    if isinstance(keywords, str):
        keywords = [s.strip() for s in keywords.split(",") if s.strip()]

    initial_refs = [new_ref] if meaningful else []
    embedding = get_embedding(pub_data["content"])
    new_meta = {
        "pub_code": pub_data["pub_code"],
        "pub_title": pub_data["pub_title"],
        "pub_type": pub_data["pub_type"],
        "reference": pub_data["reference"],
        "keywords": json.dumps(keywords, ensure_ascii=False),
        "referenced_by_json": json.dumps(initial_refs, ensure_ascii=False),
        "source": "publication",
        "created_at": now,
        "updated_at": now,
    }
    col.add(
        ids=[pub_id],
        documents=[pub_data["content"]],
        embeddings=[embedding],
        metadatas=[new_meta],
    )
    return {"action": "created", "id": pub_id}


def _match_publications(all_pubs: dict, outline_type: str = "", outline_num: str = "", point_num: str = "") -> list:
    """publications 레코드 중 주어진 outline 참조와 매치되는 것 반환.

    outline_type/outline_num/point_num 각각 빈 문자열이면 해당 필드 매칭 생략.
    한 pub당 첫 매치 1건만 반환 (matched_ref 포함).

    반환: [{"id": pub_id, "meta": meta, "matched_ref": ref}, ...]
    """
    matched = []
    if not all_pubs or not all_pubs.get("ids"):
        return matched

    for i, pub_id in enumerate(all_pubs["ids"]):
        meta = all_pubs["metadatas"][i] if all_pubs.get("metadatas") else {}
        refs = json.loads(meta.get("referenced_by_json", "[]") or "[]")

        for ref in refs:
            if outline_type and ref.get("outline_type") != outline_type:
                continue
            if outline_num and ref.get("outline_num") != outline_num:
                continue
            if point_num and ref.get("point_num") != point_num:
                continue
            matched.append({"id": pub_id, "meta": meta, "matched_ref": ref})
            break

    return matched


def _delete_reference(col, pub_id: str, ref_key: str) -> dict:
    """referenced_by 배열에서 특정 참조 1건 제거.

    ref_key 형식: '{outline_id}:{point_num}' (예: 'S-34_035_v1-20:1.1.1')

    반환:
      {"action": "removed", "remaining": N}        — 제거 후 남은 참조 N건
      {"action": "record_deleted", "remaining": 0} — 마지막 참조 → 레코드 자동 삭제
      {"action": "not_found", "remaining": N}      — ref_key 매치 항목 없음
      {"action": "record_not_found"}               — doc_id 레코드 자체 없음
    """
    try:
        existing = col.get(ids=[pub_id], include=["metadatas"])
    except Exception:
        return {"action": "record_not_found"}

    if not existing.get("ids"):
        return {"action": "record_not_found"}

    meta = dict(existing["metadatas"][0])
    refs = json.loads(meta.get("referenced_by_json", "[]") or "[]")

    new_refs = []
    removed = False
    for item in refs:
        if not removed:
            item_key = _ref_key_str(
                item.get("outline_type", ""),
                item.get("outline_num", ""),
                item.get("outline_year", ""),
                item.get("version", ""),
                item.get("point_num", ""),
            )
            if item_key == ref_key:
                removed = True
                continue
        new_refs.append(item)

    if not removed:
        return {"action": "not_found", "remaining": len(refs)}

    if not new_refs:
        col.delete(ids=[pub_id])
        return {"action": "record_deleted", "remaining": 0}

    meta["referenced_by_json"] = json.dumps(new_refs, ensure_ascii=False)
    meta["updated_at"] = datetime.utcnow().isoformat()
    col.update(ids=[pub_id], metadatas=[meta])
    return {"action": "removed", "remaining": len(new_refs)}
