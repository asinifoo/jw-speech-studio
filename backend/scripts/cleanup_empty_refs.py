"""기존 publications 레코드에서 빈 referenced_by 항목 제거 (1회성).

버그: Build-6/7 이전 저장된 레코드 중 reference_info가 모든 필드 빈 값인 경우
referenced_by_json 배열에 빈 객체가 append되어 '1개 골자에서 사용' 오표시 발생.

이 스크립트는 의미 없는 항목만 필터해 재저장. 의미 있는 항목은 그대로 유지.

사용법:
  python backend/scripts/cleanup_empty_refs.py

dry-run 원하면 --dry 인자.
"""
from __future__ import annotations

import argparse
import json
import sys

import chromadb


def _is_meaningful(r: dict) -> bool:
    return bool(
        (r.get("outline_type") or "").strip() or
        (r.get("outline_num") or "").strip() or
        (r.get("point_num") or "").strip()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="publications 빈 referenced_by 정리")
    parser.add_argument("--dry", action="store_true", help="변경 없이 대상만 출력")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    client = chromadb.HttpClient(host=args.host, port=args.port)
    try:
        col = client.get_collection("publications")
    except Exception as e:
        print(f"[ERROR] publications 컬렉션 없음: {e}", file=sys.stderr)
        return 2

    all_pubs = col.get(include=["metadatas"])
    total = len(all_pubs.get("ids") or [])
    print(f"전체 레코드: {total}")

    cleaned = 0
    for i, pid in enumerate(all_pubs["ids"] or []):
        meta = all_pubs["metadatas"][i]
        try:
            refs = json.loads(meta.get("referenced_by_json", "[]") or "[]")
        except Exception:
            continue
        meaningful = [r for r in refs if _is_meaningful(r)]
        if len(meaningful) == len(refs):
            continue  # 변경 없음

        print(f"{pid}: {len(refs)} → {len(meaningful)}")
        if not args.dry:
            new_meta = {**meta, "referenced_by_json": json.dumps(meaningful, ensure_ascii=False)}
            col.update(ids=[pid], metadatas=[new_meta])
        cleaned += 1

    action = "변경할 대상" if args.dry else "정리 완료"
    print(f"{action}: {cleaned}건")
    return 0


if __name__ == "__main__":
    sys.exit(main())
