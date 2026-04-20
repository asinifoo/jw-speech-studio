"""기존 출판물 md에 [소주제] 필드 자동 주입 (1회성).

입력: outline_*_출판물_preprocessed.md (원본 건드리지 않음)
출력: 별도 디렉토리에 소주제 주입된 복사본

골자 md에서 {point_num: subtopic_title} 매핑을 만들고, 출판물 md 각 청크의
[골자요점]에서 point_num을 파싱해 [요점내용] 줄 바로 위에 [소주제] 삽입.

사용법:
  python backend/scripts/inject_subtopic.py \
      --input-dir  /path/to/pub_mds \
      --output-dir /path/to/converted \
      --outline-dir /path/to/outline_mds

작성자 주의: 실제 실행 전 dry-run 검토 권장. 샘플 파일 1~2개로 먼저 확인.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path


_PUB_FILE_RE = re.compile(r"_출판물_preprocessed\.md$")
_OUTLINE_FILE_RE = re.compile(r"^outline_.+_(\d{3})_preprocessed\.md$")
_PUB_FN_GNUM_RE = re.compile(r"_(\d{3})_출판물_preprocessed\.md$")
_GOLZA_NUM_META_RE = re.compile(r"^\s*-\s*\*?\*?\[?골자번호\]?\*?\*?\s*[:：]\s*(\S+)", re.MULTILINE)
_SUBTOPIC_HEADER_RE = re.compile(r"^##\s+소주제\s+\d+\s*[:：]\s*(.+?)(?:\s*\(\d+분\))?\s*$", re.MULTILINE)
_POINT_NUM_LINE_RE = re.compile(r"^###\s+.*?\[L\d+\]\s+([\d.]+)", re.MULTILINE)
_PUB_CHUNK_HDR_RE = re.compile(r"^### \[pub_[^\]]+\].*$", re.MULTILINE)
_OUTLINE_POINT_FIELD_RE = re.compile(r"-\s*\*\*\[?골자요점\]?\*\*\s*[:：]\s*([^\n\r]+)")
_POINT_CONTENT_FIELD_RE = re.compile(r"^(\s*-\s*\*\*\[?요점내용\]?\*\*\s*[:：])", re.MULTILINE)
_SUBTOPIC_ALREADY_RE = re.compile(r"-\s*\*\*\[?소주제\]?\*\*\s*[:：]")


def build_outline_subtopic_map(outline_md_text: str) -> dict:
    """골자 md → {point_num: subtopic_title} 매핑.

    '## 소주제 N: 제목' 블록을 경계로, 블록 내 '### ... [L?] X.Y.Z' 줄의 point_num을
    해당 소주제에 귀속. 점 계층 전부 포함 (1, 1.1, 1.1.1 …).
    """
    result = {}
    # 소주제 헤더 매치 위치 수집
    headers = list(_SUBTOPIC_HEADER_RE.finditer(outline_md_text))
    if not headers:
        return result
    boundaries = [(m.start(), m.end(), m.group(1).strip()) for m in headers]
    boundaries.append((len(outline_md_text), len(outline_md_text), ""))  # sentinel

    for i in range(len(boundaries) - 1):
        start = boundaries[i][1]
        end = boundaries[i + 1][0]
        title = boundaries[i][2]
        block = outline_md_text[start:end]
        for pm in _POINT_NUM_LINE_RE.finditer(block):
            pn = pm.group(1)
            # 이미 다른 소주제에 바인딩된 point_num은 skip (보수적)
            if pn not in result:
                result[pn] = title
    return result


def find_outline_file(outline_dir: Path, golza_num: str) -> Path | None:
    """같은 번호의 골자 md 파일 탐색 (outline_S-*_{num}_preprocessed.md 또는 유사)."""
    candidates = []
    for f in outline_dir.iterdir():
        if not f.is_file() or not f.name.endswith(".md"):
            continue
        m = _OUTLINE_FILE_RE.match(f.name)
        if m and m.group(1) == golza_num.zfill(3):
            candidates.append(f)
    if candidates:
        # 가장 최근 파일 우선 (여러 버전 존재 가능)
        candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        return candidates[0]
    return None


def extract_golza_num_from_pub(pub_md_text: str, filename: str) -> str | None:
    """출판물 md에서 골자번호 추출. 메타 섹션 → 실패 시 파일명에서 추정."""
    m = _GOLZA_NUM_META_RE.search(pub_md_text)
    if m:
        v = m.group(1).strip().zfill(3)
        if v.isdigit():
            return v
    fn_m = _PUB_FN_GNUM_RE.search(filename)
    if fn_m:
        return fn_m.group(1)
    return None


def parse_outline_point_num(outline_point_value: str) -> str | None:
    """골자요점 필드 값 '035-1.1.1' 또는 '1.1.1' 에서 point_num 추출."""
    v = outline_point_value.strip()
    if "-" in v:
        return v.split("-", 1)[1].strip()
    return v or None


def inject_subtopic_into_pub(pub_md_text: str, point_to_sub: dict, filename: str, stats: dict) -> str:
    """출판물 md 텍스트 전체에 [소주제] 라인 주입. stats를 in-place 갱신."""
    # 청크 경계
    chunks = []
    hdr_positions = [m.start() for m in _PUB_CHUNK_HDR_RE.finditer(pub_md_text)]
    if not hdr_positions:
        return pub_md_text
    head = pub_md_text[:hdr_positions[0]]
    for i, start in enumerate(hdr_positions):
        end = hdr_positions[i + 1] if i + 1 < len(hdr_positions) else len(pub_md_text)
        chunks.append(pub_md_text[start:end])

    out_parts = [head]
    for chunk in chunks:
        if _SUBTOPIC_ALREADY_RE.search(chunk):
            out_parts.append(chunk)
            stats["skipped_already"] += 1
            continue

        op_match = _OUTLINE_POINT_FIELD_RE.search(chunk)
        pn = parse_outline_point_num(op_match.group(1)) if op_match else None
        sub_title = point_to_sub.get(pn) if pn else None

        if sub_title is None:
            sub_line_value = "(소주제 미확인)"
            stats["missing"] += 1
            stats["missing_samples"].append((filename, pn or "?"))
        else:
            sub_line_value = sub_title
            stats["injected"] += 1

        # [요점내용] 줄 바로 위에 삽입. 없으면 chunk 끝에 추가.
        pc_match = _POINT_CONTENT_FIELD_RE.search(chunk)
        new_line = f"- **소주제**: {sub_line_value}\n"
        if pc_match:
            insert_at = pc_match.start()
            chunk = chunk[:insert_at] + new_line + chunk[insert_at:]
        else:
            # 마지막 메타 필드 뒤에라도 추가 (안전망)
            chunk = chunk.rstrip() + "\n" + new_line
            stats["appended_end"] += 1
        out_parts.append(chunk)

    return "".join(out_parts)


def process_file(pub_path: Path, outline_dir: Path, out_dir: Path, stats: dict) -> bool:
    text = pub_path.read_text(encoding="utf-8")
    golza_num = extract_golza_num_from_pub(text, pub_path.name)
    if not golza_num:
        stats["errors"].append((pub_path.name, "골자번호 추출 실패"))
        return False
    outline_path = find_outline_file(outline_dir, golza_num)
    if outline_path is None:
        stats["errors"].append((pub_path.name, f"골자 md 파일 없음 (num={golza_num})"))
        return False
    outline_text = outline_path.read_text(encoding="utf-8")
    point_to_sub = build_outline_subtopic_map(outline_text)
    if not point_to_sub:
        stats["errors"].append((pub_path.name, f"소주제 매핑 0건 ({outline_path.name})"))
        return False

    file_stats = {"injected": 0, "missing": 0, "skipped_already": 0, "appended_end": 0, "missing_samples": []}
    converted = inject_subtopic_into_pub(text, point_to_sub, pub_path.name, file_stats)

    out_path = out_dir / pub_path.name
    out_path.write_text(converted, encoding="utf-8")

    stats["processed"] += 1
    stats["injected_total"] += file_stats["injected"]
    stats["missing_total"] += file_stats["missing"]
    stats["skipped_total"] += file_stats["skipped_already"]
    stats["per_file"].append((pub_path.name, file_stats))
    stats["missing_samples"].extend(file_stats["missing_samples"])
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="출판물 md에 [소주제] 필드 주입 (1회성 변환)")
    parser.add_argument("--input-dir", required=True, help="출판물 md 원본 디렉토리")
    parser.add_argument("--output-dir", required=True, help="변환된 md 저장 디렉토리 (없으면 생성)")
    parser.add_argument("--outline-dir", required=True, help="골자 md 디렉토리 (매핑 조회용)")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    outline_dir = Path(args.outline_dir)
    out_dir = Path(args.output_dir)

    if not input_dir.is_dir():
        print(f"[ERROR] input-dir not found: {input_dir}", file=sys.stderr)
        return 2
    if not outline_dir.is_dir():
        print(f"[ERROR] outline-dir not found: {outline_dir}", file=sys.stderr)
        return 2
    out_dir.mkdir(parents=True, exist_ok=True)

    pub_files = sorted([p for p in input_dir.iterdir() if p.is_file() and _PUB_FILE_RE.search(p.name)])
    if not pub_files:
        print(f"[WARN] 대상 파일 없음: {input_dir}")
        return 0

    stats = {
        "processed": 0,
        "injected_total": 0,
        "missing_total": 0,
        "skipped_total": 0,
        "per_file": [],
        "errors": [],
        "missing_samples": [],
    }

    for p in pub_files:
        process_file(p, outline_dir, out_dir, stats)

    # 검증
    input_count = len(pub_files)
    output_count = sum(1 for p in out_dir.iterdir() if _PUB_FILE_RE.search(p.name))

    print("=" * 60)
    print(f"입력 파일: {input_count}")
    print(f"출력 파일: {output_count}")
    print(f"처리 성공: {stats['processed']}")
    print(f"주입 [소주제] 총합: {stats['injected_total']}")
    print(f"매핑 실패 (소주제 미확인): {stats['missing_total']}")
    print(f"이미 [소주제] 있어 skip: {stats['skipped_total']}")
    print("=" * 60)

    if stats["errors"]:
        print("\n[ERRORS]")
        for fname, reason in stats["errors"]:
            print(f"  {fname}: {reason}")

    if stats["missing_samples"]:
        print(f"\n[매핑 실패 샘플 ({min(len(stats['missing_samples']), 20)}건)]")
        for fname, pn in stats["missing_samples"][:20]:
            print(f"  {fname} point_num={pn}")

    if input_count != output_count:
        print(f"\n[WARN] 입력/출력 파일 수 불일치: {input_count} != {output_count}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
