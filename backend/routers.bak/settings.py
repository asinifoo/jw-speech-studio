"""설정 관리 API"""
import os
import re
import json
import hashlib
import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from config import (ANTHROPIC_API_KEY, ANTHROPIC_API_VERSION, CHAT_MAX_TURNS, CHAT_SEARCH_TOP_K, DB_PATH, EMBED_MODEL, FILTER_MODEL, GEMINI_API_KEY, LLM_MODEL, OLLAMA_CHAT_CTX, OLLAMA_CHAT_NOTHINK, OLLAMA_FILTER_CTX, OLLAMA_FILTER_NOTHINK, OLLAMA_GEN_CTX, OLLAMA_GEN_NOTHINK, OLLAMA_URL, OPENAI_API_KEY, PASSWORD_HASH, PROMPT_TEMPLATES, _CATEGORIES_PATH, _CONFIG_PATH, _DEFAULT_PROMPTS, _config_keys, _load_config_keys, _save_config_keys)
import config
from models import (OllamaPullRequest, OllamaDeleteRequest, SaveKeysRequest, ChangePasswordRequest,
    ApiVersionsRequest, SetFilterModelRequest, SetOllamaCtxRequest, SetChatTurnsRequest,
    SetOllamaThinkRequest, SaveAiModelsRequest, SetPromptRequest, PresetsRequest, WolFiltersRequest)
from services.wol import _load_wol_filters, _save_wol_filters, _clean_wol_query, _WOL_FILTERS_USER_DEFAULT_PATH, _DEFAULT_WOL_SUFFIXES, _DEFAULT_WOL_STOPWORDS
from db import _bm25_cache

router = APIRouter()

_wol_filters = _load_wol_filters()

@router.get("/api/health")
def health():
    return {"status": "ok", "db_path": DB_PATH, "llm_model": LLM_MODEL, "filter_model": FILTER_MODEL, "filter_ctx": OLLAMA_FILTER_CTX, "gen_ctx": OLLAMA_GEN_CTX, "chat_ctx": OLLAMA_CHAT_CTX, "filter_no_think": OLLAMA_FILTER_NOTHINK, "gen_no_think": OLLAMA_GEN_NOTHINK, "chat_no_think": OLLAMA_CHAT_NOTHINK, "chat_max_turns": CHAT_MAX_TURNS, "chat_search_top_k": CHAT_SEARCH_TOP_K, "search": "hybrid (semantic + BM25 + RRF)"}


@router.get("/api/ollama/models")
def ollama_models():
    """Ollama에 설치된 모델 목록"""
    try:
        resp = requests.get(f"{OLLAMA_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        models = resp.json().get("models", [])
        return {"models": [{"name": m["name"], "size": m.get("size", 0)} for m in models]}
    except Exception as e:
        return {"models": [], "error": str(e)}



@router.post("/api/ollama/pull")
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



@router.post("/api/ollama/delete")
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

@router.get("/api/settings/keys")
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



@router.post("/api/settings/keys")
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



@router.post("/api/settings/password")
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


@router.get("/api/settings/password-status")
def password_status():
    """비밀번호 설정 상태"""
    return {"has_password": bool(PASSWORD_HASH)}

@router.get("/api/settings/api-versions")
def get_api_versions():
    """API 버전 조회"""
    existing = _load_config_keys()
    return {"anthropic": existing.get("ANTHROPIC_API_VERSION", "2023-06-01")}


@router.post("/api/settings/api-versions")
def save_api_versions(req: ApiVersionsRequest):
    """API 버전 저장"""
    global ANTHROPIC_API_VERSION
    existing = _load_config_keys()
    if req.anthropic:
        existing["ANTHROPIC_API_VERSION"] = req.anthropic
        ANTHROPIC_API_VERSION = req.anthropic
    _save_config_keys(existing)
    return {"status": "저장 완료"}


@router.get("/api/settings/filter-model")
def get_filter_model():
    """LLM 필터 모델 조회"""
    return {"filter_model": FILTER_MODEL}



@router.post("/api/settings/filter-model")
def set_filter_model(req: SetFilterModelRequest):
    """LLM 필터 모델 변경"""
    global FILTER_MODEL
    FILTER_MODEL = req.model.strip() or LLM_MODEL
    existing = _load_config_keys()
    existing["FILTER_MODEL"] = FILTER_MODEL
    _save_config_keys(existing)
    return {"status": "변경 완료", "filter_model": FILTER_MODEL}


@router.get("/api/settings/ollama-ctx")
def get_ollama_ctx():
    return {"filter_ctx": OLLAMA_FILTER_CTX, "gen_ctx": OLLAMA_GEN_CTX, "chat_ctx": OLLAMA_CHAT_CTX}



@router.post("/api/settings/ollama-ctx")
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


@router.get("/api/settings/chat-turns")
def get_chat_turns():
    return {"chat_max_turns": CHAT_MAX_TURNS, "chat_search_top_k": CHAT_SEARCH_TOP_K}


@router.post("/api/settings/chat-turns")
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


@router.get("/api/settings/ollama-think")
def get_ollama_think():
    return {"filter_no_think": OLLAMA_FILTER_NOTHINK, "gen_no_think": OLLAMA_GEN_NOTHINK, "chat_no_think": OLLAMA_CHAT_NOTHINK}



@router.post("/api/settings/ollama-think")
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


@router.get("/api/settings/ai-models")
def get_ai_models():
    """AI 모델 목록 + 기본 모델 조회"""
    config = _load_config_keys()
    return {
        "models": config.get("AI_MODELS", None),
        "default": config.get("AI_DEFAULT", None),
        "chat_default": config.get("AI_CHAT_DEFAULT", None),
    }


@router.post("/api/settings/ai-models")
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


@router.get("/api/settings/prompts")
def get_prompts():
    config = _load_config_keys()
    saved_defaults = {k: config.get(f"PROMPT_SAVED_{k.upper()}", v) for k, v in _DEFAULT_PROMPTS.items()}
    return {"prompts": PROMPT_TEMPLATES, "defaults": saved_defaults, "original_defaults": _DEFAULT_PROMPTS}



@router.post("/api/settings/prompts")
def set_prompt(req: SetPromptRequest):
    if req.key not in _DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"잘못된 키: {req.key}")
    PROMPT_TEMPLATES[req.key] = req.prompt
    existing = _load_config_keys()
    existing[f"PROMPT_{req.key.upper()}"] = req.prompt
    _save_config_keys(existing)
    return {"status": "저장 완료", "key": req.key}

@router.post("/api/settings/prompts/reset")
def reset_prompt(req: SetPromptRequest):
    if req.key not in _DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"잘못된 키: {req.key}")
    config = _load_config_keys()
    saved = config.get(f"PROMPT_SAVED_{req.key.upper()}", _DEFAULT_PROMPTS[req.key])
    PROMPT_TEMPLATES[req.key] = saved
    config.pop(f"PROMPT_{req.key.upper()}", None)
    _save_config_keys(config)
    return {"status": "초기화 완료", "key": req.key}

@router.post("/api/settings/prompts/save-default")
def save_prompt_default(req: SetPromptRequest):
    """현재 프롬프트를 커스텀 기본값으로 저장 (초기화 시 이 값으로 복원)"""
    if req.key not in _DEFAULT_PROMPTS:
        raise HTTPException(status_code=400, detail=f"잘못된 키: {req.key}")
    existing = _load_config_keys()
    existing[f"PROMPT_SAVED_{req.key.upper()}"] = req.prompt
    _save_config_keys(existing)
    return {"status": "기본값 저장 완료", "key": req.key}


# ── 프리셋 동기화 ──
@router.get("/api/settings/presets/{key}")
def get_presets(key: str):
    """프리셋 목록 + 체크 상태 조회"""
    existing = _load_config_keys()
    presets_key = f"PRESETS_{key.upper()}"
    checked_key = f"PRESETS_{key.upper()}_CHECKED"
    return {
        "presets": existing.get(presets_key, []),
        "checked": existing.get(checked_key, []),
    }


@router.post("/api/settings/presets/{key}")
def save_presets(key: str, req: PresetsRequest):
    """프리셋 목록 + 체크 상태 저장"""
    existing = _load_config_keys()
    presets_key = f"PRESETS_{key.upper()}"
    checked_key = f"PRESETS_{key.upper()}_CHECKED"
    existing[presets_key] = req.presets
    existing[checked_key] = req.checked
    _save_config_keys(existing)
    return {"status": "저장 완료"}

@router.get("/api/wol/filters")
def get_wol_filters():
    """WOL 불용어/접미사 설정 조회"""
    return _wol_filters


@router.post("/api/wol/filters")
def set_wol_filters(req: WolFiltersRequest):
    """WOL 불용어/접미사 설정 저장"""
    global _wol_filters
    _wol_filters = {"suffixes": req.suffixes, "stopwords": req.stopwords}
    _save_wol_filters(_wol_filters)
    _bm25_cache.clear()  # 접미사 변경 → BM25 인덱스 재구축 필요
    return {"ok": True, "suffixes": len(req.suffixes), "stopwords": len(req.stopwords)}

@router.post("/api/wol/filters/reset")
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

@router.post("/api/wol/filters/save-default")
def save_wol_filters_as_default():
    """현재 필터를 사용자 기본값으로 저장"""
    os.makedirs(os.path.dirname(_WOL_FILTERS_USER_DEFAULT_PATH), exist_ok=True)
    with open(_WOL_FILTERS_USER_DEFAULT_PATH, "w", encoding="utf-8") as f:
        json.dump(_wol_filters, f, ensure_ascii=False, indent=2)
    return {"ok": True,
            "suffixes": len(_wol_filters.get("suffixes", [])),
            "stopwords": len(_wol_filters.get("stopwords", []))}

@router.post("/api/wol/filters/reset-system")
def reset_wol_filters_system():
    """하드코딩 원본 기본값으로 복원 (사용자 기본값 무시)"""
    global _wol_filters
    _wol_filters = {"suffixes": _DEFAULT_WOL_SUFFIXES, "stopwords": _DEFAULT_WOL_STOPWORDS}
    _save_wol_filters(_wol_filters)
    _bm25_cache.clear()
    return {"ok": True, "suffixes": len(_DEFAULT_WOL_SUFFIXES), "stopwords": len(_DEFAULT_WOL_STOPWORDS)}

@router.post("/api/wol/filters/test")
def test_wol_filters(req: dict):
    """쿼리 전처리 테스트 (저장하지 않고 결과만 반환)"""
    query = req.get("query", "")
    result = _clean_wol_query(query)
    return {"query": query, "cleaned": result}

@router.get("/api/categories")
def get_categories():
    """카테고리 조회"""
    default = {
        "service_types": ["호별", "상가", "재방문", "특별활동", "비대면", "폐쇄"],
        "visit_targets": ["청소년", "청년", "중년", "장년"],
        "visit_situations": ["일반", "건강", "낙담", "바쁨"],
    }
    if os.path.exists(_CATEGORIES_PATH):
        try:
            with open(_CATEGORIES_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return default


@router.post("/api/categories")
def save_categories(req: dict):
    """카테고리 수정"""
    with open(_CATEGORIES_PATH, "w", encoding="utf-8") as f:
        json.dump(req, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}


# ─── 내 스타일 ──────────────────────────────────
_MY_STYLES_PATH = os.path.join(os.path.expanduser("~/jw-system"), "my_styles.json")

@router.get("/api/settings/my-styles")
def get_my_styles():
    if os.path.exists(_MY_STYLES_PATH):
        try:
            with open(_MY_STYLES_PATH, "r", encoding="utf-8") as f:
                return {"styles": json.load(f)}
        except Exception:
            pass
    return {"styles": []}

@router.post("/api/settings/my-styles")
def save_my_styles(req: dict):
    styles = req.get("styles", [])
    with open(_MY_STYLES_PATH, "w", encoding="utf-8") as f:
        json.dump(styles, f, ensure_ascii=False, indent=2)
    return {"status": "ok"}
