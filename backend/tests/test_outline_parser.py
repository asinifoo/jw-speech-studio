import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.outline_parser import parse_outline_filename, _outline_prefix, normalize_outline_type


# ─── 신규: CO 패턴 ─────────────────────────────────────

def test_co_c_default_num():
    r = parse_outline_filename("CO-26-C_KO.docx")
    assert r["outline_type"] == "CO_C"
    assert r["outline_num"] == "001"
    assert r["outline_year"] == "26"
    assert r["version"] is None


def test_co_c_explicit_num():
    r = parse_outline_filename("CO-26-C_002_KO.docx")
    assert r["outline_type"] == "CO_C"
    assert r["outline_num"] == "002"
    assert r["outline_year"] == "26"


def test_co_r_default_num():
    r = parse_outline_filename("CO-26-R_KO.docx")
    assert r["outline_type"] == "CO_R"
    assert r["outline_num"] == "001"
    assert r["outline_year"] == "26"


def test_co_year_27():
    r = parse_outline_filename("CO-27-C_KO.docx")
    assert r["outline_type"] == "CO_C"
    assert r["outline_year"] == "27"


def test_co_with_version():
    r = parse_outline_filename("CO-26-C_KO_v01-26.docx")
    assert r["outline_type"] == "CO_C"
    assert r["outline_num"] == "001"
    assert r["outline_year"] == "26"
    assert r["version"] == "01/26"


def test_co_invalid_subtype_falls_back():
    # CO-YY-X (잘못된 서브타입): 매치 실패, 모든 필드 None
    r = parse_outline_filename("CO-26-X_KO.docx")
    assert r["outline_type"] is None
    assert r["outline_num"] is None
    assert r["outline_year"] is None


# ─── 회귀: 기존 동작 ────────────────────────────────────

def test_regression_s34_no_year():
    r = parse_outline_filename("S-34_KO.docx")
    assert r["outline_type"] == "S-34"
    assert r["outline_num"] == "001"
    assert r["outline_year"] is None


def test_regression_s34_explicit_num():
    r = parse_outline_filename("S-34_KO_001_v09-15.docx")
    assert r["outline_type"] == "S-34"
    assert r["outline_num"] == "001"
    assert r["outline_year"] is None
    assert r["version"] == "09/15"


def test_regression_s123_year():
    r = parse_outline_filename("S-123-26_KO.docx")
    assert r["outline_type"] == "S-123"
    assert r["outline_num"] == "001"
    assert r["outline_year"] == "26"


def test_regression_s211_year():
    r = parse_outline_filename("S-211-26_KO.docx")
    assert r["outline_type"] == "S-211"
    assert r["outline_num"] == "001"
    assert r["outline_year"] == "26"


def test_regression_s31():
    r = parse_outline_filename("S-31_KO.docx")
    assert r["outline_type"] == "S-31"
    assert r["outline_num"] == "001"
    assert r["outline_year"] is None


def test_regression_jwbc_sp():
    r = parse_outline_filename("JWBC-SP_KO_123.docx")
    assert r["outline_type"] == "JWBC-SP"
    assert r["outline_num"] == "123"
    assert r["outline_year"] is None


def test_regression_unknown_filename():
    # 순수 숫자/일반 파일명 → 모든 필드 None
    r = parse_outline_filename("random_001.docx")
    assert r["outline_type"] is None
    assert r["outline_num"] is None
    assert r["outline_year"] is None


def test_regression_empty():
    r = parse_outline_filename("")
    assert r == {"outline_type": None, "outline_num": None, "outline_year": None, "version": None}


# ─── _outline_prefix: 기존 동작 (year="" 기본값) ──────────

def test_prefix_s34_num_padding():
    assert _outline_prefix("S-34", "5") == "S-34_005"


def test_prefix_korean_to_english_s34():
    assert _outline_prefix("공개강연", "35") == "S-34_035"


def test_prefix_s31():
    assert _outline_prefix("S-31", "1") == "S-31_001"


def test_prefix_korean_memorial_empty_num():
    assert _outline_prefix("기념식", "") == "S-31_"


def test_prefix_jwbc_sp():
    assert _outline_prefix("JWBC-SP", "3") == "JWBC-SP_003"


def test_prefix_co_c():
    assert _outline_prefix("CO_C", "1") == "CO_C_001"


def test_prefix_sb():
    assert _outline_prefix("SB", "41") == "SB_041"


def test_prefix_etc_passthrough():
    assert _outline_prefix("ETC", "abc") == "abc"


def test_prefix_empty_type_passthrough():
    assert _outline_prefix("", "001") == "001"


# ─── _outline_prefix: 신규 year 인자 ──────────────────────

def test_prefix_s123_with_year():
    assert _outline_prefix("S-123", "1", "26") == "S-123_001_y26"


def test_prefix_s211_with_year():
    assert _outline_prefix("S-211", "1", "27") == "S-211_001_y27"


def test_prefix_co_c_with_year():
    assert _outline_prefix("CO_C", "1", "26") == "CO_C_001_y26"


def test_prefix_co_r_with_year():
    assert _outline_prefix("CO_R", "2", "26") == "CO_R_002_y26"


def test_prefix_sb_with_year():
    assert _outline_prefix("SB", "41", "24") == "SB_041_y24"


def test_prefix_s34_empty_year_same_as_default():
    assert _outline_prefix("S-34", "5", "") == "S-34_005"


def test_prefix_etc_ignores_year():
    assert _outline_prefix("ETC", "abc", "26") == "abc"


def test_prefix_empty_type_ignores_year():
    assert _outline_prefix("", "001", "26") == "001"


# ─── normalize_outline_type: 한글 매핑 ─────────────────

def test_norm_공개강연():
    assert normalize_outline_type("공개강연") == "S-34"


def test_norm_공개_강연_with_space():
    assert normalize_outline_type("공개 강연") == "S-34"


def test_norm_기념식():
    assert normalize_outline_type("기념식") == "S-31"


def test_norm_특별강연():
    assert normalize_outline_type("특별강연") == "S-123"


def test_norm_특별_강연_with_space():
    assert normalize_outline_type("특별 강연") == "S-123"


def test_norm_RP모임():
    assert normalize_outline_type("RP모임") == "S-211"


def test_norm_RP_모임_with_space():
    assert normalize_outline_type("RP 모임") == "S-211"


def test_norm_순회대회():
    assert normalize_outline_type("순회대회") == "CO_C"


def test_norm_순회_대회_with_space():
    assert normalize_outline_type("순회 대회") == "CO_C"


def test_norm_지역대회():
    assert normalize_outline_type("지역대회") == "CO_R"


def test_norm_지역_대회_with_space():
    assert normalize_outline_type("지역 대회") == "CO_R"


def test_norm_생활과_봉사():
    assert normalize_outline_type("생활과 봉사") == "SB"


def test_norm_기타():
    assert normalize_outline_type("기타") == "ETC"


# ─── normalize_outline_type: 영문 pass-through ────────

def test_norm_s34_passthrough():
    assert normalize_outline_type("S-34") == "S-34"


def test_norm_s123_passthrough():
    assert normalize_outline_type("S-123") == "S-123"


def test_norm_co_c_passthrough():
    assert normalize_outline_type("CO_C") == "CO_C"


def test_norm_sb_passthrough():
    assert normalize_outline_type("SB") == "SB"


def test_norm_jwbc_sp_passthrough():
    assert normalize_outline_type("JWBC-SP") == "JWBC-SP"


def test_norm_etc_passthrough():
    assert normalize_outline_type("ETC") == "ETC"


# ─── normalize_outline_type: 엣지 ────────────────────

def test_norm_empty():
    assert normalize_outline_type("") == ""


def test_norm_strip_whitespace():
    assert normalize_outline_type("  공개강연  ") == "S-34"


def test_norm_unknown_returned_as_is():
    assert normalize_outline_type("UNKNOWN") == "UNKNOWN"
