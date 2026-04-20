"""성경 검색, WOL 검색 API"""
from fastapi import APIRouter
from models import BibleSearchRequest, WolSearchRequest
from services.bible_utils import BOOK_TO_ABBR, normalize_book_name, expand_scripture_refs, get_verse_text, _SINGLE_CHAPTER_BOOKS
from services.wol import search_wol, _HAS_BS4
from db import get_db
import re

router = APIRouter()


@router.post("/api/wol/search")
def wol_search_api(req: WolSearchRequest):
    """WOL 검색 (독립 엔드포인트)"""
    if not _HAS_BS4:
        raise HTTPException(status_code=500, detail="beautifulsoup4 미설치")
    results = search_wol(req.query, max_results=req.max_results)
    return {"results": results, "count": len(results)}

@router.get("/api/wol/status")
def wol_status():
    """WOL 검색 가용 상태"""
    return {"available": _HAS_BS4}


@router.post("/api/bible/search")
def bible_search(req: BibleSearchRequest):
    """성경 검색 - 여러 줄 참조, 그룹화된 결과"""
    client = get_db()

    query = req.query.strip()
    if not query:
        return {"results": []}

    # 여러 줄에서 성구 참조 추출 (원래 참조 유지)
    grouped = []  # [{"original": "요한 1서 2:15-17", "refs": ["요1 2:15", "요1 2:16", "요1 2:17"]}]
    lines = query.split("\n")
    # 세미콜론과 쉼표+한글로도 분리
    expanded_lines = []
    for line in lines:
        parts = re.split(r";\s*", line)
        for part in parts:
            sub = re.split(r",\s*(?=[가-힣])", part)
            expanded_lines.extend(sub)
    for line in expanded_lines:
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("---"):
            continue
        line_clean = re.sub(r'^\d+\.\s*', '', line).strip()
        if not line_clean:
            continue

        refs = []
        # 단축어 참조
        expanded = expand_scripture_refs(line_clean)
        if expanded and expanded[0] != line_clean:
            refs = expanded
        else:
            # 전체이름 참조
            body_refs = extract_scriptures_from_text(line_clean)
            if body_refs:
                for br in body_refs:
                    refs.extend(expand_scripture_refs(br))
            else:
                ref_match = re.match(r'^([가-힣]+\d?)\s+(\d+):(.+)$', line_clean)
                if ref_match:
                    refs = expand_scripture_refs(line_clean)

        if refs:
            # 단장 성경 장 번호 경고 감지
            warning = ""
            ch_match = re.match(r'^(.+?)\s+(\d+):(.+)$', line_clean)
            if ch_match:
                book_check = normalize_book_name(ch_match.group(1))
                ch_num = ch_match.group(2)
                if book_check in _SINGLE_CHAPTER_BOOKS and ch_num != "1":
                    warning = f"{book_check}은(는) 1장만 있습니다 ({ch_num}장→1장 보정)"
            grouped.append({"original": line_clean, "refs": refs, "warning": warning})
        else:
            grouped.append({"original": line_clean, "refs": [], "error": "파싱 실패"})

    # DB 검색 및 그룹화된 결과 생성
    results = []
    errors = []
    total_count = 0
    bible = client.get_collection("jw_ai")

    for group in grouped:
        if group.get("error"):
            errors.append({"original": group["original"], "reason": group["error"]})
            continue

        verses = []
        not_found = []
        for ref in group["refs"]:
            try:
                res = bible.get(where={"참조": ref}, include=["documents", "metadatas"])
                if res and res["documents"]:
                    meta = res["metadatas"][0] if res["metadatas"] else {}
                    verses.append({
                        "ref": meta.get("참조", ref),
                        "verse": meta.get("절", 0),
                        "text": res["documents"][0],
                    })
                    total_count += 1
                else:
                    not_found.append(ref)
            except Exception:
                not_found.append(ref)

        if verses:
            # 첫 절의 메타데이터에서 책 정보
            first_meta_ref = group["refs"][0]
            try:
                first_res = bible.get(where={"참조": first_meta_ref}, include=["metadatas"])
                book = first_res["metadatas"][0].get("책", "") if first_res["metadatas"] else ""
            except Exception:
                book = ""

            results.append({
                "original": group["original"],
                "book": book,
                "verses": verses,
                "not_found": not_found,
                "warning": group.get("warning", ""),
            })
        elif not_found:
            errors.append({"original": group["original"], "reason": "DB에 없음", "refs": not_found})

    return {"results": results, "ref_count": total_count, "errors": errors}


@router.get("/api/bible/lookup")
def bible_lookup(ref: str):
    """성구 참조로 본문 조회 (쉼표/세미콜론 복수 지원)"""
    client = get_db()
    bible = client.get_collection("jw_ai")
    ref = ref.strip()
    if not ref:
        return {"verses": []}

    # 세미콜론·쉼표+한글로 분리
    parts = re.split(r";\s*", ref)
    all_refs = []
    for part in parts:
        subs = re.split(r",\s*(?=[가-힣])", part)
        for s in subs:
            s = s.strip()
            if s:
                all_refs.extend(expand_scripture_refs(s))

    verses = []
    for r in all_refs:
        try:
            res = bible.get(where={"참조": r}, include=["documents", "metadatas"])
            if res and res["documents"]:
                meta = res["metadatas"][0] if res["metadatas"] else {}
                verses.append({"ref": meta.get("참조", r), "text": res["documents"][0]})
        except Exception:
            pass
    return {"verses": verses}
