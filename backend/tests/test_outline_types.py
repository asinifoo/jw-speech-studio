"""/api/outline/types 엔드포인트 + get_outline_types() 서비스 함수.

세션 5c Phase 1 Step 2a — _TYPE_NAMES / _TYPE_META drift 감지 포함.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.outline_parser import (
    _TYPE_NAMES,
    _TYPE_META,
    _TYPE_META_EXCLUDED,
    _OUTLINE_TYPE_KO_TO_EN,
    get_outline_types,
)


# ─── 서비스 함수 ───────────────────────────────────────────

def test_get_outline_types_returns_list():
    r = get_outline_types()
    assert isinstance(r, list)
    assert len(r) > 0


def test_get_outline_types_count_matches_names_minus_excluded():
    r = get_outline_types()
    expected = len(_TYPE_NAMES) - len(_TYPE_META_EXCLUDED)
    assert len(r) == expected


def test_all_returned_codes_exist_in_type_names():
    for entry in get_outline_types():
        assert entry["code"] in _TYPE_NAMES


def test_all_returned_names_match_type_names_lookup():
    for entry in get_outline_types():
        assert entry["name"] == _TYPE_NAMES[entry["code"]]


def test_excluded_codes_not_in_response():
    codes = {entry["code"] for entry in get_outline_types()}
    for excluded in _TYPE_META_EXCLUDED:
        assert excluded not in codes


def test_drift_type_names_minus_excluded_equals_meta_keys():
    """drift 감지: _TYPE_NAMES 와 _TYPE_META 의 키 집합이 정확히 일치(+excluded 제외)."""
    names_codes = set(_TYPE_NAMES.keys()) - _TYPE_META_EXCLUDED
    meta_codes = set(_TYPE_META.keys())
    assert names_codes == meta_codes, (
        f"drift: _TYPE_NAMES - excluded={names_codes} vs _TYPE_META={meta_codes} "
        f"diff={names_codes ^ meta_codes}"
    )


def test_all_entries_have_required_fields():
    for entry in get_outline_types():
        for field in ("code", "name", "aliases", "num_pattern", "version_example"):
            assert field in entry, f"{entry['code']} missing field {field}"
        assert isinstance(entry["aliases"], list)


def test_outline_types_no_year_required_field():
    """Doc-45: /api/outline/types 응답에 year_required 필드 부재 검증."""
    for entry in get_outline_types():
        assert "year_required" not in entry, (
            f"Doc-45 회귀: outline_type {entry.get('code')} 응답에 year_required 필드 존재."
        )


def test_aliases_exist_in_ko_to_en_map():
    """aliases 에 한글 표기 포함된 유형은 _OUTLINE_TYPE_KO_TO_EN 에서도 매핑 가능해야 함."""
    for entry in get_outline_types():
        for alias in entry["aliases"]:
            assert alias in _OUTLINE_TYPE_KO_TO_EN, (
                f"alias {alias!r} (for {entry['code']}) "
                f"not found in _OUTLINE_TYPE_KO_TO_EN"
            )
            assert _OUTLINE_TYPE_KO_TO_EN[alias] == entry["code"], (
                f"alias {alias!r} maps to {_OUTLINE_TYPE_KO_TO_EN[alias]!r} "
                f"but entry code is {entry['code']!r}"
            )


def test_co_excluded_from_response():
    """CO 단독은 Gather wrapper 용 fallback — 응답 제외."""
    assert "CO" in _TYPE_NAMES
    assert "CO" in _TYPE_META_EXCLUDED
    codes = {entry["code"] for entry in get_outline_types()}
    assert "CO" not in codes


def test_co_c_and_co_r_included():
    codes = {entry["code"] for entry in get_outline_types()}
    assert "CO_C" in codes
    assert "CO_R" in codes


def test_jwbc_all_5_subtypes_included():
    codes = {entry["code"] for entry in get_outline_types()}
    for code in ("JWBC", "JWBC-SP", "JWBC-MW", "JWBC-PG", "JWBC-AM"):
        assert code in codes


# ─── 엔드포인트 (FastAPI TestClient) ───────────────────────

def test_endpoint_returns_200():
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)
    r = client.get("/api/outline/types")
    assert r.status_code == 200


def test_endpoint_json_shape():
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)
    data = client.get("/api/outline/types").json()
    assert "types" in data
    assert isinstance(data["types"], list)
    assert len(data["types"]) == len(_TYPE_NAMES) - len(_TYPE_META_EXCLUDED)


def test_endpoint_not_shadowed_by_outline_detail():
    """라우터 선언 순서 확인: /api/outline/types 가 /api/outline/{id} 보다 앞."""
    from fastapi.testclient import TestClient
    from main import app
    client = TestClient(app)
    r = client.get("/api/outline/types")
    # outline_detail 이 잡으면 body={"subtopics": {}, "note": ""} 가 되므로 구분
    data = r.json()
    assert "types" in data
    assert "subtopics" not in data
