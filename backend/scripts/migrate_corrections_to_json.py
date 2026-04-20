#!/usr/bin/env python3
"""stt_corrections.md → stt_corrections.json 마이그레이션 (Phase 4 Build-2.5A).

기존 505 규칙을 target 기준으로 그룹화.
1회성. 실행 후 삭제해도 무방.
"""
import json
import re
import shutil
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path


MD_PATH = Path.home() / "jw-system" / "stt_corrections.md"
JSON_PATH = Path.home() / "jw-system" / "stt_corrections.json"
BACKUP_PATH = MD_PATH.with_suffix(".md.backup_before_json")

SECTION_ID_MAP = {
    "여호와/하느님 관련": ("jehovah", "주 하느님 관련 명칭 교정"),
    "성경 책 이름": ("bible_books", "성서 각 권 이름 오인식 교정"),
    "성경 인물/지명": ("bible_names", "성서 등장 인물 및 지명"),
    "JW 전문 용어": ("jw_terms", "여호와의 증인 전문 용어"),
    "일반 단어": ("general", "일반 단어 오인식"),
}

SKIP_HEADERS = ("수정하지 말아야 할 단어", "반복 문장", "타임스탬프", "`\\n`", "\\n 리터럴")


def strip_annotation(text):
    """괄호 주석 추출 + 제거. (clean_text, note) 반환."""
    note_match = re.search(r"\(([^)]*)\)", text)
    note = note_match.group(1).strip() if note_match else ""
    clean = re.sub(r"\s*\([^)]*\)\s*", " ", text).strip()
    return clean, note


def parse_md_file():
    """md 파싱. 섹션별 (errors_list, target, note) 수집 + skip_words."""
    text = MD_PATH.read_text(encoding="utf-8")
    lines = text.split("\n")

    sections_data = OrderedDict()
    skip_words = []

    current_section = None
    skip_current = False
    in_protected_table = False

    for line_num, line in enumerate(lines, 1):
        stripped = line.strip()

        if stripped.startswith("## "):
            current_section = stripped.lstrip("#").strip()
            skip_current = any(kw in current_section for kw in SKIP_HEADERS)
            in_protected_table = "수정하지 말아야 할 단어" in current_section
            if not skip_current and current_section in SECTION_ID_MAP:
                sections_data[current_section] = []
            continue

        if not stripped.startswith("|"):
            continue

        parts = [p.strip() for p in stripped.strip("|").split("|")]
        if len(parts) < 2 or parts[0] in ("오류", "단어", "") or parts[0].startswith("-"):
            continue

        # "수정하지 말아야 할 단어": 3컬럼
        if in_protected_table:
            word = parts[0].strip()
            reason = parts[1].strip() if len(parts) > 1 else ""
            word_clean, _ = strip_annotation(word)
            if word_clean:
                skip_words.append({"word": word_clean, "reason": reason})
            continue

        if skip_current or current_section not in SECTION_ID_MAP:
            continue

        # 2컬럼 초과 스킵
        if len(parts) > 2:
            continue

        left_raw = parts[0]
        right_raw = parts[1]

        left_clean, left_note = strip_annotation(left_raw)
        right_clean, _ = strip_annotation(right_raw)

        if not left_clean or not right_clean:
            continue

        # 슬래시
        if "/" in left_clean or "/" in right_clean:
            lefts = [l.strip() for l in left_clean.split("/") if l.strip()]
            rights = [r.strip() for r in right_clean.split("/") if r.strip()]
            if not lefts or not rights:
                continue
            if len(rights) == 1:
                for l in lefts:
                    sections_data[current_section].append(([l], rights[0], left_note))
            elif len(lefts) == len(rights):
                for l, r in zip(lefts, rights):
                    sections_data[current_section].append(([l], r, left_note))
            else:
                print(f"[경고] L{line_num} 슬래시 불균형: {left_raw} | {right_raw}", flush=True)
                continue
        elif "," in left_clean:
            # 숫자 쉼표 보호
            sentinel = "\x01"
            protected = re.sub(r"(\d),(\d)", lambda m: m.group(1) + sentinel + m.group(2), left_clean)
            if "," in protected:
                lefts = [x.replace(sentinel, ",").strip() for x in protected.split(",") if x.strip()]
                sections_data[current_section].append((lefts, right_clean, left_note))
            else:
                sections_data[current_section].append(([left_clean], right_clean, left_note))
        else:
            sections_data[current_section].append(([left_clean], right_clean, left_note))

    return sections_data, skip_words


def build_json(sections_data, skip_words):
    """target 기준 재그룹화."""
    sections = []

    for section_name, entries in sections_data.items():
        section_id, section_desc = SECTION_ID_MAP[section_name]

        groups_by_target = OrderedDict()
        for errors_list, target, note in entries:
            if target not in groups_by_target:
                groups_by_target[target] = []
            for err in errors_list:
                groups_by_target[target].append({"text": err, "note": note})

        groups = []
        for target, errors in groups_by_target.items():
            seen = set()
            deduped = []
            for e in errors:
                if e["text"] not in seen:
                    seen.add(e["text"])
                    deduped.append(e)
            groups.append({"target": target, "errors": deduped})

        sections.append({
            "id": section_id,
            "name": section_name,
            "description": section_desc,
            "enabled": True,
            "groups": groups,
        })

    return {
        "version": "6.0",
        "updated_at": datetime.now().isoformat(),
        "sections": sections,
        "special_rules": {
            "remove_timestamps": {
                "enabled": True,
                "description": "[00:00 → 00:28] 형식 타임스탬프 삭제",
            },
            "fix_newline_literal": {
                "enabled": True,
                "description": "\\n 리터럴 → 실제 줄바꿈",
            },
            "protect_number_comma": {
                "enabled": True,
                "description": "2,100만 같은 숫자 쉼표 보호",
            },
            "collapse_spaces": {
                "enabled": True,
                "description": "연속 공백 정리",
            },
        },
        "skip_words": skip_words,
    }


def main():
    if not MD_PATH.exists():
        print(f"✗ md 파일 없음: {MD_PATH}")
        return 1

    if JSON_PATH.exists():
        print(f"⚠️  JSON 파일 이미 존재: {JSON_PATH}")
        print("기존 파일을 덮어쓰려면 먼저 수동 삭제 필요")
        return 2

    print(f"📖 파싱: {MD_PATH}")
    sections_data, skip_words = parse_md_file()

    total_groups = 0
    total_errors = 0
    for name, entries in sections_data.items():
        targets = set(t for _, t, _ in entries)
        errs = sum(len(e) for e, _, _ in entries)
        total_groups += len(targets)
        total_errors += errs
        print(f"  - {name}: {len(entries)}행 → {len(targets)}그룹, {errs}오류")

    print(f"\n총 {total_groups}그룹, {total_errors}오류")
    print(f"skip_words: {len(skip_words)}개")

    data = build_json(sections_data, skip_words)

    print(f"\n💾 백업: {MD_PATH.name} → {BACKUP_PATH.name}")
    shutil.copy2(MD_PATH, BACKUP_PATH)

    print(f"💾 저장: {JSON_PATH}")
    JSON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print("\n✅ 마이그레이션 완료")
    print(f"   섹션: {len(data['sections'])}개")
    print(f"   그룹: {sum(len(s['groups']) for s in data['sections'])}개")
    print(f"   오류: {sum(len(g['errors']) for s in data['sections'] for g in s['groups'])}개")
    print(f"   special_rules: {len(data['special_rules'])}개")
    print(f"   skip_words: {len(data['skip_words'])}개")
    print(f"\n기존 md 백업: {BACKUP_PATH}")
    print(f"생성된 JSON : {JSON_PATH}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
