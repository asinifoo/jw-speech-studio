import requests
"""AI 대화, 검색, 채팅 세션"""
import os
import re
import json
import time
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from config import (CHAT_MAX_TURNS, CHAT_SEARCH_TOP_K, LLM_MODEL, OLLAMA_CHAT_CTX, OLLAMA_CHAT_NOTHINK, OLLAMA_URL, PROMPT_TEMPLATES, _CHAT_SESSION_DIR, _abort_event)
import config
import hashlib
from models import SearchRequest, FreeSearchRequest, ChatRequest, PastSearchRequest, SaveChatSessionRequest

def _verify_password(password: str):
    if not config.PASSWORD_HASH:
        return
    h = hashlib.sha256(password.encode()).hexdigest()
    if h != config.PASSWORD_HASH:
        raise HTTPException(status_code=403, detail="비밀번호가 올바르지 않습니다")
from services.llm import call_llm, call_llm_stream, query_ollama
from services.wol import search_wol, fetch_wol_article, wol_results_to_search_format, _clean_wol_query, _HAS_BS4, _wol_article_cache
from services.bible_utils import get_verse_text, expand_scripture_refs
from db import get_db, get_embedding, hybrid_search, search_collection, _bm25_cache, _dedup_body

_CHAT_MAX_SESSIONS = 10
_CHAT_SESSIONS_PATH = os.path.join(os.path.expanduser("~/jw-system"), "chat_sessions.json")

router = APIRouter()


def _load_pub_list(client) -> list:
    """publications 컬렉션 전체 로드 (Phase 3: referenced_by 배열 포함)."""
    out = []
    try:
        pub_col = client.get_collection("publications")
        pub_all = pub_col.get(include=["documents", "metadatas"])
    except Exception:
        return out
    if not pub_all or not pub_all.get("ids"):
        return out
    for i, pid in enumerate(pub_all["ids"]):
        meta = pub_all["metadatas"][i] if pub_all.get("metadatas") else {}
        try:
            refs = json.loads(meta.get("referenced_by_json", "[]") or "[]")
        except Exception:
            refs = []
        out.append({
            "id": pid,
            "pub_code": meta.get("pub_code", ""),
            "pub_title": meta.get("pub_title", ""),
            "reference": meta.get("reference", ""),
            "point_content": meta.get("point_summary", ""),
            "refs": refs,
            "text": pub_all["documents"][i] if pub_all.get("documents") else "",
        })
    return out


def _attach_pubs_to_results(results: list, pub_list: list) -> None:
    """검색 결과 각 item에 참조 출판물 첨부 (referenced_by 매칭).

    item.metadata의 outline_type+outline_num+point_num 중 존재하는 필드만 매칭.
    매치된 pub은 item['publications'] 배열에 추가.
    """
    if not pub_list:
        return
    for item in results:
        item_meta = item.get("metadata", {})
        sp_pn = item_meta.get("point_num", "") or item_meta.get("point_id", "")
        sp_on = item_meta.get("outline_num", "")
        sp_ot = item_meta.get("outline_type", "")
        if not sp_pn and not sp_on:
            continue
        matched = []
        for pub in pub_list:
            for ref in pub.get("refs", []):
                if sp_on and ref.get("outline_num") != sp_on:
                    continue
                if sp_ot and ref.get("outline_type") and ref.get("outline_type") != sp_ot:
                    continue
                if sp_pn and ref.get("point_num") != sp_pn:
                    continue
                matched.append(pub)
                break
        if matched:
            item["publications"] = matched

@router.post("/api/search")
def search_points(req: SearchRequest):
    client = get_db()
    collections = ["speech_expressions", "publications"]
    results = []

    # 출판물 사전 로드 (Phase 3: referenced_by 배열)
    pub_list = _load_pub_list(client)

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
            items = [it for it in items if it.get("metadata", {}).get("source", "") not in ("memo", "메모", "original", "원문", "speaker_memo", "outline", "service", "봉사 모임", "visit", "방문")]
            point_result["search_results"].extend(items)

        # 검색 결과에 관련 출판물 첨부 (Phase 3: referenced_by 배열)
        _attach_pubs_to_results(point_result["search_results"], pub_list)

        # RRF 점수로 전체 정렬
        point_result["search_results"].sort(key=lambda x: x["score"], reverse=True)

        # 중복 제거: doc_id + point_num+speaker+date + body
        seen_ids = set()
        seen_meta = set()
        seen_body = set()
        deduped = []
        for item in point_result["search_results"]:
            doc_id = item.get("id", "")
            if doc_id and doc_id in seen_ids:
                continue
            meta = item.get("metadata", {})
            # point_num + speaker + date 조합으로 중복 체크
            mk = (meta.get("point_num", ""), meta.get("speaker", ""), meta.get("date", ""), meta.get("point_content", "")[:50])
            if mk[0] and mk in seen_meta:
                continue
            body = _dedup_body(item.get("text", ""))
            body_key = (meta.get("speaker", ""), body)
            if body_key in seen_body:
                continue
            if doc_id:
                seen_ids.add(doc_id)
            if mk[0]:
                seen_meta.add(mk)
            seen_body.add(body_key)
            deduped.append(item)
        point_result["search_results"] = deduped

        results.append(point_result)

    return {"points": results}



@router.post("/api/search/free")
def free_search(req: FreeSearchRequest):
    """DB 검색: 모든 컬렉션에서 검색"""
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
    # DB 검색에서 원문만 제외 (골자/연사메모 포함)
    all_results = [it for it in all_results if it.get("metadata", {}).get("source", "") != "원문"]

    # 출판물 첨부 (Phase 3: referenced_by 배열)
    pub_list = _load_pub_list(client)

    _attach_pubs_to_results(all_results, pub_list)

    # 중복 제거: doc_id + meta + body
    seen_ids = set()
    seen_meta = set()
    seen_body = set()
    deduped = []
    for item in all_results:
        doc_id = item.get("id", "")
        if doc_id and doc_id in seen_ids:
            continue
        meta = item.get("metadata", {})
        mk = (meta.get("point_num", ""), meta.get("speaker", ""), meta.get("date", ""), meta.get("point_content", "")[:50])
        if mk[0] and mk in seen_meta:
            continue
        body = _dedup_body(item.get("text", ""))
        body_key = (meta.get("speaker", ""), body)
        if body_key in seen_body:
            continue
        if doc_id:
            seen_ids.add(doc_id)
        if mk[0]:
            seen_meta.add(mk)
        seen_body.add(body_key)
        deduped.append(item)

    return {"results": deduped[:req.top_k]}


@router.post("/api/chat/stream")
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
        collections = ["speech_expressions", "publications"]
        try:
            query_emb = get_embedding(req.message)
            for col_name in collections:
                items = hybrid_search(client, col_name, req.message, query_emb, top_k=actual_top_k)
                search_results.extend(items)
            search_results.sort(key=lambda x: x["score"], reverse=True)
            search_results = [it for it in search_results if it.get("metadata", {}).get("source", "") not in ("원문", "memo", "speaker_memo", "outline")]
            # 중복 제거: doc_id + meta + body
            seen_ids = set()
            seen_meta = set()
            seen_body = set()
            deduped = []
            for item in search_results:
                doc_id = item.get("id", "")
                if doc_id and doc_id in seen_ids:
                    continue
                meta = item.get("metadata", {})
                mk = (meta.get("point_num", ""), meta.get("speaker", ""), meta.get("date", ""), meta.get("point_content", "")[:50])
                if mk[0] and mk in seen_meta:
                    continue
                body = _dedup_body(item.get("text", ""))
                body_key = (meta.get("speaker", ""), body)
                if body_key in seen_body:
                    continue
                if doc_id:
                    seen_ids.add(doc_id)
                if mk[0]:
                    seen_meta.add(mk)
                seen_body.add(body_key)
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
            title = meta.get("outline_title", "")
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
            outline_title = meta.get("outline_title", "")
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
            col_label = {"speech_expressions": "연설", "publications": "출판물"}.get(col_name, source or col_name)
            header = f"[자료 {i+1}] ({col_label})"
            if pub_code:
                header += f" {pub_code}"
            if pub_title:
                header += f" {pub_title}"
            if outline_title:
                header += f" 제목:{outline_title}"
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

def _load_chat_sessions():
    try:
        with open(_CHAT_SESSIONS_PATH, "r", encoding="utf-8", errors="replace") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception:
        return []

def _save_chat_sessions(sessions):
    import tempfile
    dir_path = os.path.dirname(_CHAT_SESSIONS_PATH)
    os.makedirs(dir_path, exist_ok=True)
    try:
        fd, tmp_path = tempfile.mkstemp(dir=dir_path, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(sessions, f, ensure_ascii=False, indent=2)
        os.replace(tmp_path, _CHAT_SESSIONS_PATH)
    except Exception:
        try:
            os.remove(tmp_path)
        except Exception:
            pass

@router.get("/api/chat/sessions")
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

@router.get("/api/chat/sessions/{session_id}")
def get_chat_session(session_id: str):
    sessions = _load_chat_sessions()
    for s in sessions:
        if s["id"] == session_id:
            return s
    raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")


@router.post("/api/chat/sessions")
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

@router.delete("/api/chat/sessions/{session_id}")
def delete_chat_session(session_id: str):
    sessions = _load_chat_sessions()
    sessions = [s for s in sessions if s["id"] != session_id]
    _save_chat_sessions(sessions)
    return {"status": "삭제 완료"}


@router.post("/api/search/past")
def search_past(req: PastSearchRequest):
    """과거 기록 검색: 주제/상황 기반으로 과거 봉사 모임/방문 검색"""
    client = get_db()
    try:
        query_emb = get_embedding(req.query)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"임베딩 오류: {e}")

    all_results = []
    for col_name in ["speech_expressions", "publications"]:
        items = hybrid_search(client, col_name, req.query, query_emb, top_k=req.top_k * 3)
        all_results.extend(items)

    # 불필요한 source 제외
    all_results = [it for it in all_results if it.get("metadata", {}).get("source", "") not in ("원문", "memo", "speaker_memo", "outline")]

    # source 필터 (봉사 모임/방문) — 한/영 모두 매칭
    from config import normalize_source, SOURCE_KO_TO_EN
    if req.source:
        en = normalize_source(req.source)
        ko_set = {k for k, v in SOURCE_KO_TO_EN.items() if v == en}
        allowed = {en} | ko_set
        filtered = [it for it in all_results if it.get("metadata", {}).get("source", "") in allowed]
    else:
        filtered = all_results
    # service_type 필터 (봉사 모임)
    if req.service_type:
        filtered = [it for it in filtered if it.get("metadata", {}).get("service_type", "") == req.service_type]

    filtered.sort(key=lambda x: x["score"], reverse=True)
    return {"entries": filtered[:req.top_k], "total": len(filtered)}
