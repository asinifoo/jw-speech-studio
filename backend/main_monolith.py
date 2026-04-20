"""
JW 연설 준비 도우미 - FastAPI 백엔드 v7
변경: 전처리 시스템 재구현 (3개 저장소 완전 분리, outline_* 메타데이터)
"""

import os
import re
import json
import time
import hashlib
import threading
from typing import Optional
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chromadb
import requests
from rank_bm25 import BM25Okapi
from urllib.parse import quote_plus, urljoin

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False
    print("⚠️ beautifulsoup4 미설치 — WOL 검색 비활성 (pip install beautifulsoup4 lxml)")

DB_PATH = os.environ.get("JW_DB_PATH", os.path.expanduser("~/jw-system/db"))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = "bge-m3"
LLM_MODEL = os.environ.get("JW_LLM_MODEL", "gemma4:26b")

# API 키 & 설정: .env → config 파일 → 런타임
_CONFIG_PATH = os.path.join(os.path.expanduser("~/jw-system"), "api_keys.json")

import threading
_config_lock = threading.Lock()

def _load_config_keys():
    """config 파일에서 설정 로드"""
    try:
        with open(_CONFIG_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_config_keys(keys: dict):
    """config 파일에 API 키 저장 (자동 백업, 잠금)"""
    with _config_lock:
        os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)
        if os.path.exists(_CONFIG_PATH):
            import shutil
            shutil.copy2(_CONFIG_PATH, _CONFIG_PATH + ".bak")
        with open(_CONFIG_PATH, "w") as f:
            json.dump(keys, f, indent=2, ensure_ascii=False)

_config_keys = _load_config_keys()

# env가 있으면 env 우선, 없으면 config 파일
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "") or _config_keys.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_API_VERSION = _config_keys.get("ANTHROPIC_API_VERSION", "2023-06-01")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or _config_keys.get("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "") or _config_keys.get("OPENAI_API_KEY", "")
FILTER_MODEL = os.environ.get("JW_FILTER_MODEL", "") or _config_keys.get("FILTER_MODEL", "") or LLM_MODEL
PASSWORD_HASH = _config_keys.get("PASSWORD_HASH", "") or os.environ.get("JW_PASSWORD_HASH", "")

app = FastAPI(title="JW 연설 준비 도우미 API v6")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 스트리밍 중단 플래그
_abort_event = threading.Event()

@app.post("/api/abort")
def abort_generation():
    """현재 진행 중인 스트리밍 생성을 중단"""
    _abort_event.set()
    return {"status": "중단 요청됨"}


def get_db():
    return chromadb.HttpClient(host="localhost", port=8000)


def get_embedding(text: str) -> list:
    resp = requests.post(f"{OLLAMA_URL}/api/embeddings", json={"model": EMBED_MODEL, "prompt": text})
    resp.raise_for_status()
    return resp.json()["embedding"]


OLLAMA_FILTER_CTX = int(os.environ.get("JW_OLLAMA_FILTER_CTX", "") or _config_keys.get("OLLAMA_FILTER_CTX", 0) or 4096)
OLLAMA_GEN_CTX = int(os.environ.get("JW_OLLAMA_GEN_CTX", "") or _config_keys.get("OLLAMA_GEN_CTX", 0) or 16384)
OLLAMA_CHAT_CTX = int(os.environ.get("JW_OLLAMA_CHAT_CTX", "") or _config_keys.get("OLLAMA_CHAT_CTX", 0) or 16384)
OLLAMA_FILTER_NOTHINK = _config_keys.get("OLLAMA_FILTER_NOTHINK", True)
OLLAMA_GEN_NOTHINK = _config_keys.get("OLLAMA_GEN_NOTHINK", True)
OLLAMA_CHAT_NOTHINK = _config_keys.get("OLLAMA_CHAT_NOTHINK", True)
CHAT_MAX_TURNS = int(_config_keys.get("CHAT_MAX_TURNS", 0) or 10)
CHAT_SEARCH_TOP_K = int(_config_keys.get("CHAT_SEARCH_TOP_K", 0) or 10)

# 프롬프트 템플릿 (Manage에서 수정 가능)
_DEFAULT_PROMPTS = {
    "speech": """- 자연스러운 구어체로 작성
- 성구를 적절히 인용하고 설명
- 청중에게 질문을 던지며 참여 유도
- 도입 → 본문 (요점별) → 결론 구조
- 실용적 적용점 포함
- **연설 전체 방향** 자료가 있으면 연설의 전체적인 줄기와 흐름을 잡는 데 반영하세요
- **[우선 참고 자료]**가 있는 요점은 해당 자료의 내용을 핵심적으로 반영하세요
- **추가 자료**가 있으면 해당 내용도 우선적으로 참고하여 연설문에 반영하세요
- **부가 요점**(L2~L5)은 해당 주요점(L1)을 뒷받침하는 내용이므로, 주요점 안에서 계층에 맞게 자연스럽게 다뤄주세요. L2는 세부 설명, L3은 추가 설명, L4~L5는 보충/참고 수준입니다""",
    "service_meeting": """1. **서론**: 구역의 특성이나 봉사에서 만날 수 있는 상황으로 시작하세요
2. **성구 토의**: 핵심 성구를 낭독하고, 청중에게 질문하며 토의하세요
3. **실용적 제안**: 어떤 서론을 사용할 수 있는지, 어떤 출판물이 도움이 되는지 구체적으로 제안하세요
4. **질문-답변 형식**: 청중의 참여를 이끌어내는 질문을 중간중간 넣으세요
5. **마무리**: 오늘 살펴본 점을 요약하고 봉사에 적용하도록 격려하세요
6. **과거 봉사 모임이 참고로 제공된 경우**: 사회 스타일과 구조를 참고하되, 내용은 새로운 주제에 맞게 작성하세요
7. 자연스러운 대화체로 작성하세요
8. 5~7분 분량으로 작성하세요""",
    "visit": """1. **도입**: 방문 대상자의 근황에 관심을 보이며 따뜻하게 시작하세요
2. **격려의 말씀**: 대상자의 상황(연령대, 고려한 상황)에 맞는 공감과 이해를 표현하세요
3. **성구 적용**: 핵심 성구를 자연스럽게 소개하고, 대상자의 상황에 구체적으로 적용하세요
4. **실용적 격려**: 대상자가 이미 잘하고 있는 점을 칭찬하고, 여호와께서 그 노력을 보고 계심을 확신시키세요
5. **마무리**: 여호와의 사랑과 지원을 확신시키며 따뜻하게 마무리하세요
6. **과거 방문이 참고로 제공된 경우**: 대화 스타일과 구조를 참고하되, 내용은 새로운 상황에 맞게 작성하세요
7. 자연스럽고 따뜻한 대화체로 작성하세요 (이름 대신 '이 자매/형제'로 지칭)
8. 5~10분 분량으로 작성하세요""",
    "refine": """- 연설문의 전체 구조와 핵심 내용은 유지하세요
- 성구 인용은 정확하게 유지하세요
- 지시사항에 따라 수정하되, 원문의 의도를 존중하세요
- 자연스러운 구어체를 유지하세요""",
}
PROMPT_TEMPLATES = {k: _config_keys.get(f"PROMPT_{k.upper()}", v) for k, v in _DEFAULT_PROMPTS.items()}

def query_ollama(prompt: str, system: str = "", model_name: str = "", no_think: bool = False, ctx: int = 0) -> str:
    model = model_name or LLM_MODEL
    num_ctx = ctx or OLLAMA_GEN_CTX
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": model, "messages": messages, "stream": False,
            "think": not no_think,
            "options": {"num_ctx": num_ctx},
        })
        if resp.status_code == 404:
            raise Exception(f"로컬 모델 '{model}'이(가) 설치되지 않았습니다. Manage → AI 관리에서 pull 버튼으로 설치하세요.")
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except requests.exceptions.ConnectionError:
        raise Exception(f"Ollama 서버에 연결할 수 없습니다 ({OLLAMA_URL}). Ollama가 실행 중인지 확인하세요.")


class ParseRequest(BaseModel):
    text: str
    has_separate_title: bool = False

class SearchRequest(BaseModel):
    points: list[dict]
    top_k: int = 10

class FilterRequest(BaseModel):
    points: list[dict]

class GenerateRequest(BaseModel):
    password: str
    title: str
    duration: str
    points: list[dict]
    extra_materials: str = ""
    model: str = ""
    no_think: bool = False


# ─── 성경 매핑 ───────────────────────────────────────────

BOOK_TO_ABBR = {
    # 히브리어 성경
    '창세기': '창', '창세': '창', '창': '창',
    '출애굽기': '출', '출애굽': '출', '탈출기': '출', '출': '출',
    '레위기': '레', '레위': '레', '레': '레',
    '민수기': '민', '민수': '민', '민': '민',
    '신명기': '신', '신명': '신', '신': '신',
    '여호수아': '수', '여호수아기': '수', '수': '수',
    '사사기': '삿', '사사': '삿', '재판관기': '삿', '판': '삿', '삿': '삿',
    '룻기': '룻', '룻': '룻',
    '사무엘상': '삼상', '사무엘 상': '삼상', '사무엘첫째': '삼상', '사무엘 첫째': '삼상', '삼첫': '삼상', '삼상': '삼상',
    '사무엘하': '삼하', '사무엘 하': '삼하', '사무엘둘째': '삼하', '사무엘 둘째': '삼하', '삼둘': '삼하', '삼하': '삼하',
    '열왕기상': '왕상', '열왕기 상': '왕상', '열왕첫째': '왕상', '열왕기 첫째': '왕상', '열왕기첫째': '왕상', '왕첫': '왕상', '왕상': '왕상',
    '열왕기하': '왕하', '열왕기 하': '왕하', '열왕둘째': '왕하', '열왕기 둘째': '왕하', '열왕기둘째': '왕하', '왕둘': '왕하', '왕하': '왕하',
    '역대기상': '대상', '역대기 상': '대상', '역대첫째': '대상', '역대기 첫째': '대상', '역대기첫째': '대상', '대첫': '대상', '대상': '대상',
    '역대기하': '대하', '역대기 하': '대하', '역대둘째': '대하', '역대기 둘째': '대하', '역대기둘째': '대하', '대둘': '대하', '대하': '대하',
    '에스라': '라', '에스라기': '라', '라': '라', '스': '라',
    '느헤미야': '느', '느헤미야기': '느', '느': '느',
    '에스더': '더', '에스더기': '더', '더': '더',
    '욥기': '욥', '욥': '욥',
    '시편': '시', '시': '시',
    '잠언': '잠', '잠': '잠',
    '전도서': '전', '전도': '전', '전': '전',
    '솔로몬의노래': '아', '솔로몬의 노래': '아', '아가': '아', '아': '아',
    '이사야': '사', '이사야서': '사', '사': '사',
    '예레미야': '렘', '예레미야서': '렘', '렘': '렘',
    '예레미야애가': '애', '예레미야 애가': '애', '애가': '애', '애': '애',
    '에스겔': '겔', '에스겔서': '겔', '겔': '겔',
    '다니엘': '단', '다니엘서': '단', '단': '단',
    '호세아': '호', '호세아서': '호', '호': '호',
    '요엘': '욜', '요엘서': '욜', '욜': '욜',
    '아모스': '암', '아모스서': '암', '암': '암',
    '오바댜': '옵', '오바댜서': '옵', '옵': '옵',
    '요나': '욘', '요나서': '욘', '욘': '욘',
    '미가': '미', '미가서': '미', '미': '미',
    '나훔': '나', '나훔서': '나', '나': '나',
    '하박국': '합', '하박국서': '합', '합': '합',
    '스바냐': '습', '스바냐서': '습', '습': '습',
    '학개': '학', '학개서': '학', '학': '학',
    '스가랴': '슥', '스가랴서': '슥', '슥': '슥',
    '말라기': '말', '말라기서': '말', '말': '말',
    # 그리스어 성경
    '마태복음': '마', '마태': '마', '마': '마',
    '마가복음': '막', '마가': '막', '막': '막',
    '누가복음': '눅', '누가': '눅', '눅': '눅',
    '요한복음': '요', '요한': '요', '요': '요',
    '사도행전': '행', '사도': '행', '행': '행',
    '로마서': '롬', '로마': '롬', '롬': '롬',
    '고린도전서': '고전', '고린도 전서': '고전', '고린도첫째': '고전', '고린도 첫째': '고전', '고첫': '고전', '고전': '고전',
    '고린도후서': '고후', '고린도 후서': '고후', '고린도둘째': '고후', '고린도 둘째': '고후', '고둘': '고후', '고후': '고후',
    '갈라디아서': '갈', '갈라디아': '갈', '갈': '갈',
    '에베소서': '엡', '에베소': '엡', '엡': '엡',
    '빌립보서': '빌', '빌립보': '빌', '빌': '빌',
    '골로새서': '골', '골로새': '골', '골': '골',
    '데살로니가전서': '살전', '데살로니가 전서': '살전', '데살로니가첫째': '살전', '데살로니가 첫째': '살전', '데첫': '살전', '살전': '살전',
    '데살로니가후서': '살후', '데살로니가 후서': '살후', '데살로니가둘째': '살후', '데살로니가 둘째': '살후', '데둘': '살후', '살후': '살후',
    '디모데전서': '딤전', '디모데 전서': '딤전', '디모데첫째': '딤전', '디모데 첫째': '딤전', '디첫': '딤전', '딤전': '딤전',
    '디모데후서': '딤후', '디모데 후서': '딤후', '디모데둘째': '딤후', '디모데 둘째': '딤후', '디둘': '딤후', '딤후': '딤후',
    '디도서': '딛', '디도': '딛', '딛': '딛',
    '빌레몬서': '몬', '빌레몬': '몬', '몬': '몬',
    '히브리서': '히', '히브리': '히', '히': '히',
    '야고보서': '약', '야고보': '약', '약': '약',
    '베드로전서': '벧전', '베드로 전서': '벧전', '베드로첫째': '벧전', '베드로 첫째': '벧전', '베첫': '벧전', '벧전': '벧전',
    '베드로후서': '벧후', '베드로 후서': '벧후', '베드로둘째': '벧후', '베드로 둘째': '벧후', '베둘': '벧후', '벧후': '벧후',
    '요한1서': '요1', '요한 1서': '요1', '요한일서': '요1', '요한첫째': '요1', '요한 첫째': '요1', '요첫': '요1', '요1': '요1',
    '요한2서': '요2', '요한 2서': '요2', '요한이서': '요2', '요한둘째': '요2', '요한 둘째': '요2', '요둘': '요2', '요2': '요2',
    '요한3서': '요3', '요한 3서': '요3', '요한삼서': '요3', '요한셋째': '요3', '요한 셋째': '요3', '요셋': '요3', '요3': '요3',
    '유다서': '유', '유다': '유', '유': '유',
    '요한계시록': '계', '요한 계시록': '계', '계시록': '계', '계시': '계', '계': '계',
}


def normalize_book_name(book: str) -> str:
    """책 이름을 DB 약어로 변환"""
    return BOOK_TO_ABBR.get(book.strip(), book.strip())


# 1장만 있는 성경 (약호 기준)
_SINGLE_CHAPTER_BOOKS = {'옵', '몬', '요2', '요3', '유'}


def extract_scriptures_from_text(text):
    found = []
    for full_name, abbr in BOOK_TO_ABBR.items():
        # 일반 형식: "책 장:절"
        pattern = r'(?<![가-힣\d])' + re.escape(full_name) + r'\s+(\d+):(\d+(?:\s*[-,]\s*\d+)*)'
        for m in re.finditer(pattern, text):
            ref = f"{abbr} {m.group(1)}:{m.group(2).replace(' ', '')}"
            if ref not in found:
                found.append(ref)
        # 단장 성경: "책 절" (장 없이)
        if abbr in _SINGLE_CHAPTER_BOOKS:
            pattern2 = r'(?<![가-힣\d])' + re.escape(full_name) + r'\s+(\d+(?:\s*[-,]\s*\d+)*)\b'
            for m in re.finditer(pattern2, text):
                verse = m.group(1).replace(' ', '')
                ref = f"{abbr} 1:{verse}"
                if ref not in found:
                    found.append(ref)
    return found


def expand_scripture_refs(ref_str: str) -> list[str]:
    ref_str = ref_str.strip()
    if not ref_str:
        return []

    # 1) 일반 형식: "책 장:절"
    m = re.match(r'^(.+?)\s+(\d+):(.+)$', ref_str)
    if m:
        book = normalize_book_name(m.group(1))
        chapter = m.group(2)
        verse_part = m.group(3).strip()

        # 단장 성경은 항상 1장 (잘못된 장 번호 자동 보정)
        if book in _SINGLE_CHAPTER_BOOKS:
            chapter = "1"

        results = []
        parts = [p.strip() for p in verse_part.split(',')]
        for part in parts:
            range_m = re.match(r'^(\d+)\s*-\s*(\d+)$', part)
            if range_m:
                for v in range(int(range_m.group(1)), int(range_m.group(2)) + 1):
                    results.append(f"{book} {chapter}:{v}")
            else:
                results.append(f"{book} {chapter}:{part}")
        return results

    # 2) 단장 성경 형식: "책 절" (장 없이 절만 — 옵, 몬, 요2, 요3, 유)
    m2 = re.match(r'^(.+?)\s+(\d+(?:\s*[-,]\s*\d+)*)$', ref_str)
    if m2:
        book = normalize_book_name(m2.group(1))
        if book in _SINGLE_CHAPTER_BOOKS:
            verse_part = m2.group(2).strip()
            results = []
            parts = [p.strip() for p in verse_part.split(',')]
            for part in parts:
                range_m = re.match(r'^(\d+)\s*-\s*(\d+)$', part)
                if range_m:
                    for v in range(int(range_m.group(1)), int(range_m.group(2)) + 1):
                        results.append(f"{book} 1:{v}")
                else:
                    results.append(f"{book} 1:{part}")
            return results

    return [ref_str]


def get_verse_text(scripture_ref: str, client) -> Optional[str]:
    try:
        bible = client.get_collection("jw_ai")
        results = bible.get(where={"참조": scripture_ref}, include=["documents"])
        if results and results["documents"]:
            return results["documents"][0]
    except Exception:
        pass
    try:
        emb = get_embedding(scripture_ref)
        bible = client.get_collection("jw_ai")
        results = bible.query(query_embeddings=[emb], n_results=3, include=["documents", "metadatas"])
        if results and results["documents"] and results["documents"][0]:
            return results["documents"][0][0]
    except Exception:
        pass
    return None


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
    suffixes = _wol_filters.get("suffixes", _DEFAULT_WOL_SUFFIXES)
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
            item["metadata"] = dict(item.get("metadata", {}))
            item["metadata"]["search_source"] = " + ".join(sources)
            results.append(item)

    return results


# ─── WOL 검색 (wol.jw.org) ────────────────────────────────

WOL_BASE = "https://wol.jw.org"
WOL_SEARCH_URL = f"{WOL_BASE}/ko/wol/s/r8/lp-ko"
WOL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ko-KR,ko;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_WOL_FILTERS_PATH = os.path.join(os.path.expanduser("~/jw-system"), "wol_filters.json")
_WOL_FILTERS_USER_DEFAULT_PATH = os.path.join(os.path.expanduser("~/jw-system"), "wol_filters_default.json")

_DEFAULT_WOL_SUFFIXES = [
    '께서는', '께서도', '께서',
    '에게서는', '에게서', '에게는', '에게도', '에게',
    '셨습니다', '었습니다', '았습니다', '겠습니다', '습니다',
    '셨어요', '었어요', '았어요', '겠어요',
    '하셨다', '셨다', '었다', '았다', '겠다',
    '하셨고', '셨고', '었고', '았고',
    '하셨는데', '셨는데', '었는데', '았는데',
    '하셨지만', '셨지만', '었지만', '았지만',
    '하십니다', '십니다', '시는', '시다', '시고',
    '합니다', '니다',
    '하는', '하는지', '하나요', '하며', '하고',
    '인가요', '인가', '인지',
    '일까요', '일까', '입니까',
    '이란', '란', '이라', '라는',
    '이에요', '에요', '이다', '입니다',
    '인데', '인데요',
    '에서는', '에서', '에는',
    '으로', '로서', '로써', '로',
    '이는', '는', '은',
    '이가', '가', '이', '을', '를',
    '의', '에', '도', '만', '까지',
    '부터', '처럼', '같은',
    '대해', '대한', '관한', '관해',
    '히', '으로써', '으로서',
    '무엇인가', '무엇인지', '무엇일까',
    '뭔가요', '뭘까요', '뭐예요',
]

_DEFAULT_WOL_STOPWORDS = [
    '무엇', '뭐', '뭐예요', '뭔가', '뭘까',
    '어떻게', '왜', '어디', '언제', '어떤',
    '대해', '대한', '관해', '관한',
    '알려줘', '알려주세요', '설명해줘', '설명해주세요',
    '해줘', '해주세요', '보여줘', '보여주세요', '말해줘',
    '좀', '것', '수',
]

def _load_wol_filters() -> dict:
    """WOL 필터 설정 로드. 파일 없으면 기본값으로 생성."""
    try:
        with open(_WOL_FILTERS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "suffixes": data.get("suffixes", _DEFAULT_WOL_SUFFIXES),
            "stopwords": data.get("stopwords", _DEFAULT_WOL_STOPWORDS),
        }
    except (FileNotFoundError, json.JSONDecodeError):
        filters = {"suffixes": _DEFAULT_WOL_SUFFIXES, "stopwords": _DEFAULT_WOL_STOPWORDS}
        _save_wol_filters(filters)
        return filters

def _save_wol_filters(filters: dict):
    os.makedirs(os.path.dirname(_WOL_FILTERS_PATH), exist_ok=True)
    with open(_WOL_FILTERS_PATH, "w", encoding="utf-8") as f:
        json.dump(filters, f, ensure_ascii=False, indent=2)

# 시작 시 로드
_wol_filters = _load_wol_filters()


def _clean_wol_query(query: str) -> str:
    """WOL 검색용 쿼리 전처리: 부호·조사·어미·불용어 제거 → 핵심 키워드만."""
    q = re.sub(r"[?!.,;:'\"\u2018\u2019\u201c\u201d\xb7\u2026~()\[\]{}-]", ' ', query)

    suffixes = _wol_filters.get("suffixes", _DEFAULT_WOL_SUFFIXES)
    stopwords = set(_wol_filters.get("stopwords", _DEFAULT_WOL_STOPWORDS))

    tokens = q.split()
    cleaned = []
    for tok in tokens:
        t = tok.strip()
        if not t:
            continue
        for sfx in suffixes:
            if t.endswith(sfx) and len(t) > len(sfx):
                t = t[:-len(sfx)]
                break
        if t and t not in stopwords:
            cleaned.append(t)

    result = ' '.join(cleaned).strip()
    return result if result else re.sub(r'[?!]', '', query).strip()


# WOL 기사 캐시 (URL → 본문 텍스트)
_wol_article_cache = {}
_WOL_ARTICLE_CACHE_MAX = 100


def search_wol(query: str, max_results: int = 10) -> list[dict]:
    """wol.jw.org에서 검색하여 결과 목록 반환.
    
    Returns: [{"title": str, "snippet": str, "url": str, "pub_title": str, "collection": "wol"}]
    """
    if not _HAS_BS4:
        return []

    clean_q = _clean_wol_query(query)
    print(f"WOL 검색 쿼리: '{query}' → '{clean_q}'")

    try:
        resp = requests.get(
            WOL_SEARCH_URL,
            params={"q": clean_q, "p": "1", "r": "occ"},
            headers=WOL_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"WOL 검색 네트워크 오류: {e}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    items = []

    # 검색 결과 파싱 — 여러 가능한 CSS 셀렉터 시도
    result_elems = (
        soup.select("ul.results li") or
        soup.select(".resultItems .searchItem") or
        soup.select("#searchResults .result") or
        soup.select("ul.directory li")
    )

    if not result_elems:
        # 대체: article 내부 .syn-body 등
        result_elems = soup.select("article") or soup.select(".cardTitleBlock")

    for elem in result_elems[:max_results]:
        try:
            # 제목 추출
            title_el = (
                elem.select_one(".cardTitleBlock .title") or
                elem.select_one("h3 a") or
                elem.select_one("h2 a") or
                elem.select_one("a.lnk") or
                elem.select_one("a")
            )
            title = title_el.get_text(strip=True) if title_el else ""

            # 링크 추출
            link_el = (
                elem.select_one("a.lnk") or
                elem.select_one("h3 a") or
                elem.select_one("h2 a") or
                elem.select_one("a[href*='/d/']") or
                elem.select_one("a")
            )
            href = link_el.get("href", "") if link_el else ""
            if href and not href.startswith("http"):
                href = urljoin(WOL_BASE, href)

            # URL 정규화: /bc/(성구참조), /it/(색인) 등 → /d/(기사)로 변환 시도
            if href:
                bc_match = re.search(r'/(?:bc|it|nwtsty)/r(\d+)/lp-([^/]+)/(\d+)', href)
                if bc_match:
                    r, lp, doc_id = bc_match.groups()
                    href = f"{WOL_BASE}/{lp[:2]}/wol/d/r{r}/lp-{lp}/{doc_id}"
                elif '/wol/s/' in href or '/wol/l/' in href:
                    href = ""  # 검색/목록 페이지는 제외

            # 본문 스니펫
            snippet_el = (
                elem.select_one(".synopsis") or
                elem.select_one(".cardLine2") or
                elem.select_one(".desc") or
                elem.select_one("p")
            )
            snippet = snippet_el.get_text(strip=True) if snippet_el else ""

            # 출판물명
            pub_el = (
                elem.select_one(".cardLine1") or
                elem.select_one(".publication") or
                elem.select_one(".source")
            )
            pub_title = pub_el.get_text(strip=True) if pub_el else ""

            if not title and not snippet:
                continue

            items.append({
                "title": title[:200],
                "snippet": snippet[:600],
                "url": href,
                "pub_title": pub_title[:100],
                "collection": "wol",
            })
        except Exception:
            continue

    # 중복 제거 (URL + 스니펫 기준)
    seen_urls = set()
    seen_snippets = set()
    deduped = []
    for item in items:
        url = item.get("url", "")
        snippet_key = item.get("snippet", "")[:100] or item.get("title", "")

        # 같은 URL이면 중복
        if url and url in seen_urls:
            continue
        # 같은 스니펫이면 중복
        if snippet_key and snippet_key in seen_snippets:
            continue

        if url:
            seen_urls.add(url)
        if snippet_key:
            seen_snippets.add(snippet_key)
        deduped.append(item)

    return deduped


def fetch_wol_article(url: str, max_chars: int = 2000) -> str:
    """WOL 기사 URL에서 본문 텍스트를 가져온다 (캐시 적용)."""
    if not _HAS_BS4 or not url:
        return ""

    # 캐시 확인
    if url in _wol_article_cache:
        return _wol_article_cache[url][:max_chars]

    try:
        resp = requests.get(url, headers=WOL_HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        article = (
            soup.select_one("article") or
            soup.select_one("#article") or
            soup.select_one(".docClass-40, .docClass-68, .docClass-52") or
            soup.select_one("#content")
        )
        if article:
            for tag in article.select(".footnote, .figcaption, script, style, .alternatePresentation"):
                tag.decompose()
            # 블록 태그 앞에만 줄바꿈 삽입 (인라인 태그는 공백으로 연결)
            for br in article.find_all("br"):
                br.replace_with("\n")
            for block in article.find_all(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "tr"]):
                block.insert_before("\n")
            text = article.get_text(" ")
            # 정리: 다중 공백 → 단일 공백, 다중 줄바꿈 → 이중 줄바꿈
            text = re.sub(r'[^\S\n]+', ' ', text)       # 공백 정리 (줄바꿈 제외)
            text = re.sub(r'\n\s*\n+', '\n\n', text)    # 다중 줄바꿈 정리
            text = text.strip()
        else:
            text = soup.get_text(" ", strip=True)

        # 캐시 저장 (최대 크기 제한)
        if len(_wol_article_cache) >= _WOL_ARTICLE_CACHE_MAX:
            oldest = next(iter(_wol_article_cache))
            del _wol_article_cache[oldest]
        _wol_article_cache[url] = text

        return text[:max_chars]
    except Exception as e:
        print(f"WOL 기사 가져오기 오류: {e}")
        return ""


def wol_results_to_search_format(wol_items: list[dict]) -> list[dict]:
    """WOL 결과를 DB 검색 결과와 동일한 형식으로 변환."""
    results = []
    for i, item in enumerate(wol_items):
        text = item.get("snippet", "") or item.get("title", "")
        results.append({
            "id": f"wol_{i}",
            "collection": "wol",
            "text": text,
            "metadata": {
                "source": "WOL",
                "pub_title": item.get("pub_title", ""),
                "outline_title": item.get("title", ""),
                "wol_url": item.get("url", ""),
            },
            "score": round(0.035 * (1.0 - i * 0.05), 3),  # 순위 기반 점수
        })
    return results


# ─── 파싱 ────────────────────────────────────────────────

def parse_outline_text(text: str, has_separate_title: bool = False) -> dict:
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    if not lines:
        return {"title": "", "duration": "", "points": []}

    if has_separate_title:
        # 제목이 별도 입력됐으면 모든 줄을 요점으로 처리
        title = ""
        duration = ""
        point_lines = lines
    else:
        first_line = lines[0]
        duration = ""
        title = ""

        dur_match = re.search(r"\((\d+)\s*분\)", first_line)
        has_refs = re.search(r"\([^)]*(?:사|마|눅|요|창|출|레|민|신|삿|룻|삼|왕|대|라|느|더|욥|시|잠|전|아|렘|애|겔|단|호|욜|암|옵|욘|미|나|합|습|학|슥|말|막|행|롬|고|갈|엡|빌|골|살|딤|딛|몬|히|약|벧|유|계|「)\s", first_line)

        if dur_match and not has_refs:
            duration = dur_match.group(1) + "분"
            title = re.sub(r"\(\d+\s*분\)", "", first_line).strip()
            point_lines = lines[1:]
        elif not has_refs and len(lines) > 1:
            title = first_line
            point_lines = lines[1:]
        else:
            title = ""
            point_lines = lines

    points = []
    for raw_line in point_lines:
        line = raw_line.strip()
        if not line:
            continue

        # 레벨 감지: ---- = L5, --- = L4, -- = L3, - = L2, 없음 = L1
        dash_match = re.match(r'^(-{1,4})(.+)$', line)
        if dash_match:
            level = len(dash_match.group(1)) + 1  # - = L2, -- = L3, --- = L4, ---- = L5
            line = dash_match.group(2).strip()
        elif raw_line.startswith('  ') or raw_line.startswith('\t'):
            # 들여쓰기 호환 (스페이스 2개 = L2)
            level = 2
        else:
            level = 1

        refs_match = re.search(r"\(([^)]+)\)\s*$", line)
        scriptures = []
        publications = []
        point_text = line

        if refs_match:
            refs_str = refs_match.group(1)
            point_text = line[:refs_match.start()].strip()
            parts = re.split(r";\s*", refs_str)
            # 쉼표 뒤에 한글(책 이름)이 오면 분리: "사 65:13, 막 4:14" → ["사 65:13", "막 4:14"]
            expanded_parts = []
            for part in parts:
                sub = re.split(r",\s*(?=[가-힣])", part)
                expanded_parts.extend(sub)
            for part in expanded_parts:
                part = part.strip()
                if part.startswith("\u300c") or part.startswith("'"):
                    publications.append(part)
                else:
                    scriptures.append(part)

        body_refs = extract_scriptures_from_text(point_text)
        for br in body_refs:
            if br not in scriptures:
                scriptures.append(br)

        point_data = {"title": point_text, "scriptures": scriptures, "publications": publications, "level": level}

        if level >= 2 and points:
            if "sub_points" not in points[-1]:
                points[-1]["sub_points"] = []
            points[-1]["sub_points"].append(point_data)
        else:
            points.append(point_data)

    if not points:
        body_refs = extract_scriptures_from_text(title)
        points.append({"title": title, "scriptures": body_refs, "publications": []})

    return {"title": title, "duration": duration, "points": points}


# ─── API 엔드포인트 ──────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "db_path": DB_PATH, "llm_model": LLM_MODEL, "filter_model": FILTER_MODEL, "filter_ctx": OLLAMA_FILTER_CTX, "gen_ctx": OLLAMA_GEN_CTX, "chat_ctx": OLLAMA_CHAT_CTX, "filter_no_think": OLLAMA_FILTER_NOTHINK, "gen_no_think": OLLAMA_GEN_NOTHINK, "chat_no_think": OLLAMA_CHAT_NOTHINK, "chat_max_turns": CHAT_MAX_TURNS, "chat_search_top_k": CHAT_SEARCH_TOP_K, "search": "hybrid (semantic + BM25 + RRF)"}


@app.get("/api/ollama/models")
def ollama_models():
    """Ollama에 설치된 모델 목록"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        models = resp.json().get("models", [])
        return {"models": [{"name": m["name"], "size": m.get("size", 0)} for m in models]}
    except Exception as e:
        return {"models": [], "error": str(e)}


class OllamaPullRequest(BaseModel):
    model: str

@app.post("/api/ollama/pull")
def ollama_pull(req: OllamaPullRequest):
    """Ollama 모델 pull (SSE 스트리밍)"""
    def event_stream():
        try:
            resp = requests.post(f"{OLLAMA_URL}/api/pull",
                json={"name": req.model, "stream": True},
                timeout=600, stream=True)
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    status = data.get("status", "")
                    total = data.get("total", 0)
                    completed = data.get("completed", 0)
                    progress = int(completed / total * 100) if total > 0 else 0
                    yield f"data: {json.dumps({'status': status, 'progress': progress})}\n\n"
                    if status == "success":
                        yield f"data: {json.dumps({'status': 'done', 'progress': 100})}\n\n"
                except json.JSONDecodeError:
                    pass
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


class OllamaDeleteRequest(BaseModel):
    model: str

@app.post("/api/ollama/delete")
def ollama_delete(req: OllamaDeleteRequest):
    """Ollama 모델 삭제"""
    if req.model == EMBED_MODEL:
        raise HTTPException(status_code=400, detail=f"임베딩 모델 '{EMBED_MODEL}'은(는) 삭제할 수 없습니다")
    if req.model == FILTER_MODEL:
        raise HTTPException(status_code=400, detail=f"현재 LLM 필터 모델 '{FILTER_MODEL}'은(는) 사용 중이므로 삭제할 수 없습니다. 먼저 다른 모델로 변경하세요.")
    try:
        resp = requests.delete(f"{OLLAMA_URL}/api/delete", json={"name": req.model}, timeout=30)
        if resp.status_code == 404:
            raise HTTPException(status_code=404, detail=f"모델 '{req.model}'을(를) 찾을 수 없습니다")
        resp.raise_for_status()
        return {"status": f"'{req.model}' 삭제 완료"}
    except requests.exceptions.ConnectionError:
        raise HTTPException(status_code=500, detail="Ollama 서버에 연결할 수 없습니다")


@app.get("/api/settings/keys")
def get_api_keys():
    """API 키 상태 조회 (값은 마스킹)"""
    def mask(key):
        if not key:
            return ""
        if len(key) <= 8:
            return "***"
        return key[:4] + "..." + key[-4:]
    return {
        "GEMINI_API_KEY": mask(GEMINI_API_KEY),
        "ANTHROPIC_API_KEY": mask(ANTHROPIC_API_KEY),
        "OPENAI_API_KEY": mask(OPENAI_API_KEY),
    }


class SaveKeysRequest(BaseModel):
    password: str
    keys: dict  # {"GEMINI_API_KEY": "...", ...}

@app.post("/api/settings/keys")
def save_api_keys(req: SaveKeysRequest):
    """API 키 저장 (비밀번호 필요)"""
    global GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY
    _verify_password(req.password)

    existing = _load_config_keys()
    for k in ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]:
        if k in req.keys and req.keys[k] is not None:
            val = req.keys[k].strip()
            if val:
                existing[k] = val
            else:
                existing.pop(k, None)
    _save_config_keys(existing)

    # 런타임에도 즉시 반영
    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or existing.get("GEMINI_API_KEY", "")
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "") or existing.get("ANTHROPIC_API_KEY", "")
    OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "") or existing.get("OPENAI_API_KEY", "")

    return {"status": "저장 완료"}


class ChangePasswordRequest(BaseModel):
    current_password: str = ""
    new_password: str

@app.post("/api/settings/password")
def change_password(req: ChangePasswordRequest):
    """비밀번호 변경"""
    global PASSWORD_HASH

    # 비밀번호가 이미 설정된 경우 현재 비밀번호 확인
    if PASSWORD_HASH:
        if not req.current_password:
            raise HTTPException(status_code=400, detail="현재 비밀번호를 입력하세요")
        if hashlib.sha256(req.current_password.encode()).hexdigest() != PASSWORD_HASH:
            raise HTTPException(status_code=403, detail="현재 비밀번호가 올바르지 않습니다")

    if not req.new_password or len(req.new_password) < 4:
        raise HTTPException(status_code=400, detail="새 비밀번호는 4자 이상이어야 합니다")

    new_hash = hashlib.sha256(req.new_password.encode()).hexdigest()

    # config 파일에 저장
    existing = _load_config_keys()
    existing["PASSWORD_HASH"] = new_hash
    _save_config_keys(existing)

    # 런타임 반영
    PASSWORD_HASH = new_hash
    return {"status": "비밀번호가 변경되었습니다"}


@app.get("/api/settings/password-status")
def password_status():
    """비밀번호 설정 상태"""
    return {"has_password": bool(PASSWORD_HASH)}

@app.get("/api/settings/api-versions")
def get_api_versions():
    """API 버전 조회"""
    existing = _load_config_keys()
    return {"anthropic": existing.get("ANTHROPIC_API_VERSION", "2023-06-01")}

class ApiVersionsRequest(BaseModel):
    anthropic: str = ""

@app.post("/api/settings/api-versions")
def save_api_versions(req: ApiVersionsRequest):
    """API 버전 저장"""
    global ANTHROPIC_API_VERSION
    existing = _load_config_keys()
    if req.anthropic:
        existing["ANTHROPIC_API_VERSION"] = req.anthropic
        ANTHROPIC_API_VERSION = req.anthropic
    _save_config_keys(existing)
    return {"status": "저장 완료"}


@app.get("/api/settings/filter-model")
def get_filter_model():
    """LLM 필터 모델 조회"""
    return {"filter_model": FILTER_MODEL}


class SetFilterModelRequest(BaseModel):
    model: str

@app.post("/api/settings/filter-model")
def set_filter_model(req: SetFilterModelRequest):
    """LLM 필터 모델 변경"""
    global FILTER_MODEL
    FILTER_MODEL = req.model.strip() or LLM_MODEL
    existing = _load_config_keys()
    existing["FILTER_MODEL"] = FILTER_MODEL
    _save_config_keys(existing)
    return {"status": "변경 완료", "filter_model": FILTER_MODEL}


@app.get("/api/settings/ollama-ctx")
def get_ollama_ctx():
    return {"filter_ctx": OLLAMA_FILTER_CTX, "gen_ctx": OLLAMA_GEN_CTX, "chat_ctx": OLLAMA_CHAT_CTX}


class SetOllamaCtxRequest(BaseModel):
    ctx: int
    target: str = "filter"

@app.post("/api/settings/ollama-ctx")
def set_ollama_ctx(req: SetOllamaCtxRequest):
    global OLLAMA_FILTER_CTX, OLLAMA_GEN_CTX, OLLAMA_CHAT_CTX
    if req.ctx < 2048:
        raise HTTPException(status_code=400, detail="최소 2048 이상이어야 합니다")
    if req.ctx > 262144:
        raise HTTPException(status_code=400, detail="최대 262144 이하여야 합니다")
    existing = _load_config_keys()
    if req.target == "gen":
        OLLAMA_GEN_CTX = req.ctx
        existing["OLLAMA_GEN_CTX"] = OLLAMA_GEN_CTX
    elif req.target == "chat":
        OLLAMA_CHAT_CTX = req.ctx
        existing["OLLAMA_CHAT_CTX"] = OLLAMA_CHAT_CTX
    else:
        OLLAMA_FILTER_CTX = req.ctx
        existing["OLLAMA_FILTER_CTX"] = OLLAMA_FILTER_CTX
    _save_config_keys(existing)
    return {"status": "변경 완료", "filter_ctx": OLLAMA_FILTER_CTX, "gen_ctx": OLLAMA_GEN_CTX, "chat_ctx": OLLAMA_CHAT_CTX}


@app.get("/api/settings/chat-turns")
def get_chat_turns():
    return {"chat_max_turns": CHAT_MAX_TURNS, "chat_search_top_k": CHAT_SEARCH_TOP_K}

class SetChatTurnsRequest(BaseModel):
    turns: int = 0
    top_k: int = 0

@app.post("/api/settings/chat-turns")
def set_chat_turns(req: SetChatTurnsRequest):
    global CHAT_MAX_TURNS, CHAT_SEARCH_TOP_K
    existing = _load_config_keys()
    if req.turns > 0:
        if req.turns < 2:
            raise HTTPException(status_code=400, detail="최소 2턴 이상이어야 합니다")
        if req.turns > 50:
            raise HTTPException(status_code=400, detail="최대 50턴 이하여야 합니다")
        CHAT_MAX_TURNS = req.turns
        existing["CHAT_MAX_TURNS"] = req.turns
    if req.top_k > 0:
        if req.top_k < 3:
            raise HTTPException(status_code=400, detail="최소 3건 이상이어야 합니다")
        if req.top_k > 30:
            raise HTTPException(status_code=400, detail="최대 30건 이하여야 합니다")
        CHAT_SEARCH_TOP_K = req.top_k
        existing["CHAT_SEARCH_TOP_K"] = req.top_k
    _save_config_keys(existing)
    return {"status": "변경 완료", "chat_max_turns": CHAT_MAX_TURNS, "chat_search_top_k": CHAT_SEARCH_TOP_K}


@app.get("/api/settings/ollama-think")
def get_ollama_think():
    return {"filter_no_think": OLLAMA_FILTER_NOTHINK, "gen_no_think": OLLAMA_GEN_NOTHINK, "chat_no_think": OLLAMA_CHAT_NOTHINK}


class SetOllamaThinkRequest(BaseModel):
    target: str  # "filter" or "gen" or "chat"
    no_think: bool

@app.post("/api/settings/ollama-think")
def set_ollama_think(req: SetOllamaThinkRequest):
    global OLLAMA_FILTER_NOTHINK, OLLAMA_GEN_NOTHINK, OLLAMA_CHAT_NOTHINK
    print(f"[Think 변경] target={req.target}, no_think={req.no_think} (변경 전: filter={OLLAMA_FILTER_NOTHINK}, gen={OLLAMA_GEN_NOTHINK}, chat={OLLAMA_CHAT_NOTHINK})")
    existing = _load_config_keys()
    if req.target == "gen":
        OLLAMA_GEN_NOTHINK = req.no_think
        existing["OLLAMA_GEN_NOTHINK"] = req.no_think
    elif req.target == "chat":
        OLLAMA_CHAT_NOTHINK = req.no_think
        existing["OLLAMA_CHAT_NOTHINK"] = req.no_think
    else:
        OLLAMA_FILTER_NOTHINK = req.no_think
        existing["OLLAMA_FILTER_NOTHINK"] = req.no_think
    _save_config_keys(existing)
    print(f"[Think 변경 완료] filter={OLLAMA_FILTER_NOTHINK}, gen={OLLAMA_GEN_NOTHINK}, chat={OLLAMA_CHAT_NOTHINK}")
    return {"status": "변경 완료", "filter_no_think": OLLAMA_FILTER_NOTHINK, "gen_no_think": OLLAMA_GEN_NOTHINK, "chat_no_think": OLLAMA_CHAT_NOTHINK}


@app.get("/api/settings/ai-models")
def get_ai_models():
    """AI 모델 목록 + 기본 모델 조회"""
    config = _load_config_keys()
    return {
        "models": config.get("AI_MODELS", None),
        "default": config.get("AI_DEFAULT", None),
        "chat_default": config.get("AI_CHAT_DEFAULT", None),
    }

class SaveAiModelsRequest(BaseModel):
    models: dict = None
    default: dict = None
    chat_default: dict = None

@app.post("/api/settings/ai-models")
def save_ai_models(req: SaveAiModelsRequest):
    """AI 모델 목록 + 기본 모델 저장"""
    existing = _load_config_keys()
    if req.models is not None:
        existing["AI_MODELS"] = req.models
    if req.default is not None:
        existing["AI_DEFAULT"] = req.default
    if req.chat_default is not None:
        existing["AI_CHAT_DEFAULT"] = req.chat_default
    _save_config_keys(existing)
    return {"status": "저장 완료"}


@app.get("/api/settings/prompts")
def get_prompts():
    config = _load_config_keys()
    saved_defaults = {k: config.get(f"PROMPT_SAVED_{k.upper()}", v) for k, v in _DEFAULT_PROMPTS.items()}
    return {"prompts": PROMPT_TEMPLATES, "defaults": saved_defaults, "original_defaults": _DEFAULT_PROMPTS}


class SetPromptRequest(BaseModel):
    key: str
    prompt: str

@app.post("/api/settings/prompts")
def set_prompt(req: SetPromptRequest):
    if req.key not in _DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"잘못된 키: {req.key}")
    PROMPT_TEMPLATES[req.key] = req.prompt
    existing = _load_config_keys()
    existing[f"PROMPT_{req.key.upper()}"] = req.prompt
    _save_config_keys(existing)
    return {"status": "저장 완료", "key": req.key}

@app.post("/api/settings/prompts/reset")
def reset_prompt(req: SetPromptRequest):
    if req.key not in _DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"잘못된 키: {req.key}")
    config = _load_config_keys()
    saved = config.get(f"PROMPT_SAVED_{req.key.upper()}", _DEFAULT_PROMPTS[req.key])
    PROMPT_TEMPLATES[req.key] = saved
    config.pop(f"PROMPT_{req.key.upper()}", None)
    _save_config_keys(config)
    return {"status": "초기화 완료", "key": req.key}

@app.post("/api/settings/prompts/save-default")
def save_prompt_default(req: SetPromptRequest):
    """현재 프롬프트를 커스텀 기본값으로 저장 (초기화 시 이 값으로 복원)"""
    if req.key not in _DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"잘못된 키: {req.key}")
    existing = _load_config_keys()
    existing[f"PROMPT_SAVED_{req.key.upper()}"] = req.prompt
    _save_config_keys(existing)
    return {"status": "기본값 저장 완료", "key": req.key}


# ── 프리셋 동기화 ──
@app.get("/api/settings/presets/{key}")
def get_presets(key: str):
    """프리셋 목록 + 체크 상태 조회"""
    existing = _load_config_keys()
    presets_key = f"PRESETS_{key.upper()}"
    checked_key = f"PRESETS_{key.upper()}_CHECKED"
    return {
        "presets": existing.get(presets_key, []),
        "checked": existing.get(checked_key, []),
    }

class PresetsRequest(BaseModel):
    presets: list = []
    checked: list = []

@app.post("/api/settings/presets/{key}")
def save_presets(key: str, req: PresetsRequest):
    """프리셋 목록 + 체크 상태 저장"""
    existing = _load_config_keys()
    presets_key = f"PRESETS_{key.upper()}"
    checked_key = f"PRESETS_{key.upper()}_CHECKED"
    existing[presets_key] = req.presets
    existing[checked_key] = req.checked
    _save_config_keys(existing)
    return {"status": "저장 완료"}


@app.post("/api/parse")
def parse_outline(req: ParseRequest):
    return parse_outline_text(req.text, req.has_separate_title)


@app.post("/api/search")
def search_points(req: SearchRequest):
    client = get_db()
    collections = ["speech_points", "speech_expressions"]
    results = []

    # 출판물 사전 로드
    pub_list = []
    try:
        pub_col = client.get_collection("publications")
        pub_all = pub_col.get(include=["documents", "metadatas"])
        if pub_all and pub_all["ids"]:
            for pi2, pid in enumerate(pub_all["ids"]):
                meta = pub_all["metadatas"][pi2]
                pub_list.append({
                    "pub_code": meta.get("pub_code", ""),
                    "pub_title": meta.get("pub_title", ""),
                    "point_id": meta.get("point_id", ""),
                    "point_content": meta.get("point_content", ""),
                    "text": pub_all["documents"][pi2],
                })
    except Exception:
        pass

    for point in req.points:
        point_result = {
            "title": point["title"],
            "scriptures": point.get("scriptures", []),
            "publications": point.get("publications", []),
            "sub_points": [],
            "auto_scriptures": [],
            "auto_publications": [],
            "search_results": [],
        }

        # 출판물 자동 매칭: 요점의 출판물 참조 → DB 검색
        if pub_list:
            for pub_ref in point.get("publications", []):
                ref_norm = pub_ref.replace("「", "").replace("」", "").replace(" ", "").lower()
                for pub in pub_list:
                    code_norm = pub["pub_code"].replace("「", "").replace("」", "").replace(" ", "").lower()
                    if ref_norm == code_norm or ref_norm in code_norm or code_norm in ref_norm:
                        point_result["auto_publications"].append({
                            "pub_code": pub["pub_code"],
                            "point_content": pub["point_content"],
                            "text": pub["text"],
                            "matched_ref": pub_ref,
                        })
                        break

        # 성구 자동 조회 (원래 참조 단위로 그룹화)
        all_scriptures = list(point.get("scriptures", []))

        # 부가 요점 처리
        for sub in point.get("sub_points", []):
            sub_result = {"title": sub["title"], "level": sub.get("level", 2), "scriptures": sub.get("scriptures", []), "publications": sub.get("publications", []), "auto_scriptures": []}
            for ref in sub.get("scriptures", []):
                expanded = expand_scripture_refs(ref)
                verses = []
                for single_ref in expanded:
                    verse_text = get_verse_text(single_ref, client)
                    if verse_text:
                        v_match = re.search(r':(\d+)$', single_ref)
                        verse_num = int(v_match.group(1)) if v_match else 0
                        verses.append({"ref": single_ref, "verse": verse_num, "text": verse_text})
                if verses:
                    sub_result["auto_scriptures"].append({"original": ref, "verses": verses})
            point_result["sub_points"].append(sub_result)

        for ref in all_scriptures:
            expanded = expand_scripture_refs(ref)
            verses = []
            for single_ref in expanded:
                verse_text = get_verse_text(single_ref, client)
                if verse_text:
                    v_match = re.search(r':(\d+)$', single_ref)
                    verse_num = int(v_match.group(1)) if v_match else 0
                    verses.append({"ref": single_ref, "verse": verse_num, "text": verse_text})
            if verses:
                point_result["auto_scriptures"].append({
                    "original": ref,
                    "verses": verses,
                })

        # 하이브리드 검색 (L1 + 부가 요점 제목 결합)
        query_parts = [point["title"]]
        for sub in point.get("sub_points", []):
            query_parts.append(sub["title"])
        query_text = " ".join(query_parts)
        try:
            query_emb = get_embedding(query_text)
        except Exception as e:
            print(f"임베딩 오류: {e}")
            results.append(point_result)
            continue

        for col_name in collections:
            items = hybrid_search(client, col_name, query_text, query_emb, top_k=req.top_k)
            # 연설 준비에서 봉사 모임/방문 자료 제외
            items = [it for it in items if it.get("metadata", {}).get("source", "") not in ("봉사 모임", "방문", "메모", "원문")]
            point_result["search_results"].extend(items)

        # 검색 결과에 관련 출판물 첨부
        if pub_list:
            for item in point_result["search_results"]:
                item_meta = item.get("metadata", {})
                sp_id = item_meta.get("point_id", "")
                if not sp_id:
                    continue
                matched = []
                for pub in pub_list:
                    pub_id = pub["point_id"]
                    if not pub_id:
                        continue
                    if sp_id == pub_id or pub_id.startswith(sp_id + ".") or sp_id.startswith(pub_id + "."):
                        matched.append(pub)
                if matched:
                    item["publications"] = matched

        # RRF 점수로 전체 정렬
        point_result["search_results"].sort(key=lambda x: x["score"], reverse=True)

        # 중복 제거: speaker + 본문 내용 기반
        seen = set()
        deduped = []
        for item in point_result["search_results"]:
            meta = item.get("metadata", {})
            speaker = meta.get("speaker", "")
            body = _dedup_body(item.get("text", ""))
            key = (speaker, body)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)
        point_result["search_results"] = deduped

        results.append(point_result)

    return {"points": results}


class FreeSearchRequest(BaseModel):
    query: str
    top_k: int = 20

@app.post("/api/search/free")
def free_search(req: FreeSearchRequest):
    """자유 검색: 키워드로 speech_points, speech_expressions, publications 검색"""
    client = get_db()
    collections = ["speech_points", "speech_expressions", "publications"]

    try:
        query_emb = get_embedding(req.query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"임베딩 오류: {e}")

    all_results = []
    for col_name in collections:
        items = hybrid_search(client, col_name, req.query, query_emb, top_k=req.top_k)
        all_results.extend(items)

    all_results.sort(key=lambda x: x["score"], reverse=True)
    # DB 검색에서 원문 제외
    all_results = [it for it in all_results if it.get("metadata", {}).get("source", "") != "원문"]

    # 출판물 첨부
    pub_list = []
    try:
        pub_col = client.get_collection("publications")
        pub_all = pub_col.get(include=["documents", "metadatas"])
        if pub_all and pub_all["ids"]:
            for pi2, pid in enumerate(pub_all["ids"]):
                m = pub_all["metadatas"][pi2]
                pub_list.append({
                    "pub_code": m.get("pub_code", ""),
                    "pub_title": m.get("pub_title", ""),
                    "point_id": m.get("point_id", ""),
                    "point_content": m.get("point_content", ""),
                    "text": pub_all["documents"][pi2],
                })
    except Exception:
        pass

    if pub_list:
        for item in all_results:
            item_meta = item.get("metadata", {})
            sp_id = item_meta.get("point_id", "")
            if not sp_id:
                continue
            matched = [p for p in pub_list if p["point_id"] and
                       (sp_id == p["point_id"] or p["point_id"].startswith(sp_id + ".") or sp_id.startswith(p["point_id"] + "."))]
            if matched:
                item["publications"] = matched

    # 중복 제거
    seen = set()
    deduped = []
    for item in all_results:
        meta = item.get("metadata", {})
        speaker = meta.get("speaker", "")
        body = _dedup_body(item.get("text", ""))
        key = (speaker, body)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)

    return {"results": deduped[:req.top_k]}


@app.post("/api/filter")
def filter_results(req: FilterRequest):
    filtered_points = []
    for point in req.points:
        point_title = point.get("title", "")
        search_results = point.get("search_results", [])
        if not search_results:
            filtered_points.append({**point, "search_results": []})
            continue
        items_text = ""
        for i, item in enumerate(search_results):
            meta = item.get("metadata", {})
            speaker = meta.get("speaker", "")
            items_text += f"\n[{i}] (점수:{item['score']}) {speaker}: {item['text'][:200]}"
        prompt = f"""다음은 연설 요점과 검색된 자료입니다.\n\n**요점**: {point_title}\n\n**검색 결과**:\n{items_text}\n\n각 검색 결과가 이 요점에 관련이 있는지 판단하세요.\n관련 없는 항목의 번호만 쉼표로 나열하세요.\n모두 관련 있으면 "없음"이라고 답하세요.\n번호만 답하세요."""
        try:
            print(f"[필터] model={FILTER_MODEL}, think={'ON' if not OLLAMA_FILTER_NOTHINK else 'OFF'} (OLLAMA_FILTER_NOTHINK={OLLAMA_FILTER_NOTHINK})")
            llm_response = query_ollama(prompt, system="당신은 JW 연설 자료의 관련성을 판단하는 전문가입니다. 번호만 간결하게 답하세요.", model_name=FILTER_MODEL, ctx=OLLAMA_FILTER_CTX, no_think=OLLAMA_FILTER_NOTHINK)
            exclude_ids = set()
            if "없음" not in llm_response:
                numbers = re.findall(r"\d+", llm_response)
                exclude_ids = {int(n) for n in numbers if int(n) < len(search_results)}
            for i, item in enumerate(search_results):
                item["filtered"] = i in exclude_ids
        except Exception as e:
            print(f"LLM 필터링 오류: {e}")
            for item in search_results:
                item["filtered"] = False
        filtered_points.append({**point, "search_results": search_results})
    return {"points": filtered_points}


def _build_generate_prompt(req: GenerateRequest) -> str:
    """연설문 생성 프롬프트 구성"""
    materials = ""
    title_theme = ""
    point_num = 0
    for i, point in enumerate(req.points):
        is_title_point = point.get("_isTitlePoint", False)

        if is_title_point:
            title_theme += f"\n\n## 연설 전체 방향 (제목 '{point['title']}' 관련 자료):\n"
            title_theme += "아래 자료들을 연설의 전체적인 줄기와 방향을 잡는 데 참고하세요.\n"
            for sc in point.get("auto_scriptures", []):
                if isinstance(sc, dict) and "verses" in sc:
                    for v in sc["verses"]:
                        title_theme += f"\n**[성구]** {v['ref']}: {v['text']}"
                else:
                    title_theme += f"\n**[성구]** {sc['ref']}: {sc['text']}"
            for item in point.get("search_results", []):
                if item.get("selected", True) and not item.get("filtered", False):
                    meta = item.get("metadata", {})
                    speaker = meta.get("speaker", "")
                    title_theme += f"\n**[전체 참고]** ({speaker}) {item['text']}"
        else:
            point_num += 1
            materials += f"\n\n### 요점 {point_num}: {point['title']}\n"

            for sc in point.get("auto_scriptures", []):
                if isinstance(sc, dict) and "verses" in sc:
                    for v in sc["verses"]:
                        materials += f"\n**[성구]** {v['ref']}: {v['text']}"
                else:
                    materials += f"\n**[성구]** {sc['ref']}: {sc['text']}"

            for ap in point.get("auto_publications", []):
                body = "\n".join(l for l in (ap.get("text", "")).split("\n") if not l.startswith("[") and l.strip())
                if body:
                    materials += f"\n\n**[출판물 자료]** {ap.get('pub_code', '')}:\n{body}"

            priority = point.get("priority_material", "")
            if priority:
                materials += f"\n\n**[우선 참고 자료 - 출판물]** (이 자료를 핵심적으로 활용하세요)\n{priority}"

            point_extra = point.get("extra_material", "")
            if point_extra:
                materials += f"\n\n**[우선 참고 자료 - 추가]** (이 자료도 핵심적으로 활용하세요)\n{point_extra}"

            for item in point.get("search_results", []):
                if item.get("selected", True) and not item.get("filtered", False):
                    meta = item.get("metadata", {})
                    speaker = meta.get("speaker", "")
                    materials += f"\n**[참고]** ({speaker}) {item['text']}"

            level_labels = {2: "세부", 3: "추가", 4: "보충", 5: "참고"}
            for sub in point.get("sub_points", []):
                lvl = sub.get("level", 2)
                indent = "  " * (lvl - 1)
                label = level_labels.get(lvl, "부가")
                materials += f"\n\n{indent}> **[{label}]** {sub['title']}\n"
                for sc in sub.get("auto_scriptures", []):
                    if isinstance(sc, dict) and "verses" in sc:
                        for v in sc["verses"]:
                            materials += f"\n{indent}  **[성구]** {v['ref']}: {v['text']}"
                    else:
                        materials += f"\n{indent}  **[성구]** {sc['ref']}: {sc['text']}"

    extra = ""
    if req.extra_materials:
        extra = f"\n\n## 추가 자료 (이 자료도 우선적으로 참고하세요):\n{req.extra_materials}"

    title_str = req.title if req.title else "제목 없음"
    duration_str = req.duration if req.duration else ""
    if duration_str and duration_str.strip().isdigit():
        duration_str = duration_str.strip() + "분"

    return f"""다음 자료를 바탕으로 {duration_str} 분량의 여호와의 증인 회중 연설문을 작성하세요.

## 연설 제목: {title_str}
## 시간: {duration_str}
{title_theme}
## 요점별 자료:
{materials}
{extra}

## 지침:
{PROMPT_TEMPLATES['speech']}
"""


def _verify_password(password: str):
    if not PASSWORD_HASH:
        raise HTTPException(status_code=500, detail="서버에 비밀번호가 설정되지 않았습니다")
    if hashlib.sha256(password.encode()).hexdigest() != PASSWORD_HASH:
        raise HTTPException(status_code=403, detail="비밀번호가 올바르지 않습니다")


@app.post("/api/generate")
def generate_speech(req: GenerateRequest):
    _verify_password(req.password)
    prompt = _build_generate_prompt(req)
    try:
        result = call_llm(prompt, model=req.model, no_think=OLLAMA_GEN_NOTHINK)
        return {"speech": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API 오류: {str(e)}")


@app.post("/api/generate/stream")
def generate_speech_stream(req: GenerateRequest):
    """연설문 생성 (SSE 스트리밍)"""
    _verify_password(req.password)
    prompt = _build_generate_prompt(req)

    def event_stream():
        _abort_event.clear()
        model_label = req.model or "기본"
        think_label = "ON" if not OLLAMA_GEN_NOTHINK else "OFF"
        print(f"[연설 생성] model={model_label}, think={think_label} (OLLAMA_GEN_NOTHINK={OLLAMA_GEN_NOTHINK})")
        yield f"data: {json.dumps({'stage': 'preparing', 'progress': 10, 'message': '자료 정리 완료'})}\n\n"
        yield f"data: {json.dumps({'stage': 'calling', 'progress': 15, 'message': 'AI 호출 중 (' + model_label + ', 🧠' + think_label + ')'})}\n\n"
        full_text = ""
        char_count = 0
        try:
            for chunk in call_llm_stream(prompt, model=req.model, no_think=OLLAMA_GEN_NOTHINK):
                full_text += chunk
                char_count += len(chunk)
                progress = min(95, 20 + int(char_count / 50))
                yield f"data: {json.dumps({'stage': 'streaming', 'progress': progress, 'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'stage': 'done', 'progress': 100, 'speech': full_text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _friendly_api_error(provider: str, model: str, e) -> str:
    """API 오류를 사용자 친화적 메시지로 변환"""
    msg = str(e)
    if "401" in msg or "403" in msg or "Unauthorized" in msg or "authentication" in msg.lower():
        return f"{provider} API 키가 유효하지 않습니다. Manage → AI 관리에서 확인하세요."
    if "404" in msg or "Not Found" in msg:
        return f"{provider} 모델 '{model}'을(를) 찾을 수 없습니다. 모델명을 확인하세요."
    if "429" in msg or "rate" in msg.lower():
        return f"{provider} API 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요."
    if "timeout" in msg.lower() or "timed out" in msg.lower():
        return f"{provider} 응답 시간이 초과되었습니다. 다시 시도하세요."
    if "ConnectionError" in msg or "Connection refused" in msg:
        return f"{provider} 서버에 연결할 수 없습니다."
    return f"{provider} 오류: {msg}"


def call_llm(prompt: str, model: str = "", no_think: bool = False) -> str:
    """모델 선택에 따라 Gemini / Claude / OpenAI / Ollama API 호출 (no_think 무시, 전역 설정 사용)"""
    model = model.strip()

    # ── Gemini 계열 ──
    if model.startswith("gemini-"):
        if not GEMINI_API_KEY:
            raise Exception("Gemini API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            m = genai.GenerativeModel(model)
            response = m.generate_content(prompt)
            return response.text
        except Exception as e:
            raise Exception(_friendly_api_error("Gemini", model, e))

    # ── Claude 계열 ──
    if model.startswith("claude-"):
        if not ANTHROPIC_API_KEY:
            raise Exception("Claude API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_API_VERSION},
                json={"model": model, "max_tokens": 8192, "messages": [{"role": "user", "content": prompt}]}, timeout=180)
            if not resp.ok:
                err_detail = resp.json().get("error", {}).get("message", resp.text) if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                raise Exception(f"Claude 오류 ({resp.status_code}): {err_detail}")
            return resp.json()["content"][0]["text"]
        except Exception as e:
            if "Claude 오류" in str(e):
                raise
            raise Exception(_friendly_api_error("Claude", model, e))

    # ── OpenAI (ChatGPT) 계열 ──
    if model.startswith("gpt-"):
        if not OPENAI_API_KEY:
            raise Exception("OpenAI API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={"model": model, "max_tokens": 8192, "messages": [{"role": "user", "content": prompt}]}, timeout=180)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            raise Exception(_friendly_api_error("ChatGPT", model, e))

    # ── Ollama 로컬 ──
    if model:
        return query_ollama(prompt, model_name=model, no_think=OLLAMA_GEN_NOTHINK)

    # ── 기본: Gemini → Claude → Ollama 순서 폴백 ──
    if GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            m = genai.GenerativeModel("gemini-2.5-flash")
            response = m.generate_content(prompt)
            return response.text
        except Exception as e:
            raise Exception(_friendly_api_error("Gemini", "gemini-2.5-flash", e))
    elif ANTHROPIC_API_KEY:
        try:
            resp = requests.post("https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_API_VERSION},
                json={"model": "claude-sonnet-4-6", "max_tokens": 8192, "messages": [{"role": "user", "content": prompt}]}, timeout=180)
            if not resp.ok:
                err_detail = resp.json().get("error", {}).get("message", resp.text) if resp.headers.get("content-type", "").startswith("application/json") else resp.text
                raise Exception(f"Claude 오류 ({resp.status_code}): {err_detail}")
            return resp.json()["content"][0]["text"]
        except Exception as e:
            if "Claude 오류" in str(e):
                raise
            raise Exception(_friendly_api_error("Claude", "claude-sonnet-4-6", e))
    else:
        return query_ollama(prompt, no_think=OLLAMA_GEN_NOTHINK)


def call_llm_stream(prompt: str, model: str = "", no_think: bool = False):
    """스트리밍 LLM 호출 — 텍스트 청크를 yield"""
    model = model.strip()

    # ── Gemini 계열 ──
    if model.startswith("gemini-"):
        if not GEMINI_API_KEY:
            raise Exception("Gemini API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            m = genai.GenerativeModel(model)
            response = m.generate_content(prompt, stream=True)
        except Exception as e:
            raise Exception(_friendly_api_error("Gemini", model, e))
        for chunk in response:
            if _abort_event.is_set():
                return
            if chunk.text:
                yield chunk.text
        return

    # ── Claude 계열 ──
    if model.startswith("claude-"):
        if not ANTHROPIC_API_KEY:
            raise Exception("Claude API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": ANTHROPIC_API_VERSION},
                json={"model": model, "max_tokens": 8192, "stream": True, "messages": [{"role": "user", "content": prompt}]},
                timeout=300, stream=True)
            if not resp.ok:
                err_body = resp.text[:500]
                raise Exception(f"Claude 오류 ({resp.status_code}): {err_body}")
        except Exception as e:
            if "Claude 오류" in str(e):
                raise
            raise Exception(_friendly_api_error("Claude", model, e))
        for line in resp.iter_lines():
            if _abort_event.is_set():
                resp.close()
                return
            if not line:
                continue
            line_str = line.decode("utf-8", errors="ignore")
            if line_str.startswith("data: "):
                try:
                    data = json.loads(line_str[6:])
                    if data.get("type") == "content_block_delta":
                        text = data.get("delta", {}).get("text", "")
                        if text:
                            yield text
                except json.JSONDecodeError:
                    pass
        return

    # ── OpenAI (ChatGPT) 계열 ──
    if model.startswith("gpt-"):
        if not OPENAI_API_KEY:
            raise Exception("OpenAI API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={"model": model, "max_tokens": 8192, "stream": True, "messages": [{"role": "user", "content": prompt}]},
                timeout=300, stream=True)
            resp.raise_for_status()
        except Exception as e:
            raise Exception(_friendly_api_error("ChatGPT", model, e))
        for line in resp.iter_lines():
            if _abort_event.is_set():
                resp.close()
                return
            if not line:
                continue
            line_str = line.decode("utf-8", errors="ignore")
            if line_str.startswith("data: ") and line_str.strip() != "data: [DONE]":
                try:
                    data = json.loads(line_str[6:])
                    text = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if text:
                        yield text
                except json.JSONDecodeError:
                    pass
        return

    # ── Ollama 로컬 ──
    ollama_model = model or LLM_MODEL
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat",
            json={"model": ollama_model, "messages": [{"role": "user", "content": prompt}], "stream": True,
                  "think": not no_think,
                  "options": {"num_ctx": OLLAMA_GEN_CTX}},
            timeout=600, stream=True)
        if resp.status_code == 404:
            raise Exception(f"로컬 모델 '{ollama_model}'이(가) 설치되지 않았습니다. Manage → AI 관리에서 pull 버튼으로 설치하세요.")
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise Exception(f"Ollama 서버에 연결할 수 없습니다 ({OLLAMA_URL}). Ollama가 실행 중인지 확인하세요.")
    for line in resp.iter_lines():
        if _abort_event.is_set():
            resp.close()
            return
        if not line:
            continue
        try:
            data = json.loads(line)
            text = data.get("message", {}).get("content", "")
            if text:
                yield text
        except json.JSONDecodeError:
            pass


# ─── 파일 업로드 ──────────────────────────────────────────

_UPLOAD_DIR = os.path.join(os.path.expanduser("~/jw-system"), "uploads")
os.makedirs(_UPLOAD_DIR, exist_ok=True)
_MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def extract_text_from_file(filepath: str) -> str:
    """파일에서 텍스트 추출 (txt, md, pdf, docx 지원)."""
    ext = os.path.splitext(filepath)[1].lower()

    if ext in ('.txt', '.md', '.csv', '.json', '.log'):
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()

    if ext == '.pdf':
        try:
            import subprocess
            result = subprocess.run(
                ['python3', '-c', f"""
import sys
try:
    import fitz  # PyMuPDF
    doc = fitz.open("{filepath}")
    text = "\\n\\n".join(page.get_text() for page in doc)
    print(text)
except ImportError:
    # fallback: pdftotext
    import subprocess as sp
    r = sp.run(['pdftotext', '-layout', '{filepath}', '-'], capture_output=True, text=True)
    print(r.stdout)
"""],
                capture_output=True, text=True, timeout=30
            )
            return result.stdout.strip()
        except Exception as e:
            return f"[PDF 텍스트 추출 실패: {e}]"

    if ext == '.docx':
        try:
            import zipfile
            from xml.etree import ElementTree
            with zipfile.ZipFile(filepath, 'r') as z:
                with z.open('word/document.xml') as doc_xml:
                    tree = ElementTree.parse(doc_xml)
                    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                    paragraphs = tree.findall('.//w:p', ns)
                    texts = []
                    for p in paragraphs:
                        runs = p.findall('.//w:t', ns)
                        line = ''.join(r.text or '' for r in runs)
                        if line:
                            texts.append(line)
                    return '\n'.join(texts)
        except Exception as e:
            return f"[DOCX 텍스트 추출 실패: {e}]"

    return f"[지원하지 않는 파일 형식: {ext}]"


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """파일 업로드 → 텍스트 추출 반환"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="파일이 없습니다")

    # 크기 체크
    content = await file.read()
    if len(content) > _MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"파일 크기 초과 (최대 {_MAX_FILE_SIZE // 1024 // 1024}MB)")

    # 저장
    safe_name = re.sub(r'[^\w.\-]', '_', file.filename)
    filepath = os.path.join(_UPLOAD_DIR, f"{int(time.time())}_{safe_name}")
    with open(filepath, 'wb') as f:
        f.write(content)

    # 텍스트 추출
    text = extract_text_from_file(filepath)
    char_count = len(text)

    return {
        "filename": file.filename,
        "size": len(content),
        "chars": char_count,
        "text": text[:50000],  # 최대 5만자
        "truncated": char_count > 50000,
    }


# ─── RAG 채팅 ────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list = []  # [{"role": "user"|"assistant", "content": "..."}]
    model: str = ""
    password: str = ""
    top_k: int = 10
    search_mode: str = "db"  # "db" | "wol" | "db_wol" | "chat"
    file_context: str = ""   # 첨부 파일 텍스트
    file_name: str = ""      # 첨부 파일명

@app.post("/api/chat/stream")
def chat_stream(req: ChatRequest):
    """RAG 채팅: DB 검색 + LLM 대화 (SSE 스트리밍)"""
    if req.password:
        _verify_password(req.password)
    elif req.model and (req.model.startswith('gemini-') or req.model.startswith('claude-') or req.model.startswith('gpt-')):
        raise HTTPException(status_code=400, detail="클라우드 모델은 비밀번호가 필요합니다")

    # 1. 검색 (search_mode: db | wol | db_wol | chat)
    actual_top_k = req.top_k if req.top_k > 0 else CHAT_SEARCH_TOP_K
    search_mode = req.search_mode or "db"
    search_results = []
    wol_results = []

    # ── 대화 모드: 검색 스킵 ──
    if search_mode == "chat":
        pass

    # ── DB 검색 ──
    elif search_mode in ("db", "db_wol"):
        client = get_db()
        collections = ["speech_points", "speech_expressions", "publications"]
        try:
            query_emb = get_embedding(req.message)
            for col_name in collections:
                items = hybrid_search(client, col_name, req.message, query_emb, top_k=actual_top_k)
                search_results.extend(items)
            search_results.sort(key=lambda x: x["score"], reverse=True)
            search_results = [it for it in search_results if it.get("metadata", {}).get("source", "") != "원문"]
            # 중복 제거
            seen = set()
            deduped = []
            for item in search_results:
                meta = item.get("metadata", {})
                body = _dedup_body(item.get("text", ""))
                key = (meta.get("speaker", ""), body)
                if key not in seen:
                    seen.add(key)
                    deduped.append(item)
            search_results = deduped[:actual_top_k]
        except Exception as e:
            search_results = []

    # ── WOL 검색 ──
    if search_mode in ("wol", "db_wol"):
        try:
            wol_raw = search_wol(req.message, max_results=actual_top_k)
            wol_results = wol_results_to_search_format(wol_raw)

            # URL이 있는 모든 결과의 본문 수집 (순차 + 0.5초 딜레이, 캐시 적용)
            for item in wol_results:
                url = item.get("metadata", {}).get("wol_url", "")
                if not url:
                    continue
                # 캐시 히트면 딜레이 불필요
                if url not in _wol_article_cache:
                    time.sleep(0.5)
                body = fetch_wol_article(url, max_chars=1500)
                if body:
                    item["text"] = body

            # 본문 수집 후 중복 제거 (같은 기사가 다른 성구로 잡힌 경우)
            seen_bodies = set()
            deduped_wol = []
            for item in wol_results:
                body_key = item.get("text", "")[:200]
                if body_key and body_key in seen_bodies:
                    continue
                if body_key:
                    seen_bodies.add(body_key)
                deduped_wol.append(item)
            wol_results = deduped_wol

        except Exception as e:
            print(f"WOL 검색 오류: {e}")
            wol_results = []

    # ── 결과 합산 ──
    all_search = search_results + wol_results

    # 2. 컨텍스트 구성
    context_parts = []
    for i, item in enumerate(all_search):
        meta = item.get("metadata", {})
        col_name = item.get("collection", "")

        if col_name == "wol":
            # WOL 결과 컨텍스트
            title = meta.get("outline_title", "") or meta.get("golza_title", "")
            pub = meta.get("pub_title", "")
            wol_url = meta.get("wol_url", "")
            text = item.get("text", "")[:500]
            header = f"[자료 {i+1}] (WOL)"
            if pub:
                header += f" {pub}"
            if title:
                header += f" 제목:{title}"
            if wol_url:
                header += f" URL:{wol_url}"
            context_parts.append(f"{header}\n{text}")
        else:
            # DB 결과 컨텍스트 (기존 로직)
            speaker = meta.get("speaker", "")
            source = meta.get("source", "")
            golza = meta.get("outline_title", "") or meta.get("golza_title", "")
            pub_code = meta.get("pub_code", "")
            pub_title = meta.get("pub_title", "")
            text = item.get("text", "")
            body_lines = []
            for l in text.split('\n'):
                if l.startswith('[연설내용_전체] '):
                    body_lines.append(l[10:].strip())
                elif not l.startswith('[') and l.strip():
                    body_lines.append(l)
            body = '\n'.join(body_lines).strip()[:500]
            col_label = {"speech_points": "연설 요점", "speech_expressions": "표현/예시", "publications": "출판물"}.get(col_name, source or col_name)
            header = f"[자료 {i+1}] ({col_label})"
            if pub_code:
                header += f" {pub_code}"
            if pub_title:
                header += f" {pub_title}"
            if golza:
                header += f" 제목:{golza}"
            sub_source = meta.get("sub_source", "")
            if sub_source:
                header += f" 소제목:{sub_source}"
            point_content = meta.get("point_content", "")
            if point_content:
                header += f" 요점:{point_content}"
            if speaker:
                header += f" ({speaker})"
            context_parts.append(f"{header}\n{body}")

    context = "\n\n".join(context_parts)

    # 3. 프롬프트 구성 (검색 모드에 따라 안내 조정)
    if search_mode == "chat":
        # 일반 대화 모드
        today = time.strftime("%Y년 %m월 %d일")
        system_prompt = f"""당신은 JW Speech Studio의 AI 어시스턴트입니다.
오늘 날짜: {today}

규칙:
- 사용자와 자연스럽게 대화하세요
- 질문에 간결하고 핵심적으로 답변하세요
- 이전 대화 내용을 참고하여 맥락에 맞게 답변하세요
- 연설 준비, 성경 해석, 봉사 조언 등 다양한 주제에 도움을 줄 수 있습니다
- "인터넷 검색이 안 됩니다" 같은 불필요한 면책 문구는 하지 마세요
- 자연스러운 한국어로 답변하세요"""
    else:
        source_desc = {
            "db": "로컬 DB",
            "wol": "WOL (wol.jw.org)",
            "db_wol": "로컬 DB + WOL (wol.jw.org)",
        }.get(search_mode, "DB")

        system_prompt = f"""당신은 여호와의 증인 연설/봉사 자료 검색 도우미입니다.
아래 {source_desc}에서 검색된 자료를 참고하여 사용자의 질문에 답변하세요.

규칙:
- 검색된 자료에 근거하여 답변하세요
- 자료를 인용할 때 [자료 N] 형식으로 출처를 표시하세요
- WOL 자료는 출처 URL도 함께 안내하세요
- 자료에 없는 내용은 "검색된 자료에서 찾을 수 없습니다"라고 답하세요
- 자연스러운 한국어로 답변하세요
- 사용자가 자료를 보여달라고 하면, 핵심 내용을 요약하고 "아래 검색 결과를 확인해 보세요"라고 안내하세요"""

    messages = [{"role": "system", "content": system_prompt}]

    # 이전 대화 이력 (CHAT_MAX_TURNS 턴 = 질문+답변 쌍)
    for h in req.history[-(CHAT_MAX_TURNS * 2):]:
        messages.append({"role": h["role"], "content": h["content"]})

    # 현재 메시지 + 검색 컨텍스트 + 파일 컨텍스트
    user_content = req.message

    # 파일 첨부가 있으면 포함
    file_section = ""
    if req.file_context:
        file_label = req.file_name or "첨부 파일"
        file_text = req.file_context[:30000]  # LLM 컨텍스트 보호
        file_section = f"\n\n## 첨부 파일 ({file_label}):\n{file_text}"

    if context and file_section:
        user_content = f"""## 검색된 자료 ({source_desc}):
{context}
{file_section}

## 사용자 질문:
{req.message}"""
    elif context:
        user_content = f"""## 검색된 자료 ({source_desc}):
{context}

## 사용자 질문:
{req.message}"""
    elif file_section:
        user_content = f"""{file_section}

## 사용자 질문:
{req.message}"""

    messages.append({"role": "user", "content": user_content})

    def event_stream():
        _abort_event.clear()
        # 검색 결과 전송
        yield f"data: {json.dumps({'stage': 'search', 'results': all_search, 'search_mode': search_mode}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'stage': 'calling', 'message': 'AI 응답 생성 중...'})}\n\n"

        model = req.model or LLM_MODEL
        full_text = ""

        try:
            if model.startswith("gemini-") or model.startswith("claude-") or model.startswith("gpt-"):
                # 클라우드 모델
                prompt = "\n\n".join([f"[{m['role']}] {m['content']}" for m in messages])
                for chunk in call_llm_stream(prompt, model=model):
                    if _abort_event.is_set():
                        return
                    full_text += chunk
                    yield f"data: {json.dumps({'stage': 'streaming', 'chunk': chunk})}\n\n"
            else:
                # Ollama 로컬 모델 (chat API 직접 사용)
                try:
                    resp = requests.post(f"{OLLAMA_URL}/api/chat",
                        json={"model": model, "messages": messages, "stream": True,
                              "think": not OLLAMA_CHAT_NOTHINK,
                              "options": {"num_ctx": OLLAMA_CHAT_CTX}},
                        timeout=600, stream=True)
                    if resp.status_code == 404:
                        yield f"data: {json.dumps({'stage': 'error', 'message': f'모델 {model}이(가) 설치되지 않았습니다'})}\n\n"
                        return
                    resp.raise_for_status()
                except requests.exceptions.ConnectionError:
                    yield f"data: {json.dumps({'stage': 'error', 'message': 'Ollama 서버에 연결할 수 없습니다'})}\n\n"
                    return

                for line in resp.iter_lines():
                    if _abort_event.is_set():
                        resp.close()
                        return
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        text = data.get("message", {}).get("content", "")
                        if text:
                            full_text += text
                            yield f"data: {json.dumps({'stage': 'streaming', 'chunk': text})}\n\n"
                    except json.JSONDecodeError:
                        pass

            yield f"data: {json.dumps({'stage': 'done', 'text': full_text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ─── WOL 검색 API ─────────────────────────────────────────

class WolSearchRequest(BaseModel):
    query: str
    max_results: int = 10

@app.post("/api/wol/search")
def wol_search_api(req: WolSearchRequest):
    """WOL 검색 (독립 엔드포인트)"""
    if not _HAS_BS4:
        raise HTTPException(status_code=500, detail="beautifulsoup4 미설치")
    results = search_wol(req.query, max_results=req.max_results)
    return {"results": results, "count": len(results)}

@app.get("/api/wol/status")
def wol_status():
    """WOL 검색 가용 상태"""
    return {"available": _HAS_BS4}


@app.get("/api/wol/filters")
def get_wol_filters():
    """WOL 불용어/접미사 설정 조회"""
    return _wol_filters

class WolFiltersRequest(BaseModel):
    suffixes: list[str] = []
    stopwords: list[str] = []

@app.post("/api/wol/filters")
def set_wol_filters(req: WolFiltersRequest):
    """WOL 불용어/접미사 설정 저장"""
    global _wol_filters
    _wol_filters = {"suffixes": req.suffixes, "stopwords": req.stopwords}
    _save_wol_filters(_wol_filters)
    _bm25_cache.clear()  # 접미사 변경 → BM25 인덱스 재구축 필요
    return {"ok": True, "suffixes": len(req.suffixes), "stopwords": len(req.stopwords)}

@app.post("/api/wol/filters/reset")
def reset_wol_filters():
    """WOL 불용어/접미사 기본값 복원 (사용자 기본값 → 하드코딩 기본값 순)"""
    global _wol_filters
    # 사용자 기본값 파일이 있으면 그걸 사용
    try:
        with open(_WOL_FILTERS_USER_DEFAULT_PATH, "r", encoding="utf-8") as f:
            user_default = json.load(f)
        _wol_filters = {
            "suffixes": user_default.get("suffixes", _DEFAULT_WOL_SUFFIXES),
            "stopwords": user_default.get("stopwords", _DEFAULT_WOL_STOPWORDS),
        }
        source = "user"
    except (FileNotFoundError, json.JSONDecodeError):
        _wol_filters = {"suffixes": _DEFAULT_WOL_SUFFIXES, "stopwords": _DEFAULT_WOL_STOPWORDS}
        source = "system"
    _save_wol_filters(_wol_filters)
    _bm25_cache.clear()
    return {"ok": True, "source": source,
            "suffixes": len(_wol_filters["suffixes"]),
            "stopwords": len(_wol_filters["stopwords"])}

@app.post("/api/wol/filters/save-default")
def save_wol_filters_as_default():
    """현재 필터를 사용자 기본값으로 저장"""
    os.makedirs(os.path.dirname(_WOL_FILTERS_USER_DEFAULT_PATH), exist_ok=True)
    with open(_WOL_FILTERS_USER_DEFAULT_PATH, "w", encoding="utf-8") as f:
        json.dump(_wol_filters, f, ensure_ascii=False, indent=2)
    return {"ok": True,
            "suffixes": len(_wol_filters.get("suffixes", [])),
            "stopwords": len(_wol_filters.get("stopwords", []))}

@app.post("/api/wol/filters/reset-system")
def reset_wol_filters_system():
    """하드코딩 원본 기본값으로 복원 (사용자 기본값 무시)"""
    global _wol_filters
    _wol_filters = {"suffixes": _DEFAULT_WOL_SUFFIXES, "stopwords": _DEFAULT_WOL_STOPWORDS}
    _save_wol_filters(_wol_filters)
    _bm25_cache.clear()
    return {"ok": True, "suffixes": len(_DEFAULT_WOL_SUFFIXES), "stopwords": len(_DEFAULT_WOL_STOPWORDS)}

@app.post("/api/wol/filters/test")
def test_wol_filters(req: dict):
    """쿼리 전처리 테스트 (저장하지 않고 결과만 반환)"""
    query = req.get("query", "")
    result = _clean_wol_query(query)
    return {"query": query, "cleaned": result}


# ─── 채팅 세션 관리 ──────────────────────────────────────

_CHAT_SESSIONS_PATH = os.path.join(os.path.expanduser("~/jw-system"), "chat_sessions.json")
_CHAT_MAX_SESSIONS = 10

def _load_chat_sessions():
    try:
        with open(_CHAT_SESSIONS_PATH, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

def _save_chat_sessions(sessions):
    os.makedirs(os.path.dirname(_CHAT_SESSIONS_PATH), exist_ok=True)
    with open(_CHAT_SESSIONS_PATH, "w") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)

@app.get("/api/chat/sessions")
def get_chat_sessions():
    sessions = _load_chat_sessions()
    # 목록용: 메시지 본문 제외, 메타만 반환 (최신순)
    listing = []
    for s in sessions:
        listing.append({
            "id": s["id"],
            "title": s.get("title", ""),
            "messageCount": len(s.get("messages", [])),
            "updated": s.get("updated", ""),
        })
    listing.sort(key=lambda x: x.get("updated", ""), reverse=True)
    return {"sessions": listing}

@app.get("/api/chat/sessions/{session_id}")
def get_chat_session(session_id: str):
    sessions = _load_chat_sessions()
    for s in sessions:
        if s["id"] == session_id:
            return s
    raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")

class SaveChatSessionRequest(BaseModel):
    id: str
    title: str = ""
    messages: list = []
    allResults: list = []

@app.post("/api/chat/sessions")
def save_chat_session(req: SaveChatSessionRequest):
    sessions = _load_chat_sessions()
    now = __import__("datetime").datetime.now().isoformat()
    found = False
    for i, s in enumerate(sessions):
        if s["id"] == req.id:
            sessions[i] = {"id": req.id, "title": req.title, "messages": req.messages, "allResults": req.allResults, "updated": now}
            found = True
            break
    if not found:
        if len(sessions) >= _CHAT_MAX_SESSIONS:
            # 가장 오래된 세션 삭제
            sessions.sort(key=lambda x: x.get("updated", ""), reverse=True)
            sessions = sessions[:_CHAT_MAX_SESSIONS - 1]
        sessions.insert(0, {"id": req.id, "title": req.title, "messages": req.messages, "allResults": req.allResults, "updated": now})
    _save_chat_sessions(sessions)
    return {"status": "저장 완료", "id": req.id}

@app.delete("/api/chat/sessions/{session_id}")
def delete_chat_session(session_id: str):
    sessions = _load_chat_sessions()
    sessions = [s for s in sessions if s["id"] != session_id]
    _save_chat_sessions(sessions)
    return {"status": "삭제 완료"}


class ServiceMeetingRequest(BaseModel):
    password: str
    topic: str
    scriptures: str = ""
    notes: str = ""
    past_meetings: list = []
    search_results: list = []
    auto_scriptures: list = []
    visit_mode: bool = False
    model: str = ""
    no_think: bool = False
    extra_materials: str = ""

@app.post("/api/generate/service-meeting")
def generate_service_meeting(req: ServiceMeetingRequest):
    """봉사 모임 스크립트 생성"""
    _verify_password(req.password)
    prompt = _build_service_meeting_prompt(req)
    try:
        result = call_llm(prompt, model=req.model, no_think=OLLAMA_GEN_NOTHINK)
        return {"script": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/generate/service-meeting/stream")
def generate_service_meeting_stream(req: ServiceMeetingRequest):
    """봉사 모임 스크립트 생성 (SSE 스트리밍)"""
    _verify_password(req.password)
    prompt = _build_service_meeting_prompt(req)

    def event_stream():
        _abort_event.clear()
        model_label = req.model or "기본"
        think_label = "ON" if not OLLAMA_GEN_NOTHINK else "OFF"
        print(f"[생성] model={model_label}, think={think_label} (OLLAMA_GEN_NOTHINK={OLLAMA_GEN_NOTHINK})")
        yield f"data: {json.dumps({'stage': 'calling', 'progress': 15, 'message': 'AI 호출 중 (' + model_label + ', 🧠' + think_label + ')'})}\n\n"
        full_text = ""
        char_count = 0
        try:
            for chunk in call_llm_stream(prompt, model=req.model, no_think=OLLAMA_GEN_NOTHINK):
                full_text += chunk
                char_count += len(chunk)
                progress = min(95, 20 + int(char_count / 50))
                yield f"data: {json.dumps({'stage': 'streaming', 'progress': progress, 'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'stage': 'done', 'progress': 100, 'script': full_text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

def _build_service_meeting_prompt(req: ServiceMeetingRequest) -> str:
    """봉사 모임/방문 프롬프트 구성"""
    materials = f"## 주제: {req.topic}\n"
    if req.scriptures:
        materials += f"\n### 핵심 성구\n"
        for sc in req.auto_scriptures:
            if isinstance(sc, dict) and "verses" in sc:
                for v in sc["verses"]:
                    materials += f"\n**{v['ref']}**: {v['text']}"
    if req.past_meetings:
        materials += f"\n\n### 과거 참고 (스타일/구조 참고용)\n"
        for pm in req.past_meetings:
            meta = pm.get("metadata", {})
            materials += f"\n---\n**[{meta.get('date','')}] {meta.get('outline_title', '') or meta.get('golza_title', meta.get('topic',''))}**\n"
            lines = (pm.get("text", "")).split("\n")
            body = "\n".join(l for l in lines if not l.startswith("[") and l.strip())
            materials += body[:500] + ("\n..." if len(body) > 500 else "") + "\n"
    if req.search_results:
        materials += f"\n\n### DB 검색 자료\n"
        for item in req.search_results:
            meta = item.get("metadata", {})
            speaker = meta.get("speaker", "")
            materials += f"\n**[참고]** ({speaker}) {item.get('text', '')[:300]}\n"
    if req.notes:
        materials += f"\n\n### 추가 메모/지시사항\n{req.notes}"
    if req.extra_materials:
        materials += f"\n\n### 추가 자료\n{req.extra_materials}"

    if req.visit_mode:
        return f"""당신은 여호와의 증인 장로/봉사의 종으로서 양치는 방문을 준비하고 있습니다.
아래 자료를 바탕으로 양치는 방문 스크립트를 작성해 주세요.

{materials}

## 작성 지침:
{PROMPT_TEMPLATES['visit']}
"""
    else:
        return f"""당신은 여호와의 증인 회중의 봉사 모임 사회자입니다.
아래 자료를 바탕으로 봉사 모임 스크립트를 작성해 주세요.

{materials}

## 작성 지침:
{PROMPT_TEMPLATES['service_meeting']}
"""


class RefineRequest(BaseModel):
    password: str
    speech: str
    instructions: str = ""
    model: str = ""
    no_think: bool = False


@app.post("/api/refine")
def refine_speech(req: RefineRequest):
    """연설문 다듬기"""
    _verify_password(req.password)
    instructions = req.instructions.strip() if req.instructions else "자연스럽게 다듬어 주세요"
    prompt = _build_refine_prompt(req.speech, instructions)
    try:
        result = call_llm(prompt, model=req.model, no_think=OLLAMA_GEN_NOTHINK)
        return {"speech": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API 오류: {str(e)}")


@app.post("/api/refine/stream")
def refine_speech_stream(req: RefineRequest):
    """연설문 다듬기 (SSE 스트리밍)"""
    _verify_password(req.password)
    instructions = req.instructions.strip() if req.instructions else "자연스럽게 다듬어 주세요"
    prompt = _build_refine_prompt(req.speech, instructions)

    def event_stream():
        _abort_event.clear()
        model_label = req.model or "기본"
        yield f"data: {json.dumps({'stage': 'calling', 'progress': 15, 'message': '다듬기 중... (' + model_label + ')'})}\n\n"
        full_text = ""
        char_count = 0
        try:
            for chunk in call_llm_stream(prompt, model=req.model, no_think=OLLAMA_GEN_NOTHINK):
                full_text += chunk
                char_count += len(chunk)
                progress = min(95, 20 + int(char_count / 50))
                yield f"data: {json.dumps({'stage': 'streaming', 'progress': progress, 'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'stage': 'done', 'progress': 100, 'speech': full_text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


def _build_refine_prompt(speech: str, instructions: str) -> str:
    return f"""다음은 여호와의 증인 회중 연설문 초안입니다. 아래 지시사항에 따라 다듬어 주세요.

## 연설문 초안:
{speech}

## 지시사항:
{instructions}

## 주의:
{PROMPT_TEMPLATES['refine']}
"""


class BibleSearchRequest(BaseModel):
    query: str
    mode: str = "auto"  # auto, reference, semantic
    top_k: int = 10


@app.post("/api/bible/search")
def bible_search(req: BibleSearchRequest):
    """성경 검색 - 여러 줄 참조, 그룹화된 결과"""
    client = get_db()

    query = req.query.strip()
    if not query:
        return {"results": []}

    # 여러 줄에서 성구 참조 추출 (원래 참조 유지)
    grouped = []  # [{"original": "요한 1서 2:15-17", "refs": ["요1 2:15", "요1 2:16", "요1 2:17"]}]
    lines = query.split("\n")
    # 세미콜론과 쉼표+한글로도 분리
    expanded_lines = []
    for line in lines:
        parts = re.split(r";\s*", line)
        for part in parts:
            sub = re.split(r",\s*(?=[가-힣])", part)
            expanded_lines.extend(sub)
    for line in expanded_lines:
        line = line.strip()
        if not line or line.startswith("#") or line.startswith("---"):
            continue
        line_clean = re.sub(r'^\d+\.\s*', '', line).strip()
        if not line_clean:
            continue

        refs = []
        # 단축어 참조
        expanded = expand_scripture_refs(line_clean)
        if expanded and expanded[0] != line_clean:
            refs = expanded
        else:
            # 전체이름 참조
            body_refs = extract_scriptures_from_text(line_clean)
            if body_refs:
                for br in body_refs:
                    refs.extend(expand_scripture_refs(br))
            else:
                ref_match = re.match(r'^([가-힣]+\d?)\s+(\d+):(.+)$', line_clean)
                if ref_match:
                    refs = expand_scripture_refs(line_clean)

        if refs:
            # 단장 성경 장 번호 경고 감지
            warning = ""
            ch_match = re.match(r'^(.+?)\s+(\d+):(.+)$', line_clean)
            if ch_match:
                book_check = normalize_book_name(ch_match.group(1))
                ch_num = ch_match.group(2)
                if book_check in _SINGLE_CHAPTER_BOOKS and ch_num != "1":
                    warning = f"{book_check}은(는) 1장만 있습니다 ({ch_num}장→1장 보정)"
            grouped.append({"original": line_clean, "refs": refs, "warning": warning})
        else:
            grouped.append({"original": line_clean, "refs": [], "error": "파싱 실패"})

    # DB 검색 및 그룹화된 결과 생성
    results = []
    errors = []
    total_count = 0
    bible = client.get_collection("jw_ai")

    for group in grouped:
        if group.get("error"):
            errors.append({"original": group["original"], "reason": group["error"]})
            continue

        verses = []
        not_found = []
        for ref in group["refs"]:
            try:
                res = bible.get(where={"참조": ref}, include=["documents", "metadatas"])
                if res and res["documents"]:
                    meta = res["metadatas"][0] if res["metadatas"] else {}
                    verses.append({
                        "ref": meta.get("참조", ref),
                        "verse": meta.get("절", 0),
                        "text": res["documents"][0],
                    })
                    total_count += 1
                else:
                    not_found.append(ref)
            except Exception:
                not_found.append(ref)

        if verses:
            # 첫 절의 메타데이터에서 책 정보
            first_meta_ref = group["refs"][0]
            try:
                first_res = bible.get(where={"참조": first_meta_ref}, include=["metadatas"])
                book = first_res["metadatas"][0].get("책", "") if first_res["metadatas"] else ""
            except Exception:
                book = ""

            results.append({
                "original": group["original"],
                "book": book,
                "verses": verses,
                "not_found": not_found,
                "warning": group.get("warning", ""),
            })
        elif not_found:
            errors.append({"original": group["original"], "reason": "DB에 없음", "refs": not_found})

    return {"results": results, "ref_count": total_count, "errors": errors}


@app.get("/api/publications/outline/{outline_num}")
def get_publications_by_outline(outline_num: str):
    """골자 번호로 출판물 조회"""
    client = get_db()
    try:
        col = client.get_collection("publications")
    except Exception:
        return {"publications": [], "total": 0}

    all_docs = col.get(include=["documents", "metadatas"])
    results = []

    if all_docs and all_docs["ids"]:
        for i, doc_id in enumerate(all_docs["ids"]):
            meta = all_docs["metadatas"][i] if all_docs["metadatas"] else {}
            linked = meta.get("linked_outlines", "")
            if outline_num not in linked and outline_num.zfill(3) not in linked:
                continue
            results.append({
                "id": doc_id,
                "pub_code": meta.get("pub_code", ""),
                "pub_title": meta.get("pub_title", ""),
                "reference": meta.get("reference", ""),
                "keywords": meta.get("keywords", ""),
                "text": all_docs["documents"][i] if all_docs["documents"] else "",
            })

    return {"publications": results, "total": len(results)}


@app.get("/api/collections")
def list_collections():
    client = get_db()
    cols = client.list_collections()
    return {"collections": [{"name": name, "count": client.get_collection(name).count()} for name in cols]}


@app.get("/api/cache/clear")
def clear_cache():
    """BM25 캐시 초기화 (DB에 새 데이터 추가 후 호출)"""
    _bm25_cache.clear()
    return {"status": "BM25 캐시 초기화 완료"}


@app.get("/api/db/manual")
def list_manual_entries():
    """수동 입력 항목 목록 (날짜순)"""
    client = get_db()
    entries = []
    for col_name in ["speech_points", "speech_expressions", "publications"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if all_data and all_data["ids"]:
                for i, doc_id in enumerate(all_data["ids"]):
                    meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                    if meta.get("mode") in ("manual", "batch") or meta.get("pub_type") == "manual":
                        entries.append({
                            "id": doc_id,
                            "collection": col_name,
                            "text": all_data["documents"][i] if all_data["documents"] else "",
                            "metadata": meta,
                        })
        except Exception:
            pass
    # 날짜순 정렬 (최신 먼저, ID에 timestamp 포함)
    entries.sort(key=lambda x: x["id"], reverse=True)
    return {"entries": entries, "total": len(entries)}


@app.get("/api/db/by-source/{source}")
def list_by_source(source: str, limit: int = 10, service_type: str = ""):
    """출처별 항목 목록 (최신순), service_type으로 추가 필터"""
    client = get_db()
    entries = []
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if all_data and all_data["ids"]:
                for i, doc_id in enumerate(all_data["ids"]):
                    meta = all_data["metadatas"][i] if all_data["metadatas"] else {}
                    if meta.get("source", "") != source:
                        continue
                    if service_type and meta.get("service_type", "") != service_type:
                        continue
                    entries.append({
                        "id": doc_id,
                        "collection": col_name,
                        "text": all_data["documents"][i] if all_data["documents"] else "",
                        "metadata": meta,
                    })
        except Exception:
            pass
    entries.sort(key=lambda x: x["id"], reverse=True)
    return {"entries": entries[:limit], "total": len(entries)}


class PastSearchRequest(BaseModel):
    query: str
    source: str  # "봉사 모임" or "방문"
    service_type: str = ""
    top_k: int = 10

@app.post("/api/search/past")
def search_past(req: PastSearchRequest):
    """과거 기록 검색: 주제/상황 기반으로 과거 봉사 모임/방문 검색"""
    client = get_db()
    try:
        query_emb = get_embedding(req.query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"임베딩 오류: {e}")

    all_results = []
    for col_name in ["speech_points", "speech_expressions"]:
        items = hybrid_search(client, col_name, req.query, query_emb, top_k=req.top_k * 3)
        all_results.extend(items)

    # source 필터
    filtered = [it for it in all_results if it.get("metadata", {}).get("source", "") == req.source]
    # service_type 필터 (봉사 모임)
    if req.service_type:
        filtered = [it for it in filtered if it.get("metadata", {}).get("service_type", "") == req.service_type]

    filtered.sort(key=lambda x: x["score"], reverse=True)
    return {"entries": filtered[:req.top_k], "total": len(filtered)}


@app.get("/api/db/service-types")
def list_service_types():
    """봉사 종류 목록 (DB에서 수집 - 봉사 모임 소스만)"""
    defaults = ['일반', '재방문', '기념식', '지역대회', '특별활동']
    client = get_db()
    found = set()
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["metadatas"])
            for meta in (all_data["metadatas"] or []):
                st = meta.get("service_type", "")
                src = meta.get("source", "")
                sub = meta.get("sub_source", "")
                # 봉사 모임 소스만 + 기타 연설/토의 종류가 혼입되지 않도록 차단
                if st and src == "봉사 모임" and sub != "기타 연설":
                    found.add(st)
        except Exception:
            pass
    # 기타 연설/토의 기본 종류 블랙리스트 (혼입 방지)
    blacklist = {'성경에 담긴 보물', '회중의 필요', '집회 교재', '파수대', '성서 연구', '영적 보물'}
    found -= blacklist
    # 기본 + DB에서 발견된 것 합치기 (순서 유지)
    result = list(defaults)
    for s in sorted(found):
        if s not in result:
            result.append(s)
    return {"service_types": result}


@app.post("/api/db/service-type/delete")
def delete_service_type(data: dict):
    """봉사 종류 삭제: 해당 종류의 모든 항목을 '일반'으로 변경"""
    st = data.get("service_type", "")
    if not st or st in ['일반', '재방문', '기념식', '지역대회', '특별활동']:
        raise HTTPException(status_code=400, detail="기본 종류는 삭제할 수 없습니다")
    client = get_db()
    count = 0
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas", "embeddings"])
            if all_data and all_data["ids"]:
                for i, doc_id in enumerate(all_data["ids"]):
                    meta = all_data["metadatas"][i]
                    if meta.get("service_type", "") == st:
                        meta["service_type"] = "일반"
                        col.update(ids=[doc_id], metadatas=[meta])
                        count += 1
        except Exception:
            pass
    _bm25_cache.clear()
    return {"status": f"{count}건을 '일반'으로 변경", "count": count}


class DbUpdateRequest(BaseModel):
    collection: str
    doc_id: str
    text: str
    metadata: dict = None

class DbDeleteRequest(BaseModel):
    collection: str
    doc_id: str

@app.post("/api/db/update")
def db_update(req: DbUpdateRequest):
    """DB 문서 수정"""
    client = get_db()
    try:
        col = client.get_collection(req.collection)
        emb = get_embedding(req.text)
        update_kwargs = {"ids": [req.doc_id], "documents": [req.text], "embeddings": [emb]}
        if req.metadata:
            existing = col.get(ids=[req.doc_id], include=["metadatas"])
            if existing and existing["metadatas"]:
                merged = {**existing["metadatas"][0], **req.metadata}
                update_kwargs["metadatas"] = [merged]
        col.update(**update_kwargs)
        _bm25_cache.clear()
        return {"status": "수정 완료", "id": req.doc_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/db/delete")
def db_delete(req: DbDeleteRequest):
    """DB 문서 삭제 + 골자 JSON 삭제"""
    client = get_db()
    try:
        col = client.get_collection(req.collection)
        # 골자 항목이면 JSON도 삭제
        try:
            existing = col.get(ids=[req.doc_id], include=["metadatas"])
            if existing and existing["metadatas"]:
                meta = existing["metadatas"][0]
                if meta and meta.get("source") == "outline" or meta.get("mode") == "golza":
                    gn = meta.get("outline_num", "") or meta.get("golza_num", "")
                    gt = meta.get("outline_type", "") or meta.get("golza_type", "")
                    ver = meta.get("version", "")
                    if gn:
                        # 같은 골자+버전의 다른 항목이 있는지 확인
                        where_cond = {"$and": [{"outline_num": gn}, {"source": "outline"}]}
                        if ver:
                            where_cond = {"$and": [{"outline_num": gn}, {"source": "outline"}, {"version": ver}]}
                        others = col.get(where=where_cond)
                        remaining = [i for i in (others.get("ids") or []) if i != req.doc_id]
                        if not remaining:
                            # 마지막 항목이면 JSON 삭제
                            prefix = _outline_prefix(gt, gn)
                            ver_safe = ver.replace("/", "-").replace(" ", "").strip()
                            fname = f"{prefix}_v{ver_safe}.json" if ver_safe else f"{prefix}.json"
                            fpath = os.path.join(_OUTLINES_DIR, fname)
                            if os.path.exists(fpath):
                                os.remove(fpath)
        except Exception:
            pass
        col.delete(ids=[req.doc_id])
        _bm25_cache.clear()
        return {"status": "삭제 완료", "id": req.doc_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


_OUTLINES_DIR = os.path.join(os.path.expanduser("~/jw-system"), "outlines")
_CATEGORIES_PATH = os.path.join(os.path.expanduser("~/jw-system"), "categories.json")

# 유형코드 → 유형이름 매핑
_TYPE_NAMES = {
    "S-34": "공개강연", "S-31": "기념식", "S-123": "특별강연", "S-211": "RP모임",
    "SB": "생활과봉사", "CO": "대회", "CO_순회": "대회(순회)", "CO_지역": "대회(지역)",
    "JWBC": "JW방송", "JWBC-SP": "JW방송(연설)", "JWBC-MW": "JW방송(중간주)", "JWBC-PG": "JW방송(프로그램)", "JWBC-AM": "JW방송(아침예배)",
    "ETC": "기타",
}

def _outline_prefix(otype: str, onum: str) -> str:
    """유형코드+번호 → 파일/ID용 prefix"""
    if otype in ("공개강연",) or otype.startswith("S-34"):
        return f"S-34_{onum.zfill(3)}"
    elif otype in ("기념식",) or otype.startswith("S-31"):
        return f"S-31_{onum}"
    elif otype.startswith("JWBC"):
        return f"{otype}_{onum}"
    elif otype.startswith("S-") or otype.startswith("CO") or otype.startswith("SB"):
        return f"{otype}_{onum}"
    elif otype == "ETC" or not otype:
        return onum
    else:
        return f"{otype}_{onum}"

def _ver_safe(version: str) -> str:
    """버전 문자열을 파일명에 안전하게"""
    return version.replace("/", "-").replace(" ", "").strip()


# ─── 전처리 md 파싱 API ──────────────────────────────────

@app.post("/api/preprocess/parse-md")
async def parse_md_files(files: list[UploadFile] = File(...)):
    """전처리된 md 파일을 파싱하여 구조화된 데이터 반환"""
    import re as _re

    results = []

    for file in files:
        content = (await file.read()).decode("utf-8", errors="replace")
        lines = content.split("\n")
        filename = file.filename or ""

        # ── 파일명에서 메타 추출 ──
        fn_clean = filename.replace("_preprocessed", "").replace("_processed", "").replace(".md", "").replace(".txt", "")
        fn_parts = fn_clean.split("_")

        fn_type = ""
        fn_num = ""
        fn_speaker = ""
        fn_date = ""

        if fn_parts:
            # "golza" 접두어 제거
            if fn_parts[0].lower() == "golza":
                fn_parts = fn_parts[1:]

            if fn_parts:
                first = fn_parts[0]
                rest_start = 1

                # 유형 감지
                if first.startswith("S-34"):
                    fn_type = "S-34"
                elif first.startswith("S-31"):
                    fn_type = "S-31"
                elif first.startswith("JWBC"):
                    fn_type = first
                elif _re.match(r"^S-\d{2,3}", first):
                    fn_type = first
                elif _re.match(r"^(CO|SB|ETC)", first):
                    fn_type = first
                else:
                    fn_type = first
                    rest_start = 1

                if len(fn_parts) > rest_start:
                    fn_num = fn_parts[rest_start]

                remaining = fn_parts[rest_start + 1:] if len(fn_parts) > rest_start + 1 else []
                for part in remaining:
                    if _re.match(r"^\d{4,6}$", part):
                        fn_date = part
                    elif part not in ("preprocessed", "processed", "v1", "v2"):
                        fn_speaker = fn_speaker or part

        # ── 내용에서 메타데이터 추출 ──
        meta = {
            "outline_type": fn_type,
            "outline_num": fn_num,
            "title": "",
            "version": "",
            "time": "",
            "note": "",
            "speaker": fn_speaker,
            "date": fn_date,
            "source": "",
            "memo": "",
            "theme_scripture": "",
        }

        for line in lines:
            stripped = line.strip()
            if stripped.startswith("- **연사**:"):
                meta["speaker"] = meta["speaker"] or stripped.replace("- **연사**:", "").strip()
            elif stripped.startswith("- **날짜**:"):
                meta["date"] = meta["date"] or _re.sub(r"\s*\(.*\)", "", stripped.replace("- **날짜**:", "")).strip()
            elif stripped.startswith("- **골자번호**:") or stripped.startswith("- **번호**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                meta["outline_num"] = meta["outline_num"] or val
            elif stripped.startswith("- **제목**:"):
                meta["title"] = stripped.replace("- **제목**:", "").strip()
            elif stripped.startswith("- **골자유형**:") or stripped.startswith("- **유형**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                if val:
                    meta["outline_type"] = val
            elif stripped.startswith("- **골자버전**:") or stripped.startswith("- **버전**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                meta["version"] = val
            elif stripped.startswith("- **시간**:") or stripped.startswith("- **총 시간**:"):
                val = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
                meta["time"] = meta["time"] or val
            elif stripped.startswith("- **유의사항**:"):
                meta["note"] = stripped.replace("- **유의사항**:", "").strip()
            elif stripped.startswith("- **출처**:"):
                meta["source"] = stripped.replace("- **출처**:", "").strip()
            elif stripped.startswith("- **메모**:") or stripped.startswith("- **비고**:"):
                meta["memo"] = stripped.split(":", 1)[1].strip() if ":" in stripped else ""
            elif stripped.startswith("- **주제성구**:") or stripped.startswith("- **주제 성구**:"):
                meta["theme_scripture"] = stripped.split(":", 1)[1].strip() if ":" in stripped else ""

        # ── 유형 보정 ──
        ot = meta["outline_type"]
        on = meta["outline_num"]
        if not ot and on:
            if _re.match(r"^\d{1,3}$", on):
                meta["outline_type"] = "S-34"
            elif on.startswith("기념식") or on.startswith("S-31"):
                meta["outline_type"] = "S-31"
        # outline_type_name 자동 설정
        meta["outline_type_name"] = _TYPE_NAMES.get(meta["outline_type"], meta["outline_type"])

        # ── 소주제 + 요점 파싱 ──
        subtopics = []
        current_sub = {"num": 0, "title": "", "time": "", "points": []}

        section_blocks = content.split("\n### ")

        sub_pattern = _re.compile(r"^## 소주제\s*(\d+)\s*[:：]\s*(.+?)(?:\s*\((\d+[~\-]?\d*분)\))?\s*$", _re.MULTILINE)
        sub_matches = list(sub_pattern.finditer(content))

        # 연사 특징 메모
        speaker_memo = ""
        memo_match = _re.search(r"## 연사 특징 메모\s*\n([\s\S]*?)(?=\n## |\Z)", content)
        if memo_match:
            speaker_memo = memo_match.group(1).strip()

        def _extract_field(block, name):
            m = _re.search(rf"- \*\*{name}\*\*:\s*(.*?)(?:\n|$)", block)
            return m.group(1).strip() if m else ""

        def _extract_bold_field(block, name):
            m = _re.search(rf"\*\*\[{name}\]\*\*:?\s*(.*)", block)
            return m.group(1).strip() if m else ""

        for i, block_raw in enumerate(section_blocks[1:], 1):
            block = "### " + block_raw

            level_match = _re.match(r"### (?:🟥|🟧|🟨|🟩|🟦|🟪)\s*\[L(\d)\]\s*([\d.]+(?:\.\d+)*)", block)
            if not level_match:
                continue

            level_num = int(level_match.group(1))
            point_num = level_match.group(2)
            level = f"L{level_num}"

            block_start = content.find(block_raw)
            belonging_sub = 0
            for sm in sub_matches:
                if sm.start() < block_start:
                    belonging_sub = int(sm.group(1))

            if belonging_sub > 0 and (not subtopics or subtopics[-1]["num"] != belonging_sub):
                if current_sub["points"]:
                    subtopics.append(current_sub)
                sm_obj = next((s for s in sub_matches if int(s.group(1)) == belonging_sub), None)
                current_sub = {
                    "num": belonging_sub,
                    "title": sm_obj.group(2).strip() if sm_obj else "",
                    "time": sm_obj.group(3) or "" if sm_obj else "",
                    "points": [],
                }

            subtopic_val = _extract_field(block, "소주제")
            point_content = _extract_field(block, "요점") or _extract_field(block, "내용")

            scripture = _extract_field(block, "성구")
            scripture_usage = ""
            if scripture:
                scripture = _re.sub(r"\s*✅", "", scripture).strip()
                # (낭독)/(미언급)/(참조)/(적용) 추출
                usage_m = _re.search(r"\((낭독|참조|미언급|적용)\)", scripture)
                if usage_m:
                    scripture_usage = usage_m.group(1)
                    scripture = _re.sub(r"\s*\((낭독|참조|미언급|적용)\)", "", scripture).strip()

            publications = _extract_field(block, "출판물")

            has_speech_data = "**[연설내용_전체]**" in block
            raw_usage = _extract_field(block, "사용여부")
            usage = raw_usage or ("미상" if has_speech_data else "사용")

            speech_text = ""
            speech_match = _re.search(r"\*\*\[연설내용_전체\]\*\*\n(.*?)(?:\n\*\*\[키워드\]|\n\*\*\[태그\]|\n\*\*\[연설기법\]|\n\*\*\[표현\]|\n\*\*\[예시\]|\n---|\s*$)", block, _re.DOTALL)
            if speech_match:
                speech_text = speech_match.group(1).strip()

            keywords = _extract_bold_field(block, "키워드").replace("**", "")
            if keywords.startswith(":"):
                keywords = keywords[1:].strip()
            tags = _extract_bold_field(block, "태그").replace("**", "")
            if tags.startswith(":"):
                tags = tags[1:].strip()

            point_data = {
                "num": point_num,
                "level": level,
                "text": point_content,
                "subtopic": subtopic_val,
                "scriptures": scripture,
                "scripture_usage": scripture_usage,
                "publications": publications,
                "speech_text": speech_text,
                "keywords": keywords,
                "tags": tags,
                "usage": usage,
            }
            current_sub["points"].append(point_data)

        if current_sub["points"]:
            subtopics.append(current_sub)
        if not subtopics and current_sub["points"]:
            subtopics.append(current_sub)

        # ── 출판물 파싱 ──
        file_publications = []
        is_pub_file = "출판물" in filename or "### [pub_" in content
        if is_pub_file:
            pub_sections = content.split("### [pub_")
            for pi, pub_sec in enumerate(pub_sections[1:], 1):
                pub_block = "### [pub_" + pub_sec
                pub_hdr = _re.match(r"### \[(pub_[^\]]+)\]\s*(.*)", pub_block)
                if not pub_hdr:
                    continue
                pub_id_raw = pub_hdr.group(1)
                pub_code_raw = pub_hdr.group(2).strip()
                pub_abbr = _extract_field(pub_block, "출판물약호")
                pub_title = _extract_field(pub_block, "출판물제목")
                pub_ref = _extract_field(pub_block, "참조본문")
                pub_type = _extract_field(pub_block, "유형")
                outline_point = _extract_field(pub_block, "골자요점") or _extract_field(pub_block, "요점번호")
                point_content_pub = _extract_field(pub_block, "요점내용") or _extract_field(pub_block, "내용")
                keywords_pub = _extract_field(pub_block, "키워드")
                cross_ref = _extract_field(pub_block, "교차참조")
                body = ""
                body_match = _re.search(r"\*\*\[본문\]\*\*\n(.*?)(?=\n---|\n### |\s*$)", pub_block, _re.DOTALL)
                if body_match:
                    body = body_match.group(1).strip()
                if not body:
                    continue
                file_publications.append({
                    "pub_id": pub_id_raw,
                    "pub_code": pub_code_raw or pub_abbr,
                    "pub_abbr": pub_abbr,
                    "pub_title": pub_title,
                    "reference": pub_ref,
                    "pub_type": pub_type,
                    "outline_point": outline_point,
                    "point_content": point_content_pub,
                    "keywords": keywords_pub,
                    "cross_ref": cross_ref,
                    "body": body,
                })

        # ── 검증 ──
        warnings = []
        total_points = sum(len(s["points"]) for s in subtopics)
        total_pubs = len(file_publications)
        if total_points == 0 and total_pubs == 0:
            warnings.append("요점/출판물이 하나도 파싱되지 않았습니다")
        if not meta["title"]:
            warnings.append("제목이 감지되지 않았습니다")
        if not meta["outline_num"]:
            warnings.append("골자 번호가 감지되지 않았습니다")

        # 파일명 검증
        fn_std = _re.match(r"^(golza_)?(S-\d+|CO|SB|ETC|JWBC[\w-]*)_", fn_clean) or _re.match(r"^\d{3}_", fn_clean)
        if not fn_std and filename:
            warnings.append(f"파일명 형식 비표준: {filename}")

        # 요점별 검증
        def _validate_scripture(scr, pt_num):
            """성구 형식 검증"""
            if not scr:
                return
            # 마크다운 필드가 섞여 들어온 경우 무시
            if scr.startswith("- **") or scr.startswith("**"):
                return
            for part in _re.split(r"[;；]", scr):
                part = part.strip()
                if not part:
                    continue
                # 마크다운 잔여물 무시
                if part.startswith("- **") or part.startswith("**"):
                    continue
                # "히브리서 13)" — 절 번호 없음 (장만 있고 콜론 없음)
                if _re.search(r"\d+\)?\s*$", part) and ":" not in part:
                    warnings.append(f"{pt_num}: 성구 형식 오류 — '{part.strip()}' (절 번호 없음)")
                # "렘 17:" — 콜론 뒤 비어있음
                elif _re.search(r":\s*$", part):
                    warnings.append(f"{pt_num}: 성구 형식 오류 — '{part.strip()}' (콜론 뒤 비어있음)")

        for sub in subtopics:
            for pt in sub["points"]:
                pn = pt.get("num", "?")
                if not pt["text"]:
                    warnings.append(f"{pn}: 요점 내용 없음")
                if not pt["num"]:
                    warnings.append(f"번호 없는 요점")
                _validate_scripture(pt.get("scriptures", ""), pn)

        # ── 골자 JSON 존재 확인 ──
        outline_status = None
        ot = meta["outline_type"]
        on = meta["outline_num"]
        if ot and on and not ot.startswith("JWBC"):
            prefix = _outline_prefix(ot, on)
            outline_files = []
            if os.path.exists(_OUTLINES_DIR):
                for gf in os.listdir(_OUTLINES_DIR):
                    if gf.startswith(prefix) and gf.endswith(".json"):
                        outline_files.append(gf)
            if outline_files:
                versions = []
                for gf in outline_files:
                    ver_match = _re.search(r"_v([\d\-]+)\.json$", gf)
                    versions.append(ver_match.group(1).replace("-", "/") if ver_match else "unknown")
                outline_status = {"exists": True, "files": outline_files, "versions": versions}
            else:
                outline_status = {"exists": False, "files": [], "versions": []}

        # 파일 형식 감지
        has_any_speech = any(pt.get("speech_text") for sub in subtopics for pt in sub.get("points", []))
        if is_pub_file and total_pubs > 0:
            file_format = "publication"
        elif has_any_speech:
            file_format = "speech"
        else:
            file_format = "outline"

        results.append({
            "filename": filename,
            "meta": meta,
            "subtopics": subtopics,
            "publications": file_publications,
            "speaker_memo": speaker_memo,
            "file_format": file_format,
            "total_points": total_points,
            "total_publications": total_pubs,
            "total_subtopics": len(subtopics),
            "warnings": warnings,
            "outline_status": outline_status,
        })

    return {"files": results, "total": len(results)}


# ─── 전처리 저장 API (3개 저장소 완전 분리) ────────────────

@app.post("/api/preprocess/save-outline")
def save_outline(req: dict):
    """골자 요점 저장 — speech_points만 (speech_expressions/publications 절대 안 건드림)"""
    os.makedirs(_OUTLINES_DIR, exist_ok=True)
    client = get_db()
    col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})
    overwrite = req.get("overwrite", False)
    files = req.get("files", [])
    results = []

    for item in files:
        meta = item.get("meta", {})
        subtopics = item.get("subtopics", [])
        ot = meta.get("outline_type", "")
        on = meta.get("outline_num", "")
        ot_name = meta.get("outline_type_name", "") or _TYPE_NAMES.get(ot, ot)
        title = meta.get("title", "")
        version = meta.get("version", "")
        vs = _ver_safe(version)

        if not on:
            results.append({"outline_num": on, "status": "error", "message": "번호 없음", "saved": 0})
            continue

        prefix = _outline_prefix(ot, on)
        fname = f"{prefix}_v{vs}.json" if vs else f"{prefix}.json"
        fpath = os.path.join(_OUTLINES_DIR, fname)

        if os.path.exists(fpath) and not overwrite:
            results.append({"outline_num": on, "status": "exists", "message": f"골자 {on}번 (v{version})이 이미 존재합니다", "saved": 0})
            continue

        # 덮어쓰기 시 기존 삭제
        if overwrite:
            try:
                wc = {"$and": [{"outline_num": on}, {"source": "outline"}]}
                if version:
                    wc = {"$and": [{"outline_num": on}, {"source": "outline"}, {"version": version}]}
                ex = col.get(where=wc)
                if ex and ex["ids"]:
                    col.delete(ids=ex["ids"])
            except Exception:
                pass

        saved = 0
        errors = 0
        saved_subtopics = []

        for sub in subtopics:
            sub_title = sub.get("title", "")
            sub_num = sub.get("num", 0)
            sub_time = sub.get("time", "")
            saved_pts = []

            for pt in sub.get("points", []):
                pt_num = pt.get("num", "")
                pt_text = pt.get("text", "")
                pt_level = pt.get("level", "L1")
                scriptures = pt.get("scriptures", "")
                scripture_usage = pt.get("scripture_usage", "")
                pubs = pt.get("publications", "")
                usage = pt.get("usage", "사용")

                if not pt_text:
                    continue
                if "미사용" in usage and "합쳐서" not in usage:
                    continue

                doc_id = f"{prefix}_v{vs}_{pt_num}" if vs else f"{prefix}_{pt_num}"

                doc_parts = [f"[골자] {on} - {title}"]
                if sub_title:
                    doc_parts.append(f"[소주제] {sub_num}. {sub_title}")
                doc_parts.append(f"[요점] {pt_num} - {pt_text}")
                if scriptures:
                    doc_parts.append(f"[성구] {scriptures}")
                if pubs:
                    doc_parts.append(f"[출판물] {pubs}")
                doc_parts.append("")
                doc_parts.append(pt_text)
                doc_text = "\n".join(doc_parts)

                doc_meta = {
                    "outline_type": ot, "outline_type_name": ot_name, "outline_num": on, "outline_title": title,
                    "version": version, "time": meta.get("time", ""), "note": meta.get("note", ""),
                    "sub_topic": f"{sub_num}. {sub_title}" if sub_title else "", "sub_topic_num": sub_num, "sub_topic_time": sub_time,
                    "point_num": pt_num, "level": pt_level, "point_content": pt_text,
                    "scriptures": scriptures, "scripture_usage": scripture_usage, "publications": pubs,
                    "source": "outline", "memo": "", "importance": 0,
                }

                try:
                    emb = get_embedding(doc_text)
                    col.upsert(ids=[doc_id], documents=[doc_text], metadatas=[doc_meta], embeddings=[emb])
                    saved += 1
                    saved_pts.append({**pt, "doc_id": doc_id})
                except Exception:
                    errors += 1
                    saved_pts.append({**pt, "doc_id": None})

            saved_subtopics.append({"num": sub_num, "title": sub_title, "time": sub_time, "point_count": len(saved_pts), "points": saved_pts})

        # JSON 저장
        outline_data = {
            "outline_type": ot, "outline_type_name": ot_name, "outline_num": on,
            "title": title, "version": version, "time": meta.get("time", ""), "note": meta.get("note", ""),
            "subtopics": [{"num": s["num"], "title": s["title"], "time": s["time"], "point_count": s["point_count"]} for s in saved_subtopics],
            "saved_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(outline_data, f, ensure_ascii=False, indent=2)

        results.append({"outline_num": on, "status": "ok", "message": f"골자 {on}번 저장 ({saved}개)", "saved": saved, "errors": errors})

    _bm25_cache.clear()
    total = sum(r.get("saved", 0) for r in results)
    return {"results": results, "total_files": len(results), "total_saved": total, "message": f"골자 {total}개 저장"}




@app.post("/api/preprocess/save-speech")
def save_speech(req: dict):
    """연설/메모/봉사/방문 저장 — speech_expressions만 (speech_points/publications 절대 안 건드림)"""
    client = get_db()
    col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})
    files = req.get("files", [])
    overwrite = req.get("overwrite", False)
    results = []

    for item in files:
        meta = item.get("meta", {})
        subtopics = item.get("subtopics", [])
        speaker_memo_text = item.get("speaker_memo", "")
        ot = meta.get("outline_type", "")
        ot_name = meta.get("outline_type_name", "") or _TYPE_NAMES.get(ot, ot)
        on = meta.get("outline_num", "")
        title = meta.get("title", "")
        version = meta.get("version", "")
        vs = _ver_safe(version)
        speaker = meta.get("speaker", "")
        date = meta.get("date", "")
        source = meta.get("source", "speech")
        theme_scripture = meta.get("theme_scripture", "")
        prefix = _outline_prefix(ot, on) if on else ""

        saved = 0
        updated = 0
        errors = 0

        # 기존 ID 수집 (신규/업데이트 구분)
        existing_ids = set()
        if speaker and on:
            try:
                ex = col.get(where={"$and": [{"outline_num": on}, {"speaker": speaker}, {"date": date}]})
                existing_ids = set(ex.get("ids", []))
            except Exception:
                pass

        # 덮어쓰기 시 기존 삭제
        if overwrite and existing_ids:
            try:
                col.delete(ids=list(existing_ids))
            except Exception:
                pass
            existing_ids = set()

        # 공통 메타 빌더
        def _base_meta():
            return {
                "outline_type": ot, "outline_type_name": ot_name, "outline_num": on, "outline_title": title,
                "version": version, "rating": 0, "rating_note": "", "favorite": "false", "used_count": 0, "last_used": "",
            }

        for sub in subtopics:
            sub_title = sub.get("title", "")
            sub_num = sub.get("num", 0)
            for pt in sub.get("points", []):
                pt_num = pt.get("num", "")
                pt_text = pt.get("text", "")
                pt_level = pt.get("level", "L1")
                scriptures = pt.get("scriptures", "")
                scripture_usage = pt.get("scripture_usage", "")
                pubs = pt.get("publications", "")
                speech_text = pt.get("speech_text", "")
                keywords = pt.get("keywords", "")
                tags = pt.get("tags", "")
                usage = pt.get("usage", "사용")

                if not speech_text and not pt_text:
                    continue
                if "미사용" in usage and "합쳐서" not in usage:
                    continue

                # 연설 본문 → speech_expressions
                if speech_text:
                    doc_id = f"{prefix}_v{vs}_{speaker}_{date}_{pt_num}" if vs else f"{prefix}_{speaker}_{date}_{pt_num}"
                    doc_parts = [f"[연설] {speaker} ({date})", f"[골자] {on} - {title}"]
                    if sub_title:
                        doc_parts.append(f"[소주제] {sub_num}. {sub_title}")
                    doc_parts.append(f"[요점] {pt_num} - {pt_text}")
                    if scriptures:
                        doc_parts.append(f"[성구] {scriptures}")
                    if keywords:
                        doc_parts.append(f"[키워드] {keywords}")
                    doc_parts.append("")
                    doc_parts.append(speech_text)
                    doc_text = "\n".join(doc_parts)

                    doc_meta = {**_base_meta(),
                        "sub_topic": f"{sub_num}. {sub_title}" if sub_title else "", "point_num": pt_num,
                        "level": pt_level, "point_content": pt_text,
                        "scriptures": scriptures, "scripture_usage": scripture_usage, "publications": pubs,
                        "source": "speech", "speaker": speaker, "date": date, "usage": usage,
                        "keywords": keywords, "tags": tags, "theme_scripture": theme_scripture,
                    }
                    try:
                        emb = get_embedding(doc_text)
                        col.upsert(ids=[doc_id], documents=[doc_text], metadatas=[doc_meta], embeddings=[emb])
                        if doc_id in existing_ids:
                            updated += 1
                        else:
                            saved += 1
                    except Exception:
                        errors += 1

                # 태그(표현/예시) → speech_expressions (별도 문서)
                if tags:
                    etype = "example" if "예시" in tags else "expression"
                    ex_id = f"{etype}_{prefix}_{speaker}_{date}_{pt_num}"
                    ex_parts = [f"[{etype}] {tags}", f"[골자] {on} - {title}"]
                    if sub_title:
                        ex_parts.append(f"[소주제] {sub_num}. {sub_title}")
                    if pt_text:
                        ex_parts.append(f"[요점] {pt_text}")
                    if keywords:
                        ex_parts.append(f"[키워드] {keywords}")
                    if speech_text:
                        ex_parts.append(f"[연설내용] {speech_text}")
                    ex_doc = "\n".join(ex_parts)

                    ex_meta = {**_base_meta(),
                        "sub_topic": f"{sub_num}. {sub_title}" if sub_title else "", "point_num": pt_num,
                        "level": pt_level, "point_content": pt_text,
                        "scriptures": scriptures, "scripture_usage": scripture_usage, "publications": pubs,
                        "source": "speech", "speaker": speaker, "date": date,
                        "keywords": keywords, "tags": tags, "theme_scripture": theme_scripture,
                    }
                    try:
                        emb = get_embedding(ex_doc)
                        col.upsert(ids=[ex_id], documents=[ex_doc], metadatas=[ex_meta], embeddings=[emb])
                        if ex_id in existing_ids:
                            updated += 1
                        else:
                            saved += 1
                    except Exception:
                        errors += 1

        # 연사 메모 저장
        if speaker_memo_text and speaker:
            memo_id = f"{prefix}_v{vs}_{speaker}_{date}_memo" if vs else f"{prefix}_{speaker}_{date}_memo"
            memo_doc = f"[골자] {on} - {title}\n[연사 메모] {speaker}\n\n{speaker_memo_text}"
            memo_meta = {**_base_meta(), "source": "speaker_memo", "speaker": speaker, "date": date}
            try:
                emb = get_embedding(memo_doc)
                col.upsert(ids=[memo_id], documents=[memo_doc], metadatas=[memo_meta], embeddings=[emb])
                saved += 1
            except Exception:
                errors += 1

        results.append({"outline_num": on, "speaker": speaker, "date": date, "saved": saved, "updated": updated, "errors": errors})

    _bm25_cache.clear()
    total_new = sum(r["saved"] for r in results)
    total_upd = sum(r["updated"] for r in results)
    parts = []
    if total_new: parts.append(f"연설 {total_new}개 신규")
    if total_upd: parts.append(f"{total_upd}개 업데이트")
    if not parts: parts.append("변경 없음")
    return {"results": results, "total_new": total_new, "total_updated": total_upd, "message": " · ".join(parts)}


@app.post("/api/preprocess/save-publication")
def save_publication(req: dict):
    """출판물 저장 — publications만 (speech_points/speech_expressions 절대 안 건드림)"""
    client = get_db()
    col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})
    files = req.get("files", [])
    results = []

    for item in files:
        meta = item.get("meta", {})
        pubs = item.get("publications", [])
        ot = meta.get("outline_type", "")
        on = meta.get("outline_num", "")
        title = meta.get("title", "")
        version = meta.get("version", "")
        vs = _ver_safe(version)
        prefix = _outline_prefix(ot, on) if on else ""
        saved = 0
        errors = 0

        for pub in pubs:
            pub_code = pub.get("pub_code", "")
            pub_title = pub.get("pub_title", "")
            pub_ref = pub.get("reference", "")
            pub_type = pub.get("pub_type", "")
            outline_point = pub.get("outline_point", "") or pub.get("golza_point", "")
            point_content = pub.get("point_content", "")
            keywords = pub.get("keywords", "")
            cross_ref = pub.get("cross_ref", "")
            body = pub.get("body", "")
            if not body:
                continue

            # 문서 ID: pub_코드_참조
            ref_safe = pub_ref.replace(" ", "").replace("/", "-")[:30] if pub_ref else str(saved + 1).zfill(2)
            doc_id = f"pub_{pub_code}_{ref_safe}"

            # 같은 출판물이 이미 있으면 linked_outlines만 업데이트
            link_entry = f"{prefix}:{outline_point}" if prefix and outline_point else prefix
            try:
                existing = col.get(ids=[doc_id], include=["metadatas"])
                if existing and existing["ids"]:
                    old_meta = existing["metadatas"][0]
                    old_links = old_meta.get("linked_outlines", "")
                    if link_entry and link_entry not in old_links:
                        new_links = f"{old_links}, {link_entry}" if old_links else link_entry
                        old_meta["linked_outlines"] = new_links
                        col.update(ids=[doc_id], metadatas=[old_meta])
                    saved += 1
                    continue
            except Exception:
                pass

            doc_parts = [f"[출판물] {pub_code} ({pub_title})"]
            if pub_ref:
                doc_parts.append(f"[참조] {pub_ref}")
            if outline_point:
                doc_parts.append(f"[골자요점] {outline_point} - {point_content}")
            if keywords:
                doc_parts.append(f"[키워드] {keywords}")
            doc_parts.append("")
            doc_parts.append(body)
            doc_text = "\n".join(doc_parts)

            ot_name = meta.get("outline_type_name", "") or _TYPE_NAMES.get(ot, ot)
            doc_meta = {
                "pub_code": pub_code, "pub_title": pub_title, "reference": pub_ref,
                "pub_type": pub_type, "keywords": keywords,
                "linked_outlines": link_entry, "source": "publication",
                "outline_type": ot, "outline_type_name": ot_name,
                "outline_num": on, "outline_title": title, "version": version,
            }

            try:
                emb = get_embedding(doc_text)
                col.upsert(ids=[doc_id], documents=[doc_text], metadatas=[doc_meta], embeddings=[emb])
                saved += 1
            except Exception:
                errors += 1

        results.append({"outline_num": on, "saved": saved, "errors": errors})

    _bm25_cache.clear()
    total = sum(r["saved"] for r in results)
    return {"results": results, "total_saved": total, "message": f"출판물 {total}개 저장"}


@app.post("/api/preprocess/bulk-save")
def bulk_save(req: dict):
    """일괄 저장 — 파일 형식별 자동 분류 후 각 저장소에 분리 저장"""
    files = req.get("files", [])
    outline_files = []
    speech_files = []
    pub_files = []

    for f in files:
        fmt = f.get("file_format", "")
        want_outline = f.get("_saveOutline", True)
        want_speech = f.get("_saveSpeech", True)
        want_pub = f.get("_savePub", True)
        if fmt == "outline" and want_outline:
            outline_files.append(f)
        if fmt in ("speech", "outline") and want_speech:
            has_speech = any(pt.get("speech_text") for sub in f.get("subtopics", []) for pt in sub.get("points", []))
            if has_speech:
                speech_files.append(f)
        if fmt == "publication" and want_pub:
            pub_files.append(f)
        # 연설 파일에도 출판물이 있을 수 있음
        if want_pub and f.get("publications"):
            if f not in pub_files:
                pub_files.append(f)

    outline_res = save_outline({"files": outline_files, "overwrite": req.get("overwrite_outline", False)}) if outline_files else {"total_saved": 0, "results": []}
    speech_res = save_speech({"files": speech_files, "overwrite": req.get("overwrite_speech", False)}) if speech_files else {"total_new": 0, "total_updated": 0, "results": []}
    pub_res = save_publication({"files": pub_files}) if pub_files else {"total_saved": 0, "results": []}

    parts = []
    if outline_res.get("total_saved"): parts.append(f"골자 {outline_res['total_saved']}개")
    if speech_res.get("total_new"): parts.append(f"연설 {speech_res['total_new']}개 신규")
    if speech_res.get("total_updated"): parts.append(f"연설 {speech_res['total_updated']}개 업데이트")
    if pub_res.get("total_saved"): parts.append(f"출판물 {pub_res['total_saved']}개")
    if not parts: parts.append("변경 없음")

    return {
        "outline": outline_res, "speech": speech_res, "publication": pub_res,
        "message": f"{len(files)}개 파일 — " + " · ".join(parts),
    }


@app.post("/api/preprocess/check-duplicates")
def preprocess_check_duplicates(req: dict):
    """저장 전 중복 체크"""
    client = get_db()
    sp_col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})
    ex_col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})
    duplicates = []

    for item in req.get("files", []):
        meta = item.get("meta", {})
        on = meta.get("outline_num", "")
        version = meta.get("version", "")
        speaker = meta.get("speaker", "")
        date = meta.get("date", "")
        fmt = item.get("file_format", "")

        # 연설 중복
        if speaker and date:
            try:
                ex = ex_col.get(where={"$and": [{"outline_num": on}, {"speaker": speaker}, {"date": date}]})
                if ex and ex["ids"]:
                    duplicates.append({"type": "speech", "outline_num": on, "speaker": speaker, "date": date, "count": len(ex["ids"]), "message": f"이미 등록된 연설입니다 ({speaker}/{date}). 덮어쓰시겠습니까?"})
            except Exception:
                pass

        # 골자 중복
        if fmt == "outline":
            try:
                wc = {"$and": [{"outline_num": on}, {"source": "outline"}]}
                if version:
                    wc = {"$and": [{"outline_num": on}, {"source": "outline"}, {"version": version}]}
                ex = sp_col.get(where=wc)
                if ex and ex["ids"]:
                    duplicates.append({"type": "outline", "outline_num": on, "version": version, "count": len(ex["ids"]), "message": f"골자 {on}번이 이미 등록되어 있습니다. 덮어쓰시겠습니까?"})
            except Exception:
                pass

    return {"duplicates": duplicates, "has_duplicates": len(duplicates) > 0}


# ─── 카테고리 API ──────────────────────────────────

@app.get("/api/categories")
def get_categories():
    """카테고리 조회"""
    default = {
        "visit_situations": ["건강 문제", "경제적 어려움", "가족 문제", "낙담/우울", "신앙 약화", "사별", "박해/반대", "기타"],
        "visit_targets": ["청년", "중년", "장년", "특정인"],
        "service_types": ["초회 방문", "재방문", "성경 공부", "비공식 증거", "편지 봉사", "전화 봉사", "기타"],
    }
    if os.path.exists(_CATEGORIES_PATH):
        try:
            with open(_CATEGORIES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


@app.post("/api/categories")
def save_categories(req: dict):
    """카테고리 수정"""
    with open(_CATEGORIES_PATH, "w", encoding="utf-8") as f:
        json.dump(req, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}


# ─── 골자 조회/삭제 API ──────────────────────────────────

@app.get("/api/outline/list")
def outline_list():
    """등록된 골자 목록"""
    items = []
    if os.path.exists(_OUTLINES_DIR):
        for fname in sorted(os.listdir(_OUTLINES_DIR)):
            if not fname.endswith(".json"):
                continue
            fpath = os.path.join(_OUTLINES_DIR, fname)
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                items.append({
                    "filename": fname,
                    "outline_type": data.get("outline_type", ""),
                    "outline_type_name": data.get("outline_type_name", ""),
                    "outline_num": data.get("outline_num", ""),
                    "title": data.get("title", ""),
                    "version": data.get("version", ""),
                    "subtopics": len(data.get("subtopics", [])),
                    "saved_at": data.get("saved_at", ""),
                })
            except Exception:
                continue
    return {"outlines": items}


@app.get("/api/outline/{outline_id}")
def outline_detail(outline_id: str):
    """골자 상세 (speech_points에서 조회)"""
    client = get_db()
    col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})

    # outline_id = S-34_001 형태
    parts = outline_id.rsplit("_", 1)
    if len(parts) == 2:
        ot_prefix, on = parts[0], parts[1]
    else:
        on = outline_id
        ot_prefix = ""

    try:
        result = col.get(where={"$and": [{"outline_num": on}, {"source": "outline"}]}, include=["documents", "metadatas"])
    except Exception:
        return {"subtopics": {}}

    subtopics = {}
    for i, doc_id in enumerate(result.get("ids", [])):
        meta = result["metadatas"][i] if result.get("metadatas") else {}
        st = meta.get("sub_topic", "기타")
        if st not in subtopics:
            subtopics[st] = []
        subtopics[st].append({"id": doc_id, "point_num": meta.get("point_num", ""), "level": meta.get("level", ""), "content": meta.get("point_content", ""), "scriptures": meta.get("scriptures", "")})

    # 정렬
    def sort_key(st):
        m = re.match(r"^(\d+)", st)
        return int(m.group(1)) if m else 999
    sorted_sub = dict(sorted(subtopics.items(), key=lambda x: sort_key(x[0])))
    for st in sorted_sub:
        sorted_sub[st].sort(key=lambda p: p["id"])
    return {"subtopics": sorted_sub}


# ─── 1단계: 전체 삭제 (컬렉션 단위) ──────────────────────

@app.delete("/api/db/clear/{collection_name}")
def clear_collection(collection_name: str):
    """컬렉션 전체 삭제 (jw_ai는 보호)"""
    if collection_name == "jw_ai":
        raise HTTPException(status_code=403, detail="jw_ai 컬렉션은 삭제할 수 없습니다")
    if collection_name not in ("speech_points", "speech_expressions", "publications"):
        raise HTTPException(status_code=400, detail=f"허용되지 않는 컬렉션: {collection_name}")

    client = get_db()
    deleted = 0
    try:
        col = client.get_collection(collection_name)
        deleted = col.count()
        client.delete_collection(collection_name)
    except Exception:
        pass

    # speech_points 삭제 시 outlines 폴더도 비움
    if collection_name == "speech_points" and os.path.exists(_OUTLINES_DIR):
        for fname in os.listdir(_OUTLINES_DIR):
            if fname.endswith(".json"):
                try:
                    os.remove(os.path.join(_OUTLINES_DIR, fname))
                except Exception:
                    pass

    _bm25_cache.clear()
    return {"deleted": deleted}


# ─── 2단계: 골자별 삭제 ──────────────────────────────────

@app.delete("/api/preprocess/outline/{outline_id:path}")
def delete_outline(outline_id: str):
    """골자 단위 삭제 — speech_points에서 해당 골자 전부 + JSON 삭제 (연설/출판물 안 건드림)"""
    client = get_db()
    col = client.get_or_create_collection("speech_points", metadata={"hnsw:space": "cosine"})

    # outline_id = S-34_001_v09-15 형태
    # ID가 이 prefix로 시작하는 모든 문서 삭제
    all_docs = col.get(include=["metadatas"])
    ids_to_delete = []
    if all_docs and all_docs["ids"]:
        for i, did in enumerate(all_docs["ids"]):
            if did.startswith(outline_id):
                ids_to_delete.append(did)

    deleted = 0
    if ids_to_delete:
        col.delete(ids=ids_to_delete)
        deleted = len(ids_to_delete)

    # JSON 파일 삭제
    json_path = os.path.join(_OUTLINES_DIR, f"{outline_id}.json")
    if os.path.exists(json_path):
        os.remove(json_path)

    _bm25_cache.clear()
    return {"deleted": deleted}


# ─── 3단계: 개별 삭제 ──────────────────────────────────

@app.delete("/api/preprocess/speech/{doc_id:path}")
def delete_speech(doc_id: str):
    """연설 개별/연사별 삭제 — speech_expressions만"""
    client = get_db()
    col = client.get_or_create_collection("speech_expressions", metadata={"hnsw:space": "cosine"})

    # doc_id가 정확한 ID이면 1건 삭제, prefix이면 해당 연사 전체 삭제
    all_docs = col.get(include=[])
    ids_to_delete = []
    if all_docs and all_docs["ids"]:
        for did in all_docs["ids"]:
            if did == doc_id or did.startswith(doc_id + "_"):
                ids_to_delete.append(did)

    deleted = 0
    if ids_to_delete:
        col.delete(ids=ids_to_delete)
        deleted = len(ids_to_delete)

    _bm25_cache.clear()
    return {"deleted": deleted}


@app.delete("/api/preprocess/publication/{doc_id:path}")
def delete_publication(doc_id: str):
    """출판물 개별 삭제 — publications만 + 다른 골자의 linked_outlines에서 참조 제거"""
    client = get_db()
    col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})

    # 삭제 대상 확인
    try:
        target = col.get(ids=[doc_id], include=["metadatas"])
    except Exception:
        return {"deleted": 0}

    if not target or not target["ids"]:
        return {"deleted": 0}

    col.delete(ids=[doc_id])

    _bm25_cache.clear()
    return {"deleted": 1}




class DbAddRequest(BaseModel):
    speaker: str = ""
    topic: str = ""
    date: str = ""
    outline_num: str = ""
    outline_type: str = ""
    outline_title: str = ""
    subtopic: str = ""
    point_id: str = ""
    point_summary: str = ""
    keywords: str = ""
    scriptures: str = ""
    content: str
    entry_type: str = "speech_point"
    source: str = "공개 강연"
    pub_code: str = ""
    service_type: str = ""
    sub_source: str = ""

@app.post("/api/db/add")
def db_add(req: DbAddRequest):
    """새 항목 DB에 저장"""
    client = get_db()
    ts = str(int(time.time() * 1000))

    # 출판물 코드 자동 포맷 (모든 entry_type 공통)
    # 파24 7월호 2-7면 → 「파24.7」 2-7면
    # 「파24」 7월호 2-7면 → 「파24.7」 2-7면
    # 파13 9/15 17-21면 → 「파13」 9/15 17-21면
    formatted_pub_code = req.pub_code.strip()
    if formatted_pub_code:
        # 이미 「」 포함된 경우: 「파24」 7월호 2-7면
        m = re.match(r"「([^」]+)」\s*(\d{1,2})월호\s*(.*)", formatted_pub_code)
        if m:
            formatted_pub_code = f"「{m.group(1)}.{m.group(2)}」" + (" " + m.group(3).strip() if m.group(3).strip() else "")
        elif not formatted_pub_code.startswith("「"):
            parts = formatted_pub_code.split(" ", 1)
            abbr = parts[0]
            rest = parts[1] if len(parts) > 1 else ""
            month_match = re.match(r"(\d{1,2})월호\s*(.*)", rest)
            if month_match:
                abbr = f"{abbr}.{month_match.group(1)}"
                rest = month_match.group(2).strip()
            formatted_pub_code = f"「{abbr}」" + (" " + rest if rest else "")

    if req.entry_type == "publication":
        pub_code = formatted_pub_code

        col = client.get_or_create_collection("publications", metadata={"hnsw:space": "cosine"})
        doc_parts = []
        doc_parts.append(f"[출판물] {pub_code}")
        if req.outline_num:
            doc_parts.append(f"[골자] {req.outline_num} - {req.outline_title or req.topic}")
        if req.subtopic:
            doc_parts.append(f"[소주제] {req.subtopic}")
        if req.point_summary:
            doc_parts.append(f"[요점] {req.point_id + ' - ' if req.point_id else ''}{req.point_summary}")
        if req.scriptures:
            doc_parts.append(f"[성구] {req.scriptures}")
        if req.keywords:
            doc_parts.append(f"[키워드] {req.keywords}")
        doc_parts.append("")
        doc_parts.append(req.content)
        doc_text = "\n".join(doc_parts)
        doc_id = f"manual_pub_{ts}"
        meta = {
            "type": "publication",
            "pub_code": pub_code,
            "pub_abbr": "",
            "pub_title": pub_code,
            "pub_ref": "",
            "pub_type": "manual",
            "mode": "manual",
            "outline_num": req.outline_num,
            "version": "",
            "outline_type": req.outline_type,
            "outline_title": req.outline_title or req.topic,
            "subtopic": req.subtopic,
            "point_id": req.point_id,
            "point_content": req.point_summary or "",
            "scriptures": req.scriptures,
            "keywords": req.keywords,
            "cross_ref": "",
        }
        emb = get_embedding(doc_text)
        col.add(ids=[doc_id], documents=[doc_text], metadatas=[meta], embeddings=[emb])
        _bm25_cache.clear()
        return {"status": "저장 완료", "id": doc_id, "collection": "publications"}

    col_name = "speech_expressions" if req.entry_type in ("expression", "example") else "speech_points"
    col = client.get_or_create_collection(col_name, metadata={"hnsw:space": "cosine"})

    # 문서 조립
    doc_parts = []
    if req.source and req.source not in ('공개강연', '공개 강연'):
        doc_parts.append(f"[출처] {req.source}")
    if req.outline_num:
        doc_parts.append(f"[골자] {req.outline_num} - {req.outline_title or req.topic}")
    elif req.topic:
        doc_parts.append(f"[골자] {req.topic}")
    if req.subtopic:
        doc_parts.append(f"[소주제] {req.subtopic}")
    if req.point_summary:
        doc_parts.append(f"[요점] {req.point_summary}")
    if req.scriptures:
        doc_parts.append(f"[성구] {req.scriptures}")
    if req.keywords:
        doc_parts.append(f"[키워드] {req.keywords}")
    doc_parts.append("")
    doc_parts.append(req.content)
    doc_text = "\n".join(doc_parts)

    doc_id = f"manual_{req.speaker or 'unknown'}_{ts}"

    # service_type 정리: 봉사 모임/방문/기타 연설/토의 기타 이외의 소스에서는 service_type 제거
    svc_type = req.service_type
    if req.source not in ("봉사 모임", "방문") and req.sub_source not in ("기타 연설", "기타"):
        svc_type = ""

    meta = {
        "type": req.entry_type,
        "speaker": req.speaker,
        "date": req.date,
        "source": req.source,
        "sub_source": req.sub_source,
        "service_type": svc_type,
        "outline_num": req.outline_num,
        "outline_type": req.outline_type,
        "outline_title": req.outline_title or req.topic,
        "subtopic": req.subtopic,
        "point_id": "",
        "point_content": req.point_summary or "",
        "scriptures": req.scriptures,
        "publications": formatted_pub_code or "",
        "pub_code": formatted_pub_code or "",
        "keywords": req.keywords,
        "tag": "",
        "usage": "사용",
        "level": "L1",
        "mode": "manual",
    }

    emb = get_embedding(doc_text)
    col.add(ids=[doc_id], documents=[doc_text], metadatas=[meta], embeddings=[emb])
    _bm25_cache.clear()
    return {"status": "저장 완료", "id": doc_id, "collection": col_name}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)

@app.get("/api/db/originals")
def list_originals():
    """원문 목록 (골자별 그룹)"""
    client = get_db()
    result = {}
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i]
                if meta.get("source") != "원문":
                    continue
                outline_key = meta.get("outline_num", "") or meta.get("golza_num", "") or "기타"
                if outline_key not in result:
                    result[outline_key] = {
                        "outline_num": meta.get("outline_num", "") or meta.get("golza_num", ""),
                        "outline_type": meta.get("outline_type", "") or meta.get("golza_type", ""),
                        "outline_title": meta.get("outline_title", "") or meta.get("golza_title", ""),
                        "speakers": []
                    }
                result[outline_key]["speakers"].append({
                    "id": doc_id,
                    "collection": col_name,
                    "speaker": meta.get("speaker", ""),
                    "date": meta.get("date", ""),
                    "text": all_data["documents"][i],
                    "metadata": meta,
                })
        except Exception:
            continue
    return {"originals": result}


@app.get("/api/db/transcripts")
def list_transcripts():
    """원문 목록 (골자별 연사 그룹)"""
    client = get_db()
    result = {}
    for col_name in ["speech_points", "speech_expressions"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["documents", "metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i]
                if meta.get("source") != "원문":
                    continue
                o_num = meta.get("outline_num", "") or meta.get("golza_num", "")
                o_title = meta.get("outline_title", "") or meta.get("golza_title", "")
                o_type = meta.get("outline_type", "") or meta.get("golza_type", "")
                source = meta.get("source", "")
                speaker = meta.get("speaker", "")
                date = meta.get("date", "")
                # outline_type이 비어있으면 문서 내용에서 추출 시도
                if not o_type:
                    doc_text = all_data["documents"][i] or ""
                    for line in doc_text.split("\n"):
                        if line.startswith("- **골자유형**:"):
                            o_type = line.replace("- **골자유형**:", "").strip()
                            break
                key = o_num or o_title or "기타"
                if key not in result:
                    result[key] = {"outline_num": o_num, "outline_title": o_title, "outline_type": o_type, "source": source, "speakers": []}
                elif o_type and not result[key]["outline_type"]:
                    result[key]["outline_type"] = o_type
                if source and not result[key].get("source"):
                    result[key]["source"] = source
                result[key]["speakers"].append({
                    "speaker": speaker,
                    "date": date,
                    "subtopic": meta.get("subtopic", ""),
                    "id": doc_id,
                    "collection": col_name,
                    "text": all_data["documents"][i],
                })
        except Exception:
            continue
    return {"transcripts": result}


@app.get("/api/db/transcript/{collection}/{doc_id}")
def get_transcript(collection: str, doc_id: str):
    """원문 하나 조회"""
    client = get_db()
    try:
        col = client.get_collection(collection)
        result = col.get(ids=[doc_id], include=["documents", "metadatas"])
        if result and result["ids"]:
            return {
                "id": result["ids"][0],
                "text": result["documents"][0],
                "metadata": result["metadatas"][0],
            }
        raise HTTPException(status_code=404, detail="원문을 찾을 수 없습니다")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


class BatchItem(BaseModel):
    id: str = ""
    collection: str = "speech_points"
    text: str = ""
    metadata: dict = {}

class BatchAddRequest(BaseModel):
    items: list[BatchItem] = []

@app.post("/api/db/batch-add")
def batch_add(req: BatchAddRequest):
    """전처리 파일 일괄 저장 (upsert)"""
    client = get_db()
    counts = {}
    errors = []
    for item in req.items:
        try:
            col = client.get_or_create_collection(item.collection, metadata={"hnsw:space": "cosine"})
            emb = get_embedding(item.text)
            doc_id = item.id or f"{item.collection}_{int(time.time()*1000)}_{hash(item.text) % 100000}"
            clean_meta = {}
            for k, v in item.metadata.items():
                if v is None:
                    clean_meta[k] = ""
                elif isinstance(v, (str, int, float)):
                    clean_meta[k] = v
                else:
                    clean_meta[k] = str(v)
            col.upsert(ids=[doc_id], documents=[item.text], embeddings=[emb], metadatas=[clean_meta])
            counts[item.collection] = counts.get(item.collection, 0) + 1
            time.sleep(0.02)
        except Exception as e:
            errors.append(str(e))
    _bm25_cache.clear()
    return {"status": "완료", "counts": counts, "errors": errors[:5]}


@app.get("/api/db/batch-list")
def batch_list():
    """전처리 항목 그룹별 목록"""
    client = get_db()
    groups = {}
    for col_name in ["speech_points", "speech_expressions", "publications"]:
        try:
            col = client.get_collection(col_name)
            all_data = col.get(include=["metadatas"])
            if not all_data or not all_data["ids"]:
                continue
            for i, doc_id in enumerate(all_data["ids"]):
                meta = all_data["metadatas"][i] or {}
                if meta.get("source") in ("원문", "메모"):
                    continue
                gn = meta.get("outline_num", "") or meta.get("golza_num", "") or meta.get("outline_num", "") or meta.get("golza_id", "")
                sp = meta.get("speaker", "")
                dt = meta.get("date", "")
                gt = meta.get("outline_type", "") or meta.get("golza_type", "")
                title = meta.get("outline_title", "") or meta.get("golza_title", "")
                src = meta.get("source", "")
                svc = meta.get("service_type", "")
                sub_src = meta.get("sub_source", "")
                # 키 생성: 컬렉션+골자번호+연사+날짜 (컬렉션별 분리)
                if gn:
                    key = f"{col_name}_{gn}_{sp}_{dt}" if sp else f"{col_name}_{gn}"
                else:
                    key = f"{col_name}_{src}_{title}_{sp}_{dt}" if sp else f"{col_name}_{src}_{title}"
                m = meta.get("mode", "") or ("manual" if meta.get("pub_type") == "manual" else "")
                pc = meta.get("pub_code", "")
                if key not in groups:
                    groups[key] = {"outline_num": gn, "outline_type": gt, "outline_title": title, "speaker": sp, "date": dt, "mode": m, "source": src, "service_type": svc, "sub_source": sub_src, "pub_code": pc, "keywords": set(), "ids": {}, "counts": {}, "items": []}
                if not groups[key]["pub_code"] and pc:
                    groups[key]["pub_code"] = pc
                if not groups[key]["outline_type"] and gt:
                    groups[key]["outline_type"] = gt
                if not groups[key]["outline_title"] and title:
                    groups[key]["outline_title"] = title
                item_info = {"pub": pc, "point": meta.get("point_content", ""), "scripture": meta.get("scriptures", ""), "type": meta.get("type", "")}
                groups[key]["items"].append(item_info)
                kw = meta.get("keywords", "")
                if kw:
                    for k in kw.split(","):
                        k = k.strip()
                        if k:
                            groups[key]["keywords"].add(k)
                # 골자는 keywords가 없으므로 point_content를 수집
                if not kw and src in ("outline", "골자") or (not kw and (meta.get("mode") == "golza")):
                    pc = meta.get("point_content", "")
                    if pc and len(pc) <= 30:
                        groups[key]["keywords"].add(pc)
                typ = meta.get("type", "unknown")
                groups[key]["counts"][typ] = groups[key]["counts"].get(typ, 0) + 1
                if col_name not in groups[key]["ids"]:
                    groups[key]["ids"][col_name] = []
                groups[key]["ids"][col_name].append(doc_id)
        except Exception:
            continue
    result = []
    for key, g in sorted(groups.items()):
        total = sum(g["counts"].values())
        result.append({
            "key": key, "outline_num": g["outline_num"], "outline_type": g["outline_type"],
            "outline_title": g["outline_title"], "speaker": g["speaker"], "date": g["date"],
            "mode": g.get("mode", ""), "source": g.get("source", ""), "service_type": g.get("service_type", ""),
            "sub_source": g.get("sub_source", ""), "pub_code": g.get("pub_code", ""), "keywords": ", ".join(sorted(g.get("keywords", set()))), "items": g.get("items", []), "counts": g["counts"], "total": total, "ids": g["ids"],
        })
    return {"groups": result}


class BatchDeleteRequest(BaseModel):
    ids: dict  # {"collection_name": ["id1", "id2", ...]}

@app.post("/api/db/batch-delete")
def batch_delete(req: BatchDeleteRequest):
    """전처리 항목 일괄 삭제 + 골자 JSON 삭제"""
    client = get_db()
    deleted = 0
    outline_deleted = set()
    for col_name, doc_ids in req.ids.items():
        try:
            col = client.get_collection(col_name)
            # 삭제 전 골자 정보 수집 (outline JSON 삭제용)
            try:
                existing = col.get(ids=doc_ids, include=["metadatas"])
                for meta in (existing.get("metadatas") or []):
                    if meta and meta.get("source") == "outline" or meta.get("mode") == "golza":
                        gn = meta.get("outline_num", "") or meta.get("golza_num", "")
                        gt = meta.get("outline_type", "") or meta.get("golza_type", "")
                        ver = meta.get("version", "")
                        if gn:
                            outline_deleted.add((gt, gn, ver))
            except Exception:
                pass
            col.delete(ids=doc_ids)
            deleted += len(doc_ids)
        except Exception:
            pass
    # 골자 JSON 파일 삭제
    for gt, gn, ver in outline_deleted:
        prefix = _outline_prefix(gt, gn)
        ver_safe = ver.replace("/", "-").replace(" ", "").strip()
        fname = f"{prefix}_v{ver_safe}.json" if ver_safe else f"{prefix}.json"
        fpath = os.path.join(_OUTLINES_DIR, fname)
        try:
            if os.path.exists(fpath):
                os.remove(fpath)
        except Exception:
            pass
    _bm25_cache.clear()
    return {"status": "삭제 완료", "deleted": deleted, "outline_files_deleted": len(outline_deleted)}
