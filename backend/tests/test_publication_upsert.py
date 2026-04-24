"""Phase 3: 출판물 업서트 테스트 (in-memory fake collection)."""
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services import publication_utils
from services.publication_utils import (
    _pub_id,
    _ref_key_str,
    _upsert_referenced_by,
    _upsert_publication,
    _delete_reference,
    _match_publications,
)


class FakeCollection:
    """ChromaDB col 인터페이스 흉내 (get/add/update만)."""
    def __init__(self):
        self.store = {}  # id → {doc, emb, meta}

    def get(self, ids=None, include=None):
        if ids is None:
            ids = list(self.store.keys())
        out = {"ids": [], "metadatas": [], "documents": [], "embeddings": []}
        for i in ids:
            if i in self.store:
                out["ids"].append(i)
                out["metadatas"].append(dict(self.store[i]["meta"]))
                out["documents"].append(self.store[i]["doc"])
                out["embeddings"].append(self.store[i]["emb"])
        return out

    def add(self, ids, documents, embeddings, metadatas):
        for i, d, e, m in zip(ids, documents, embeddings, metadatas):
            self.store[i] = {"doc": d, "emb": e, "meta": dict(m)}

    def update(self, ids, metadatas=None, documents=None, embeddings=None):
        for idx, i in enumerate(ids):
            if i not in self.store:
                continue
            if metadatas is not None:
                self.store[i]["meta"] = dict(metadatas[idx])
            if documents is not None:
                self.store[i]["doc"] = documents[idx]
            if embeddings is not None:
                self.store[i]["emb"] = embeddings[idx]

    def delete(self, ids):
        for i in ids:
            self.store.pop(i, None)


# get_embedding 모킹: 네트워크/Ollama 호출 회피
publication_utils.get_embedding = lambda text: [0.0] * 16


# ─── _pub_id ──────────────────────────────────────────

def test_pub_id_slash_to_dash():
    assert _pub_id("깨13/8", "6면") == "pub_깨13-8_6면"


def test_pub_id_dot_preserved_and_space():
    assert _pub_id("파배19.3", "5면 3-4항") == "pub_파배19.3_5면_3-4항"


def test_pub_id_hangul_only():
    assert _pub_id("실쉬", "54-55면 10-11항") == "pub_실쉬_54-55면_10-11항"


# ─── _ref_key_str (Doc-45: year 인수 제거) ─────────────

def test_ref_key_basic():
    assert _ref_key_str("S-34", "035", "1/20", "1.1.1") == "S-34_035_v1-20:1.1.1"


# ─── _upsert_referenced_by ────────────────────────────

def test_ref_arr_updated_when_same_key():
    arr = [{"outline_type": "S-34", "outline_num": "001", "version": "9/15",
            "point_num": "1.1", "point_text": "old"}]
    new_ref = {"outline_type": "S-34", "outline_num": "001", "version": "9/15",
               "point_num": "1.1", "point_text": "new"}
    out, action = _upsert_referenced_by(arr, new_ref)
    assert action == "updated"
    assert len(out) == 1
    assert out[0]["point_text"] == "new"


def test_ref_arr_appended_when_different_point():
    arr = [{"outline_type": "S-34", "outline_num": "001", "version": "9/15",
            "point_num": "1.1", "point_text": "first"}]
    new_ref = {"outline_type": "S-34", "outline_num": "001", "version": "9/15",
               "point_num": "1.2", "point_text": "second"}
    out, action = _upsert_referenced_by(arr, new_ref)
    assert action == "appended"
    assert len(out) == 2


# ─── _upsert_publication 시나리오 ──────────────────────

def _ref_info(point_num="1.1.1", text="요점 본문"):
    return {
        "outline_type": "S-34",
        "outline_num": "001",
        "version": "9/15",
        "point_num": point_num,
        "outline_title": "제목",
        "subtopic_title": "소주제",
        "point_text": text,
    }


def _pub_payload(content="본문A", point_num="1.1.1", point_text="요점"):
    return {
        "pub_code": "깨13/8",
        "pub_title": "깨어라! 2013년 8월호",
        "pub_type": "정기간행물",
        "reference": "6면",
        "content": content,
        "keywords": ["kw1", "kw2"],
        "reference_info": _ref_info(point_num, point_text),
    }


def test_scenario_A_created():
    col = FakeCollection()
    res = _upsert_publication(col, _pub_payload())
    assert res["action"] == "created"
    assert res["id"] == "pub_깨13-8_6면"
    stored = col.store[res["id"]]
    refs = json.loads(stored["meta"]["referenced_by_json"])
    assert len(refs) == 1
    assert stored["doc"] == "본문A"
    assert stored["meta"]["pub_code"] == "깨13/8"
    assert stored["meta"]["pub_title"] == "깨어라! 2013년 8월호"
    assert json.loads(stored["meta"]["keywords"]) == ["kw1", "kw2"]


def test_scenario_B_updated_same_ref():
    col = FakeCollection()
    _upsert_publication(col, _pub_payload(point_text="v1 텍스트"))
    res2 = _upsert_publication(col, _pub_payload(point_text="v2 텍스트"))
    assert res2["action"] == "updated"
    refs = json.loads(col.store[res2["id"]]["meta"]["referenced_by_json"])
    assert len(refs) == 1
    assert refs[0]["point_text"] == "v2 텍스트"


def test_scenario_C_appended_different_point():
    col = FakeCollection()
    r1 = _upsert_publication(col, _pub_payload(point_num="1.1.1", point_text="첫번째"))
    r2 = _upsert_publication(col, _pub_payload(point_num="1.1.2", point_text="두번째"))
    assert r1["action"] == "created"
    assert r2["action"] == "appended"
    refs = json.loads(col.store[r2["id"]]["meta"]["referenced_by_json"])
    assert len(refs) == 2
    assert {r["point_num"] for r in refs} == {"1.1.1", "1.1.2"}


def test_scenario_D_content_preserved_on_conflict():
    col = FakeCollection()
    _upsert_publication(col, _pub_payload(content="원본 본문"))
    res2 = _upsert_publication(col, _pub_payload(content="새 본문 (무시됨)"))
    assert res2["action"] == "updated"
    # content는 첫 값 유지
    assert col.store[res2["id"]]["doc"] == "원본 본문"


def test_scenario_C_multiple_outlines():
    """다른 골자에서 같은 출판물 참조 → append"""
    col = FakeCollection()
    p1 = _pub_payload()
    p1["reference_info"]["outline_num"] = "001"
    _upsert_publication(col, p1)

    p2 = _pub_payload()
    p2["reference_info"]["outline_num"] = "035"
    res2 = _upsert_publication(col, p2)
    assert res2["action"] == "appended"
    refs = json.loads(col.store[res2["id"]]["meta"]["referenced_by_json"])
    assert {r["outline_num"] for r in refs} == {"001", "035"}


def test_id_unique_across_payloads():
    """pub_code + reference 같으면 동일 ID"""
    col = FakeCollection()
    a = _pub_payload()
    b = _pub_payload()
    b["reference_info"]["point_num"] = "9.9"
    r1 = _upsert_publication(col, a)
    r2 = _upsert_publication(col, b)
    assert r1["id"] == r2["id"]
    assert len(col.store) == 1


# ─── _delete_reference 시나리오 ────────────────────────

def test_delete_reference_single_match():
    """유일 참조 삭제 → 레코드 자동 삭제"""
    col = FakeCollection()
    r = _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    pub_id = r["id"]
    # _ref_key_str("S-34","001","","9/15","1.1.1") == "S-34_001_v9-15:1.1.1"
    res = _delete_reference(col, pub_id, "S-34_001_v9-15:1.1.1")
    assert res == {"action": "record_deleted", "remaining": 0}
    assert pub_id not in col.store


def test_delete_reference_leaves_others():
    """다중 참조 중 1건만 삭제 → 레코드 유지, 배열 길이 감소"""
    col = FakeCollection()
    _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    r2 = _upsert_publication(col, _pub_payload(point_num="1.1.2"))
    pub_id = r2["id"]
    res = _delete_reference(col, pub_id, "S-34_001_v9-15:1.1.1")
    assert res["action"] == "removed"
    assert res["remaining"] == 1
    assert pub_id in col.store
    remaining_refs = json.loads(col.store[pub_id]["meta"]["referenced_by_json"])
    assert len(remaining_refs) == 1
    assert remaining_refs[0]["point_num"] == "1.1.2"


def test_delete_reference_not_found():
    """존재하지 않는 ref_key → not_found, 배열 불변"""
    col = FakeCollection()
    r = _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    res = _delete_reference(col, r["id"], "S-34_001_v9-15:9.9.9")
    assert res == {"action": "not_found", "remaining": 1}
    refs = json.loads(col.store[r["id"]]["meta"]["referenced_by_json"])
    assert len(refs) == 1
    assert refs[0]["point_num"] == "1.1.1"


def test_delete_record_not_found():
    """존재하지 않는 doc_id → record_not_found"""
    col = FakeCollection()
    res = _delete_reference(col, "pub_없음_없음", "S-34_001_v9-15:1.1.1")
    assert res == {"action": "record_not_found"}


def test_delete_reference_preserves_content():
    """참조 삭제 후 content/임베딩 변화 없음"""
    col = FakeCollection()
    _upsert_publication(col, _pub_payload(content="원본", point_num="1.1.1"))
    r2 = _upsert_publication(col, _pub_payload(content="충돌(무시)", point_num="1.1.2"))
    pub_id = r2["id"]
    original_doc = col.store[pub_id]["doc"]
    original_emb = col.store[pub_id]["emb"]
    _delete_reference(col, pub_id, "S-34_001_v9-15:1.1.1")
    assert col.store[pub_id]["doc"] == original_doc == "원본"
    assert col.store[pub_id]["emb"] == original_emb


def test_delete_record_entire():
    """FakeCollection.delete로 레코드 전체 삭제 경로 (엔드포인트 ref_key 없음 경로)"""
    col = FakeCollection()
    r = _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    pub_id = r["id"]
    assert pub_id in col.store
    col.delete(ids=[pub_id])
    assert pub_id not in col.store


# ─── _match_publications 시나리오 (Build-5) ──────────

def _all_pubs_from_fake(col: FakeCollection) -> dict:
    """FakeCollection을 ChromaDB col.get() 반환 형태로 직렬화."""
    ids, metas, docs = [], [], []
    for i, rec in col.store.items():
        ids.append(i)
        metas.append(rec["meta"])
        docs.append(rec["doc"])
    return {"ids": ids, "metadatas": metas, "documents": docs}


def test_match_by_outline_num():
    col = FakeCollection()
    p1 = _pub_payload()
    p1["pub_code"] = "깨13/8"; p1["reference"] = "6면"
    p1["reference_info"]["outline_num"] = "035"
    _upsert_publication(col, p1)

    p2 = _pub_payload()
    p2["pub_code"] = "파02"; p2["reference"] = "5면"
    p2["reference_info"]["outline_num"] = "127"
    _upsert_publication(col, p2)

    all_pubs = _all_pubs_from_fake(col)
    res = _match_publications(all_pubs, outline_num="035")
    assert len(res) == 1
    assert res[0]["meta"]["pub_code"] == "깨13/8"


def test_match_by_outline_type_and_num():
    col = FakeCollection()
    p1 = _pub_payload()
    p1["pub_code"] = "A"; p1["reference"] = "1"
    p1["reference_info"]["outline_type"] = "S-34"
    p1["reference_info"]["outline_num"] = "001"
    _upsert_publication(col, p1)

    p2 = _pub_payload()
    p2["pub_code"] = "B"; p2["reference"] = "2"
    p2["reference_info"]["outline_type"] = "S-123"
    p2["reference_info"]["outline_num"] = "001"
    _upsert_publication(col, p2)

    all_pubs = _all_pubs_from_fake(col)
    res = _match_publications(all_pubs, outline_type="S-34", outline_num="001")
    assert len(res) == 1
    assert res[0]["meta"]["pub_code"] == "A"


def test_match_by_point_num():
    col = FakeCollection()
    _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    _upsert_publication(col, _pub_payload(point_num="2.3"))
    all_pubs = _all_pubs_from_fake(col)

    res = _match_publications(all_pubs, outline_num="001", point_num="1.1.1")
    assert len(res) == 1
    assert res[0]["matched_ref"]["point_num"] == "1.1.1"

    res2 = _match_publications(all_pubs, outline_num="001", point_num="2.3")
    assert len(res2) == 1
    assert res2[0]["matched_ref"]["point_num"] == "2.3"


def test_match_empty_result():
    col = FakeCollection()
    all_pubs = _all_pubs_from_fake(col)
    assert _match_publications(all_pubs, outline_num="999") == []


def test_match_no_filter_returns_all():
    col = FakeCollection()
    p1 = _pub_payload(); p1["pub_code"] = "X"; p1["reference"] = "1"
    _upsert_publication(col, p1)
    p2 = _pub_payload(); p2["pub_code"] = "Y"; p2["reference"] = "2"
    _upsert_publication(col, p2)
    all_pubs = _all_pubs_from_fake(col)
    res = _match_publications(all_pubs)
    assert len(res) == 2


# ─── 빈 참조 방어 (Build-6/7 버그 수정) ─────────────────

def test_empty_ref_info_new_record():
    """빈 참조로 신규 생성 → 레코드는 만들되 referenced_by 빈 배열"""
    col = FakeCollection()
    payload = _pub_payload()
    payload["reference_info"] = {
        "outline_type": "", "outline_num": "",
        "version": "", "point_num": "",
        "outline_title": "", "subtopic_title": "", "point_text": "",
    }
    res = _upsert_publication(col, payload)
    assert res["action"] == "created"
    refs = json.loads(col.store[res["id"]]["meta"]["referenced_by_json"])
    assert refs == []


def test_empty_ref_info_existing_record():
    """기존 레코드에 빈 참조 재호출 → 기존 배열 유지, action=no_ref_change"""
    col = FakeCollection()
    r1 = _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    before = json.loads(col.store[r1["id"]]["meta"]["referenced_by_json"])

    empty_payload = _pub_payload()
    empty_payload["reference_info"] = {
        "outline_type": "", "outline_num": "",
        "version": "", "point_num": "",
    }
    r2 = _upsert_publication(col, empty_payload)
    assert r2["action"] == "no_ref_change"
    after = json.loads(col.store[r2["id"]]["meta"]["referenced_by_json"])
    assert after == before
    assert len(after) == 1


def test_meaningful_then_empty_keeps_length():
    """의미 있는 참조 생성 → 빈 참조 호출 → 길이 1 유지"""
    col = FakeCollection()
    r1 = _upsert_publication(col, _pub_payload(point_num="1.1.1"))
    pub_id = r1["id"]

    empty = _pub_payload()
    empty["reference_info"] = {"outline_type": "", "outline_num": "", "point_num": ""}
    _upsert_publication(col, empty)
    refs = json.loads(col.store[pub_id]["meta"]["referenced_by_json"])
    assert len(refs) == 1
    assert refs[0]["point_num"] == "1.1.1"


def test_meaningful_ref_by_title_only():
    """outline_type/num/point_num 모두 빈값이어도 outline_title만 있으면 유효"""
    col = FakeCollection()
    payload = _pub_payload()
    payload["reference_info"] = {
        "outline_type": "", "outline_num": "",
        "version": "", "point_num": "",
        "outline_title": "테스트 주제", "subtopic_title": "", "point_text": "",
    }
    res = _upsert_publication(col, payload)
    assert res["action"] == "created"
    refs = json.loads(col.store[res["id"]]["meta"]["referenced_by_json"])
    assert len(refs) == 1
    assert refs[0]["outline_title"] == "테스트 주제"


def test_meaningful_ref_by_point_text():
    """point_text만 있고 나머지 전부 빈값이어도 유효"""
    col = FakeCollection()
    payload = _pub_payload()
    payload["reference_info"] = {
        "outline_type": "", "outline_num": "",
        "version": "", "point_num": "",
        "outline_title": "", "subtopic_title": "", "point_text": "요점 내용",
    }
    res = _upsert_publication(col, payload)
    assert res["action"] == "created"
    refs = json.loads(col.store[res["id"]]["meta"]["referenced_by_json"])
    assert len(refs) == 1
    assert refs[0]["point_text"] == "요점 내용"
