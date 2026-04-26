"""세션 5f §3.x: point_text + pub_code 매칭 테스트.

- chat.py _norm_text / _norm_pub 헬퍼
- POST /api/publications/match-points 라우터 (시나리오 ① ② ③ + 빈 case)
- chat.py auto_publications 정정 (referenced_by[].point_text 일치 시에만)
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routers.chat import _norm_text, _norm_pub
from routers import manage


# ─── _norm_text ───
def test_norm_text_trim_collapse():
    assert _norm_text("  hello   world  ") == "hello world"


def test_norm_text_full_width_space():
    # U+3000 (전각 공백) → 일반 공백 → collapse
    assert _norm_text("hello　　world") == "hello world"


def test_norm_text_empty():
    assert _norm_text("") == ""
    assert _norm_text(None) == ""


# ─── _norm_pub ───
def test_norm_pub_brackets_lower():
    assert _norm_pub("「파09」 5/15") == "파095/15"


def test_norm_pub_empty():
    assert _norm_pub("") == ""


# ─── match-points 라우터 ───
def _fake_pub_list():
    return [
        {
            "pub_code": "「파09」 5/15",
            "refs": [
                {"point_text": "여호와께서는 자신의 종들을 가르치신다", "outline_num": "001"},
                {"point_text": "다른 본문 텍스트", "outline_num": "002"},
            ],
        },
        {
            "pub_code": "「깨」 5/15",
            "refs": [
                {"point_text": "다른 본문", "outline_num": "003"},
            ],
        },
    ]


def test_match_points_scenario_2_match(monkeypatch):
    """시나리오 ②: pub_code 일치 + point_text 일치 → matched 에 키 추가."""
    monkeypatch.setattr("routers.chat._load_pub_list", lambda c: _fake_pub_list())
    monkeypatch.setattr("routers.manage.get_db", lambda: None)
    res = manage.match_publication_points({
        "items": [{"point_text": "여호와께서는 자신의 종들을 가르치신다", "pub_codes": ["「파09」 5/15"]}]
    })
    assert "여호와께서는 자신의 종들을 가르치신다__파095/15" in res["matched"]


def test_match_points_scenario_3_pub_match_text_mismatch(monkeypatch):
    """시나리오 ③: pub_code 일치하나 point_text 다름 → matched 0."""
    monkeypatch.setattr("routers.chat._load_pub_list", lambda c: _fake_pub_list())
    monkeypatch.setattr("routers.manage.get_db", lambda: None)
    res = manage.match_publication_points({
        "items": [{"point_text": "전혀 다른 본문 내용", "pub_codes": ["「파09」 5/15"]}]
    })
    assert res["matched"] == []


def test_match_points_scenario_1_pub_not_found(monkeypatch):
    """시나리오 ①: pub_code 자체가 DB 에 없음 → matched 0."""
    monkeypatch.setattr("routers.chat._load_pub_list", lambda c: _fake_pub_list())
    monkeypatch.setattr("routers.manage.get_db", lambda: None)
    res = manage.match_publication_points({
        "items": [{"point_text": "어떤 본문이든", "pub_codes": ["「존재하지않음」 1/1"]}]
    })
    assert res["matched"] == []


def test_match_points_empty_point_text_skipped(monkeypatch):
    """item.point_text 가 빈 경우 skip (안전망)."""
    monkeypatch.setattr("routers.chat._load_pub_list", lambda c: _fake_pub_list())
    monkeypatch.setattr("routers.manage.get_db", lambda: None)
    res = manage.match_publication_points({
        "items": [{"point_text": "", "pub_codes": ["「파09」 5/15"]}]
    })
    assert res["matched"] == []


def test_match_points_normalize_full_width(monkeypatch):
    """전각 공백/연속 공백 정규화로 매칭."""
    monkeypatch.setattr("routers.chat._load_pub_list", lambda c: _fake_pub_list())
    monkeypatch.setattr("routers.manage.get_db", lambda: None)
    res = manage.match_publication_points({
        "items": [{"point_text": "  여호와께서는　자신의   종들을 가르치신다  ", "pub_codes": ["「파09」 5/15"]}]
    })
    assert "여호와께서는 자신의 종들을 가르치신다__파095/15" in res["matched"]
