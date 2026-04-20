"""WOL 검색, 기사 수집, 캐시, 불용어"""
import os
import re
import json
import time
import requests
from urllib.parse import quote_plus, urljoin

try:
    from bs4 import BeautifulSoup
    _HAS_BS4 = True
except ImportError:
    _HAS_BS4 = False

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
