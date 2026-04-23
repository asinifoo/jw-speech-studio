"""전처리 API (parse-md, save-outline/speech/publication, 삭제)"""
import os
import re
import json
import time
from fastapi import APIRouter, HTTPException, UploadFile, File
from config import _OUTLINES_DIR, _UPLOAD_DIR
from models import ParseRequest
from services.outline_parser import (
    parse_outline_text, parse_outline_docx,
    _lines_to_indented_text, _extract_meta_from_docx,
    _outline_prefix, _ver_safe, _TYPE_NAMES,
    normalize_outline_type,
)
from db import get_db, get_embedding, _bm25_cache

router = APIRouter()

os.makedirs(_UPLOAD_DIR, exist_ok=True)
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("/api/parse")
def parse_outline(req: ParseRequest):
    return parse_outline_text(req.text, req.has_separate_title)

def extract_text_from_file(filepath: str) -> str:
    """파일에서 텍스트 추출 (txt, md, pdf, docx 지원)."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext in ('.txt', '.md', '.csv', '.json', '.log'):
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()

    if ext == '.pdf':
        try:
            import subprocess
            result = subprocess.run(
                ['python3', '-c', f"""
import sys
try:
    import fitz  # PyMuPDF
    doc = fitz.open("{filepath}")
    text = "\\n\\n".join(page.get_text() for page in doc)
    print(text)
except ImportError:
    # fallback: pdftotext
    import subprocess as sp
    r = sp.run(['pdftotext', '-layout', '{filepath}', '-'], capture_output=True, text=True)
    print(r.stdout)
"""],
                capture_output=True, text=True, timeout=30
            )
            return result.stdout.strip()
        except Exception as e:
            return f"[PDF 텍스트 추출 실패: {e}]"

    if ext == '.docx':
        try:
            import zipfile
            from xml.etree import ElementTree
            with zipfile.ZipFile(filepath, 'r') as z:
                with z.open('word/document.xml') as doc_xml:
                    tree = ElementTree.parse(doc_xml)
                    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    paragraphs = tree.findall('.//w:p', ns)
                    texts = []
                    for p in paragraphs:
                        runs = p.findall('.//w:t', ns)
                        line = ''.join(r.text or '' for r in runs)
                        if line:
                            texts.append(line)
                    return '\n'.join(texts)
        except Exception as e:
            return f"[DOCX 텍스트 추출 실패: {e}]"

    return f"[지원하지 않는 파일 형식: {ext}]"


@router.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """파일 업로드 → 텍스트 추출 반환"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="파일이 없습니다")

    # 크기 체크
    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"파일 크기 초과 (최대 {_MAX_FILE_SIZE // 1024 // 1024}MB)")

    # 저장
    safe_name = re.sub(r'[^\w.\-]', '_', file.filename)
    filepath = os.path.join(_UPLOAD_DIR, f"{int(time.time())}_{safe_name}")
    with open(filepath, 'wb') as f:
        f.write(content)

    # 텍스트 추출
    text = extract_text_from_file(filepath)
    char_count = len(text)

    return {
        "filename": file.filename,
        "size": len(content),
        "chars": char_count,
        "text": text[:50000],  # 최대 5만자
        "truncated": char_count > 50000,
    }

# ─── 골자 DOCX → 들여쓰기 텍스트 변환 API (구조 해석 X) ───

@router.post("/api/preprocess/docx-to-text")
async def docx_to_text_endpoint(file: UploadFile = File(...)):
    """
    골자 DOCX → [골자 입력] 파서와 호환되는 들여쓰기 plain text + meta.
    구조화된 JSON은 반환하지 않음. 계층 해석은 프론트 [골자 입력] 파서가 담당.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="파일이 없습니다")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext != ".docx":
        raise HTTPException(status_code=400, detail=f"DOCX 파일만 지원합니다 (입력: {ext or '확장자 없음'})")

    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"파일 크기 초과 (최대 {_MAX_FILE_SIZE // 1024 // 1024}MB)")

    try:
        parsed = parse_outline_docx(content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DOCX 파싱 실패: {e}")

    text = _lines_to_indented_text(parsed.get("raw_lines", []))
    meta = _extract_meta_from_docx(parsed, file.filename)
    return {"text": text, "meta": meta}


# ─── 전처리 md 파싱 API ──────────────────────────────────

@router.post("/api/preprocess/parse-md")
async def parse_md_files(files: list[UploadFile] = File(...)):
    """전처리된 md 파일을 파싱하여 구조화된 데이터 반환"""
    import re as _re

    results = []

    for file in files:
        content = (await file.read()).decode("utf-8", errors="replace")
        lines = content.split("\n")
        filename = file.filename or ""

        # ── 파일명에서 메타 추출 ──
        fn_clean = filename.replace("_preprocessed", "").replace("_processed", "").replace(".md", "").replace(".txt", "")
        fn_parts = fn_clean.split("_")

        fn_type = ""
        fn_num = ""
        fn_speaker = ""
        fn_date = ""

        if fn_parts:
            # "golza" 접두어 제거
            if fn_parts[0].lower() == "golza":
                fn_parts = fn_parts[1:]

            if fn_parts:
                first = fn_parts[0]
                rest_start = 1

                # 유형 감지
                if first.startswith("S-34"):
                    fn_type = "S-34"
                elif first.startswith("S-31"):
                    fn_type = "S-31"
                elif first.startswith("JWBC"):
                    fn_type = first
                elif _re.match(r"^S-\d{2,3}", first):
                    fn_type = first
                elif _re.match(r"^(CO|SB|ETC)", first):
                    fn_type = first
                else:
                    fn_type = first
                    rest_start = 1

                if len(fn_parts) > rest_start:
                    fn_num = fn_parts[rest_start]

                remaining = fn_parts[rest_start + 1:] if len(fn_parts) > rest_start + 1 else []
                for part in remaining:
                    if _re.match(r"^\d{4,6}$", part):
                        fn_date = part
                    elif part in ("preprocessed", "processed") or _re.match(r"^v[\d\-/]+$", part):
                        pass  # 전처리 마커 또는 버전 (v8-19, v12-16 등) 무시
                    else:
                        fn_speaker = fn_speaker or part

        # ── 내용에서 메타데이터 추출 (본문 우선, 파일명은 폴백) ──
        meta = {
            "outline_type": "", "outline_num": "", "title": "", "version": "",
            "time": "", "note": "", "speaker": "", "date": "",
            "source": "", "memo": "", "theme_scripture": "",
        }

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("- **연사**:"):
                val = stripped.replace("- **연사**:", "").strip()
                if val: meta["speaker"] = val
            elif stripped.startswith("- **날짜**:"):
                val = _re.sub(r"\s*\(.*\)", "", stripped.replace("- **날짜**:", "")).strip()
                if val: meta["date"] = val
            elif stripped.startswith("- **골자번호**:") or stripped.startswith("- **번호**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val: meta["outline_num"] = val
            elif stripped.startswith("- **제목**:"):
                val = stripped.replace("- **제목**:", "").strip()
                if val: meta["title"] = val
            elif stripped.startswith("- **골자유형**:"):
                val = stripped.replace("- **골자유형**:", "").strip()
                if val: meta["outline_type"] = normalize_outline_type(val)
            elif stripped.startswith("- **골자버전**:") or stripped.startswith("- **버전**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val: meta["version"] = val
            elif stripped.startswith("- **시간**:") or stripped.startswith("- **총 시간**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val and not meta["time"]: meta["time"] = val
            elif stripped.startswith("- **유의사항**:") or stripped.startswith("- **유의 사항**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val: meta["note"] = val
            elif stripped.startswith("- **출처**:"):
                val = stripped.replace("- **출처**:", "").strip()
                if val: meta["source"] = val
            elif stripped.startswith("- **메모**:") or stripped.startswith("- **비고**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val: meta["memo"] = val
            elif stripped.startswith("- **주제성구**:") or stripped.startswith("- **주제 성구**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val: meta["theme_scripture"] = val

        # 본문에 없는 필드만 파일명 값으로 폴백
        if not meta["outline_type"] and fn_type: meta["outline_type"] = fn_type
        if not meta["outline_num"] and fn_num: meta["outline_num"] = fn_num
        if not meta["speaker"] and fn_speaker: meta["speaker"] = fn_speaker
        if not meta["date"] and fn_date: meta["date"] = fn_date

        # ── 유형 보정 ──
        ot = meta["outline_type"]
        on = meta["outline_num"]
        if not ot and on:
            if _re.match(r"^\d{1,3}$", on):
                meta["outline_type"] = "S-34"
            elif on.startswith("기념식") or on.startswith("S-31"):
                meta["outline_type"] = "S-31"
        # outline_type_name 자동 설정
        meta["outline_type_name"] = _TYPE_NAMES.get(meta["outline_type"], meta["outline_type"])

        # ── 소주제 + 요점 파싱 ──
        subtopics = []
        current_sub = {"num": 0, "title": "", "time": "", "points": []}

        section_blocks = content.split("\n### ")

        sub_pattern = _re.compile(r"^## 소주제\s*(\d+)\s*[:：]\s*(.+?)(?:\s*\((\d+[~\-]?\d*분)\))?\s*$", _re.MULTILINE)
        sub_matches = list(sub_pattern.finditer(content))

        # 연사 특징 메모
        speaker_memo = ""
        memo_match = _re.search(r"## 연사 특징 메모\s*\n([\s\S]*?)(?=\n## |\Z)", content)
        if memo_match:
            speaker_memo = memo_match.group(1).strip()

        def _extract_field(block, name):
            # Build-6A: \s* → [ \t]*  (\s가 \n을 소비해 다음 라벨까지 먹던 버그 수정)
            m = _re.search(rf"- \*\*{name}\*\*:[ \t]*(.*?)(?:\n|$)", block)
            return m.group(1).strip() if m else ""

        def _extract_bold_field(block, name):
            m = _re.search(rf"\*\*\[{name}\]\*\*:?[ \t]*(.*)", block)
            return m.group(1).strip() if m else ""

        for i, block_raw in enumerate(section_blocks[1:], 1):
            block = "### " + block_raw

            level_match = _re.match(r"### (?:🟥|🟧|🟨|🟩|🟦|🟪)\s*\[L(\d)\]\s*([\d.]+(?:\.\d+)*)", block)
            if not level_match:
                continue

            level_num = int(level_match.group(1))
            point_num = level_match.group(2)
            level = f"L{level_num}"

            block_start = content.find(block_raw)
            belonging_sub = 0
            for sm in sub_matches:
                if sm.start() < block_start:
                    belonging_sub = int(sm.group(1))

            if belonging_sub > 0 and (not subtopics or subtopics[-1]["num"] != belonging_sub):
                if current_sub["points"]:
                    subtopics.append(current_sub)
                sm_obj = next((s for s in sub_matches if int(s.group(1)) == belonging_sub), None)
                current_sub = {
                    "num": belonging_sub,
                    "title": sm_obj.group(2).strip() if sm_obj else "",
                    "time": sm_obj.group(3) or "" if sm_obj else "",
                    "points": [],
                }

            subtopic_val = _extract_field(block, "소주제")
            point_content = _extract_field(block, "요점") or _extract_field(block, "내용")

            scripture = _extract_field(block, "성구")
            scripture_usage = ""
            if scripture:
                scripture = _re.sub(r"\s*✅", "", scripture).strip()
                # (낭독)/(미언급)/(참조)/(적용) 추출
                usage_m = _re.search(r"\((낭독|참조|미언급|적용)\)", scripture)
                if usage_m:
                    scripture_usage = usage_m.group(1)
                    scripture = _re.sub(r"\s*\((낭독|참조|미언급|적용)\)", "", scripture).strip()

            publications = _extract_field(block, "출판물")

            has_speech_data = "**[연설내용_전체]**" in block
            raw_usage = _extract_field(block, "사용여부")
            usage = raw_usage or ("미상" if has_speech_data else "사용")

            speech_text = ""
            speech_match = _re.search(r"\*\*\[연설내용_전체\]\*\*\n(.*?)(?:\n\*\*\[키워드\]|\n\*\*\[태그\]|\n\*\*\[연설기법\]|\n\*\*\[표현\]|\n\*\*\[예시\]|\n---|\s*$)", block, _re.DOTALL)
            if speech_match:
                speech_text = speech_match.group(1).strip()

            keywords = _extract_bold_field(block, "키워드").replace("**", "")
            if keywords.startswith(":"):
                keywords = keywords[1:].strip()
            tags = _extract_bold_field(block, "태그").replace("**", "")
            if tags.startswith(":"):
                tags = tags[1:].strip()

            point_data = {
                "num": point_num,
                "level": level,
                "text": point_content,
                "subtopic": subtopic_val,
                "scriptures": scripture,
                "scripture_usage": scripture_usage,
                "publications": publications,
                "speech_text": speech_text,
                "keywords": keywords,
                "tags": tags,
                "usage": usage,
            }
            current_sub["points"].append(point_data)

        if current_sub["points"]:
            subtopics.append(current_sub)
        if not subtopics and current_sub["points"]:
            subtopics.append(current_sub)

        # ── 출판물 파싱 ──
        file_publications = []
        is_pub_file = "출판물" in filename or "### [pub_" in content
        if is_pub_file:
            pub_sections = content.split("### [pub_")
            for pi, pub_sec in enumerate(pub_sections[1:], 1):
                pub_block = "### [pub_" + pub_sec
                pub_hdr = _re.match(r"### \[(pub_[^\]]+)\]\s*(.*)", pub_block)
                if not pub_hdr:
                    continue
                pub_id_raw = pub_hdr.group(1)
                pub_code_raw = pub_hdr.group(2).strip()
                pub_abbr = _extract_field(pub_block, "출판물약호")
                pub_title = _extract_field(pub_block, "출판물제목")
                pub_ref = _extract_field(pub_block, "참조본문")
                pub_type = _extract_field(pub_block, "유형")
                outline_point = _extract_field(pub_block, "골자요점") or _extract_field(pub_block, "요점번호")
                subtopic_title_pub = _extract_field(pub_block, "소주제")
                point_content_pub = _extract_field(pub_block, "요점내용") or _extract_field(pub_block, "내용")
                keywords_pub = _extract_field(pub_block, "키워드")
                cross_ref = _extract_field(pub_block, "교차참조")
                body = ""
                body_match = _re.search(r"\*\*\[본문\]\*\*\n(.*?)(?=\n---|\n### |\s*$)", pub_block, _re.DOTALL)
                if body_match:
                    body = body_match.group(1).strip()
                if not body:
                    continue
                file_publications.append({
                    "pub_id": pub_id_raw,
                    "pub_code": pub_code_raw or pub_abbr,
                    "pub_abbr": pub_abbr,
                    "pub_title": pub_title,
                    "reference": pub_ref,
                    "pub_type": pub_type,
                    "outline_point": outline_point,
                    "subtopic_title": subtopic_title_pub,
                    "point_content": point_content_pub,
                    "keywords": keywords_pub,
                    "cross_ref": cross_ref,
                    "body": body,
                })

        # ── 검증 ──
        warnings = []
        total_points = sum(len(s["points"]) for s in subtopics)
        total_pubs = len(file_publications)
        if total_points == 0 and total_pubs == 0:
            warnings.append("요점/출판물이 하나도 파싱되지 않았습니다")
        if not meta["title"]:
            warnings.append("제목이 감지되지 않았습니다")
        if not meta["outline_num"]:
            warnings.append("골자 번호가 감지되지 않았습니다")

        # 파일명 형식 검증 제거 (사용자 수정 파일명 false positive 방지)

        # 요점별 검증
        def _validate_scripture(scr, pt_num):
            """성구 형식 검증"""
            if not scr:
                return
            # 마크다운 필드가 섞여 들어온 경우 무시
            if scr.startswith("- **") or scr.startswith("**"):
                return
            for part in _re.split(r"[;；]", scr):
                part = part.strip()
                if not part:
                    continue
                # 마크다운 잔여물 무시
                if part.startswith("- **") or part.startswith("**"):
                    continue
                if _re.match(r'^[-─—=*#]{2,}$', part):
                    continue
                # "히브리서 13)" — 절 번호 없음 (장만 있고 콜론 없음)
                if _re.search(r"\d+\)?\s*$", part) and ":" not in part:
                    warnings.append(f"{pt_num}: 성구 형식 오류 — '{part.strip()}' (절 번호 없음)")
                # "렘 17:" — 콜론 뒤 비어있음
                elif _re.search(r":\s*$", part):
                    warnings.append(f"{pt_num}: 성구 형식 오류 — '{part.strip()}' (콜론 뒤 비어있음)")

        def _validate_publication(pub, pt_num):
            """출판물 형식 검증 — 세미콜론 복수 출판물 지원"""
            if not pub:
                return
            if pub.startswith("- **") or pub.startswith("**"):
                return
            for part in _re.split(r"[;；]", pub):
                part = part.strip()
                if not part:
                    continue
                if part.startswith("- **") or part.startswith("**"):
                    continue
                if _re.match(r'^[-─—=*#]{2,}$', part):
                    continue
                # 겹낫표 없으면 경고
                if "「" not in part and "」" not in part:
                    warnings.append(f"{pt_num}: 출판물 형식 — '{part}' (겹낫표 없음)")
                    continue
                # 겹낫표 뒤의 참조 부분 분석
                after = part.split("」")[-1].strip() if "」" in part else ""
                if not after:
                    continue  # 출판물명만 있고 참조 없음 → 정상
                has_myeon = "면" in after
                has_hang = "항" in after
                # 숫자가 있는데 면도 항도 없으면 경고
                if _re.search(r"\d+", after) and not has_myeon and not has_hang:
                    warnings.append(f"{pt_num}: 출판물 형식 — '{part}' (면/항 누락)")
                    continue
                # "면" 없이 "항"만 있으면 → "면" 누락 의심
                # 예: "856 1항" → 856면? 856항?
                if has_hang and not has_myeon:
                    before_hang = after.split("항")[0].strip()
                    nums = _re.findall(r"\d+", before_hang)
                    if len(nums) >= 2:
                        warnings.append(f"{pt_num}: 출판물 형식 — '{part}' (\"면\" 누락?)")
                # "면" 뒤에 숫자가 있는데 "항"이 없으면 경고
                # 예: "10-11면 14-17" → 면 뒤에 14-17인데 항 없음
                if has_myeon:
                    after_myeon = after.split("면")[-1].strip()
                    if _re.search(r"\d+", after_myeon) and not has_hang:
                        warnings.append(f"{pt_num}: 출판물 형식 — '{part}' (\"항\" 누락?)")

        for sub in subtopics:
            for pt in sub["points"]:
                pn = pt.get("num", "?")
                if not pt["text"]:
                    warnings.append(f"{pn}: 요점 내용 없음")
                if not pt["num"]:
                    warnings.append(f"번호 없는 요점")
                _validate_scripture(pt.get("scriptures", ""), pn)
                _validate_publication(pt.get("publications", ""), pn)

        # 번호 순서 검증
        all_nums = [pt.get("num", "") for sub in subtopics for pt in sub.get("points", []) if pt.get("num")]
        seen_parents = {}  # "1.1" → 마지막으로 본 인덱스
        for idx, num in enumerate(all_nums):
            parts = num.split(".")
            if len(parts) >= 2:
                parent = ".".join(parts[:-1])
                # 상위 번호가 이미 지나간 뒤에 하위가 나오면 경고
                # 같은 depth의 다른 번호가 parent 이후에 나왔는지 확인
                for prev_idx in range(idx - 1, -1, -1):
                    prev = all_nums[prev_idx]
                    prev_parts = prev.split(".")
                    if len(prev_parts) == len(parts) and ".".join(prev_parts[:-1]) == parent:
                        break  # 같은 부모의 형제 → 정상
                    if len(prev_parts) <= len(parts) - 1:
                        # 상위 레벨을 찾음
                        if prev == parent:
                            break  # 바로 위 부모 → 정상
                        # 부모가 아닌 상위가 나옴 → 순서 오류
                        if prev.startswith(".".join(parts[:len(prev_parts)-1]) + ".") and prev != parent and len(prev_parts) == len(parent.split(".")):
                            warnings.append(f"{num}: {prev} 이후에 {parent}의 하위가 올 수 없음")
                        break
            # 같은 부모의 형제 간 번호 건너뜀 검증
            if len(parts) >= 1 and idx > 0:
                parent_key = ".".join(parts[:-1])
                # 이전 번호들 중 같은 부모의 마지막 형제 찾기
                for prev_idx in range(idx - 1, -1, -1):
                    prev = all_nums[prev_idx]
                    prev_parts = prev.split(".")
                    if len(prev_parts) == len(parts) and ".".join(prev_parts[:-1]) == parent_key:
                        try:
                            prev_last = int(prev_parts[-1])
                            cur_last = int(parts[-1])
                            if cur_last > prev_last + 1:
                                skipped = (parent_key + "." if parent_key else "") + f"{prev_last + 1}"
                                warnings.append(f"{num}: {skipped}을 건너뜀")
                        except ValueError:
                            pass
                        break
                    # 하위 레벨이면 건너뛰고 계속 탐색
                    if len(prev_parts) > len(parts):
                        continue
                    break

        # ── 골자 JSON 존재 확인 ──
        outline_status = None
        ot = meta["outline_type"]
        on = meta["outline_num"]
        if ot and on and not ot.startswith("JWBC"):
            prefix = _outline_prefix(ot, on)
            outline_files = []
            if os.path.exists(_OUTLINES_DIR):
                for gf in os.listdir(_OUTLINES_DIR):
                    if gf.startswith(prefix) and gf.endswith(".json"):
                        outline_files.append(gf)
            if outline_files:
                versions = []
                for gf in outline_files:
                    ver_match = _re.search(r"_v([\d\-]+)\.json$", gf)
                    versions.append(ver_match.group(1).replace("-", "/") if ver_match else "unknown")
                outline_status = {"exists": True, "files": outline_files, "versions": versions}
            else:
                outline_status = {"exists": False, "files": [], "versions": []}

        # 파일 형식 감지
        is_original = "원문" in filename
        has_any_speech = any(pt.get("speech_text") for sub in subtopics for pt in sub.get("points", []))
        if is_original:
            file_format = "original"
        elif is_pub_file and total_pubs > 0:
            file_format = "publication"
        elif has_any_speech:
            file_format = "speech"
        else:
            file_format = "outline"

        result_item = {
            "filename": filename,
            "meta": meta,
            "subtopics": subtopics,
            "publications": file_publications,
            "speaker_memo": speaker_memo,
            "file_format": file_format,
            "total_points": total_points,
            "total_publications": total_pubs,
            "total_subtopics": len(sub_matches),
            "warnings": warnings,
            "outline_status": outline_status,
        }
        if is_original:
            result_item["_raw_content"] = content
        results.append(result_item)

    return {"files": results, "total": len(results)}


# ─── 전처리 저장 API (3개 저장소 완전 분리) ────────────────

@router.post("/api/preprocess/save-outline")
def save_outline(req: dict):
    """골자 요점 저장 — speech_points만 (speech_expressions/publications 절대 안 건드림)"""
    os.makedirs(_OUTLINES_DIR, exist_ok=True)
    client = get_db()
    col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})
    overwrite = req.get("overwrite", False)
    files = req.get("files", [])
    results = []

    for item in files:
        meta = item.get("meta", {})
        subtopics = item.get("subtopics", [])
        ot = normalize_outline_type(meta.get("outline_type", ""))
        on = meta.get("outline_num", "")
        oy = meta.get("outline_year", "") or ""
        ot_name = meta.get("outline_type_name", "") or _TYPE_NAMES.get(ot, ot)
        title = meta.get("title", "")
        version = meta.get("version", "")
        vs = _ver_safe(version)

        if not on:
            results.append({"outline_num": on, "status": "error", "message": "번호 없음", "saved": 0})
            continue

        prefix = _outline_prefix(ot, on, oy)
        fname = f"{prefix}_v{vs}.json" if vs else f"{prefix}.json"
        fpath = os.path.join(_OUTLINES_DIR, fname)

        if os.path.exists(fpath) and not overwrite:
            results.append({"outline_num": on, "status": "exists", "message": f"골자 {on}번 (v{version})이 이미 존재합니다", "saved": 0})
            continue

        # 덮어쓰기 시 기존 삭제 — type + num + version 일치, outline_year는 후처리 필터
        # (outline_year는 신규 필드라 기존 레코드엔 부재. where 절에 넣으면 기존 데이터 매칭 실패)
        if overwrite:
            try:
                wc = {"$and": [
                    {"outline_type": ot},
                    {"outline_num": on},
                    {"source": "outline"},
                    {"version": version or ""},
                ]}
                ex = col.get(where=wc, include=["metadatas"])
                target_ids = []
                for i, mid in enumerate(ex.get("ids", []) or []):
                    m = ex["metadatas"][i] if ex.get("metadatas") else {}
                    if (m.get("outline_year", "") or "") == oy:
                        target_ids.append(mid)
                if target_ids:
                    col.delete(ids=target_ids)
            except Exception:
                pass

        saved = 0
        errors = 0
        saved_subtopics = []

        for sub in subtopics:
            sub_title = sub.get("title", "")
            sub_num = sub.get("num", 0)
            sub_time = sub.get("time", "")
            saved_pts = []

            for pt in sub.get("points", []):
                pt_num = pt.get("num", "")
                pt_text = pt.get("text", "")
                pt_level = pt.get("level", "L1")
                scriptures = pt.get("scriptures", "")
                scripture_usage = pt.get("scripture_usage", "")
                pubs = pt.get("publications", "")
                usage = pt.get("usage", "사용")

                if not pt_text:
                    continue
                if "미사용" in usage and "합쳐서" not in usage:
                    continue

                doc_id = f"{prefix}_v{vs}_{pt_num}" if vs else f"{prefix}_{pt_num}"

                doc_parts = [f"[골자] {on} - {title}"]
                if sub_title:
                    doc_parts.append(f"[소주제] {sub_num}. {sub_title}")
                doc_parts.append(f"[요점] {pt_num} - {pt_text}")
                if scriptures:
                    doc_parts.append(f"[성구] {scriptures}")
                if pubs:
                    doc_parts.append(f"[출판물] {pubs}")
                doc_parts.append("")
                doc_parts.append(pt_text)
                doc_text = "\n".join(doc_parts)

                doc_meta = {
                    "outline_type": ot, "outline_type_name": ot_name, "outline_num": on, "outline_year": oy, "outline_title": title,
                    "version": version, "time": meta.get("time", ""), "note": meta.get("note", ""),
                    "sub_topic": f"{sub_num}. {sub_title}" if sub_title else "", "sub_topic_num": sub_num, "sub_topic_time": sub_time,
                    "point_num": pt_num, "level": pt_level, "point_content": pt_text,
                    "scriptures": scriptures, "scripture_usage": scripture_usage, "publications": pubs,
                    "source": "outline", "memo": "", "importance": 0,
                }

                try:
                    emb = get_embedding(doc_text)
                    col.upsert(ids=[doc_id], documents=[doc_text], metadatas=[doc_meta], embeddings=[emb])
                    saved += 1
                    saved_pts.append({**pt, "doc_id": doc_id})
                except Exception as e:
                    import traceback
                    print(f"[save-outline ERROR] doc_id={doc_id}, error={e}")
                    traceback.print_exc()
                    errors += 1
                    saved_pts.append({**pt, "doc_id": None})

            saved_subtopics.append({"num": sub_num, "title": sub_title, "time": sub_time, "point_count": len(saved_pts), "points": saved_pts})

        # JSON 저장
        outline_data = {
            "outline_type": ot, "outline_type_name": ot_name, "outline_num": on, "outline_year": oy or None,
            "title": title, "version": version, "time": meta.get("time", ""), "note": meta.get("note", ""),
            "subtopics": saved_subtopics,
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(outline_data, f, ensure_ascii=False, indent=2)

        results.append({"outline_num": on, "status": "ok", "message": f"골자 {on}번 저장 ({saved}개)", "saved": saved, "errors": errors})

    _bm25_cache.clear()
    total = sum(r.get("saved", 0) for r in results)
    return {"results": results, "total_files": len(results), "total_saved": total, "message": f"골자 {total}개 저장"}




@router.post("/api/preprocess/save-speech")
def save_speech(req: dict):
    """연설/메모/봉사/방문 저장 — speech_expressions만 (speech_points/publications 절대 안 건드림)"""
    client = get_db()
    col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})
    files = req.get("files", [])
    overwrite = req.get("overwrite", False)
    results = []

    for item in files:
        meta = item.get("meta", {})
        subtopics = item.get("subtopics", [])
        speaker_memo_text = item.get("speaker_memo", "")
        ot = normalize_outline_type(meta.get("outline_type", ""))
        ot_name = meta.get("outline_type_name", "") or _TYPE_NAMES.get(ot, ot)
        on = meta.get("outline_num", "")
        oy = meta.get("outline_year", "") or ""
        title = meta.get("title", "")
        version = meta.get("version", "")
        vs = _ver_safe(version)
        speaker = meta.get("speaker", "")
        date = meta.get("date", "")
        source = meta.get("source", "speech")
        theme_scripture = meta.get("theme_scripture", "")
        prefix = _outline_prefix(ot, on, oy) if on else ""

        saved = 0
        updated = 0
        errors = 0

        # 기존 ID 수집 (신규/업데이트 구분)
        existing_ids = set()
        if speaker and on:
            try:
                ex = col.get(where={"$and": [{"outline_num": on}, {"speaker": speaker}, {"date": date}]})
                existing_ids = set(ex.get("ids", []))
            except Exception:
                pass

        # 덮어쓰기 시 기존 삭제
        if overwrite and existing_ids:
            try:
                col.delete(ids=list(existing_ids))
            except Exception:
                pass
            existing_ids = set()

        # 공통 메타 빌더
        def _base_meta():
            return {
                "outline_type": ot, "outline_type_name": ot_name, "outline_num": on, "outline_title": title,
                "version": version, "rating": 0, "rating_note": "", "favorite": "false", "used_count": 0, "last_used": "",
            }

        for sub in subtopics:
            sub_title = sub.get("title", "")
            sub_num = sub.get("num", 0)
            for pt in sub.get("points", []):
                pt_num = pt.get("num", "")
                pt_text = pt.get("text", "")
                pt_level = pt.get("level", "L1")
                scriptures = pt.get("scriptures", "")
                scripture_usage = pt.get("scripture_usage", "")
                pubs = pt.get("publications", "")
                speech_text = pt.get("speech_text", "")
                keywords = pt.get("keywords", "")
                tags = pt.get("tags", "")
                usage = pt.get("usage", "사용")

                if not speech_text and not pt_text:
                    continue
                if "미사용" in usage and "합쳐서" not in usage:
                    continue

                # 연설 본문 → speech_expressions
                if speech_text:
                    doc_id = f"{prefix}_v{vs}_{speaker}_{date}_{pt_num}" if vs else f"{prefix}_{speaker}_{date}_{pt_num}"
                    doc_parts = [f"[연설] {speaker} ({date})", f"[골자] {on} - {title}"]
                    if sub_title:
                        doc_parts.append(f"[소주제] {sub_num}. {sub_title}")
                    doc_parts.append(f"[요점] {pt_num} - {pt_text}")
                    if scriptures:
                        doc_parts.append(f"[성구] {scriptures}")
                    if keywords:
                        doc_parts.append(f"[키워드] {keywords}")
                    doc_parts.append("")
                    doc_parts.append(speech_text)
                    doc_text = "\n".join(doc_parts)

                    doc_meta = {**_base_meta(),
                        "sub_topic": f"{sub_num}. {sub_title}" if sub_title else "", "point_num": pt_num,
                        "level": pt_level, "point_content": pt_text,
                        "scriptures": scriptures, "scripture_usage": scripture_usage, "publications": pubs,
                        "source": "speech", "speaker": speaker, "date": date, "usage": usage,
                        "keywords": keywords, "tags": tags, "theme_scripture": theme_scripture,
                    }
                    try:
                        emb = get_embedding(doc_text)
                        col.upsert(ids=[doc_id], documents=[doc_text], metadatas=[doc_meta], embeddings=[emb])
                        if doc_id in existing_ids:
                            updated += 1
                        else:
                            saved += 1
                    except Exception:
                        errors += 1

                # tags 정보는 연설 본문 메타에 포함됨 (별도 문서 불필요)

                # speech_text 없고 tags만 있는 요점 → tags 기반 문서 저장
                if tags and not speech_text:
                    etype = "example" if "예시" in tags else "expression"
                    ex_id = f"{etype}_{prefix}_{speaker}_{date}_{pt_num}"
                    ex_parts = [f"[{etype}] {tags}", f"[골자] {on} - {title}"]
                    if sub_title:
                        ex_parts.append(f"[소주제] {sub_num}. {sub_title}")
                    if pt_text:
                        ex_parts.append(f"[요점] {pt_text}")
                    if keywords:
                        ex_parts.append(f"[키워드] {keywords}")
                    ex_doc = "\n".join(ex_parts)

                    ex_meta = {**_base_meta(),
                        "sub_topic": f"{sub_num}. {sub_title}" if sub_title else "", "point_num": pt_num,
                        "level": pt_level, "point_content": pt_text,
                        "scriptures": scriptures, "scripture_usage": scripture_usage, "publications": pubs,
                        "source": "speech", "speaker": speaker, "date": date,
                        "keywords": keywords, "tags": tags, "theme_scripture": theme_scripture,
                    }
                    try:
                        emb = get_embedding(ex_doc)
                        col.upsert(ids=[ex_id], documents=[ex_doc], metadatas=[ex_meta], embeddings=[emb])
                        if ex_id in existing_ids:
                            updated += 1
                        else:
                            saved += 1
                    except Exception:
                        errors += 1

        # 연사 메모 저장 (카테고리 자동 분리)
        if speaker_memo_text and speaker:
            memo_base = f"{prefix}_v{vs}_{speaker}_{date}" if vs else f"{prefix}_{speaker}_{date}"
            memo_meta_base = {**_base_meta(), "source": "speaker_memo", "speaker": speaker, "date": date}

            # 카테고리 패턴 감지
            _field_map = [
                ("도입 방식", "도입"), ("연설 구조", "구조"), ("성구 사용", "성구"), ("성구 활용", "성구"),
                ("예시 활용", "예시"), ("언어 습관", "언어습관"), ("특징적 표현", "언어습관"),
                ("마무리 방식", "마무리"), ("마무리", "마무리"), ("도입", "도입"), ("구조", "구조"),
                ("성구", "성구"), ("예시", "예시"), ("언어습관", "언어습관"),
            ]
            sections = {}
            current_cat = None
            for line in speaker_memo_text.split("\n"):
                stripped = line.strip()
                found_cat = None
                found_content = ""
                for field, cat in _field_map:
                    if stripped.startswith(f"- **{field}**:") or stripped.startswith(f"**{field}**:"):
                        found_cat = cat
                        found_content = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                        break
                if found_cat:
                    current_cat = found_cat
                    if current_cat not in sections:
                        sections[current_cat] = []
                    if found_content:
                        sections[current_cat].append(found_content)
                elif current_cat and stripped and not stripped.startswith("[") and not stripped.startswith("#"):
                    sections[current_cat].append(stripped)

            if sections:
                # 원본 저장 (전체 보기용, reprocessed 플래그)
                memo_id = f"{memo_base}_memo"
                memo_doc = f"[골자] {on} - {title}\n[연사 메모] {speaker}\n\n{speaker_memo_text}"
                try:
                    emb = get_embedding(memo_doc)
                    col.upsert(ids=[memo_id], documents=[memo_doc], metadatas=[{**memo_meta_base, "reprocessed": "true"}], embeddings=[emb])
                except Exception:
                    pass
                # 카테고리별 분리 저장
                for cat, cat_lines in sections.items():
                    cat_content = "\n".join(cat_lines).strip()
                    if not cat_content:
                        continue
                    cat_id = f"{memo_base}_memo_{cat}"
                    cat_doc = f"[연사 메모] {speaker}\n[카테고리] {cat}\n\n{cat_content}"
                    try:
                        emb = get_embedding(cat_doc)
                        col.upsert(ids=[cat_id], documents=[cat_doc], metadatas=[{**memo_meta_base, "memo_category": cat}], embeddings=[emb])
                        saved += 1
                    except Exception:
                        errors += 1
            else:
                # 패턴 없으면 통째로 저장
                memo_id = f"{memo_base}_memo"
                memo_doc = f"[골자] {on} - {title}\n[연사 메모] {speaker}\n\n{speaker_memo_text}"
                try:
                    emb = get_embedding(memo_doc)
                    col.upsert(ids=[memo_id], documents=[memo_doc], metadatas=[memo_meta_base], embeddings=[emb])
                    saved += 1
                except Exception:
                    errors += 1

        results.append({"outline_num": on, "speaker": speaker, "date": date, "saved": saved, "updated": updated, "errors": errors})

    _bm25_cache.clear()
    total_new = sum(r["saved"] for r in results)
    total_upd = sum(r["updated"] for r in results)
    parts = []
    if total_new: parts.append(f"연설 {total_new}개 신규")
    if total_upd: parts.append(f"{total_upd}개 업데이트")
    if not parts: parts.append("변경 없음")
    return {"results": results, "total_new": total_new, "total_updated": total_upd, "message": " · ".join(parts)}


@router.post("/api/preprocess/save-publication")
def save_publication(body: dict):
    """Phase 3: referenced_by 배열 기반 업서트 저장.

    동일 ID (pub_code + reference)면 referenced_by 배열만 갱신/추가.
    content 충돌 시 기존 값 유지.
    """
    from services.publication_utils import _upsert_publication
    client = get_db()
    col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})

    files = body.get("files", [])
    results = {"created": 0, "updated": 0, "appended": 0, "errors": []}

    for f in files:
        meta = f.get("meta", {})
        ot = normalize_outline_type(meta.get("outline_type", ""))
        on = meta.get("outline_num", "")
        oy = meta.get("outline_year", "") or ""
        ver = meta.get("version", "")
        outline_title = meta.get("title", "")

        for pub in f.get("publications", []):
            try:
                outline_point = pub.get("outline_point", "") or ""
                # "001-1.1.2" 형태면 뒤쪽, 아니면 원본
                pn = outline_point.split("-", 1)[-1] if "-" in outline_point else outline_point

                pub_data = {
                    "pub_code": pub.get("pub_code", ""),
                    "pub_title": pub.get("pub_title", ""),
                    "pub_type": pub.get("pub_type", ""),
                    "reference": pub.get("reference", ""),
                    "content": pub.get("body", ""),
                    "keywords": pub.get("keywords", []),
                    "reference_info": {
                        "outline_type": ot,
                        "outline_num": on,
                        "outline_year": oy,
                        "version": ver,
                        "point_num": pn,
                        "outline_title": outline_title,
                        "subtopic_title": pub.get("subtopic_title", ""),
                        "point_text": pub.get("point_content", ""),
                    },
                }

                if not pub_data["pub_code"] or not pub_data["reference"]:
                    results["errors"].append({"pub": pub.get("pub_id", ""), "reason": "pub_code 또는 reference 누락"})
                    continue
                if not pub_data["content"]:
                    results["errors"].append({"pub": pub.get("pub_id", ""), "reason": "body 누락"})
                    continue

                res = _upsert_publication(col, pub_data)
                results[res["action"]] += 1
            except Exception as e:
                results["errors"].append({"pub": pub.get("pub_id", ""), "reason": str(e)})

    _bm25_cache.clear()
    # bulk_save 호환: total_saved = created + updated + appended 집계
    results["total_saved"] = results["created"] + results["updated"] + results["appended"]
    return results


@router.post("/api/preprocess/bulk-save")
def bulk_save(req: dict):
    """일괄 저장 — 파일 형식별 자동 분류 후 각 저장소에 분리 저장"""
    files = req.get("files", [])
    outline_files = []
    speech_files = []
    pub_files = []

    for f in files:
        fmt = f.get("file_format", "")
        want_outline = f.get("_saveOutline", True)
        want_speech = f.get("_saveSpeech", True)
        want_pub = f.get("_savePub", True)
        if fmt == "outline" and want_outline:
            outline_files.append(f)
        if fmt in ("speech", "outline") and want_speech:
            has_speech = any(pt.get("speech_text") for sub in f.get("subtopics", []) for pt in sub.get("points", []))
            if has_speech:
                speech_files.append(f)
        if fmt == "publication" and want_pub:
            pub_files.append(f)
        # 연설 파일에도 출판물이 있을 수 있음
        if want_pub and f.get("publications"):
            if f not in pub_files:
                pub_files.append(f)

    outline_res = save_outline({"files": outline_files, "overwrite": req.get("overwrite_outline", False)}) if outline_files else {"total_saved": 0, "results": []}
    speech_res = save_speech({"files": speech_files, "overwrite": req.get("overwrite_speech", False)}) if speech_files else {"total_new": 0, "total_updated": 0, "results": []}
    pub_res = save_publication({"files": pub_files}) if pub_files else {"total_saved": 0, "results": []}

    parts = []
    if outline_res.get("total_saved"): parts.append(f"골자 {outline_res['total_saved']}개")
    if speech_res.get("total_new"): parts.append(f"연설 {speech_res['total_new']}개 신규")
    if speech_res.get("total_updated"): parts.append(f"연설 {speech_res['total_updated']}개 업데이트")
    if pub_res.get("total_saved"): parts.append(f"출판물 {pub_res['total_saved']}개")
    if not parts: parts.append("변경 없음")

    return {
        "outline": outline_res, "speech": speech_res, "publication": pub_res,
        "message": f"{len(files)}개 파일 — " + " · ".join(parts),
    }


@router.post("/api/preprocess/check-duplicates")
def preprocess_check_duplicates(req: dict):
    """저장 전 중복 체크"""
    client = get_db()
    sp_col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})
    ex_col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})
    pub_col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})
    duplicates = []

    for item in req.get("files", []):
        meta = item.get("meta", {})
        on = meta.get("outline_num", "")
        version = meta.get("version", "")
        speaker = meta.get("speaker", "")
        date = meta.get("date", "")
        fmt = item.get("file_format", "")

        # 연설 중복
        if speaker and date:
            try:
                ex = ex_col.get(where={"$and": [{"outline_num": on}, {"speaker": speaker}, {"date": date}]})
                if ex and ex["ids"]:
                    duplicates.append({"type": "speech", "outline_num": on, "speaker": speaker, "date": date, "count": len(ex["ids"]), "message": f"이미 등록된 연설입니다 ({speaker}/{date}). 덮어쓰시겠습니까?"})
            except Exception:
                pass

        # 골자 중복 — type + num + version 일치, outline_year는 후처리 필터
        # (outline_year는 신규 필드. 기존 레코드엔 부재 → where에서 제외하고 메타 필터)
        if fmt == "outline":
            ot = meta.get("outline_type", "")
            oy = meta.get("outline_year", "") or ""
            try:
                wc = {"$and": [
                    {"outline_type": ot},
                    {"outline_num": on},
                    {"source": "outline"},
                    {"version": version or ""},
                ]}
                ex = sp_col.get(where=wc, include=["metadatas"])
                year_matched = 0
                if ex and ex.get("ids"):
                    for i, mid in enumerate(ex["ids"]):
                        m = ex["metadatas"][i] if ex.get("metadatas") else {}
                        if (m.get("outline_year", "") or "") == oy:
                            year_matched += 1
                if year_matched > 0:
                    ver_disp = f"v{version}" if version else "버전 미지정"
                    year_disp = f" {oy}년" if oy else ""
                    duplicates.append({"type": "outline", "outline_num": on, "outline_year": oy, "version": version, "count": year_matched, "message": f"골자{year_disp} {on}번 ({ver_disp})이 이미 등록되어 있습니다. 덮어쓰시겠습니까?"})
            except Exception:
                pass

        # 출판물 중복
        if fmt == "publication":
            pubs = item.get("publications", [])
            existing_count = 0
            for pub in pubs:
                pub_code = pub.get("pub_code", "")
                pub_ref = pub.get("reference", "")
                ref_safe = pub_ref.replace(" ", "").replace("/", "-")[:30] if pub_ref else ""
                if pub_code and ref_safe:
                    try:
                        ex = pub_col.get(ids=[f"pub_{pub_code}_{ref_safe}"])
                        if ex and ex["ids"]:
                            existing_count += 1
                    except Exception:
                        pass
            if existing_count > 0:
                duplicates.append({"type": "publication", "outline_num": on, "count": existing_count, "message": f"출판물 {existing_count}개가 이미 등록되어 있습니다. 참조만 추가됩니다."})

    return {"duplicates": duplicates, "has_duplicates": len(duplicates) > 0}


_SPEECHES_DIR = os.path.join(os.path.expanduser("~/jw-system"), "speeches")

@router.post("/api/preprocess/save-original")
def save_original(req: dict):
    """원문 파일 저장 — ~/jw-system/speeches/에 파일만 저장 (DB/임베딩 없음)"""
    os.makedirs(_SPEECHES_DIR, exist_ok=True)
    files = req.get("files", [])
    saved = 0
    existing = 0
    for item in files:
        meta = item.get("meta", {})
        filename = item.get("filename", "")
        content = item.get("_raw_content", "")
        if not content and not filename:
            continue
        # 파일명 결정
        if not filename:
            ot = meta.get("outline_type", "")
            on = meta.get("outline_num", "")
            speaker = meta.get("speaker", "")
            date = meta.get("date", "")
            filename = f"{ot}_{on}_{speaker}_{date}_원문.md"
        fpath = os.path.join(_SPEECHES_DIR, filename)
        if os.path.exists(fpath) and not req.get("overwrite", False):
            existing += 1
            continue
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(content)
        saved += 1
    parts = []
    if saved: parts.append(f"원문 {saved}개 저장")
    if existing: parts.append(f"{existing}개 이미 존재")
    return {"saved": saved, "existing": existing, "message": " · ".join(parts) or "변경 없음"}


# ─── 연사 스타일 메모 검색 ──────────────────────

@router.post("/api/search/speaker-memo")
def search_speaker_memo(req: dict):
    """speaker_memo 전용 검색 (카테고리 필터 지원)"""
    query = req.get("query", "")
    category = req.get("category", "")
    top_k = req.get("top_k", 20)
    if not query and not category:
        return {"results": [], "total": 0}
    client = get_db()
    # 카테고리만 지정된 경우 해당 카테고리 전체 조회
    if category and not query:
        col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})
        try:
            all_data = col.get(where={"$and": [{"source": "speaker_memo"}, {"memo_category": category}]}, include=["documents", "metadatas"])
            items = []
            for i, doc_id in enumerate(all_data.get("ids", [])):
                items.append({"id": doc_id, "collection": "speech_expressions", "text": all_data["documents"][i], "metadata": all_data["metadatas"][i], "score": 0})
            # rating 순 → 최신순
            items.sort(key=lambda x: (x["metadata"].get("rating", 0), x["metadata"].get("date", "")), reverse=True)
            return {"results": items[:top_k], "total": len(items)}
        except Exception:
            return {"results": [], "total": 0}
    try:
        query_emb = get_embedding(query)
    except Exception as e:
        return {"results": [], "total": 0, "error": str(e)}
    from db import hybrid_search
    items = hybrid_search(client, "speech_expressions", query, query_emb, top_k=top_k * 3)
    filtered = [it for it in items if it.get("metadata", {}).get("source", "") == "speaker_memo"]
    if category:
        filtered = [it for it in filtered if it.get("metadata", {}).get("memo_category", "") == category]
    return {"results": filtered[:top_k], "total": len(filtered)}


# ─── 연사 메모 재처리 (카테고리별 분리) ──────────────

_MEMO_CATEGORIES = ["도입", "구조", "성구", "예시", "언어습관", "마무리"]
# 정확한 필드명 → 카테고리 매핑 (긴 패턴 우선)
_MEMO_FIELD_MAP = [
    ("도입 방식", "도입"),
    ("연설 구조", "구조"),
    ("성구 사용", "성구"),
    ("성구 활용", "성구"),
    ("예시 활용", "예시"),
    ("언어 습관", "언어습관"),
    ("특징적 표현", "언어습관"),
    ("마무리 방식", "마무리"),
    ("마무리", "마무리"),
    ("도입", "도입"),
    ("구조", "구조"),
    ("성구", "성구"),
    ("예시", "예시"),
    ("비유", "예시"),
    ("언어습관", "언어습관"),
    ("말투", "언어습관"),
    ("결론", "마무리"),
    ("전개", "구조"),
]

@router.post("/api/preprocess/reprocess-memos")
def reprocess_memos():
    """기존 speaker_memo를 카테고리별로 분리 재저장 (기존 분리 결과 + 원본 삭제)"""
    client = get_db()
    col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})
    all_data = col.get(include=["documents", "metadatas"])
    if not all_data or not all_data["ids"]:
        return {"processed": 0, "created": 0, "deleted": 0}

    processed = 0
    created = 0
    deleted_ids = []

    # 1단계: 기존 분리된 카테고리 메모 삭제
    for i, doc_id in enumerate(all_data["ids"]):
        meta = all_data["metadatas"][i]
        if meta.get("source") == "speaker_memo" and meta.get("memo_category"):
            deleted_ids.append(doc_id)

    # 2단계: 원본 메모 분리
    for i, doc_id in enumerate(all_data["ids"]):
        meta = all_data["metadatas"][i]
        if meta.get("source") != "speaker_memo":
            continue
        if meta.get("memo_category"):
            continue
        if meta.get("reprocessed") == "true":
            continue
        text = all_data["documents"][i] or ""

        # 정확한 패턴 매칭으로 분리
        sections = {}
        current_cat = None
        for line in text.split("\n"):
            stripped = line.strip()
            found_cat = None
            found_content = ""
            for field, cat in _MEMO_FIELD_MAP:
                if stripped.startswith(f"- **{field}**:") or stripped.startswith(f"**{field}**:"):
                    found_cat = cat
                    found_content = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                    break
            if found_cat:
                current_cat = found_cat
                if current_cat not in sections:
                    sections[current_cat] = []
                if found_content:
                    sections[current_cat].append(found_content)
            elif current_cat and stripped and not stripped.startswith("[") and not stripped.startswith("#"):
                sections[current_cat].append(stripped)

        if not sections:
            continue

        processed += 1
        # 기존 메모의 base_id 추출 (예: S-34_001_v09-15_김현식_2309_memo → S-34_001_v09-15_김현식_2309)
        base_id = doc_id
        if base_id.endswith("_memo"):
            base_id = base_id[:-5]

        # 카테고리별 개별 문서 저장
        for cat, lines in sections.items():
            cat_content = "\n".join(lines).strip()
            if not cat_content:
                continue
            cat_id = f"{base_id}_memo_{cat}"
            cat_doc = f"[연사 메모] {meta.get('speaker', '')}\n[카테고리] {cat}\n\n{cat_content}"
            cat_meta = {k: v for k, v in meta.items()}
            cat_meta["memo_category"] = cat
            try:
                emb = get_embedding(cat_doc)
                col.upsert(ids=[cat_id], documents=[cat_doc], metadatas=[cat_meta], embeddings=[emb])
                created += 1
            except Exception:
                pass

        # 원본 메모는 삭제하지 않고 유지 (reprocessed 플래그만 추가)
        try:
            orig_meta = {k: v for k, v in meta.items()}
            orig_meta["reprocessed"] = "true"
            col.update(ids=[doc_id], metadatas=[orig_meta])
        except Exception:
            pass

    _bm25_cache.clear()
    return {"processed": processed, "created": created, "deleted": len(deleted_ids), "message": f"{processed}개 메모 → {created}개 카테고리 생성, {len(deleted_ids)}개 기존 카테고리 삭제"}


@router.delete("/api/preprocess/outline/{outline_id:path}")
def delete_outline(outline_id: str, year: str = ""):
    """골자 단위 삭제 — speech_points에서 해당 골자 전부 + JSON 삭제.
    year 쿼리 주면 outline_year가 일치하는 레코드만 삭제 (빈 값끼리도 매치).
    """
    client = get_db()
    col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})

    year_filter_on = year is not None and year != ""

    # document ID도 year 포함하므로 outline_id 그대로 startswith 매치
    # 예: "S-123_001_y26_v10-21" → 그대로 사용
    db_prefix = outline_id

    # outline_id = S-34_001_v09-15 형태. ID prefix 매치 + outline_year 후필터
    all_docs = col.get(include=["metadatas"])
    ids_to_delete = []
    if all_docs and all_docs["ids"]:
        for i, did in enumerate(all_docs["ids"]):
            if not did.startswith(db_prefix):
                continue
            if year_filter_on:
                m = all_docs["metadatas"][i] if all_docs.get("metadatas") else {}
                if (m.get("outline_year", "") or "") != year:
                    continue
            ids_to_delete.append(did)

    deleted = 0
    if ids_to_delete:
        col.delete(ids=ids_to_delete)
        deleted = len(ids_to_delete)

    # JSON 파일 삭제 (경로 검증 — _OUTLINES_DIR 하위만)
    import glob
    json_deleted = 0
    outlines_abs = os.path.abspath(_OUTLINES_DIR)
    for jp in glob.glob(os.path.join(_OUTLINES_DIR, f"{outline_id}*.json")):
        # 경로 검증: _OUTLINES_DIR 하위만 삭제 허용
        if not os.path.abspath(jp).startswith(outlines_abs + os.sep):
            continue
        # year 필터: 파일 내용의 outline_year 확인
        if year_filter_on:
            try:
                with open(jp, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if (data.get("outline_year") or "") != year:
                    continue
            except Exception:
                continue
        os.remove(jp)
        json_deleted += 1

    _bm25_cache.clear()
    return {"deleted": deleted, "json_deleted": json_deleted}


# ─── 3단계: 개별 삭제 ──────────────────────────────────

@router.delete("/api/preprocess/speech/{doc_id:path}")
def delete_speech(doc_id: str):
    """연설 개별/연사별 삭제 — speech_expressions만"""
    client = get_db()
    col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})

    # doc_id가 정확한 ID이면 1건 삭제, prefix이면 해당 연사 전체 삭제
    all_docs = col.get(include=[])
    ids_to_delete = []
    if all_docs and all_docs["ids"]:
        for did in all_docs["ids"]:
            if did == doc_id or did.startswith(doc_id + "_"):
                ids_to_delete.append(did)

    deleted = 0
    if ids_to_delete:
        col.delete(ids=ids_to_delete)
        deleted = len(ids_to_delete)

    _bm25_cache.clear()
    return {"deleted": deleted}


@router.delete("/api/preprocess/publication/{doc_id:path}")
def delete_publication(doc_id: str, ref_key: str = ""):
    """출판물 삭제 — ref_key 있으면 참조 1건만, 없으면 레코드 전체.

    ref_key 형식: '{outline_id}:{point_num}' (예: 'S-34_035_v1-20:1.1.1')
    """
    client = get_db()
    col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})

    if ref_key:
        from services.publication_utils import _delete_reference
        result = _delete_reference(col, doc_id, ref_key)
        _bm25_cache.clear()
        return result

    # 레코드 전체 삭제
    try:
        target = col.get(ids=[doc_id], include=[])
        if not target or not target["ids"]:
            return {"action": "record_not_found", "deleted": 0}
        col.delete(ids=[doc_id])
        _bm25_cache.clear()
        return {"action": "record_deleted", "deleted": 1}
    except Exception as e:
        return {"action": "error", "deleted": 0, "message": str(e)}
