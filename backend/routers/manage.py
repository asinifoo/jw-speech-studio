"""DB 관리, 조회, 삭제, 일괄 추가"""
import os
import re
import json
import time
from fastapi import APIRouter, HTTPException
from config import _OUTLINES_DIR, normalize_source
from models import DbAddRequest, DbUpdateRequest, DbDeleteRequest, BatchItem, BatchAddRequest, BatchDeleteRequest
from services.outline_parser import _outline_prefix, _ver_safe, normalize_outline_type
from db import get_db, get_embedding, _bm25_cache

router = APIRouter()

_ABBR_PATH = os.path.join(os.path.expanduser("~/jw-system"), "jw_abbreviations.json")

def _load_abbreviations():
    try:
        with open(_ABBR_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _yr_full(yr: str) -> str:
    if len(yr) == 2:
        return ("19" if int(yr) > 50 else "20") + yr
    return yr


def _resolve_pub_code(raw: str):
    """전체 출판물 코드 파싱 → (pub_title, pub_type, reference, pub_code_clean)

    검색 순서: publications → pamphlets → booklets → bibles → web_articles → indexes → periodicals(패턴)
    """
    abbr = _load_abbreviations()
    periodicals = abbr.get("periodicals", {})
    static_cats = [
        ("publications", "서책"), ("pamphlets", "팜플렛"), ("booklets", "소책자"),
        ("bibles", "성경"), ("web_articles", "웹 연재 기사"), ("indexes", "색인"),
    ]

    s = raw.strip()

    # 1. 면/항 분리: 끝에서 "N면", "N-N면", "N항" 패턴
    ref = ""
    ref_match = re.search(r"\s+(\d[\d\-,]*면(?:\s+\d[\d\-,]*항)?)$", s)
    if not ref_match:
        ref_match = re.search(r"\s+(\d[\d\-,]*항)$", s)
    if ref_match:
        ref = ref_match.group(1).strip()
        s = s[:ref_match.start()].strip()

    # 2. 「」 분리
    inner, after = "", ""
    if s.startswith("「") and "」" in s:
        close = s.index("」")
        inner = s[1:close]
        after = s[close + 1:].strip()
    else:
        inner = s

    pub_code_clean = s

    # 3. 정확 매칭: 「」안 전체를 비정기 카테고리에서 검색
    for cat_key, cat_type in static_cats:
        cat = abbr.get(cat_key, {})
        if inner in cat:
            val = cat[inner]
            title = val["short"] if isinstance(val, dict) else val
            # after가 있으면 reference에 포함 (예: 「통」 "지구, 땅" 22항 → ref = '"지구, 땅" 22항')
            full_ref = (after + " " + ref).strip() if after else ref
            return title, cat_type, full_ref, pub_code_clean

    # 4. 「」뒤 -N 합쳐서 매칭: 「통」-1 → "통-1"
    if after and re.match(r"^-\d", after):
        combined = inner + (after.split()[0] if " " in after else after)
        for cat_key, cat_type in static_cats:
            cat = abbr.get(cat_key, {})
            if combined in cat:
                val = cat[combined]
                title = val["short"] if isinstance(val, dict) else val
                return title, cat_type, ref, pub_code_clean

    # 5. 정기 간행물 패턴 매칭
    for abbr_key in sorted(periodicals.keys(), key=lambda x: -len(x)):
        if not inner.startswith(abbr_key):
            continue
        rest = inner[len(abbr_key):]
        info = periodicals[abbr_key]
        title = info["short"] if isinstance(info, dict) else info
        pattern = info.get("pattern", "") if isinstance(info, dict) else ""

        # 파25.02 또는 파25.2
        m = re.match(r"(\d{2,4})\.(\d{1,2})$", rest)
        if m:
            yr = _yr_full(m.group(1))
            num = m.group(2)
            if pattern == "year_issue":
                return f"{title} {yr}년 제{num}호", "정기 간행물", ref, pub_code_clean
            return f"{title} {yr}년 {num}월호", "정기 간행물", ref, pub_code_clean

        # 파10 + after
        m_yr = re.match(r"(\d{2,4})$", rest)
        if m_yr:
            yr = _yr_full(m_yr.group(1))
            if after:
                m_date = re.match(r"(\d{1,2})/(\d{1,2})$", after)
                if m_date:
                    return f"{title} {yr}년 {m_date.group(1)}월 {m_date.group(2)}일호", "정기 간행물", ref, pub_code_clean
                m_mon = re.match(r"(\d{1,2})월호?$", after)
                if m_mon:
                    return f"{title} {yr}년 {m_mon.group(1)}월호", "정기 간행물", ref, pub_code_clean
            return f"{title} {yr}년", "정기 간행물", ref, pub_code_clean
        break

    return "", "", ref, pub_code_clean


@router.get("/api/publications/abbreviations")
def get_abbreviations():
    """약어 목록 반환"""
    return _load_abbreviations()


@router.get("/api/publications/lookup")
def lookup_pub_title(code: str = ""):
    """출판물 코드로 pub_title + reference 자동 조회 + 중복 체크
    우선순위: 1) DB 저장본 → 2) 약어 기반 자동 생성
    추가 반환: exact_match (pub_code + reference 완전 일치 항목)
    """
    if not code.strip():
        return {"pub_title": "", "pub_type": "", "reference": "", "pub_code": "", "exact_match": None}

    abbr_title, abbr_type, ref, clean_code = _resolve_pub_code(code.strip())

    db_title, db_type = "", ""
    exact_match = None  # pub_code + reference 모두 일치

    # DB 조회 (1번 순회로 매칭 + 중복 체크)
    client = get_db()
    try:
        col = client.get_collection("publications")
        all_data = col.get(include=["metadatas"])
        if all_data and all_data["ids"]:
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                pc = meta.get("pub_code", "") or ""
                pa = meta.get("pub_abbr", "") or ""
                m_ref = meta.get("reference", "") or ""
                # clean_code 매칭 (학습형 pub_title 우선)
                if clean_code and (clean_code == pc or clean_code == pa):
                    if not db_title:
                        t = meta.get("pub_title", "")
                        if t and t != pc and t != pa:
                            db_title = t
                            db_type = meta.get("pub_type", "")
                    # 면/항까지 일치 → 완전 중복
                    if ref and m_ref and ref.replace(" ", "") == m_ref.replace(" ", "") and not exact_match:
                        exact_match = {
                            "id": doc_id,
                            "pub_code": pc,
                            "pub_title": meta.get("pub_title", ""),
                            "reference": m_ref,
                            "pub_type": meta.get("pub_type", ""),
                        }
    except Exception:
        pass

    # 반환 조립
    if db_title:
        return {"pub_title": db_title, "pub_type": db_type, "reference": ref, "pub_code": clean_code, "source": "db", "exact_match": exact_match}
    if abbr_title:
        return {"pub_title": abbr_title, "pub_type": abbr_type, "reference": ref, "pub_code": clean_code, "source": "abbreviation", "exact_match": exact_match}
    return {"pub_title": "", "pub_type": "", "reference": ref, "pub_code": clean_code, "exact_match": exact_match}


@router.get("/api/publications/outline/{outline_num}")
def get_publications_by_outline(outline_num: str, outline_type: str = ""):
    """골자 번호로 출판물 조회 (Phase 3: referenced_by 배열 기반)."""
    from services.publication_utils import _match_publications
    client = get_db()
    try:
        col = client.get_collection("publications")
    except Exception:
        return {"publications": [], "total": 0}

    all_docs = col.get(include=["documents", "metadatas"])
    doc_by_id = {}
    if all_docs and all_docs.get("documents"):
        for i, did in enumerate(all_docs["ids"]):
            doc_by_id[did] = all_docs["documents"][i]

    matched = _match_publications(all_docs, outline_type=outline_type, outline_num=outline_num)

    results = []
    for m in matched:
        meta = m["meta"]
        results.append({
            "id": m["id"],
            "pub_code": meta.get("pub_code", ""),
            "pub_title": meta.get("pub_title", ""),
            "reference": meta.get("reference", ""),
            "keywords": meta.get("keywords", ""),
            "text": doc_by_id.get(m["id"], ""),
        })

    return {"publications": results, "total": len(results)}


@router.get("/api/collections")
def list_collections():
    client = get_db()
    cols = client.list_collections()
    return {"collections": [{"name": name, "count": client.get_collection(name).count()} for name in cols]}


@router.get("/api/cache/clear")
def clear_cache():
    """BM25 캐시 초기화 (DB에 새 데이터 추가 후 호출)"""
    _bm25_cache.clear()
    return {"status": "BM25 캐시 초기화 완료"}

@router.get("/api/db/manual")
def list_manual_entries():
    """수동 입력 항목 목록 (날짜순)"""
    client = get_db()
    entries = []
    for col_name in ["speech_points", "speech_expressions", "publications"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if all_data and all_data["ids"]:
                for i, doc_id in enumerate(all_data["ids"]):
                    meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                    if meta.get("mode") in ("manual", "batch") or meta.get("pub_type") == "manual" or meta.get("source") == "원문":
                        entries.append({
                            "id": doc_id,
                            "collection": col_name,
                            "text": all_data["documents"][i] if all_data["documents"] else "",
                            "metadata": meta,
                        })
        except Exception:
            pass
    # 날짜순 정렬 (최신 먼저, ID에 timestamp 포함)
    entries.sort(key=lambda x: x["id"], reverse=True)
    return {"entries": entries, "total": len(entries)}


@router.get("/api/db/by-source/{source}")
def list_by_source(source: str, limit: int = 10, service_type: str = ""):
    """출처별 항목 목록 (최신순), service_type으로 추가 필터"""
    from config import SOURCE_KO_TO_EN
    en = normalize_source(source)
    # 역방향 매핑: 영문→한국어 목록 (마이그레이션 전 데이터 호환)
    ko_set = {k for k, v in SOURCE_KO_TO_EN.items() if v == en}
    allowed_sources = {en} | ko_set
    client = get_db()
    entries = []
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if all_data and all_data["ids"]:
                for i, doc_id in enumerate(all_data["ids"]):
                    meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                    if meta.get("source", "") not in allowed_sources:
                        continue
                    if service_type and meta.get("service_type", "") != service_type:
                        continue
                    entries.append({
                        "id": doc_id,
                        "collection": col_name,
                        "text": all_data["documents"][i] if all_data["documents"] else "",
                        "metadata": meta,
                    })
        except Exception:
            pass
    entries.sort(key=lambda x: x["id"], reverse=True)
    return {"entries": entries[:limit], "total": len(entries)}


@router.get("/api/db/collection/{col_name}")
def list_collection(col_name: str, source: str = "", limit: int = 5000):
    """컬렉션별 항목 조회 (source 필터 선택)"""
    if col_name not in ("speech_points", "speech_expressions", "publications"):
        return {"entries": [], "total": 0}
    client = get_db()
    entries = []
    try:
        col = client.get_collection(col_name)
        all_data = col.get(include=["documents", "metadatas"])
        if all_data and all_data["ids"]:
            raw_sources = [s.strip() for s in source.split(",") if s.strip()] if source else []
            # 영문+한국어 모두 포함 (마이그레이션 전 데이터 호환)
            from config import SOURCE_KO_TO_EN
            expanded = set(raw_sources)
            for s in raw_sources:
                en = normalize_source(s)
                expanded.add(en)
                expanded |= {k for k, v in SOURCE_KO_TO_EN.items() if v == en}
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                if expanded and meta.get("source", "") not in expanded:
                    continue
                entries.append({
                    "id": doc_id,
                    "collection": col_name,
                    "text": all_data["documents"][i] if all_data["documents"] else "",
                    "metadata": meta,
                })
    except Exception:
        pass
    entries.sort(key=lambda x: x["id"], reverse=True)
    return {"entries": entries[:limit], "total": len(entries)}





@router.get("/api/db/service-types")
def list_service_types():
    """봉사 종류 목록 (DB에서 수집 - 봉사 모임 소스만)"""
    defaults = ['일반', '재방문', '기념식', '지역대회', '특별활동']
    client = get_db()
    found = set()
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["metadatas"])
            for meta in (all_data["metadatas"] or []):
                st = meta.get("service_type", "")
                src = meta.get("source", "")
                sub = meta.get("sub_source", "")
                # 봉사 모임 소스만 + 기타 연설/토의 종류가 혼입되지 않도록 차단
                if st and src == "봉사 모임" and sub != "기타 연설":
                    found.add(st)
        except Exception:
            pass
    # 기타 연설/토의 기본 종류 블랙리스트 (혼입 방지)
    blacklist = {'성경에 담긴 보물', '회중의 필요', '집회 교재', '파수대', '성서 연구', '영적 보물'}
    found -= blacklist
    # 기본 + DB에서 발견된 것 합치기 (순서 유지)
    result = list(defaults)
    for s in sorted(found):
        if s not in result:
            result.append(s)
    return {"service_types": result}


@router.post("/api/db/service-type/delete")
def delete_service_type(data: dict):
    """봉사 종류 삭제: 해당 종류의 모든 항목을 '일반'으로 변경"""
    st = data.get("service_type", "")
    if not st or st in ['일반', '재방문', '기념식', '지역대회', '특별활동']:
        raise HTTPException(status_code=400, detail="기본 종류는 삭제할 수 없습니다")
    client = get_db()
    count = 0
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas", "embeddings"])
            if all_data and all_data["ids"]:
                for i, doc_id in enumerate(all_data["ids"]):
                    meta = all_data["metadatas"][i]
                    if meta.get("service_type", "") == st:
                        meta["service_type"] = "일반"
                        col.update(ids=[doc_id], metadatas=[meta])
                        count += 1
        except Exception:
            pass
    _bm25_cache.clear()
    return {"status": f"{count}건을 '일반'으로 변경", "count": count}



@router.post("/api/db/update")
def db_update(req: DbUpdateRequest):
    """DB 문서 수정"""
    client = get_db()
    try:
        col = client.get_collection(req.collection)
        emb = get_embedding(req.text)
        update_kwargs = {"ids": [req.doc_id], "documents": [req.text], "embeddings": [emb]}
        if req.metadata:
            existing = col.get(ids=[req.doc_id], include=["metadatas"])
            if existing and existing["metadatas"]:
                merged = {**existing["metadatas"][0], **req.metadata}
                update_kwargs["metadatas"] = [merged]
        col.update(**update_kwargs)
        _bm25_cache.clear()
        return {"status": "수정 완료", "id": req.doc_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/db/delete")
def db_delete(req: DbDeleteRequest):
    """DB 문서 삭제 + 골자 JSON 삭제"""
    client = get_db()
    try:
        col = client.get_collection(req.collection)
        # 골자 항목이면 JSON도 삭제
        try:
            existing = col.get(ids=[req.doc_id], include=["metadatas"])
            if existing and existing["metadatas"]:
                meta = existing["metadatas"][0]
                if meta and meta.get("source") == "outline":
                    gn = meta.get("outline_num", "")
                    gt = meta.get("outline_type", "")
                    gy = meta.get("outline_year", "") or ""
                    ver = meta.get("version", "")
                    if gn:
                        # 같은 골자+버전의 다른 항목이 있는지 확인
                        where_cond = {"$and": [{"outline_num": gn}, {"source": "outline"}]}
                        if ver:
                            where_cond = {"$and": [{"outline_num": gn}, {"source": "outline"}, {"version": ver}]}
                        others = col.get(where=where_cond)
                        remaining = [i for i in (others.get("ids") or []) if i != req.doc_id]
                        if not remaining:
                            # 마지막 항목이면 JSON 삭제
                            prefix = _outline_prefix(gt, gn, gy)
                            ver_safe = ver.replace("/", "-").replace(" ", "").strip()
                            fname = f"{prefix}_v{ver_safe}.json" if ver_safe else f"{prefix}.json"
                            fpath = os.path.join(_OUTLINES_DIR, fname)
                            if os.path.exists(fpath):
                                os.remove(fpath)
        except Exception:
            pass
        col.delete(ids=[req.doc_id])
        _bm25_cache.clear()
        return {"status": "삭제 완료", "id": req.doc_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/outline/list")
def outline_list():
    """등록된 골자 목록"""
    items = []
    if os.path.exists(_OUTLINES_DIR):
        for fname in sorted(os.listdir(_OUTLINES_DIR)):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(_OUTLINES_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                items.append({
                    "filename": fname,
                    "outline_type": data.get("outline_type", ""),
                    "outline_type_name": data.get("outline_type_name", ""),
                    "outline_num": data.get("outline_num", ""),
                    "outline_year": data.get("outline_year") or "",
                    "title": data.get("title", ""),
                    "version": data.get("version", ""),
                    "subtopics": len(data.get("subtopics", [])),
                    "saved_at": data.get("saved_at", ""),
                })
            except Exception:
                continue
    return {"outlines": items}


@router.get("/api/outline/{outline_id}")
def outline_detail(outline_id: str, outline_type: str = "", version: str = "", year: str = ""):
    """골자 상세 (speech_points에서 조회). version/year 쿼리 주면 해당 버전만."""
    client = get_db()
    col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})

    # outline_id = S-34_001 형태
    parts = outline_id.rsplit("_", 1)
    if len(parts) == 2:
        ot_prefix, on = parts[0], parts[1]
    else:
        on = outline_id
        ot_prefix = ""

    try:
        result = col.get(where={"$and": [{"outline_num": on}, {"source": "outline"}]}, include=["documents", "metadatas"])
    except Exception:
        return {"subtopics": {}}

    subtopics = {}
    for i, doc_id in enumerate(result.get("ids", [])):
        m_i = (result["metadatas"][i] or {}) if result.get("metadatas") else {}
        # outline_type 필터: ID prefix 또는 메타데이터로 매칭
        if outline_type:
            meta_ot = m_i.get("outline_type", "")
            meta_otn = m_i.get("outline_type_name", "")
            if outline_type not in (meta_ot, meta_otn):
                continue
        # version 필터: 명시된 경우 정확히 일치만 (빈 문자열끼리도 매치)
        if version is not None and version != "" and m_i.get("version", "") != version:
            continue
        # year 필터: 명시된 경우 정확히 일치만. 기존 레코드(필드 부재)는 "" 취급
        if year is not None and year != "" and (m_i.get("outline_year", "") or "") != year:
            continue
        meta = m_i
        st = meta.get("sub_topic", "기타")
        if st not in subtopics:
            subtopics[st] = []
        subtopics[st].append({"id": doc_id, "point_num": meta.get("point_num", ""), "level": meta.get("level", ""), "content": meta.get("point_content", ""), "scriptures": meta.get("scriptures", "")})

    # 정렬
    def sort_key(st):
        m = re.match(r"^(\d+)", st)
        return int(m.group(1)) if m else 999
    sorted_sub = dict(sorted(subtopics.items(), key=lambda x: sort_key(x[0])))
    for st in sorted_sub:
        sorted_sub[st].sort(key=lambda p: p["id"])
    # 유의사항: 첫 요점의 note 메타데이터에서 추출
    note = ""
    if result.get("metadatas"):
        for m in result["metadatas"]:
            if m and m.get("note"):
                note = m["note"]
                break
    return {"subtopics": sorted_sub, "note": note}


# ─── 1단계: 전체 삭제 (컬렉션 단위) ──────────────────────

@router.delete("/api/db/clear/{collection_name}")
def clear_collection(collection_name: str):
    """컬렉션 전체 삭제 (jw_ai는 보호)"""
    if collection_name == "jw_ai":
        raise HTTPException(status_code=403, detail="jw_ai 컬렉션은 삭제할 수 없습니다")
    if collection_name not in ("speech_points", "speech_expressions", "publications"):
        raise HTTPException(status_code=400, detail=f"허용되지 않는 컬렉션: {collection_name}")

    client = get_db()
    deleted = 0
    try:
        col = client.get_collection(collection_name)
        deleted = col.count()
        client.delete_collection(collection_name)
    except Exception:
        pass

    # speech_points 삭제 시 outlines 폴더도 비움
    if collection_name == "speech_points" and os.path.exists(_OUTLINES_DIR):
        for fname in os.listdir(_OUTLINES_DIR):
            if fname.endswith(".json"):
                try:
                    os.remove(os.path.join(_OUTLINES_DIR, fname))
                except Exception:
                    pass

    _bm25_cache.clear()
    return {"deleted": deleted}


@router.post("/api/db/add")
def db_add(req: DbAddRequest):
    """새 항목 DB에 저장"""
    # source 영문 통일
    req.source = normalize_source(req.source)
    client = get_db()
    ts = str(int(time.time() * 1000))

    # 출판물 코드 자동 포맷 (모든 entry_type 공통)
    # 파24 7월호 2-7면 → 「파24.7」 2-7면
    # 「파24」 7월호 2-7면 → 「파24.7」 2-7면
    # 파13 9/15 17-21면 → 「파13」 9/15 17-21면
    formatted_pub_code = req.pub_code.strip()
    if formatted_pub_code:
        # 이미 「」 포함된 경우: 「파24」 7월호 2-7면
        m = re.match(r"「([^」]+)」\s*(\d{1,2})월호\s*(.*)", formatted_pub_code)
        if m:
            formatted_pub_code = f"「{m.group(1)}.{m.group(2)}」" + (" " + m.group(3).strip() if m.group(3).strip() else "")
        elif not formatted_pub_code.startswith("「"):
            parts = formatted_pub_code.split(" ", 1)
            abbr = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            month_match = re.match(r"(\d{1,2})월호\s*(.*)", rest)
            if month_match:
                abbr = f"{abbr}.{month_match.group(1)}"
                rest = month_match.group(2).strip()
            formatted_pub_code = f"「{abbr}」" + (" " + rest if rest else "")

    if req.entry_type == "publication":
        # Phase 3: save-publication과 동일한 업서트 경로로 통합.
        # pub_code + reference 유일 ID. 같은 참조면 referenced_by 갱신, 다른 참조면 append.
        from services.publication_utils import _upsert_publication

        pub_code = formatted_pub_code.strip()
        ref = (req.reference or "").strip()
        if not pub_code or not ref:
            return {"status": "error", "message": "pub_code, reference는 필수", "collection": "publications"}

        col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})
        pub_data = {
            "pub_code": pub_code,
            "pub_title": req.pub_title.strip() or pub_code,
            "pub_type": req.pub_type.strip() or "manual",
            "reference": ref,
            "content": req.content,
            "keywords": req.keywords,  # string 또는 list 모두 _upsert_publication이 처리
            "reference_info": {
                "outline_type": normalize_outline_type(req.outline_type),
                "outline_num": req.outline_num,
                "outline_year": req.outline_year,
                "version": req.version,
                "point_num": req.point_id,
                "outline_title": req.outline_title or req.topic,
                "subtopic_title": req.subtopic,
                "point_text": req.point_summary or "",
            },
        }
        res = _upsert_publication(col, pub_data)
        _bm25_cache.clear()
        return {"status": "저장 완료", "id": res["id"], "action": res["action"], "collection": "publications"}

    col_name = "speech_expressions" if req.entry_type in ("expression", "example") or req.source in ("memo", "discussion", "service", "visit") else "speech_points"
    col = client.get_or_create_collection(col_name, metadata={"hnsw:space": "cosine"})

    # 문서 조립
    is_discussion = req.source == "discussion"
    doc_parts = []
    if is_discussion:
        doc_parts.append(f"[토의] {req.sub_source}")
        if formatted_pub_code:
            doc_parts.append(f"[출판물] {formatted_pub_code}")
        if req.topic:
            doc_parts.append(f"[주제] {req.topic}")
        if req.subtopic:
            doc_parts.append(f"[질문] {req.subtopic}")
    elif req.source in ("service", "visit"):
        doc_parts.append(f"[{'봉사 모임' if req.source == 'service' else '방문'}]")
        if req.service_type:
            doc_parts.append(f"[유형] {req.service_type}")
        if req.visit_target:
            doc_parts.append(f"[대상] {req.visit_target}")
        if req.topic:
            doc_parts.append(f"[주제] {req.topic}")
        if req.situation:
            doc_parts.append(f"[상황] {req.situation}")
    else:
        if req.source and req.source not in ('공개강연', '공개 강연'):
            doc_parts.append(f"[출처] {req.source}")
        if req.outline_num:
            doc_parts.append(f"[골자] {req.outline_num} - {req.outline_title or req.topic}")
        elif req.topic:
            doc_parts.append(f"[골자] {req.topic}")
        if req.subtopic:
            doc_parts.append(f"[소주제] {req.subtopic}")
        if req.point_summary:
            doc_parts.append(f"[요점] {req.point_summary}")
    if formatted_pub_code and req.entry_type != "publication":
        doc_parts.append(f"[출판물] {formatted_pub_code}")
    if req.scriptures:
        doc_parts.append(f"[성구] {req.scriptures}")
    if req.keywords:
        doc_parts.append(f"[키워드] {req.keywords}")
    doc_parts.append("")
    doc_parts.append(req.content)
    doc_text = "\n".join(doc_parts)

    doc_id = f"manual_{req.speaker or 'discussion'}_{ts}" if is_discussion else f"manual_{req.speaker or 'unknown'}_{ts}"

    # service_type 정리: 봉사 모임/방문/기타 연설/토의 기타 이외의 소스에서는 service_type 제거
    svc_type = req.service_type
    if req.source not in ("service", "visit") and req.sub_source not in ("기타 연설", "기타"):
        svc_type = ""

    if is_discussion:
        meta = {
            "type": "expression",
            "source": "discussion",
            "sub_source": req.sub_source,
            "discussion_type": req.sub_source,
            "topic": req.topic,
            "question": req.subtopic,
            "pub_code": formatted_pub_code or "",
            "date": req.date,
            "scriptures": req.scriptures,
            "keywords": req.keywords,
            "mode": "manual",
            "outline_title": req.topic,
            "subtopic": req.subtopic,
            "outline_num": "",
            "outline_type": "",
            "speaker": req.speaker,
            "point_content": "",
            "tag": "",
            "usage": "사용",
            "level": "L1",
        }
    elif req.source in ("service", "visit"):
        meta = {
            "type": "expression",
            "source": req.source,
            "service_type": req.service_type,
            "visit_target": req.visit_target,
            "situation": req.situation,
            "topic": req.topic,
            "date": req.date,
            "scriptures": req.scriptures,
            "publications": formatted_pub_code or "",
            "pub_code": formatted_pub_code or "",
            "keywords": req.keywords,
            "rating": str(req.rating),
            "rating_note": req.rating_note,
            "favorite": "true" if req.favorite else "false",
            "used_count": "0",
            "last_used": "",
            "mode": "manual",
            "outline_title": req.topic,
            "outline_num": "",
            "outline_type": "",
            "subtopic": "",
            "speaker": req.speaker,
            "sub_source": "",
            "point_content": "",
            "pub_code": "",
            "tag": "",
            "usage": "사용",
            "level": "L1",
        }
    else:
        meta = {
            "type": req.entry_type,
            "speaker": req.speaker,
            "date": req.date,
            "source": req.source,
            "sub_source": req.sub_source,
            "service_type": svc_type,
            "outline_num": req.outline_num,
            "outline_type": req.outline_type,
            "outline_title": req.outline_title or req.topic,
            "subtopic": req.subtopic,
            "point_id": "",
            "point_content": req.point_summary or "",
            "scriptures": req.scriptures,
            "publications": formatted_pub_code or "",
            "pub_code": formatted_pub_code or "",
            "keywords": req.keywords,
            "tag": "",
            "usage": "사용",
            "level": "L1",
            "mode": "manual",
        }

    emb = get_embedding(doc_text)
    col.add(ids=[doc_id], documents=[doc_text], metadatas=[meta], embeddings=[emb])
    _bm25_cache.clear()
    return {"status": "저장 완료", "id": doc_id, "collection": col_name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

_SPEECHES_DIR = os.path.join(os.path.expanduser("~/jw-system"), "speeches")

@router.get("/api/db/originals")
def list_originals():
    """원문 목록 (DB + 파일)"""
    client = get_db()
    result = {}

    # 1. DB에서 source="원문" 조회
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i]
                if meta.get("source") != "원문":
                    continue
                outline_key = meta.get("outline_num", "") or "기타"
                if outline_key not in result:
                    result[outline_key] = {
                        "outline_num": meta.get("outline_num", ""),
                        "outline_type": meta.get("outline_type", ""),
                        "outline_title": meta.get("outline_title", ""),
                        "speakers": []
                    }
                result[outline_key]["speakers"].append({
                    "id": doc_id,
                    "collection": col_name,
                    "speaker": meta.get("speaker", ""),
                    "date": meta.get("date", ""),
                    "text": all_data["documents"][i],
                    "metadata": meta,
                    "source_type": "db",
                })
        except Exception:
            continue

    # 2. ~/jw-system/speeches/ 폴더에서 파일 조회
    if os.path.exists(_SPEECHES_DIR):
        import re as _re
        for fname in sorted(os.listdir(_SPEECHES_DIR)):
            if not fname.endswith(".md") and not fname.endswith(".txt"):
                continue
            fpath = os.path.join(_SPEECHES_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue
            # 파일명에서 메타 추출: S-34_003_박성준_2503_원문.md
            fn_clean = fname.replace("_원문수정본", "").replace("_원문", "").replace(".md", "").replace(".txt", "")
            fn_parts = fn_clean.split("_")
            ot = fn_parts[0] if fn_parts else ""
            on = fn_parts[1] if len(fn_parts) > 1 else ""
            speaker = fn_parts[2] if len(fn_parts) > 2 else ""
            date = fn_parts[3] if len(fn_parts) > 3 else ""
            # md 내용에서 제목 추출
            title = ""
            for line in content.split("\n"):
                if line.strip().startswith("- **제목**:"):
                    title = line.strip().replace("- **제목**:", "").strip()
                    break
            outline_key = on or "기타"
            if outline_key not in result:
                result[outline_key] = {
                    "outline_num": on,
                    "outline_type": ot,
                    "outline_title": title,
                    "speakers": []
                }
            if title and not result[outline_key]["outline_title"]:
                result[outline_key]["outline_title"] = title
            result[outline_key]["speakers"].append({
                "id": f"file_{fname}",
                "collection": "file",
                "speaker": speaker,
                "date": date,
                "text": content,
                "metadata": {"source": "원문", "outline_type": ot, "outline_num": on, "outline_title": title, "speaker": speaker, "date": date, "filename": fname},
                "source_type": "file",
                "filename": fname,
            })

    return {"originals": result}


@router.get("/api/db/speaker-memos")
def list_speaker_memos():
    """연사메모 전체 목록"""
    client = get_db()
    items = []
    try:
        col = client.get_collection("speech_expressions")
        all_data = col.get(include=["documents", "metadatas"])
        if all_data and all_data["ids"]:
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i]
                if meta.get("source") != "speaker_memo":
                    continue
                items.append({
                    "id": doc_id,
                    "collection": "speech_expressions",
                    "text": all_data["documents"][i],
                    "metadata": meta,
                })
    except Exception:
        pass
    # rating → 최신순
    items.sort(key=lambda x: (x["metadata"].get("rating", 0), x["metadata"].get("date", ""), x["metadata"].get("speaker", "")), reverse=True)
    return {"memos": items, "total": len(items)}


@router.get("/api/db/transcripts")
def list_transcripts():
    """원문 목록 (골자별 연사 그룹)"""
    client = get_db()
    result = {}
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i]
                if meta.get("source") != "원문":
                    continue
                o_num = meta.get("outline_num", "")
                o_title = meta.get("outline_title", "")
                o_type = meta.get("outline_type", "")
                source = meta.get("source", "")
                speaker = meta.get("speaker", "")
                date = meta.get("date", "")
                # outline_type이 비어있으면 문서 내용에서 추출 시도
                if not o_type:
                    doc_text = all_data["documents"][i] or ""
                    for line in doc_text.split("\n"):
                        if line.startswith("- **골자유형**:"):
                            o_type = line.replace("- **골자유형**:", "").strip()
                            break
                key = o_num or o_title or "기타"
                if key not in result:
                    result[key] = {"outline_num": o_num, "outline_title": o_title, "outline_type": o_type, "source": source, "speakers": []}
                elif o_type and not result[key]["outline_type"]:
                    result[key]["outline_type"] = o_type
                if source and not result[key].get("source"):
                    result[key]["source"] = source
                result[key]["speakers"].append({
                    "speaker": speaker,
                    "date": date,
                    "subtopic": meta.get("subtopic", ""),
                    "id": doc_id,
                    "collection": col_name,
                    "text": all_data["documents"][i],
                })
        except Exception:
            continue
    # 파일 원문 추가
    if os.path.exists(_SPEECHES_DIR):
        import re as _re
        for fname in sorted(os.listdir(_SPEECHES_DIR)):
            if not fname.endswith(".md") and not fname.endswith(".txt"):
                continue
            fpath = os.path.join(_SPEECHES_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue
            fn_clean = fname.replace("_원문수정본", "").replace("_원문", "").replace(".md", "").replace(".txt", "")
            fn_parts = fn_clean.split("_")
            ot = fn_parts[0] if fn_parts else ""
            on = fn_parts[1] if len(fn_parts) > 1 else ""
            speaker = fn_parts[2] if len(fn_parts) > 2 else ""
            date = fn_parts[3] if len(fn_parts) > 3 else ""
            # md 파일 내용에서 제목 추출
            title = ""
            for line in content.split("\n"):
                if line.strip().startswith("- **제목**:"):
                    title = line.strip().replace("- **제목**:", "").strip()
                    break
            key = on or "기타"
            if key not in result:
                result[key] = {"outline_num": on, "outline_title": title, "outline_type": ot, "source": "원문", "speakers": []}
            if title and not result[key]["outline_title"]:
                result[key]["outline_title"] = title
            result[key]["speakers"].append({
                "speaker": speaker, "date": date, "subtopic": "",
                "id": f"file_{fname}", "collection": "file", "text": content,
                "filename": fname, "source_type": "file",
            })

    return {"transcripts": result}


@router.get("/api/db/transcript/{collection}/{doc_id}")
def get_transcript(collection: str, doc_id: str):
    """원문 하나 조회"""
    client = get_db()
    try:
        col = client.get_collection(collection)
        result = col.get(ids=[doc_id], include=["documents", "metadatas"])
        if result and result["ids"]:
            return {
                "id": result["ids"][0],
                "text": result["documents"][0],
                "metadata": result["metadatas"][0],
            }
        raise HTTPException(status_code=404, detail="원문을 찾을 수 없습니다")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))




@router.post("/api/db/batch-add")
def batch_add(req: BatchAddRequest):
    """전처리 파일 일괄 저장 (upsert)"""
    client = get_db()
    counts = {}
    errors = []
    for item in req.items:
        try:
            col = client.get_or_create_collection(item.collection, metadata={"hnsw:space": "cosine"})
            emb = get_embedding(item.text)
            doc_id = item.id or f"{item.collection}_{int(time.time()*1000)}_{hash(item.text) % 100000}"
            clean_meta = {}
            for k, v in item.metadata.items():
                if v is None:
                    clean_meta[k] = ""
                elif isinstance(v, (str, int, float)):
                    clean_meta[k] = v
                else:
                    clean_meta[k] = str(v)
            col.upsert(ids=[doc_id], documents=[item.text], embeddings=[emb], metadatas=[clean_meta])
            counts[item.collection] = counts.get(item.collection, 0) + 1
            time.sleep(0.02)
        except Exception as e:
            errors.append(str(e))
    _bm25_cache.clear()
    return {"status": "완료", "counts": counts, "errors": errors[:5]}


@router.get("/api/db/batch-list")
def batch_list():
    """전처리 항목 그룹별 목록"""
    client = get_db()
    groups = {}
    for col_name in ["speech_points", "speech_expressions", "publications"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i] or {}
                if meta.get("source") in ("원문", "메모"):
                    continue
                gn = meta.get("outline_num", "")
                sp = meta.get("speaker", "")
                dt = meta.get("date", "")
                gt = meta.get("outline_type", "")
                title = meta.get("outline_title", "")
                src = meta.get("source", "")
                svc = meta.get("service_type", "")
                sub_src = meta.get("sub_source", "")
                # 키 생성: 컬렉션+골자번호+연사+날짜 (컬렉션별 분리)
                if gn:
                    key = f"{col_name}_{gn}_{sp}_{dt}" if sp else f"{col_name}_{gn}"
                else:
                    key = f"{col_name}_{src}_{title}_{sp}_{dt}" if sp else f"{col_name}_{src}_{title}"
                m = meta.get("mode", "") or ("manual" if meta.get("pub_type") == "manual" else "")
                pc = meta.get("pub_code", "")
                if key not in groups:
                    groups[key] = {"outline_num": gn, "outline_type": gt, "outline_title": title, "speaker": sp, "date": dt, "mode": m, "source": src, "service_type": svc, "sub_source": sub_src, "pub_code": pc, "keywords": set(), "ids": {}, "counts": {}, "items": []}
                if not groups[key]["pub_code"] and pc:
                    groups[key]["pub_code"] = pc
                if not groups[key]["outline_type"] and gt:
                    groups[key]["outline_type"] = gt
                if not groups[key]["outline_title"] and title:
                    groups[key]["outline_title"] = title
                item_info = {"pub": pc, "point": meta.get("point_content", ""), "scripture": meta.get("scriptures", ""), "type": meta.get("type", "")}
                groups[key]["items"].append(item_info)
                kw = meta.get("keywords", "")
                if kw:
                    for k in kw.split(","):
                        k = k.strip()
                        if k:
                            groups[key]["keywords"].add(k)
                # 골자는 keywords가 없으므로 point_content를 수집
                if not kw and src in ("outline", "골자"):
                    pc = meta.get("point_content", "")
                    if pc and len(pc) <= 30:
                        groups[key]["keywords"].add(pc)
                typ = meta.get("type", "unknown")
                groups[key]["counts"][typ] = groups[key]["counts"].get(typ, 0) + 1
                if col_name not in groups[key]["ids"]:
                    groups[key]["ids"][col_name] = []
                groups[key]["ids"][col_name].append(doc_id)
        except Exception:
            continue
    result = []
    for key, g in sorted(groups.items()):
        total = sum(g["counts"].values())
        result.append({
            "key": key, "outline_num": g["outline_num"], "outline_type": g["outline_type"],
            "outline_title": g["outline_title"], "speaker": g["speaker"], "date": g["date"],
            "mode": g.get("mode", ""), "source": g.get("source", ""), "service_type": g.get("service_type", ""),
            "sub_source": g.get("sub_source", ""), "pub_code": g.get("pub_code", ""), "keywords": ", ".join(sorted(g.get("keywords", set()))), "items": g.get("items", []), "counts": g["counts"], "total": total, "ids": g["ids"],
        })
    # 컬렉션별 총 건수
    col_counts = {}
    for col_name in ["speech_points", "speech_expressions", "publications"]:
        try:
            col_counts[col_name] = client.get_collection(col_name).count()
        except Exception:
            col_counts[col_name] = 0
    return {"groups": result, "collection_counts": col_counts}



@router.post("/api/db/batch-delete")
def batch_delete(req: BatchDeleteRequest):
    """전처리 항목 일괄 삭제 + 골자 JSON 삭제"""
    client = get_db()
    deleted = 0
    outline_deleted = set()
    for col_name, doc_ids in req.ids.items():
        try:
            col = client.get_collection(col_name)
            # 삭제 전 골자 정보 수집 (outline JSON 삭제용)
            try:
                existing = col.get(ids=doc_ids, include=["metadatas"])
                for meta in (existing.get("metadatas") or []):
                    if meta and meta.get("source") == "outline":
                        gn = meta.get("outline_num", "")
                        gt = meta.get("outline_type", "")
                        gy = meta.get("outline_year", "") or ""
                        ver = meta.get("version", "")
                        if gn:
                            outline_deleted.add((gt, gn, gy, ver))
            except Exception:
                pass
            col.delete(ids=doc_ids)
            deleted += len(doc_ids)
        except Exception:
            pass
    # 골자 JSON 파일 삭제
    for gt, gn, gy, ver in outline_deleted:
        prefix = _outline_prefix(gt, gn, gy)
        ver_safe = ver.replace("/", "-").replace(" ", "").strip()
        fname = f"{prefix}_v{ver_safe}.json" if ver_safe else f"{prefix}.json"
        fpath = os.path.join(_OUTLINES_DIR, fname)
        try:
            if os.path.exists(fpath):
                os.remove(fpath)
        except Exception:
            pass
    _bm25_cache.clear()
    return {"status": "삭제 완료", "deleted": deleted, "outline_files_deleted": len(outline_deleted)}


@router.post("/api/migrate/source-values")
def migrate_source_values():
    """모든 컬렉션의 source 값을 한국어→영문으로 마이그레이션"""
    from config import SOURCE_KO_TO_EN
    client = get_db()
    updated = {}
    for col_name in ["speech_points", "speech_expressions", "publications"]:
        count = 0
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                src = meta.get("source", "")
                if src in SOURCE_KO_TO_EN:
                    new_src = SOURCE_KO_TO_EN[src]
                    col.update(ids=[doc_id], metadatas=[{**meta, "source": new_src}])
                    count += 1
            updated[col_name] = count
        except Exception as e:
            updated[col_name] = f"오류: {e}"
    _bm25_cache.clear()
    return {"status": "마이그레이션 완료", "updated": updated}
