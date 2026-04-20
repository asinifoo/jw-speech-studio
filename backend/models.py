"""Pydantic 모델 (Request/Response)"""
from typing import Optional, Literal
from pydantic import BaseModel, Field


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


class FreeSearchRequest(BaseModel):
    query: str
    top_k: int = 10
    collections: list[str] = []

class ChatRequest(BaseModel):
    message: str
    history: list = []  # [{"role": "user"|"assistant", "content": "..."}]
    model: str = ""
    password: str = ""
    top_k: int = 10
    search_mode: str = "db"  # "db" | "wol" | "db_wol" | "chat"
    file_context: str = ""   # 첨부 파일 텍스트
    file_name: str = ""      # 첨부 파일명

class WolSearchRequest(BaseModel):
    query: str
    max_results: int = 10

class SaveChatSessionRequest(BaseModel):
    id: str
    title: str = ""
    messages: list = []
    allResults: list = []


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

class RefineRequest(BaseModel):
    password: str
    speech: str
    instructions: str = ""
    model: str = ""
    no_think: bool = False


class BibleSearchRequest(BaseModel):
    query: str
    mode: str = "auto"  # auto, reference, semantic
    top_k: int = 10


class PastSearchRequest(BaseModel):
    query: str
    source: str  # "봉사 모임" or "방문"
    service_type: str = ""
    top_k: int = 10


class DbUpdateRequest(BaseModel):
    collection: str
    doc_id: str
    text: str
    metadata: dict = None


class DbDeleteRequest(BaseModel):
    collection: str
    doc_id: str


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
    pub_title: str = ""
    pub_type: str = ""
    reference: str = ""
    outline_year: str = ""
    version: str = ""
    service_type: str = ""
    sub_source: str = ""
    situation: str = ""
    visit_target: str = ""
    rating: int = 0
    rating_note: str = ""
    favorite: bool = False

class BatchItem(BaseModel):
    id: str = ""
    collection: str = "speech_points"
    text: str = ""
    metadata: dict = {}

class BatchAddRequest(BaseModel):
    items: list[BatchItem] = []

class BatchDeleteRequest(BaseModel):
    ids: dict

# Settings models
class OllamaPullRequest(BaseModel):
    model: str

class OllamaDeleteRequest(BaseModel):
    model: str

class SaveKeysRequest(BaseModel):
    password: str
    keys: dict  # {"GEMINI_API_KEY": "...", ...}


class ChangePasswordRequest(BaseModel):
    current_password: str = ""
    new_password: str


class ApiVersionsRequest(BaseModel):
    anthropic: str = ""


class SetFilterModelRequest(BaseModel):
    model: str

class SetOllamaCtxRequest(BaseModel):
    ctx: int
    target: str = "filter"


class SetChatTurnsRequest(BaseModel):
    turns: int = 0
    top_k: int = 0


class SetOllamaThinkRequest(BaseModel):
    target: str  # "filter" or "gen" or "chat"
    no_think: bool


class SaveAiModelsRequest(BaseModel):
    models: dict = None
    default: dict = None
    chat_default: dict = None


class SetPromptRequest(BaseModel):
    key: str
    prompt: str


class PresetsRequest(BaseModel):
    presets: list = []
    checked: list = []


class WolFiltersRequest(BaseModel):
    suffixes: list[str] = []
    stopwords: list[str] = []


# ─── STT (Phase 4) ───
class SttJob(BaseModel):
    job_id: str
    original_filename: str
    file_size_bytes: int
    status: Literal[
        "uploaded", "transcribing", "transcribed",
        "correcting", "reviewing", "draft_sent", "saved", "failed"
    ]
    progress: float = 0.0

    upload_path: str = ""
    draft_path: str = ""
    saved_path: str = ""

    duration_seconds: float = 0
    estimated_transcribe_seconds: float = 0
    created_at: str
    updated_at: str
    transcribe_started_at: str = ""
    transcribe_completed_at: str = ""
    error_message: str = ""

    raw_text: str = ""
    raw_chunks: list = Field(default_factory=list)

    # Phase 4 Build-2 (deprecated, 호환 유지)
    corrected_text: str = ""
    correction_method: str = ""
    correction_model: str = ""

    # Phase 4 Build-5A 3단계 파이프라인
    parsed_text: str = ""
    local_text: str = ""
    local_model: str = ""
    cloud_text: str = ""
    cloud_platform: str = ""
    cloud_model: str = ""
    correction_elapsed: dict = Field(default_factory=dict)

    final_text: str = ""
    final_meta: dict = Field(default_factory=dict)

    # Phase 4 Build-5C: Draft(임시저장) 연결
    linked_draft_id: str = ""

