"""ChromaDB 연결, 임베딩, BM25, 하이브리드 검색"""
import re
import requests
from rank_bm25 import BM25Okapi
from config import DB_PATH, OLLAMA_URL, EMBED_MODEL
import chromadb
from services.wol import _load_wol_filters, _DEFAULT_WOL_SUFFIXES, _clean_wol_query


def get_db():
    return chromadb.HttpClient(host="localhost", port=8000)


def get_embedding(text: str) -> list:
    resp = requests.post(f"{OLLAMA_URL}/api/embeddings", json={"model": EMBED_MODEL, "prompt": text})
    resp.raise_for_status()
    return resp.json()["embedding"]


def _dedup_body(text):
    """중복 제거용: 메타데이터 제거 후 본문 200자 추출"""
    lines = (text or "").split('\n')
    body_parts = []
    for l in lines:
        if l.startswith('[연설내용_전체] '):
            body_parts.append(l[10:])
        elif not l.startswith('[') and l.strip():
            body_parts.append(l)
    body = ''.join(body_parts)
    body = re.sub(r'[\u200b\u200c\u200d\u2060\ufeff\xa0\s]+', '', body)
    return body[:200]


# ─── 하이브리드 검색 ─────────────────────────────────────

_bm25_cache = {}

def _clean_token(token: str) -> str:
    """개별 토큰에서 접미사 제거 (문서/쿼리 양쪽 정규화용)."""
    suffixes = _load_wol_filters().get("suffixes", _DEFAULT_WOL_SUFFIXES)
    for sfx in suffixes:
        if token.endswith(sfx) and len(token) > len(sfx):
            return token[:-len(sfx)]
    return token

def get_bm25_index(client, collection_name):
    """컬렉션의 BM25 인덱스 생성 (캐시)"""
    if collection_name in _bm25_cache:
        return _bm25_cache[collection_name]

    try:
        col = client.get_collection(collection_name)
        all_docs = col.get(include=["documents", "metadatas"])

        ids = all_docs["ids"]
        docs = all_docs["documents"]
        metas = all_docs["metadatas"]

        if not docs:
            return None

        # 한국어 토큰화 + 접미사 정규화
        tokenized = [
            [_clean_token(t) for t in re.findall(r'[\w]+', doc)]
            for doc in docs
        ]

        bm25 = BM25Okapi(tokenized)
        _bm25_cache[collection_name] = {
            "bm25": bm25,
            "ids": ids,
            "docs": docs,
            "metas": metas,
        }
        return _bm25_cache[collection_name]
    except Exception as e:
        print(f"BM25 인덱스 생성 오류 ({collection_name}): {e}")
        return None


def search_collection(client, collection_name, query_embedding, top_k=10):
    """의미 검색 (ChromaDB)"""
    try:
        col = client.get_collection(collection_name)
        results = col.query(query_embeddings=[query_embedding], n_results=top_k, include=["documents", "metadatas", "distances"])
        items = []
        if results and results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                meta = results["metadatas"][0][i] if results["metadatas"] else {}
                distance = results["distances"][0][i] if results["distances"] else 0
                score = max(0, 1 - distance / 2)
                items.append({
                    "id": doc_id,
                    "collection": collection_name,
                    "text": results["documents"][0][i] if results["documents"] else "",
                    "metadata": meta,
                    "score": round(score, 3),
                })
        return items
    except Exception as e:
        print(f"컬렉션 {collection_name} 검색 오류: {e}")
        return []


def hybrid_search(client, collection_name, query_text, query_embedding, top_k=10, rrf_k=60):
    """하이브리드 검색: ChromaDB(의미) + BM25(키워드) + RRF 융합
    
    RRF_score = 1/(k + semantic_rank) + 1/(k + bm25_rank)
    - k=60: 표준값, 두 검색의 균형
    - 양쪽 모두 상위에 있으면 높은 점수
    - 한쪽에만 있어도 결과에 포함
    """

    # 1. 의미 검색 (ChromaDB)
    semantic_results = search_collection(client, collection_name, query_embedding, top_k=top_k)
    semantic_rank = {item["id"]: rank for rank, item in enumerate(semantic_results)}
    semantic_map = {item["id"]: item for item in semantic_results}

    # 2. 키워드 검색 (BM25)
    index = get_bm25_index(client, collection_name)
    if not index:
        return semantic_results

    try:
        # BM25는 클리닝된 쿼리로 토큰화 (의미검색은 이미 임베딩으로 처리됨)
        cleaned_query = _clean_wol_query(query_text)
        query_tokens = [_clean_token(t) for t in re.findall(r'[\w]+', cleaned_query)]
        query_tokens = [t for t in query_tokens if t]
        if not query_tokens:
            return semantic_results

        bm25_scores = index["bm25"].get_scores(query_tokens)
        scored = sorted(enumerate(bm25_scores), key=lambda x: x[1], reverse=True)[:top_k]

        bm25_rank = {}
        bm25_map = {}
        for rank, (idx, score) in enumerate(scored):
            if score <= 0:
                continue
            doc_id = index["ids"][idx]
            bm25_rank[doc_id] = rank
            bm25_map[doc_id] = {
                "id": doc_id,
                "collection": collection_name,
                "text": index["docs"][idx],
                "metadata": index["metas"][idx],
                "score": 0,
            }
    except Exception as e:
        print(f"BM25 검색 오류 ({collection_name}): {e}")
        return semantic_results

    # 3. RRF 융합
    all_ids = set(semantic_rank.keys()) | set(bm25_rank.keys())
    rrf_scores = {}

    for doc_id in all_ids:
        score = 0
        if doc_id in semantic_rank:
            score += 1.0 / (rrf_k + semantic_rank[doc_id])
        if doc_id in bm25_rank:
            score += 1.0 / (rrf_k + bm25_rank[doc_id])
        rrf_scores[doc_id] = score

    # 4. RRF 점수로 정렬
    sorted_ids = sorted(rrf_scores.keys(), key=lambda x: rrf_scores[x], reverse=True)[:top_k]

    results = []
    for doc_id in sorted_ids:
        item = semantic_map.get(doc_id) or bm25_map.get(doc_id)
        if item:
            item = dict(item)
            item["score"] = round(rrf_scores[doc_id], 4)
            # 검색 출처 표시
            sources = []
            if doc_id in semantic_rank:
                sources.append(f"의미#{semantic_rank[doc_id]+1}")
            if doc_id in bm25_rank:
                sources.append(f"키워드#{bm25_rank[doc_id]+1}")
            item["metadata"] = dict(item.get("metadata") or {})
            item["metadata"]["search_source"] = " + ".join(sources)
            results.append(item)

    return results
