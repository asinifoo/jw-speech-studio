import { readSSEStream } from './utils/sseReader';

const API = '/api';

async function _errMsg(res, fallback) {
  try { const err = await res.json(); return err.detail || fallback; } catch { try { return await res.text(); } catch { return fallback; } }
}

export async function healthCheck() {
  const res = await fetch(`${API}/health`);
  return res.json();
}

export async function parseOutline(text, hasSeparateTitle = false) {
  const res = await fetch(`${API}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, has_separate_title: hasSeparateTitle }),
  });
  return res.json();
}

export async function searchPoints(points, topK = 10) {
  const res = await fetch(`${API}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points, top_k: topK }),
  });
  return res.json();
}

export async function filterResults(points) {
  const res = await fetch(`${API}/filter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  return res.json();
}

export async function generateSpeech(password, title, duration, points, extraMaterials, model) {
  const res = await fetch(`${API}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password, title, duration, points,
      extra_materials: extraMaterials || '',
      model: model || '',
    }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '생성 실패'));
  return res.json();
}

export async function generateSpeechStream(password, title, duration, points, extraMaterials, model, onEvent, noThink, signal) {
  const res = await fetch(`${API}/generate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      password, title, duration, points,
      extra_materials: extraMaterials || '',
      model: model || '',
      no_think: !!noThink,
    }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '생성 실패');
  }
  await readSSEStream(res, onEvent);
}

export async function getCollections() {
  const res = await fetch(`${API}/collections`);
  return res.json();
}

export async function bibleSearch(query, mode = 'auto', topK = 10) {
  const res = await fetch(`${API}/bible/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, mode, top_k: topK }),
  });
  return res.json();
}

export async function bibleLookup(ref) {
  const res = await fetch(`${API}/bible/lookup?ref=${encodeURIComponent(ref)}`);
  return res.json();
}

// ── Speech Draft API ──
export const draftSave = data => _postJson('/speech-draft/save', data);
export const draftCheck = (p) => fetch(`${API}/speech-draft/check?${new URLSearchParams(p)}`).then(r => r.json());
export const draftLoad = (p) => fetch(`${API}/speech-draft/load?${new URLSearchParams(p)}`).then(r => r.json());
export const draftComplete = data => _postJson('/speech-draft/complete', data);
export const draftDelete = (id) => fetch(`${API}/speech-draft/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => r.json());
export const draftList = () => fetch(`${API}/speech-draft/list`).then(r => r.json());
export const deleteOutline = (id, year = '') => {
  const qs = year ? `?year=${encodeURIComponent(year)}` : '';
  return fetch(`${API}/preprocess/outline/${encodeURIComponent(id)}${qs}`, { method: 'DELETE' }).then(r => r.json());
};

export async function refineSpeech(password, speech, instructions, model) {
  const res = await fetch(`${API}/refine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, speech, instructions, model: model || '' }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '다듬기 실패'));
  return res.json();
}

export async function refineSpeechStream(password, speech, instructions, model, onEvent, noThink, signal) {
  const res = await fetch(`${API}/refine/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, speech, instructions, model: model || '', no_think: !!noThink }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '다듬기 실패');
  }
  await readSSEStream(res, onEvent);
}

export async function getPublicationsByOutline(outlineNum) {
  const res = await fetch(`${API}/publications/outline/${encodeURIComponent(outlineNum)}`);
  return res.json();
}

export async function dbUpdate(collection, docId, text, metadata) {
  const body = { collection, doc_id: docId, text };
  if (metadata) body.metadata = metadata;
  const res = await fetch(`${API}/db/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await _errMsg(res, 'DB 수정 실패'));
  return res.json();
}

export async function dbDelete(collection, docId) {
  const res = await fetch(`${API}/db/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, doc_id: docId }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, 'DB 삭제 실패'));
  return res.json();
}

export async function freeSearch(query, topK = 20) {
  const res = await fetch(`${API}/search/free`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '검색 실패'));
  return res.json();
}

export async function outlineList() {
  const res = await fetch(`${API}/outline/list`);
  return res.json();
}

export async function outlineDetail(outlineId, outlineType = '', version = '', year = '') {
  const q = new URLSearchParams();
  if (outlineType) q.set('outline_type', outlineType);
  if (version) q.set('version', version);
  if (year) q.set('year', year);
  const qs = q.toString();
  const res = await fetch(`${API}/outline/${encodeURIComponent(outlineId)}${qs ? '?' + qs : ''}`);
  return res.json();
}

export async function dbAdd(data) {
  const res = await fetch(`${API}/db/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '저장 실패'));
  return res.json();
}

export async function listManualEntries() {
  const res = await fetch(`${API}/db/manual`);
  return res.json();
}

export async function listBySource(source, limit = 10, serviceType = '') {
  let url = `${API}/db/by-source/${encodeURIComponent(source)}?limit=${limit}`;
  if (serviceType) url += `&service_type=${encodeURIComponent(serviceType)}`;
  const res = await fetch(url);
  return res.json();
}

export async function getServiceTypes() {
  const res = await fetch(`${API}/db/service-types`);
  return res.json();
}

export async function deleteServiceType(serviceType) {
  const res = await fetch(`${API}/db/service-type/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service_type: serviceType }),
  });
  return res.json();
}

export async function generateServiceMeeting(password, data) {
  const res = await fetch(`${API}/generate/service-meeting`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...data }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '생성 실패'));
  return res.json();
}

export async function generateServiceMeetingStream(password, data, onEvent, signal) {
  const res = await fetch(`${API}/generate/service-meeting/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...data }),
    signal,
  });
  if (!res.ok) throw new Error(await _errMsg(res, '생성 실패'));
  await readSSEStream(res, onEvent);
}

export async function listOriginals() {
  const res = await fetch(`${API}/db/originals`);
  if (!res.ok) throw new Error('원문 목록 실패');
  return res.json();
}

export async function listSpeakerMemos() {
  const res = await fetch(`${API}/db/speaker-memos`);
  return res.json();
}

export async function listCollection(colName, source = '') {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  const res = await fetch(`${API}/db/collection/${encodeURIComponent(colName)}?${params}`);
  return res.json();
}

export async function listTranscripts() {
  const res = await fetch(`${API}/db/transcripts`);
  if (!res.ok) throw new Error('원문 목록 조회 실패');
  return res.json();
}

export async function getTranscript(collection, docId) {
  const res = await fetch(`${API}/db/transcript/${collection}/${encodeURIComponent(docId)}`);
  if (!res.ok) throw new Error('원문 조회 실패');
  return res.json();
}

export async function batchAdd(items) {
  const res = await fetch(`${API}/db/batch-add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error('일괄 저장 실패');
  return res.json();
}

export async function batchList() {
  const res = await fetch(`${API}/db/batch-list`);
  if (!res.ok) throw new Error('전처리 목록 조회 실패');
  return res.json();
}

export async function batchDelete(ids) {
  const res = await fetch(`${API}/db/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error('일괄 삭제 실패');
  return res.json();
}

export async function getApiKeys() {
  const res = await fetch(`${API}/settings/keys`);
  return res.json();
}

export async function saveApiKeys(password, keys) {
  const res = await fetch(`${API}/settings/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, keys }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, 'API 키 저장 실패'));
  return res.json();
}

export async function ollamaModels() {
  const res = await fetch(`${API}/ollama/models`);
  return res.json();
}

export async function ollamaPull(model, onEvent) {
  const res = await fetch(`${API}/ollama/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error('Pull 실패');
  await readSSEStream(res, onEvent);
}

export async function getPasswordStatus() {
  const res = await fetch(`${API}/settings/password-status`);
  return res.json();
}

export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${API}/settings/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '비밀번호 변경 실패'));
  return res.json();
}

export async function getFilterModel() {
  const res = await fetch(`${API}/settings/filter-model`);
  return res.json();
}

export async function setFilterModel(model) {
  const res = await fetch(`${API}/settings/filter-model`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '필터 모델 변경 실패'));
  return res.json();
}

export async function ollamaDelete(model) {
  const res = await fetch(`${API}/ollama/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '삭제 실패'));
  return res.json();
}

export async function getOllamaCtx() {
  const res = await fetch(`${API}/settings/ollama-ctx`);
  return res.json();
}

export async function setOllamaCtx(ctx, target = 'filter') {
  const res = await fetch(`${API}/settings/ollama-ctx`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ctx, target }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '변경 실패'));
  return res.json();
}

export async function lookupPubTitle(code) {
  const res = await fetch(`${API}/publications/lookup?code=${encodeURIComponent(code)}`);
  return res.json();
}

export async function getCategories() {
  const res = await fetch(`${API}/categories`);
  return res.json();
}

export async function saveCategories(data) {
  const res = await fetch(`${API}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function getChatTurns() {
  const res = await fetch(`${API}/settings/chat-turns`);
  return res.json();
}

export async function setChatTurns(turns) {
  const res = await fetch(`${API}/settings/chat-turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ turns }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '변경 실패'));
  return res.json();
}

export async function setChatSearchTopK(topK) {
  const res = await fetch(`${API}/settings/chat-turns`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ top_k: topK }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '변경 실패'));
  return res.json();
}

export async function abortGeneration() {
  try { await fetch(`${API}/abort`, { method: 'POST' }); } catch {}
}

export async function getOllamaThink() {
  const res = await fetch(`${API}/settings/ollama-think`);
  return res.json();
}

export async function setOllamaThink(target, noThink) {
  const res = await fetch(`${API}/settings/ollama-think`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target, no_think: noThink }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '변경 실패'));
  return res.json();
}

export async function getPrompts() {
  const res = await fetch(`${API}/settings/prompts`);
  if (!res.ok) throw new Error('프롬프트 로드 실패');
  return res.json();
}

export async function setPrompt(key, prompt) {
  const res = await fetch(`${API}/settings/prompts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, prompt }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '저장 실패'));
  return res.json();
}

export async function resetPrompt(key) {
  const res = await fetch(`${API}/settings/prompts/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, prompt: '' }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '초기화 실패'));
  return res.json();
}

export async function savePromptDefault(key, prompt) {
  const res = await fetch(`${API}/settings/prompts/save-default`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, prompt }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '기본값 저장 실패'));
  return res.json();
}

export async function getAiModels() {
  const res = await fetch(`${API}/settings/ai-models`);
  if (!res.ok) throw new Error('모델 목록 로드 실패');
  return res.json();
}

export async function saveAiModels(models, defaultModel, chatDefault) {
  const body = { models, default: defaultModel };
  if (chatDefault !== undefined) body.chat_default = chatDefault;
  const res = await fetch(`${API}/settings/ai-models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '저장 실패'));
  return res.json();
}

export async function saveChatDefault(chatDefault) {
  return saveAiModels(null, null, chatDefault);
}

export async function searchPast(query, source, serviceType = '', topK = 10) {
  const res = await fetch(`${API}/search/past`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, source, service_type: serviceType, top_k: topK }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '과거 검색 실패'));
  return res.json();
}

export async function chatStream(message, history, model, password, onEvent, signal, topK = 0, searchMode = 'db', fileContext = '', fileName = '') {
  const res = await fetch(`${API}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message, history, model: model || '', password: password || '',
      top_k: topK, search_mode: searchMode,
      file_context: fileContext || '', file_name: fileName || '',
    }),
    signal,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    let detail = '채팅 오류';
    try { detail = JSON.parse(txt).detail || detail; } catch { detail = txt.slice(0, 200) || detail; }
    throw new Error(detail);
  }
  await readSSEStream(res, onEvent);
}

export async function uploadFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/upload`, { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || '업로드 실패');
  }
  return res.json();
}

export async function getChatSessions() {
  const res = await fetch(`${API}/chat/sessions`);
  if (!res.ok) throw new Error('세션 목록 로드 실패');
  return res.json();
}

export async function getChatSession(id) {
  const res = await fetch(`${API}/chat/sessions/${id}`);
  if (!res.ok) throw new Error('세션 로드 실패');
  return res.json();
}

export async function saveChatSession(id, title, messages, allResults) {
  const res = await fetch(`${API}/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, title, messages, allResults }),
  });
  if (!res.ok) throw new Error('세션 저장 실패');
  return res.json();
}

export async function deleteChatSession(id) {
  const res = await fetch(`${API}/chat/sessions/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('세션 삭제 실패');
  return res.json();
}

export async function getWolStatus() {
  try {
    const res = await fetch(`${API}/wol/status`);
    if (!res.ok) return { available: false };
    return res.json();
  } catch { return { available: false }; }
}

export async function getWolFilters() {
  const res = await fetch(`${API}/wol/filters`);
  if (!res.ok) throw new Error('WOL 필터 로드 실패');
  return res.json();
}

export async function saveWolFilters(suffixes, stopwords) {
  const res = await fetch(`${API}/wol/filters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suffixes, stopwords }),
  });
  if (!res.ok) throw new Error('WOL 필터 저장 실패');
  return res.json();
}

export async function resetWolFilters() {
  const res = await fetch(`${API}/wol/filters/reset`, { method: 'POST' });
  if (!res.ok) throw new Error('WOL 필터 초기화 실패');
  return res.json();
}

export async function saveWolFiltersAsDefault() {
  const res = await fetch(`${API}/wol/filters/save-default`, { method: 'POST' });
  if (!res.ok) throw new Error('기본값 저장 실패');
  return res.json();
}

export async function resetWolFiltersSystem() {
  const res = await fetch(`${API}/wol/filters/reset-system`, { method: 'POST' });
  if (!res.ok) throw new Error('시스템 기본값 복원 실패');
  return res.json();
}

export async function testWolQuery(query) {
  const res = await fetch(`${API}/wol/filters/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error('WOL 테스트 실패');
  return res.json();
}

// ── 프리셋 동기화 ──
export async function getPresets(key) {
  const res = await fetch(`${API}/settings/presets/${key}`);
  if (!res.ok) return { presets: [], checked: [] };
  return res.json();
}

export async function savePresets(key, presets, checked) {
  const res = await fetch(`${API}/settings/presets/${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presets, checked }),
  });
  if (!res.ok) throw new Error('프리셋 저장 실패');
  return res.json();
}

// ── API 버전 관리 ──
export async function getApiVersions() {
  const res = await fetch(`${API}/settings/api-versions`);
  if (!res.ok) return { anthropic: '2023-06-01' };
  return res.json();
}

export async function saveApiVersions(versions) {
  const res = await fetch(`${API}/settings/api-versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(versions),
  });
  if (!res.ok) throw new Error('버전 저장 실패');
  return res.json();
}

// ── 전처리 md 파싱 ──
export async function parseMdFiles(files) {
  const form = new FormData();
  files.forEach(f => form.append('files', f));
  const res = await fetch(`${API}/preprocess/parse-md`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await _errMsg(res, 'md 파싱 실패'));
  return res.json();
}

// ── 골자 DOCX → 들여쓰기 텍스트 + meta (결정론적, LLM 없음) ──
export async function docxToText(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/preprocess/docx-to-text`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await _errMsg(res, 'DOCX 변환 실패'));
  return res.json();
}

// ── 전처리 저장 (3개 분리) ──
async function _postJson(path, data) {
  const res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(await _errMsg(res, '저장 실패'));
  return res.json();
}
export const saveOutline = data => _postJson('/preprocess/save-outline', data);
export const saveSpeech = data => _postJson('/preprocess/save-speech', data);
export const savePublication = data => _postJson('/preprocess/save-publication', data);
export const saveOriginal = data => _postJson('/preprocess/save-original', data);
export const bulkSave = data => _postJson('/preprocess/bulk-save', data);
export const checkDuplicates = data => _postJson('/preprocess/check-duplicates', data);

// ── 연사 스타일 ──
export async function getMyStyles() {
  const res = await fetch(`${API}/settings/my-styles`);
  return res.json();
}
export const saveMyStyles = data => _postJson('/settings/my-styles', data);
export const searchSpeakerMemo = data => _postJson('/search/speaker-memo', data);
export const reprocessMemos = () => _postJson('/preprocess/reprocess-memos', {});

// ── STT 교정 규칙 관리 (Phase 4 Build-2.5A JSON 기반) ──
export async function sttCorrectionsGet() {
  const res = await fetch(`${API}/stt/corrections`);
  if (!res.ok) throw new Error(await _errMsg(res, '조회 실패'));
  return res.json();
}
export async function sttCorrectionsSave(data) {
  const res = await fetch(`${API}/stt/corrections/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  if (!res.ok) throw new Error(await _errMsg(res, '저장 실패'));
  return res.json();
}
export async function sttCorrectionsValidate() {
  const res = await fetch(`${API}/stt/corrections/validate`);
  if (!res.ok) throw new Error(await _errMsg(res, '검증 실패'));
  return res.json();
}
export async function sttCorrectionsReload() {
  const res = await fetch(`${API}/stt/corrections/reload`, { method: 'POST' });
  if (!res.ok) throw new Error(await _errMsg(res, '리로드 실패'));
  return res.json();
}

// ── STT 작업 관리 (Phase 4 Build-4) ──
export async function sttUpload(file) {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${API}/stt/upload`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(await _errMsg(res, '업로드 실패'));
  return res.json();
}
export async function sttTranscribe(jobId) {
  const res = await fetch(`${API}/stt/jobs/${jobId}/transcribe`, { method: 'POST' });
  if (!res.ok) throw new Error(await _errMsg(res, '변환 시작 실패'));
  return res.json();
}
export async function sttJobsList() {
  const res = await fetch(`${API}/stt/jobs`);
  if (!res.ok) throw new Error(await _errMsg(res, '목록 조회 실패'));
  return res.json();
}
export async function sttJobDetail(jobId) {
  const res = await fetch(`${API}/stt/jobs/${jobId}`);
  if (!res.ok) throw new Error(await _errMsg(res, '상세 조회 실패'));
  return res.json();
}
export async function sttDelete(jobId) {
  const res = await fetch(`${API}/stt/jobs/${jobId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await _errMsg(res, '삭제 실패'));
  return res.json();
}
export const sttCorrect = (jobId, options) => _postJson(`/stt/jobs/${jobId}/correct`, options);
export const sttSave = (jobId, data) => _postJson(`/stt/jobs/${jobId}/save`, data);
