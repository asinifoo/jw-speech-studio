"""설정, 상수, API 키 로드"""
import os
import json
import threading

DB_PATH = os.environ.get("JW_DB_PATH", os.path.expanduser("~/jw-system/db"))
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBED_MODEL = "bge-m3"
LLM_MODEL = os.environ.get("JW_LLM_MODEL", "gemma4:26b")

# source 한국어→영문 매핑 (저장/마이그레이션용)
SOURCE_KO_TO_EN = {
    "골자": "outline", "연설": "speech", "간단입력": "note", "간단 입력": "note",
    "메모": "memo", "간단메모": "memo", "간단 메모": "memo",
    "토의": "discussion", "연사메모": "speaker_memo", "연사 메모": "speaker_memo",
    "봉사 모임": "service", "봉사": "service",
    "방문": "visit", "출판물": "publication", "원문": "original",
}

def normalize_source(source: str) -> str:
    """한국어 source를 영문으로 변환. 이미 영문이면 그대로 반환."""
    return SOURCE_KO_TO_EN.get(source, source)

_CONFIG_PATH = os.path.join(os.path.expanduser("~/jw-system"), "api_keys.json")
_OUTLINES_DIR = os.path.join(os.path.expanduser("~/jw-system"), "outlines")
_CATEGORIES_PATH = os.path.join(os.path.expanduser("~/jw-system"), "categories.json")
_UPLOAD_DIR = os.path.join(os.path.expanduser("~/jw-system"), "uploads")
_CHAT_SESSION_DIR = os.path.join(os.path.expanduser("~/jw-system"), "chat_sessions")

_config_lock = threading.Lock()

def _load_config_keys():
    try:
        with open(_CONFIG_PATH, "r") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_config_keys(keys: dict):
    with _config_lock:
        os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)
        if os.path.exists(_CONFIG_PATH):
            import shutil
            shutil.copy2(_CONFIG_PATH, _CONFIG_PATH + ".bak")
        with open(_CONFIG_PATH, "w") as f:
            json.dump(keys, f, indent=2, ensure_ascii=False)

_config_keys = _load_config_keys()

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "") or _config_keys.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_API_VERSION = _config_keys.get("ANTHROPIC_API_VERSION", "2023-06-01")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "") or _config_keys.get("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "") or _config_keys.get("OPENAI_API_KEY", "")
FILTER_MODEL = os.environ.get("JW_FILTER_MODEL", "") or _config_keys.get("FILTER_MODEL", "") or LLM_MODEL
PASSWORD_HASH = _config_keys.get("PASSWORD_HASH", "") or os.environ.get("JW_PASSWORD_HASH", "")

OLLAMA_FILTER_CTX = int(os.environ.get("JW_OLLAMA_FILTER_CTX", "") or _config_keys.get("OLLAMA_FILTER_CTX", 0) or 4096)
OLLAMA_GEN_CTX = int(os.environ.get("JW_OLLAMA_GEN_CTX", "") or _config_keys.get("OLLAMA_GEN_CTX", 0) or 16384)
OLLAMA_CHAT_CTX = int(os.environ.get("JW_OLLAMA_CHAT_CTX", "") or _config_keys.get("OLLAMA_CHAT_CTX", 0) or 16384)
OLLAMA_FILTER_NOTHINK = _config_keys.get("OLLAMA_FILTER_NOTHINK", True)
OLLAMA_GEN_NOTHINK = _config_keys.get("OLLAMA_GEN_NOTHINK", True)
OLLAMA_CHAT_NOTHINK = _config_keys.get("OLLAMA_CHAT_NOTHINK", True)
CHAT_MAX_TURNS = int(_config_keys.get("CHAT_MAX_TURNS", 0) or 10)
CHAT_SEARCH_TOP_K = int(_config_keys.get("CHAT_SEARCH_TOP_K", 0) or 10)

_DEFAULT_PROMPTS = {
    "speech": _config_keys.get("PROMPT_SPEECH", """- 자연스러운 구어체로 작성
- 성구를 적절히 인용하고 설명
- 청중에게 질문을 던지며 참여 유도
- 도입 → 본문 (요점별) → 결론 구조
- 실용적 적용점 포함
- **연설 전체 방향** 자료가 있으면 연설의 전체적인 줄기와 흐름을 잡는 데 반영하세요
- **[우선 참고 자료]**가 있는 요점은 해당 자료의 내용을 핵심적으로 반영하세요
- **추가 자료**가 있으면 해당 내용도 우선적으로 참고하여 연설문에 반영하세요
- **부가 요점**(L2~L5)은 해당 주요점(L1)을 뒷받침하는 내용이므로, 주요점 안에서 계층에 맞게 자연스럽게 다뤄주세요. L2는 세부 설명, L3은 추가 설명, L4~L5는 보충/참고 수준입니다"""),
    "service_meeting": _config_keys.get("PROMPT_SERVICE_MEETING", """1. **서론**: 구역의 특성이나 봉사에서 만날 수 있는 상황으로 시작하세요
2. **성구 토의**: 핵심 성구를 낭독하고, 청중에게 질문하며 토의하세요
3. **실용적 제안**: 어떤 서론을 사용할 수 있는지, 어떤 출판물이 도움이 되는지 구체적으로 제안하세요
4. **질문-답변 형식**: 청중의 참여를 이끌어내는 질문을 중간중간 넣으세요
5. **마무리**: 오늘 살펴본 점을 요약하고 봉사에 적용하도록 격려하세요
6. **과거 봉사 모임이 참고로 제공된 경우**: 사회 스타일과 구조를 참고하되, 내용은 새로운 주제에 맞게 작성하세요
7. 자연스러운 대화체로 작성하세요
8. 5~7분 분량으로 작성하세요"""),
    "visit": _config_keys.get("PROMPT_VISIT", """1. **도입**: 방문 대상자의 근황에 관심을 보이며 따뜻하게 시작하세요
2. **격려의 말씀**: 대상자의 상황(연령대, 고려한 상황)에 맞는 공감과 이해를 표현하세요
3. **성구 적용**: 핵심 성구를 자연스럽게 소개하고, 대상자의 상황에 구체적으로 적용하세요
4. **실용적 격려**: 대상자가 이미 잘하고 있는 점을 칭찬하고, 여호와께서 그 노력을 보고 계심을 확신시키세요
5. **마무리**: 여호와의 사랑과 지원을 확신시키며 따뜻하게 마무리하세요
6. **과거 방문이 참고로 제공된 경우**: 대화 스타일과 구조를 참고하되, 내용은 새로운 상황에 맞게 작성하세요
7. 자연스럽고 따뜻한 대화체로 작성하세요 (이름 대신 '이 자매/형제'로 지칭)
8. 5~10분 분량으로 작성하세요"""),
    "refine": _config_keys.get("PROMPT_REFINE", """- 연설문의 전체 구조와 핵심 내용은 유지하세요
- 성구 인용은 정확하게 유지하세요
- 지시사항에 따라 수정하되, 원문의 의도를 존중하세요
- 자연스러운 구어체를 유지하세요"""),
    "style_both": _config_keys.get("PROMPT_STYLE_BOTH", """위 스타일 지시를 참고하여 연설문을 생성해 주세요.
내 스타일이 포함되어 있으면 내 화법과 구조를 우선 반영하고,
다른 연사의 좋은 표현이나 방식을 자연스럽게 활용해 주세요."""),
    "stt_local_cleanup": _config_keys.get("PROMPT_STT_LOCAL_CLEANUP", """당신은 STT(음성 인식) 결과를 기계적으로 정리하는 전문가입니다.

다음 작업만 수행하세요:
1. 동일 문장/구문이 반복되면 1회만 남기고 제거
2. 타임스탬프 [00:00 → 00:28] 형식이 있으면 제거
3. "\\n" 리터럴이 있으면 실제 줄바꿈으로 변환
4. 연속된 공백 정리 (1칸만)
5. 문장 간 자연스러운 줄바꿈 추가

다음은 절대 하지 마세요:
- 단어 교정 (오탈자 수정 등)
- 문장 구조 변경
- 내용 추가/삭제
- 요약 또는 재구성

의미를 절대 바꾸지 말고, 오직 위 5가지 기계적 정리만 수행하세요.

원문:
{text}

정리된 텍스트만 출력하세요. 설명 없이."""),
    "stt_correction": _config_keys.get("PROMPT_STT_CORRECTION", """너는 한국어 연설/봉사 모임/방문 녹음을 정리하는 전문가다.
입력은 Whisper STT 변환 원본이다.

다음을 수행하라:
1. 명백한 오인식 수정 (예: "요호화" → "여호와")
2. 구어체의 불필요한 반복/어조사 제거
3. 자연스러운 문단 나눔 (주제 전환 시)
4. 타임스탬프/불필요한 기호 제거
5. 성구 인용은 "(성서 X장 Y절)" 형식 유지
6. 원문 의미는 변경하지 말 것
7. 반복되는 문장 1개로 정리

원문:
{text}

정리된 텍스트:
"""),
}
PROMPT_TEMPLATES = {k: v for k, v in _DEFAULT_PROMPTS.items()}

# 스트리밍 중단 플래그
_abort_event = threading.Event()
