"""LLM 호출 (Ollama/Gemini/Claude/GPT 스트리밍)"""
import json
import requests
import config

def query_ollama(prompt: str, system: str = "", model_name: str = "", no_think: bool = False, ctx: int = 0) -> str:
    model = model_name or config.LLM_MODEL
    num_ctx = ctx or config.OLLAMA_GEN_CTX
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        resp = requests.post(f"{config.OLLAMA_URL}/api/chat", json={
            "model": model, "messages": messages, "stream": False,
            "think": not no_think,
            "options": {"num_ctx": num_ctx},
        })
        if resp.status_code == 404:
            raise Exception(f"로컬 모델 '{model}'이(가) 설치되지 않았습니다. Manage → AI 관리에서 pull 버튼으로 설치하세요.")
        resp.raise_for_status()
        return resp.json()["message"]["content"]
    except requests.exceptions.ConnectionError:
        raise Exception(f"Ollama 서버에 연결할 수 없습니다 ({config.OLLAMA_URL}). Ollama가 실행 중인지 확인하세요.")

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
        if not config.GEMINI_API_KEY:
            raise Exception("Gemini API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            m = genai.GenerativeModel(model)
            response = m.generate_content(prompt)
            return response.text
        except Exception as e:
            raise Exception(_friendly_api_error("Gemini", model, e))

    # ── Claude 계열 ──
    if model.startswith("claude-"):
        if not config.ANTHROPIC_API_KEY:
            raise Exception("Claude API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": config.ANTHROPIC_API_VERSION},
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
        if not config.OPENAI_API_KEY:
            raise Exception("OpenAI API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {config.OPENAI_API_KEY}"},
                json={"model": model, "max_tokens": 8192, "messages": [{"role": "user", "content": prompt}]}, timeout=180)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            raise Exception(_friendly_api_error("ChatGPT", model, e))

    # ── Ollama 로컬 ──
    if model:
        return query_ollama(prompt, model_name=model, no_think=config.OLLAMA_GEN_NOTHINK)

    # ── 기본: Gemini → Claude → Ollama 순서 폴백 ──
    if config.GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            m = genai.GenerativeModel("gemini-2.5-flash")
            response = m.generate_content(prompt)
            return response.text
        except Exception as e:
            raise Exception(_friendly_api_error("Gemini", "gemini-2.5-flash", e))
    elif config.ANTHROPIC_API_KEY:
        try:
            resp = requests.post("https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": config.ANTHROPIC_API_VERSION},
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
        return query_ollama(prompt, no_think=config.OLLAMA_GEN_NOTHINK)


def call_llm_stream(prompt: str, model: str = "", no_think: bool = False):
    """스트리밍 LLM 호출 — 텍스트 청크를 yield"""
    model = model.strip()

    # ── Gemini 계열 ──
    if model.startswith("gemini-"):
        if not config.GEMINI_API_KEY:
            raise Exception("Gemini API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            import google.generativeai as genai
            genai.configure(api_key=config.GEMINI_API_KEY)
            m = genai.GenerativeModel(model)
            response = m.generate_content(prompt, stream=True)
        except Exception as e:
            raise Exception(_friendly_api_error("Gemini", model, e))
        for chunk in response:
            if config._abort_event.is_set():
                return
            if chunk.text:
                yield chunk.text
        return

    # ── Claude 계열 ──
    if model.startswith("claude-"):
        if not config.ANTHROPIC_API_KEY:
            raise Exception("Claude API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.anthropic.com/v1/messages",
                headers={"Content-Type": "application/json", "x-api-key": config.ANTHROPIC_API_KEY, "anthropic-version": config.ANTHROPIC_API_VERSION},
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
            if config._abort_event.is_set():
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
        if not config.OPENAI_API_KEY:
            raise Exception("OpenAI API 키가 설정되지 않았습니다. Manage → AI 관리에서 등록하세요.")
        try:
            resp = requests.post("https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {config.OPENAI_API_KEY}"},
                json={"model": model, "max_tokens": 8192, "stream": True, "messages": [{"role": "user", "content": prompt}]},
                timeout=300, stream=True)
            resp.raise_for_status()
        except Exception as e:
            raise Exception(_friendly_api_error("ChatGPT", model, e))
        for line in resp.iter_lines():
            if config._abort_event.is_set():
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
    ollama_model = model or config.LLM_MODEL
    try:
        resp = requests.post(f"{config.OLLAMA_URL}/api/chat",
            json={"model": ollama_model, "messages": [{"role": "user", "content": prompt}], "stream": True,
                  "think": not no_think,
                  "options": {"num_ctx": config.OLLAMA_GEN_CTX}},
            timeout=600, stream=True)
        if resp.status_code == 404:
            raise Exception(f"로컬 모델 '{ollama_model}'이(가) 설치되지 않았습니다. Manage → AI 관리에서 pull 버튼으로 설치하세요.")
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        raise Exception(f"Ollama 서버에 연결할 수 없습니다 ({config.OLLAMA_URL}). Ollama가 실행 중인지 확인하세요.")
    for line in resp.iter_lines():
        if config._abort_event.is_set():
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
