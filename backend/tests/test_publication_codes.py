"""세션 5f Commit F: GET /api/publications/codes — pub_code 평탄 목록."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routers import manage


def test_list_publication_codes_returns_pub_code_only(monkeypatch):
    """pub_code 평탄 목록 반환 + 빈 pub_code 제외."""
    fake_pubs = [
        {"pub_code": "「파09」 9/15", "pub_title": "파수대 2009-09-15", "reference": "21면 3항"},
        {"pub_code": "「깨」 5/15", "pub_title": "깨어라 5/15", "reference": "5면"},
        {"pub_code": "", "pub_title": "빈 코드", "reference": ""},  # 빈 pub_code 는 제외
    ]
    monkeypatch.setattr("routers.chat._load_pub_list", lambda client: fake_pubs)
    monkeypatch.setattr("routers.manage.get_db", lambda: None)

    result = manage.list_publication_codes()

    assert result == {"codes": ["「파09」 9/15", "「깨」 5/15"]}


def test_list_publication_codes_empty(monkeypatch):
    """publications 컬렉션이 비어있으면 빈 codes 배열 반환."""
    monkeypatch.setattr("routers.chat._load_pub_list", lambda client: [])
    monkeypatch.setattr("routers.manage.get_db", lambda: None)

    result = manage.list_publication_codes()

    assert result == {"codes": []}
