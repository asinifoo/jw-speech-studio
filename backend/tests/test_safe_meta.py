"""safe_meta() 헬퍼 단위 테스트 — Doc-49."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from db import safe_meta


def test_safe_meta_handles_none_metadata():
    assert safe_meta({"metadata": None}) == {}


def test_safe_meta_handles_missing_metadata():
    assert safe_meta({}) == {}


def test_safe_meta_preserves_dict():
    assert safe_meta({"metadata": {"key": "val"}}) == {"key": "val"}


def test_safe_meta_handles_none_item():
    assert safe_meta(None) == {}


def test_safe_meta_handles_non_dict_metadata():
    # 이례적 — list/str 등 잘못된 타입이 들어와도 방어
    assert safe_meta({"metadata": []}) == {}
    assert safe_meta({"metadata": "string"}) == {}
    assert safe_meta({"metadata": 42}) == {}


def test_safe_meta_chained_access_safe():
    """치환 패턴 검증: safe_meta(x).get('source', '') 가 AttributeError 없이 동작."""
    assert safe_meta({"metadata": None}).get("source", "") == ""
    assert safe_meta({}).get("source", "") == ""
    assert safe_meta({"metadata": {"source": "outline"}}).get("source", "") == "outline"
