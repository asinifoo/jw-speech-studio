"""Build-6A cleanup: MD 파서 \\s* 버그로 오염된 scriptures/publications 필드 정리.

판정: scriptures 또는 publications 값이 '- **' 로 시작하면 오염 → "" 로 리셋.
ChromaDB metadata만 수정 (embedding/document 유지).

사용:
  python3 cleanup_build6a.py           # dry-run
  python3 cleanup_build6a.py --apply   # 실제 반영
"""
import argparse
import sys
import chromadb

DB_PATH = "/home/nifo/jw-system/db"
TARGET_COLS = ("speech_expressions", "speech_points")
FIELDS = ("scriptures", "publications")


def is_polluted(value: str) -> bool:
    """오염 판정: '- **' 또는 '- 출판물' / '- 사용여부' 등으로 시작"""
    if not value:
        return False
    v = value.strip()
    if v.startswith("- **"):
        return True
    # cleanMd 등으로 asterisk 제거된 흔적
    if v.startswith("- 출판물") or v.startswith("- 사용여부") or v.startswith("- 성구"):
        return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="실제 반영 (기본은 dry-run)")
    ap.add_argument("--limit-samples", type=int, default=5, help="출력할 샘플 개수")
    args = ap.parse_args()

    mode = "APPLY" if args.apply else "DRY-RUN"
    print(f"=== Build-6A cleanup ({mode}) ===")
    print(f"DB: {DB_PATH}")
    print(f"대상: {TARGET_COLS}")
    print(f"필드: {FIELDS}")
    print()

    client = chromadb.PersistentClient(path=DB_PATH)

    grand_total = 0
    grand_updated = 0

    for col_name in TARGET_COLS:
        try:
            col = client.get_collection(col_name)
        except Exception as e:
            print(f"[{col_name}] 컬렉션 없음 — 스킵 ({e})")
            continue

        all_data = col.get(include=["metadatas"])
        ids = all_data.get("ids", [])
        metas = all_data.get("metadatas", [])
        total = len(ids)

        dirty_ids = []
        dirty_metas = []
        sample_before = []
        field_counts = {f: 0 for f in FIELDS}

        for id_, m in zip(ids, metas):
            changes = {}
            for f in FIELDS:
                v = m.get(f, "") or ""
                if is_polluted(v):
                    changes[f] = ""
                    field_counts[f] += 1
            if changes:
                new_meta = dict(m)
                new_meta.update(changes)
                dirty_ids.append(id_)
                dirty_metas.append(new_meta)
                if len(sample_before) < args.limit_samples:
                    sample_before.append((id_, {f: m.get(f, '') for f in FIELDS}))

        print(f"[{col_name}] 전체={total} / 정리 대상={len(dirty_ids)}")
        for f in FIELDS:
            print(f"  └ {f} 오염: {field_counts[f]}")
        if sample_before:
            print(f"  샘플 (수정 전):")
            for sid, vals in sample_before:
                print(f"    {sid}")
                for f, v in vals.items():
                    if v:
                        print(f"      {f}: {v[:80]!r}")

        grand_total += total
        grand_updated += len(dirty_ids)

        if args.apply and dirty_ids:
            # ChromaDB update — metadata만, 배치 단위로
            BATCH = 500
            for i in range(0, len(dirty_ids), BATCH):
                batch_ids = dirty_ids[i:i + BATCH]
                batch_metas = dirty_metas[i:i + BATCH]
                try:
                    col.update(ids=batch_ids, metadatas=batch_metas)
                    print(f"  ✓ {i + len(batch_ids)}/{len(dirty_ids)} 적용")
                except Exception as e:
                    print(f"  ✗ 배치 {i} 실패: {e}")
                    sys.exit(1)

        print()

    print(f"=== 총 {grand_updated}/{grand_total} 레코드 ===")
    if not args.apply:
        print("DRY-RUN: 실제 적용하려면 --apply 옵션을 사용하세요.")
    else:
        print("APPLY 완료.")


if __name__ == "__main__":
    main()
