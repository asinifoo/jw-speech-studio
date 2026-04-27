import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.outline_parser import parse_outline_filename, _outline_prefix, normalize_outline_type, _TYPE_NAMES


# ─── parse_outline_filename 회귀 (Doc-45: outline_year 키 없음) ──

def test_regression_s34_no_year():
    r = parse_outline_filename("S-34_KO.docx")
    assert r["outline_type"] == "S-34"
    assert r["outline_num"] == "001"


def test_regression_s34_explicit_num():
    r = parse_outline_filename("S-34_KO_001_v09-15.docx")
    assert r["outline_type"] == "S-34"
    assert r["outline_num"] == "001"
    assert r["version"] == "09/15"


def test_regression_s31():
    r = parse_outline_filename("S-31_KO.docx")
    assert r["outline_type"] == "S-31"
    assert r["outline_num"] == "001"


def test_regression_jwbc_sp():
    r = parse_outline_filename("JWBC-SP_KO_123.docx")
    assert r["outline_type"] == "JWBC-SP"
    assert r["outline_num"] == "123"


def test_regression_unknown_filename():
    r = parse_outline_filename("random_001.docx")
    assert r["outline_type"] is None
    assert r["outline_num"] is None


def test_regression_empty():
    r = parse_outline_filename("")
    assert r == {"outline_type": None, "outline_num": None, "version": None}


# ─── Doc-45 회귀 방지: 레거시 YY 파일명 주어도 outline_year 키 부재 ──

def test_parse_outline_filename_ignores_year_in_filename():
    """Doc-45: 파서가 파일명에서 YY 추출하지 않음. outline_year 키 부재 검증."""
    legacy_patterns = [
        "S-123-26_KO.docx",
        "S-211-24_KO.docx",
        "CO-24-C.docx",
        "CO-25-R.docx",
    ]
    for fname in legacy_patterns:
        result = parse_outline_filename(fname)
        assert "outline_year" not in result, (
            f"Doc-45 회귀: {fname} 에서 outline_year 키가 반환됨."
        )


# ─── _outline_prefix (Doc-45: year 파라미터 제거됨) ──

def test_prefix_s34_num_padding():
    assert _outline_prefix("S-34", "5") == "S-34_005"


def test_prefix_korean_to_english_s34():
    assert _outline_prefix("공개강연", "35") == "S-34_035"


def test_prefix_s31():
    assert _outline_prefix("S-31", "1") == "S-31_001"


def test_prefix_korean_memorial_empty_num():
    assert _outline_prefix("기념식", "") == "S-31"


def test_prefix_jwbc_sp():
    assert _outline_prefix("JWBC-SP", "3") == "JWBC-SP_003"


def test_prefix_co_c():
    assert _outline_prefix("CO_C", "1") == "CO_C_001"


def test_prefix_sb():
    assert _outline_prefix("SB", "41") == "SB_041"


def test_prefix_etc_passthrough():
    assert _outline_prefix("ETC", "abc") == "ETC_abc"


def test_prefix_empty_type_passthrough():
    assert _outline_prefix("", "001") == "ETC_001"


# ─── 한국어 alias 흡수 (5g §4.4 양쪽 동기화 영역, commit 3.5 신규) ───

def test_prefix_korean_alias_공개_강연():
    assert _outline_prefix("공개 강연", "1") == "S-34_001"


def test_prefix_korean_alias_특별강연():
    assert _outline_prefix("특별강연", "1") == "S-123_001"


def test_prefix_korean_alias_특별_강연():
    assert _outline_prefix("특별 강연", "1") == "S-123_001"


def test_prefix_korean_alias_RP모임():
    assert _outline_prefix("RP모임", "1") == "S-211_001"


def test_prefix_korean_alias_RP_모임():
    assert _outline_prefix("RP 모임", "1") == "S-211_001"


def test_prefix_korean_alias_순회대회():
    assert _outline_prefix("순회대회", "1") == "CO_C_001"


def test_prefix_korean_alias_순회_대회():
    assert _outline_prefix("순회 대회", "1") == "CO_C_001"


def test_prefix_korean_alias_지역대회():
    assert _outline_prefix("지역대회", "1") == "CO_R_001"


def test_prefix_korean_alias_지역_대회():
    assert _outline_prefix("지역 대회", "1") == "CO_R_001"


def test_prefix_korean_alias_생활과봉사():
    assert _outline_prefix("생활과봉사", "41") == "SB_041"


def test_prefix_korean_alias_생활과_봉사():
    assert _outline_prefix("생활과 봉사", "41") == "SB_041"


# ─── ETC 통일 (추가 케이스) ───

def test_prefix_etc_with_numeric():
    assert _outline_prefix("ETC", "001") == "ETC_001"


def test_prefix_etc_empty_num():
    assert _outline_prefix("ETC", "") == "ETC"


def test_prefix_empty_type_korean_num():
    assert _outline_prefix("", "기념식") == "ETC_기념식"


def test_prefix_empty_both():
    assert _outline_prefix("", "") == ""


# ─── num 빈 시 끝 _ 제거 정합 ───

def test_prefix_s34_empty_num():
    assert _outline_prefix("S-34", "") == "S-34"


# ─── 자유 입력 4종 영역 (siFreeType — commit 3.6 예정 영역) ───
# '생활과봉사' / '기타' → 매핑 흡수 (이미 위 영역 검증)
# 'JW방송' / '대회' → wrapper 매핑 부재, fallback 동작 (commit 3.6 에서 매핑 보강 예정)

def test_prefix_freetype_JW방송_fallback():
    """'JW방송' wrapper — _OUTLINE_TYPE_KO_TO_EN 매핑 부재 (commit 3.6 영역).
    자유 입력 모드 운영 영역에서 outline_type='ETC' 고정이라 본 케이스 호출 영역 X.
    """
    assert _outline_prefix("JW방송", "1") == "JW방송_001"


def test_prefix_freetype_대회_fallback():
    """'대회' wrapper 라벨 — 매핑 부재 (commit 3.6 영역). fallback 동작."""
    assert _outline_prefix("대회", "1") == "대회_001"


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


# ─── _TYPE_NAMES 라벨 정정 검증 (commit 3.6c — frontend SSOT 정합) ───

def test_type_names_co_c():
    assert _TYPE_NAMES["CO_C"] == "순회대회"


def test_type_names_co_r():
    assert _TYPE_NAMES["CO_R"] == "지역대회"


def test_type_names_jwbc_sp():
    assert _TYPE_NAMES["JWBC-SP"] == "연설"


def test_type_names_jwbc_mw():
    assert _TYPE_NAMES["JWBC-MW"] == "아침숭배"


def test_type_names_jwbc_pg():
    assert _TYPE_NAMES["JWBC-PG"] == "월간프로그램"


def test_type_names_jwbc_am():
    assert _TYPE_NAMES["JWBC-AM"] == "연례총회"
