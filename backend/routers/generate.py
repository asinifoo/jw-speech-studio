"""연설/봉사 생성 + 스트리밍 + 다듬기"""
import json
import hashlib
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
import config
from models import GenerateRequest, FilterRequest, ServiceMeetingRequest, RefineRequest
from services.llm import call_llm, call_llm_stream, query_ollama
from services.bible_utils import get_verse_text, expand_scripture_refs
from db import get_db, get_embedding, hybrid_search, safe_meta

router = APIRouter()

def _verify_password(password: str):
    if not config.PASSWORD_HASH:
        return
    h = hashlib.sha256(password.encode()).hexdigest()
    if h != config.PASSWORD_HASH:
        raise HTTPException(status_code=403, detail="비밀번호가 올바르지 않습니다")

@router.post("/api/filter")
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
            meta = safe_meta(item)
            speaker = meta.get("speaker", "")
            items_text += f"\n[{i}] (점수:{item['score']}) {speaker}: {item['text'][:200]}"
        prompt = f"""다음은 연설 요점과 검색된 자료입니다.\n\n**요점**: {point_title}\n\n**검색 결과**:\n{items_text}\n\n각 검색 결과가 이 요점에 관련이 있는지 판단하세요.\n관련 없는 항목의 번호만 쉼표로 나열하세요.\n모두 관련 있으면 "없음"이라고 답하세요.\n번호만 답하세요."""
        try:
            print(f"[필터] model={config.FILTER_MODEL}, think={'ON' if not config.OLLAMA_FILTER_NOTHINK else 'OFF'} (config.OLLAMA_FILTER_NOTHINK={config.OLLAMA_FILTER_NOTHINK})")
            llm_response = query_ollama(prompt, system="당신은 JW 연설 자료의 관련성을 판단하는 전문가입니다. 번호만 간결하게 답하세요.", model_name=config.FILTER_MODEL, ctx=config.OLLAMA_FILTER_CTX, no_think=config.OLLAMA_FILTER_NOTHINK)
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
                    meta = safe_meta(item)
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
                    meta = safe_meta(item)
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
{config.PROMPT_TEMPLATES['speech']}
"""


@router.post("/api/generate")
def generate_speech(req: GenerateRequest):
    _verify_password(req.password)
    prompt = _build_generate_prompt(req)
    try:
        result = call_llm(prompt, model=req.model, no_think=config.OLLAMA_GEN_NOTHINK)
        return {"speech": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM API 오류: {str(e)}")


@router.post("/api/generate/stream")
def generate_speech_stream(req: GenerateRequest):
    """연설문 생성 (SSE 스트리밍)"""
    _verify_password(req.password)
    prompt = _build_generate_prompt(req)

    def event_stream():
        config._abort_event.clear()
        model_label = req.model or "기본"
        think_label = "ON" if not config.OLLAMA_GEN_NOTHINK else "OFF"
        print(f"[연설 생성] model={model_label}, think={think_label} (config.OLLAMA_GEN_NOTHINK={config.OLLAMA_GEN_NOTHINK})")
        yield f"data: {json.dumps({'stage': 'preparing', 'progress': 10, 'message': '자료 정리 완료'})}\n\n"
        yield f"data: {json.dumps({'stage': 'calling', 'progress': 15, 'message': 'AI 호출 중 (' + model_label + ', 🧠' + think_label + ')'})}\n\n"
        full_text = ""
        char_count = 0
        try:
            for chunk in call_llm_stream(prompt, model=req.model, no_think=config.OLLAMA_GEN_NOTHINK):
                full_text += chunk
                char_count += len(chunk)
                progress = min(95, 20 + int(char_count / 50))
                yield f"data: {json.dumps({'stage': 'streaming', 'progress': progress, 'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'stage': 'done', 'progress': 100, 'speech': full_text})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/api/generate/service-meeting")
def generate_service_meeting(req: ServiceMeetingRequest):
    """봉사 모임 스크립트 생성"""
    _verify_password(req.password)
    prompt = _build_service_meeting_prompt(req)
    try:
        result = call_llm(prompt, model=req.model, no_think=config.OLLAMA_GEN_NOTHINK)
        return {"script": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/generate/service-meeting/stream")
def generate_service_meeting_stream(req: ServiceMeetingRequest):
    """봉사 모임 스크립트 생성 (SSE 스트리밍)"""
    _verify_password(req.password)
    prompt = _build_service_meeting_prompt(req)

    def event_stream():
        config._abort_event.clear()
        model_label = req.model or "기본"
        think_label = "ON" if not config.OLLAMA_GEN_NOTHINK else "OFF"
        print(f"[생성] model={model_label}, think={think_label} (config.OLLAMA_GEN_NOTHINK={config.OLLAMA_GEN_NOTHINK})")
        yield f"data: {json.dumps({'stage': 'calling', 'progress': 15, 'message': 'AI 호출 중 (' + model_label + ', 🧠' + think_label + ')'})}\n\n"
        full_text = ""
        char_count = 0
        try:
            for chunk in call_llm_stream(prompt, model=req.model, no_think=config.OLLAMA_GEN_NOTHINK):
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
            meta = safe_meta(pm)
            materials += f"\n---\n**[{meta.get('date','')}] {meta.get('outline_title', '') or meta.get('topic', '')}**\n"
            lines = (pm.get("text", "")).split("\n")
            body = "\n".join(l for l in lines if not l.startswith("[") and l.strip())
            materials += body[:500] + ("\n..." if len(body) > 500 else "") + "\n"
    if req.search_results:
        materials += f"\n\n### DB 검색 자료\n"
        for item in req.search_results:
            meta = safe_meta(item)
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
{config.PROMPT_TEMPLATES['visit']}
"""
    else:
        return f"""당신은 여호와의 증인 회중의 봉사 모임 사회자입니다.
아래 자료를 바탕으로 봉사 모임 스크립트를 작성해 주세요.

{materials}

## 작성 지침:
{config.PROMPT_TEMPLATES['service_meeting']}
"""



@router.post("/api/refine")
def refine_speech(req: RefineRequest):
    """연설문 다듬기"""
    _verify_password(req.password)
    instructions = req.instructions.strip() if req.instructions else "자연스럽게 다듬어 주세요"
    prompt = _build_refine_prompt(req.speech, instructions)
    try:
        result = call_llm(prompt, model=req.model, no_think=config.OLLAMA_GEN_NOTHINK)
        return {"speech": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"API 오류: {str(e)}")


@router.post("/api/refine/stream")
def refine_speech_stream(req: RefineRequest):
    """연설문 다듬기 (SSE 스트리밍)"""
    _verify_password(req.password)
    instructions = req.instructions.strip() if req.instructions else "자연스럽게 다듬어 주세요"
    prompt = _build_refine_prompt(req.speech, instructions)

    def event_stream():
        config._abort_event.clear()
        model_label = req.model or "기본"
        yield f"data: {json.dumps({'stage': 'calling', 'progress': 15, 'message': '다듬기 중... (' + model_label + ')'})}\n\n"
        full_text = ""
        char_count = 0
        try:
            for chunk in call_llm_stream(prompt, model=req.model, no_think=config.OLLAMA_GEN_NOTHINK):
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
{config.PROMPT_TEMPLATES['refine']}
"""
