"""성경 약호 매핑, 성구 파싱, 단장 성경"""
import re
from typing import Optional

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

