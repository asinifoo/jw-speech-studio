import { useState, useEffect, useRef } from 'react';
import { getAiModels, saveAiModels as saveAiModelsAPI, getApiKeys, saveApiKeys, getApiVersions, saveApiVersions, ollamaModels, ollamaPull, ollamaDelete, getPasswordStatus, changePassword, getFilterModel, setFilterModel, getOllamaCtx, setOllamaCtx, getOllamaThink, setOllamaThink, getChatTurns, setChatTurns, setChatSearchTopK, getPrompts, setPrompt, resetPrompt, savePromptDefault } from '../api';
import { useConfirm } from '../providers/ConfirmProvider';
import { useAlert } from '../providers/AlertProvider';

// AI 탭 UI state persist (Phase 5b-1) — 탭 discard 후 재로드 시 열어둔 섹션 복원
const _aiInit = (() => {
  try { return JSON.parse(localStorage.getItem('jw-ai-ui') || '{}'); }
  catch { return {}; }
})();

export default function ManageAiTab() {
  const showConfirm = useConfirm();
  const showAlert = useAlert();
  // ── AI_MODELS_DEFAULT (원본 ManagePage.jsx L558-563) ──
  const AI_MODELS_DEFAULT = {
    Local: [{ value: 'gemma4:26b', label: 'Gemma 4 26B' }, { value: 'qwen3.5:27b', label: 'Qwen 3.5 27B' }],
    Gemini: [{ value: 'gemini-2.5-flash', label: '2.5 Flash' }, { value: 'gemini-2.5-pro', label: '2.5 Pro' }],
    Claude: [{ value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' }, { value: 'claude-opus-4-20250514', label: 'Opus 4' }],
    ChatGPT: [{ value: 'gpt-4o', label: 'GPT-4o' }, { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }],
  };

  // ── state (원본 ManagePage.jsx L104, L564-622, L1222-1225) ──
  const [aiOpenSections, setAiOpenSections] = useState(_aiInit.openSections || { model: true });
  useEffect(() => {
    try { localStorage.setItem('jw-ai-ui', JSON.stringify({ openSections: aiOpenSections })); } catch {}
  }, [aiOpenSections]);
  const [aiModels, setAiModels] = useState(() => { try { const s = JSON.parse(localStorage.getItem('jw-ai-models')); if (s && typeof s === 'object') return s; } catch {} return AI_MODELS_DEFAULT; });
  const serverAiModels = useRef(null); // 서버에 저장된 상태 기억
  const serverAiDefault = useRef(null);
  const serverChatDefault = useRef(null);
  useEffect(() => {
    getAiModels().then(data => {
      if (data.models) {
        setAiModels(data.models);
        localStorage.setItem('jw-ai-models', JSON.stringify(data.models));
        serverAiModels.current = data.models;
      }
      if (data.default?.platform) {
        localStorage.setItem('jw-ai-default', JSON.stringify(data.default));
        serverAiDefault.current = data.default;
        setDefaultTick(t => t + 1);
      } else if (data.default && !data.default.platform) {
        localStorage.removeItem('jw-ai-default');
        serverAiDefault.current = null;
        setDefaultTick(t => t + 1);
      }
      if (data.chat_default?.platform) {
        localStorage.setItem('jw-ai-chat-default', JSON.stringify(data.chat_default));
        serverChatDefault.current = data.chat_default;
        setDefaultTick(t => t + 1);
      } else if (data.chat_default && !data.chat_default.platform) {
        localStorage.removeItem('jw-ai-chat-default');
        serverChatDefault.current = null;
        setDefaultTick(t => t + 1);
      }
    }).catch(() => {});
  }, []);

  // mount 시 복원된 openSections 기반 자동 fetch (Phase 5b-1)
  // toggleAiSection 의 lazy fetch 로직과 동일 — 섹션이 열려있고 데이터 아직 없을 때만
  useEffect(() => {
    if (aiOpenSections.llm) {
      Promise.all([getFilterModel(), ollamaModels(), getOllamaCtx(), getOllamaThink(), getChatTurns()])
        .then(([fm, om, ctx, think, turns]) => {
          setFilterModelState({ current: fm.filter_model, models: om.models || [] });
          setOllamaCtxState(ctx);
          setOllamaThinkState(think);
          setChatTurnsState(turns.chat_max_turns || 10);
          setChatSearchTopKState(turns.chat_search_top_k || 10);
        }).catch(() => {});
    }
    if (aiOpenSections.prompt) {
      getPrompts().then(data => { setPromptData(data); setPromptEdits({ ...data.prompts }); }).catch(() => {});
    }
    if (aiOpenSections.api) {
      getApiVersions().then(setApiVersions).catch(() => {});
    }
  }, []);
  const [newModelInputs, setNewModelInputs] = useState({});
  const [newPlatformName, setNewPlatformName] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState(null);
  const [apiVersions, setApiVersions] = useState(null);
  const [apiKeyInputs, setApiKeyInputs] = useState({});
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [aiPassword, setAiPassword] = useState('');
  const [aiError, setAiError] = useState('');
  const [installedModels, setInstalledModels] = useState(null);
  const [pullingModel, setPullingModel] = useState('');
  const [pullProgress, setPullProgress] = useState(0);
  const [defaultTick, setDefaultTick] = useState(0);
  const [pwStatus, setPwStatus] = useState(null);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [promptData, setPromptData] = useState(null);
  const [promptEdits, setPromptEdits] = useState({});
  const [promptSaving, setPromptSaving] = useState('');
  const [editingPrompts, setEditingPrompts] = useState(new Set());
  const isEditing = (k) => editingPrompts.has(k);
  const startEdit = (k) => setEditingPrompts(p => new Set(p).add(k));
  const stopEdit = (k) => setEditingPrompts(p => { const n = new Set(p); n.delete(k); return n; });
  const extractVars = (text) => {
    const matches = (text || '').match(/\{[a-z_]+\}/g);
    return matches ? [...new Set(matches)] : [];
  };
  const [filterModel, setFilterModelState] = useState(null);
  const [filterModelSaving, setFilterModelSaving] = useState(false);
  const [deletingModel, setDeletingModel] = useState('');
  const [ollamaCtx, setOllamaCtxState] = useState(null); // { filter_ctx, gen_ctx }
  const [ollamaThink, setOllamaThinkState] = useState(null); // { filter_no_think, gen_no_think }
  const [chatTurns, setChatTurnsState] = useState(null);
  const [chatSearchTopK, setChatSearchTopKState] = useState(null);
  const [aiModelsDirty, setAiModelsDirty] = useState(false);
  const [aiModelsSaveMsg, setAiModelsSaveMsg] = useState('');
  const [aiEditMode, setAiEditMode] = useState(false);
  const [selectingFor, setSelectingFor] = useState(null); // null | 'default' | 'chat'

  // ── 함수 (원본 ManagePage.jsx L105-124, L1220-1286) ──
  const toggleAiSection = async (k) => {
    const opening = !aiOpenSections[k];
    setAiOpenSections(p => ({ ...p, [k]: !p[k] }));
    if (opening && k === 'llm' && !filterModel) {
      try {
        const [fm, om, ctx, think, turns] = await Promise.all([getFilterModel(), ollamaModels(), getOllamaCtx(), getOllamaThink(), getChatTurns()]);
        setFilterModelState({ current: fm.filter_model, models: om.models || [] });
        setOllamaCtxState(ctx);
        setOllamaThinkState(think);
        setChatTurnsState(turns.chat_max_turns || 10);
        setChatSearchTopKState(turns.chat_search_top_k || 10);
      } catch {}
    }
    if (opening && k === 'prompt' && !promptData) {
      try { const data = await getPrompts(); setPromptData(data); setPromptEdits({ ...data.prompts }); } catch {}
    }
    if (opening && k === 'api' && !apiVersions) {
      try { setApiVersions(await getApiVersions()); } catch {}
    }
  };
  const getNewInput = (p) => newModelInputs[p] || { value: '', label: '' };
  const setNewInput = (p, field, val) => setNewModelInputs(prev => ({ ...prev, [p]: { ...getNewInput(p), [field]: val } }));
  const saveAiModelsLocal = (updated) => { setAiModels(updated); localStorage.setItem('jw-ai-models', JSON.stringify(updated)); setAiModelsDirty(true); setAiModelsSaveMsg(''); };
  const addAiModel = (platform) => { const inp = getNewInput(platform); if (!inp.value.trim()) return; const updated = { ...aiModels }; updated[platform] = [...(updated[platform] || []), { value: inp.value.trim(), label: inp.label.trim() || inp.value.trim() }]; saveAiModelsLocal(updated); setNewModelInputs(prev => ({ ...prev, [platform]: { value: '', label: '' } })); };
  const removeAiModel = (platform, idx) => { const updated = { ...aiModels }; updated[platform] = updated[platform].filter((_, i) => i !== idx); if (updated[platform].length === 0) delete updated[platform]; saveAiModelsLocal(updated); };
  const addAiPlatform = () => { const n = newPlatformName.trim(); if (!n || aiModels[n]) return; saveAiModelsLocal({ ...aiModels, [n]: [] }); setNewPlatformName(''); };
  const removeAiPlatform = (p) => { const updated = { ...aiModels }; delete updated[p]; saveAiModelsLocal(updated); };
  const movePlatform = (platform, dir) => {
    const keys = Object.keys(aiModels);
    const idx = keys.indexOf(platform);
    if ((dir === -1 && idx <= 0) || (dir === 1 && idx >= keys.length - 1)) return;
    const newKeys = [...keys];
    [newKeys[idx], newKeys[idx + dir]] = [newKeys[idx + dir], newKeys[idx]];
    const updated = {};
    newKeys.forEach(k => { updated[k] = aiModels[k]; });
    saveAiModelsLocal(updated);
  };
  const moveModel = (platform, idx, dir) => {
    const models = [...(aiModels[platform] || [])];
    if ((dir === -1 && idx <= 0) || (dir === 1 && idx >= models.length - 1)) return;
    [models[idx], models[idx + dir]] = [models[idx + dir], models[idx]];
    saveAiModelsLocal({ ...aiModels, [platform]: models });
  };
  const resetAiModels = () => {
    const saved = serverAiModels.current || AI_MODELS_DEFAULT;
    setAiModels(saved);
    localStorage.setItem('jw-ai-models', JSON.stringify(saved));
    if (serverAiDefault.current) {
      localStorage.setItem('jw-ai-default', JSON.stringify(serverAiDefault.current));
    } else {
      localStorage.removeItem('jw-ai-default');
    }
    if (serverChatDefault.current) {
      localStorage.setItem('jw-ai-chat-default', JSON.stringify(serverChatDefault.current));
    } else {
      localStorage.removeItem('jw-ai-chat-default');
    }
    setAiModelsDirty(false);
    setAiModelsSaveMsg('');
    setDefaultTick(t => t + 1);
  };
  const savedDefault = (() => { void defaultTick; try { return JSON.parse(localStorage.getItem('jw-ai-default')); } catch { return null; } })();
  const savedChatDefault = (() => { void defaultTick; try { return JSON.parse(localStorage.getItem('jw-ai-chat-default')); } catch { return null; } })();
  const saveAiDefault = (platform, model) => { localStorage.setItem('jw-ai-default', JSON.stringify({ platform, model })); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const clearAiDefault = () => { localStorage.removeItem('jw-ai-default'); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const saveChatAiDefault = (platform, model) => { localStorage.setItem('jw-ai-chat-default', JSON.stringify({ platform, model })); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const clearChatAiDefault = () => { localStorage.removeItem('jw-ai-chat-default'); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const saveAiModelsToServer = async () => {
    setAiModelsSaveMsg('저장 중...');
    try {
      const currentDefault = (() => { try { return JSON.parse(localStorage.getItem('jw-ai-default')); } catch { return null; } })();
      const currentChatDefault = (() => { try { return JSON.parse(localStorage.getItem('jw-ai-chat-default')); } catch { return null; } })();
      await saveAiModelsAPI(aiModels, currentDefault || {}, currentChatDefault || {});
      serverAiModels.current = aiModels;
      serverAiDefault.current = currentDefault;
      serverChatDefault.current = currentChatDefault;
      setAiModelsDirty(false);
      setAiModelsSaveMsg('서버 저장 완료');
      setTimeout(() => setAiModelsSaveMsg(''), 2000);
    } catch (e) {
      setAiModelsSaveMsg('저장 실패: ' + e.message);
    }
  };

  // ── JSX (원본 ManagePage.jsx L5491-6145) ──
  return (
        <div>
          {/* 모델 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('model')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.model ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>AI 모델 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.model ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.model && <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: '0.929rem', fontWeight: 700 }}>AI 모델 관리</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {aiModelsSaveMsg && <span style={{ fontSize: '0.786rem', color: aiModelsSaveMsg.includes('실패') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{aiModelsSaveMsg}</span>}
                {aiModelsDirty && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-orange)' }} />}
                <button onClick={resetAiModels}
                  style={{ padding: '2px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>초기화</button>
                <button onClick={() => setAiEditMode(p => !p)}
                  style={{ padding: '2px 8px', borderRadius: 8, border: '1px solid ' + (aiEditMode ? 'var(--accent-purple)' : 'var(--bd)'), background: aiEditMode ? 'var(--tint-purple)' : 'transparent', color: aiEditMode ? 'var(--accent-purple)' : 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: aiEditMode ? 600 : 400 }}>{aiEditMode ? '완료' : '편집'}</button>
                <button onClick={saveAiModelsToServer}
                  style={{ padding: '2px 8px', borderRadius: 8, border: '1px solid ' + (aiModelsDirty ? 'var(--accent)' : 'var(--bd)'), background: aiModelsDirty ? 'var(--accent)' : 'transparent', color: aiModelsDirty ? '#fff' : 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: aiModelsDirty ? 600 : 400 }}>저장</button>
              </div>
            </div>

            <div style={{ padding: '6px 10px', borderRadius: 8, background: selectingFor ? 'var(--tint-purple)' : 'var(--bg-subtle)', marginBottom: 10, fontSize: '0.786rem', display: 'flex', flexDirection: 'column', gap: 5, border: selectingFor ? '1.5px solid var(--accent-purple)' : '1px solid transparent' }}>
              {selectingFor && (
                <div style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--accent-purple)', textAlign: 'center' }}>
                  {selectingFor === 'default' ? '기본 모델을 선택하세요' : '대화 모델을 선택하세요'} — 아래 모델을 탭
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--c-muted)', fontSize: '0.786rem', width: 52, flexShrink: 0 }}>기본 모델</span>
                {savedDefault ? (
                  <span style={{ flex: 1, color: savedChatDefault?.platform === savedDefault.platform && savedChatDefault?.model === savedDefault.model ? '#8B6914' : 'var(--accent-orange)', fontWeight: 700, fontSize: '0.786rem' }}>★ {savedDefault.platform} / {savedDefault.model}</span>
                ) : (
                  <span style={{ flex: 1, color: 'var(--c-dim)', fontSize: '0.786rem' }}>설정 안됨</span>
                )}
                <button onClick={() => setSelectingFor(selectingFor === 'default' ? null : 'default')}
                  style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                    border: '1px solid ' + (selectingFor === 'default' ? 'var(--accent-purple)' : 'var(--accent-orange)'),
                    background: selectingFor === 'default' ? 'var(--accent-purple)' : 'transparent',
                    color: selectingFor === 'default' ? '#fff' : 'var(--accent-orange)', fontWeight: 600 }}>
                  {selectingFor === 'default' ? '취소' : '선택'}
                </button>
                {savedDefault && (
                  <button onClick={() => { clearAiDefault(); setSelectingFor(null); }}
                    style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>해제</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--c-muted)', fontSize: '0.786rem', width: 52, flexShrink: 0 }}>대화 모델</span>
                {savedChatDefault ? (
                  <span style={{ flex: 1, color: savedDefault?.platform === savedChatDefault.platform && savedDefault?.model === savedChatDefault.model ? '#8B6914' : 'var(--accent-purple)', fontWeight: 700, fontSize: '0.786rem' }}>★ {savedChatDefault.platform} / {savedChatDefault.model}</span>
                ) : (
                  <span style={{ flex: 1, color: 'var(--c-dim)', fontSize: '0.786rem' }}>설정 안됨</span>
                )}
                <button onClick={() => setSelectingFor(selectingFor === 'chat' ? null : 'chat')}
                  style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                    border: '1px solid ' + (selectingFor === 'chat' ? 'var(--accent-purple)' : 'var(--accent-purple)'),
                    background: selectingFor === 'chat' ? 'var(--accent-purple)' : 'transparent',
                    color: selectingFor === 'chat' ? '#fff' : 'var(--accent-purple)', fontWeight: 600 }}>
                  {selectingFor === 'chat' ? '취소' : '선택'}
                </button>
                {savedChatDefault && (
                  <button onClick={() => { clearChatAiDefault(); setSelectingFor(null); }}
                    style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>해제</button>
                )}
              </div>
            </div>

            {Object.entries(aiModels).map(([platform, models], platformIdx) => {
              const platformKeys = Object.keys(aiModels);
              const isLocal = models.some(m => !m.value.startsWith('gemini-') && !m.value.startsWith('claude-') && !m.value.startsWith('gpt-'));
              const adding = getNewInput(platform).value || getNewInput(platform).label;
              return (
              <div key={platform} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  {aiEditMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginRight: 2 }}>
                      <button onClick={() => movePlatform(platform, -1)} disabled={platformIdx === 0}
                        style={{ padding: 0, border: 'none', background: 'none', color: platformIdx === 0 ? 'var(--bd)' : 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', lineHeight: 1 }}>▲</button>
                      <button onClick={() => movePlatform(platform, 1)} disabled={platformIdx === platformKeys.length - 1}
                        style={{ padding: 0, border: 'none', background: 'none', color: platformIdx === platformKeys.length - 1 ? 'var(--bd)' : 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', lineHeight: 1 }}>▼</button>
                    </div>
                  )}
                  <span style={{ fontWeight: 700, fontSize: '0.786rem', color: 'var(--c-text-dark)' }}>{platform}</span>
                  {isLocal && (
                    <button onClick={async () => { try { setInstalledModels(await ollamaModels()); } catch {} }}
                      style={{ padding: 0, border: 'none', background: 'none', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>🔄</button>
                  )}
                  {aiEditMode && (
                    <button onClick={() => removeAiPlatform(platform)}
                      style={{ padding: '0 3px', border: 'none', background: 'none', color: '#e55', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 800 }}>×</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  {models.map((m, idx) => {
                    const mIsLocal = !m.value.startsWith('gemini-') && !m.value.startsWith('claude-') && !m.value.startsWith('gpt-');
                    const isInstalled = installedModels?.models?.some(im => im.name === m.value);
                    const isPulling = pullingModel === m.value;
                    const isDefault = savedDefault?.platform === platform && savedDefault?.model === m.value;
                    const isChatDef = savedChatDefault?.platform === platform && savedChatDefault?.model === m.value;
                    const isBoth = isDefault && isChatDef;
                    const borderColor = isBoth ? '#8B6914' : isDefault ? 'var(--accent-orange)' : isChatDef ? 'var(--accent-purple)' : selectingFor ? '#7F77DD44' : 'var(--bd)';
                    const textColor = isBoth ? '#8B6914' : isDefault ? 'var(--accent-orange)' : isChatDef ? 'var(--accent-purple)' : 'var(--c-sub)';
                    const handleCardClick = () => {
                      if (aiEditMode) return;
                      if (selectingFor === 'default') { saveAiDefault(platform, m.value); setSelectingFor(null); }
                      else if (selectingFor === 'chat') { saveChatAiDefault(platform, m.value); setSelectingFor(null); }
                    };
                    return (
                    <div key={m.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                      {aiEditMode && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginRight: 1 }}>
                          <button onClick={() => moveModel(platform, idx, -1)} disabled={idx === 0}
                            style={{ padding: 0, border: 'none', background: 'none', color: idx === 0 ? 'var(--bd)' : 'var(--c-dim)', fontSize: '0.5rem', cursor: 'pointer', lineHeight: 1 }}>▲</button>
                          <button onClick={() => moveModel(platform, idx, 1)} disabled={idx === models.length - 1}
                            style={{ padding: 0, border: 'none', background: 'none', color: idx === models.length - 1 ? 'var(--bd)' : 'var(--c-dim)', fontSize: '0.5rem', cursor: 'pointer', lineHeight: 1 }}>▼</button>
                        </div>
                      )}
                      <div onClick={handleCardClick} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 14, fontSize: '0.786rem',
                        border: `1.5px solid ${borderColor}`,
                        background: (isDefault || isChatDef) ? borderColor + '10' : selectingFor ? 'var(--bg-card)' : 'var(--bg-subtle)',
                        color: textColor, cursor: (aiEditMode || !selectingFor) ? 'default' : 'pointer',
                      }}>
                        <span style={{ fontWeight: (isDefault || isChatDef) ? 700 : 400 }}>{m.label || m.value}</span>
                        {mIsLocal && installedModels && (
                          isInstalled ? <span style={{ color: 'var(--accent)', fontSize: '0.571rem' }}>●</span>
                          : isPulling ? <span style={{ color: 'var(--accent-orange)' }}>{pullProgress}%</span>
                          : <button onClick={async (e) => {
                              e.stopPropagation();
                              setPullingModel(m.value); setPullProgress(0);
                              try { await ollamaPull(m.value, (ev) => { if (ev.progress) setPullProgress(ev.progress); if (ev.status === 'done' || ev.status === 'error') { setPullingModel(''); ollamaModels().then(r => setInstalledModels(r)).catch(() => {}); } }); } catch { setPullingModel(''); }
                            }}
                            style={{ padding: 0, border: 'none', background: 'none', color: 'var(--accent-orange)', fontSize: '0.643rem', cursor: 'pointer', textDecoration: 'underline' }}>pull</button>
                        )}
                        {isDefault && <span style={{ fontSize: '0.643rem', color: 'var(--accent-orange)' }}>★</span>}
                        {isChatDef && <span style={{ fontSize: '0.571rem', color: 'var(--accent-purple)' }}>💬</span>}
                        {aiEditMode && (
                          <button onClick={(e) => { e.stopPropagation(); removeAiModel(platform, idx); }}
                            style={{ padding: 0, border: 'none', background: 'none', color: '#e55', fontSize: '0.786rem', cursor: 'pointer', lineHeight: 1, fontWeight: 800 }}>×</button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {aiEditMode && (
                    <button onClick={() => setNewInput(platform, 'value', getNewInput(platform).value || ' ')}
                      style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 14, fontSize: '0.786rem',
                        border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer' }}>+</button>
                  )}
                </div>
                {aiEditMode && (adding) && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <input value={getNewInput(platform).value.trim()} onChange={e => setNewInput(platform, 'value', e.target.value)}
                      placeholder="모델 ID" onKeyDown={e => e.key === 'Enter' && addAiModel(platform)} autoFocus
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                    <input value={getNewInput(platform).label} onChange={e => setNewInput(platform, 'label', e.target.value)}
                      placeholder="표시명" onKeyDown={e => e.key === 'Enter' && addAiModel(platform)}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                    <button onClick={() => addAiModel(platform)}
                      style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer' }}>추가</button>
                    <button onClick={() => setNewModelInputs(prev => ({ ...prev, [platform]: { value: '', label: '' } }))}
                      style={{ padding: '3px 6px', borderRadius: 8, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                  </div>
                )}
              </div>
              );
            })}

            {aiEditMode && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                <input value={newPlatformName} onChange={e => setNewPlatformName(e.target.value)}
                  placeholder="새 플랫폼" onKeyDown={e => e.key === 'Enter' && addAiPlatform()}
                  style={{ width: 100, padding: '3px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                <button onClick={addAiPlatform}
                  style={{ padding: '3px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>+ 플랫폼</button>
              </div>
            )}
          </div>}</div>

          {/* LLM 필터 모델 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('llm')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.llm ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>🔍 로컬 LLM 설정</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.llm ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.llm && <div style={{ padding: 14 }}>
            {filterModel ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 10, fontSize: '0.786rem', color: 'var(--c-sub)' }}>
                  필터 모델: <b style={{ color: 'var(--accent-purple)' }}>{filterModel.current}</b>
                  <span style={{ marginLeft: 8, fontSize: '0.786rem', color: 'var(--c-muted)' }}>연설 검색 시 관련성 판단</span>
                  {ollamaCtx && <span style={{ marginLeft: 8 }}>| 필터: <b style={{ color: 'var(--accent)' }}>{(ollamaCtx.filter_ctx / 1024).toFixed(0)}K</b> · 생성: <b style={{ color: 'var(--accent-orange)' }}>{(ollamaCtx.gen_ctx / 1024).toFixed(0)}K</b> · 대화: <b style={{ color: 'var(--accent-purple)' }}>{(ollamaCtx.chat_ctx / 1024).toFixed(0)}K</b></span>}
                </div>

                {/* 필터 모델 선택 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>필터 모델</div>
                {filterModel.models.filter(m => !m.name.includes('embed') && !m.name.includes('bge')).map(m => {
                  const isCurrent = filterModel.current === m.name;
                  const isDeleting = deletingModel === m.name;
                  return (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <button onClick={async () => {
                      setFilterModelSaving(true);
                      try {
                        const res = await setFilterModel(m.name);
                        setFilterModelState(prev => ({ ...prev, current: res.filter_model }));
                      } catch {} finally { setFilterModelSaving(false); }
                    }} disabled={filterModelSaving}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        border: `1.5px solid ${isCurrent ? 'var(--accent-purple)' : 'var(--bd)'}`,
                        background: isCurrent ? '#7F77DD18' : 'transparent',
                        color: isCurrent ? 'var(--accent-purple)' : 'var(--c-sub)',
                        fontWeight: isCurrent ? 700 : 400,
                      }}>
                      {isCurrent ? '✓ ' : ''}{m.name}
                      {m.size > 0 && <span style={{ marginLeft: 6, fontSize: '0.643rem', color: 'var(--c-muted)' }}>{(m.size / 1e9).toFixed(1)}GB</span>}
                    </button>
                    {!isCurrent && (
                      <button onClick={async () => {
                        if (!await showConfirm(`'${m.name}' 모델을 삭제하시겠습니까?`, { confirmVariant: 'danger' })) return;
                        setDeletingModel(m.name);
                        try {
                          await ollamaDelete(m.name);
                          setFilterModelState(prev => ({ ...prev, models: prev.models.filter(mm => mm.name !== m.name) }));
                        } catch (e) { showAlert(e.message, { variant: 'error' }); }
                        finally { setDeletingModel(''); }
                      }} disabled={isDeleting}
                        style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid #e55', background: 'transparent', color: '#e55', fontSize: '0.786rem', cursor: 'pointer', flexShrink: 0 }}>
                        {isDeleting ? '...' : '삭제'}
                      </button>
                    )}
                  </div>
                  );
                })}
                {filterModel.models.filter(m => !m.name.includes('embed') && !m.name.includes('bge')).length === 0 && (
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)' }}>Ollama에 설치된 모델이 없습니다</span>
                )}

                {/* 컨텍스트 크기 — 필터 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 12, marginBottom: 4 }}>필터 컨텍스트 <span style={{ color: 'var(--accent)' }}>(LLM 필터용 · 짧은 프롬프트)</span></div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[2048, 4096, 8192, 16384, 32768, 65536].map(v => (
                    <button key={v} onClick={async () => {
                      try {
                        const res = await setOllamaCtx(v, 'filter');
                        setOllamaCtxState(res);
                      } catch (e) { showAlert(e.message, { variant: 'error' }); }
                    }}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${ollamaCtx?.filter_ctx === v ? 'var(--accent)' : 'var(--bd)'}`,
                        background: ollamaCtx?.filter_ctx === v ? '#1D9E7518' : 'transparent',
                        color: ollamaCtx?.filter_ctx === v ? 'var(--accent)' : 'var(--c-sub)',
                        fontWeight: ollamaCtx?.filter_ctx === v ? 700 : 400,
                      }}>
                      {ollamaCtx?.filter_ctx === v ? '✓ ' : ''}{(v / 1024)}K
                    </button>
                  ))}
                </div>

                {/* 컨텍스트 크기 — 생성 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 8, marginBottom: 4 }}>생성 컨텍스트 <span style={{ color: 'var(--accent-orange)' }}>(연설문/스크립트 생성용)</span></div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[4096, 8192, 16384, 32768, 65536, 131072, 262144].map(v => (
                    <button key={v} onClick={async () => {
                      try {
                        const res = await setOllamaCtx(v, 'gen');
                        setOllamaCtxState(res);
                      } catch (e) { showAlert(e.message, { variant: 'error' }); }
                    }}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${ollamaCtx?.gen_ctx === v ? 'var(--accent-orange)' : 'var(--bd)'}`,
                        background: ollamaCtx?.gen_ctx === v ? '#D85A3018' : 'transparent',
                        color: ollamaCtx?.gen_ctx === v ? 'var(--accent-orange)' : 'var(--c-sub)',
                        fontWeight: ollamaCtx?.gen_ctx === v ? 700 : 400,
                      }}>
                      {ollamaCtx?.gen_ctx === v ? '✓ ' : ''}{(v / 1024)}K
                    </button>
                  ))}
                </div>

                {/* 컨텍스트 크기 — 대화 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 8, marginBottom: 4 }}>대화 컨텍스트 <span style={{ color: 'var(--accent-purple)' }}>(AI 대화 검색용)</span></div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[4096, 8192, 16384, 32768, 65536, 131072, 262144].map(v => (
                    <button key={v} onClick={async () => {
                      try {
                        const res = await setOllamaCtx(v, 'chat');
                        setOllamaCtxState(res);
                      } catch (e) { showAlert(e.message, { variant: 'error' }); }
                    }}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${ollamaCtx?.chat_ctx === v ? 'var(--accent-purple)' : 'var(--bd)'}`,
                        background: ollamaCtx?.chat_ctx === v ? '#7F77DD18' : 'transparent',
                        color: ollamaCtx?.chat_ctx === v ? 'var(--accent-purple)' : 'var(--c-sub)',
                        fontWeight: ollamaCtx?.chat_ctx === v ? 700 : 400,
                      }}>
                      {ollamaCtx?.chat_ctx === v ? '✓ ' : ''}{(v / 1024)}K
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                  작을수록 빠르고 VRAM 절약 · 클수록 긴 프롬프트 처리 가능
                </div>

                {/* Thinking 설정 */}
                {ollamaThink && (
                  <>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 12, marginBottom: 6 }}>Thinking 모드 <span style={{ fontSize: '0.643rem' }}>(Qwen 3.5 등 thinking 모델용)</span></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => {
                        try {
                          const res = await setOllamaThink('filter', !ollamaThink.filter_no_think);
                          setOllamaThinkState(res);
                        } catch {}
                      }}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                          border: `1.5px solid ${ollamaThink.filter_no_think ? 'var(--bd)' : 'var(--accent-purple)'}`,
                          background: ollamaThink.filter_no_think ? 'transparent' : '#7F77DD18',
                          color: ollamaThink.filter_no_think ? 'var(--c-muted)' : 'var(--accent-purple)',
                          fontWeight: ollamaThink.filter_no_think ? 400 : 700 }}>
                        필터: {ollamaThink.filter_no_think ? '🧠 OFF' : '🧠 ON'}
                      </button>
                      <button onClick={async () => {
                        try {
                          const res = await setOllamaThink('gen', !ollamaThink.gen_no_think);
                          setOllamaThinkState(res);
                        } catch {}
                      }}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                          border: `1.5px solid ${ollamaThink.gen_no_think ? 'var(--bd)' : 'var(--accent-purple)'}`,
                          background: ollamaThink.gen_no_think ? 'transparent' : '#7F77DD18',
                          color: ollamaThink.gen_no_think ? 'var(--c-muted)' : 'var(--accent-purple)',
                          fontWeight: ollamaThink.gen_no_think ? 400 : 700 }}>
                        생성: {ollamaThink.gen_no_think ? '🧠 OFF' : '🧠 ON'}
                      </button>
                      <button onClick={async () => {
                        try {
                          const res = await setOllamaThink('chat', !ollamaThink.chat_no_think);
                          setOllamaThinkState(res);
                        } catch {}
                      }}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                          border: `1.5px solid ${ollamaThink.chat_no_think ? 'var(--bd)' : 'var(--accent-purple)'}`,
                          background: ollamaThink.chat_no_think ? 'transparent' : '#7F77DD18',
                          color: ollamaThink.chat_no_think ? 'var(--c-muted)' : 'var(--accent-purple)',
                          fontWeight: ollamaThink.chat_no_think ? 400 : 700 }}>
                        대화: {ollamaThink.chat_no_think ? '🧠 OFF' : '🧠 ON'}
                      </button>
                    </div>
                    <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                      OFF 권장 (3090) · ON은 M5 Ultra 등 대용량 메모리에서 사용
                    </div>
                  </>
                )}

                {/* ── AI 대화 설정 ── */}
                {(chatTurns !== null || chatSearchTopK !== null) && (
                  <>
                    <div style={{ borderTop: '1px solid var(--bd)', marginTop: 14, paddingTop: 10 }}>
                      <div style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--accent-purple)', marginBottom: 8 }}>💬 AI 대화 설정</div>
                    </div>

                    {/* 대화 이력 턴 수 */}
                    {chatTurns !== null && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>대화 이력 턴 수 <span style={{ color: 'var(--accent-purple)' }}>(AI가 기억하는 이전 질문-답변 쌍 수)</span></div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[5, 10, 15, 20, 30, 50].map(v => (
                            <button key={v} onClick={async () => {
                              try {
                                const res = await setChatTurns(v);
                                setChatTurnsState(res.chat_max_turns);
                              } catch (e) { showAlert(e.message, { variant: 'error' }); }
                            }}
                              style={{
                                padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                                border: `1.5px solid ${chatTurns === v ? 'var(--accent-purple)' : 'var(--bd)'}`,
                                background: chatTurns === v ? '#7F77DD18' : 'transparent',
                                color: chatTurns === v ? 'var(--accent-purple)' : 'var(--c-sub)',
                                fontWeight: chatTurns === v ? 700 : 400,
                              }}>
                              {chatTurns === v ? '✓ ' : ''}{v}턴
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                          클수록 긴 대화 맥락 유지 · CTX가 충분해야 함
                        </div>
                      </div>
                    )}

                    {/* 검색 결과 수 */}
                    {chatSearchTopK !== null && (
                      <div>
                        <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>검색 결과 수 <span style={{ color: 'var(--accent-orange)' }}>(AI 대화 시 DB에서 가져오는 자료 수)</span></div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[5, 10, 15, 20, 30].map(v => (
                            <button key={v} onClick={async () => {
                              try {
                                const res = await setChatSearchTopK(v);
                                setChatSearchTopKState(res.chat_search_top_k);
                              } catch (e) { showAlert(e.message, { variant: 'error' }); }
                            }}
                              style={{
                                padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                                border: `1.5px solid ${chatSearchTopK === v ? 'var(--accent-orange)' : 'var(--bd)'}`,
                                background: chatSearchTopK === v ? '#D85A3018' : 'transparent',
                                color: chatSearchTopK === v ? 'var(--accent-orange)' : 'var(--c-sub)',
                                fontWeight: chatSearchTopK === v ? 700 : 400,
                              }}>
                              {chatSearchTopK === v ? '✓ ' : ''}{v}건
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                          많을수록 넓은 범위 검색 · CTX 토큰 더 소비
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--c-dim)', fontSize: '0.786rem' }}>로딩 중...</div>
            )}
          </div>}</div>

          {/* 프롬프트 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('prompt')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.prompt ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>📝 프롬프트 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.prompt ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.prompt && <div style={{ padding: 14 }}>
            {promptData ? (
              <div style={{ marginTop: 10 }}>
                {[
                  { key: 'speech', label: '연설문 생성', color: 'var(--accent)' },
                  { key: 'service_meeting', label: '봉사 모임', color: 'var(--accent-orange)' },
                  { key: 'visit', label: '방문', color: 'var(--accent-purple)' },
                  { key: 'refine', label: '다듬기', color: 'var(--c-sub)' },
                  { key: 'style_both', label: '스타일 지시', color: 'var(--accent-purple)' },
                  { key: 'stt_local_cleanup', label: 'STT 로컬 LLM 교정', color: 'var(--accent-brown)' },
                  { key: 'stt_correction', label: 'STT 클라우드 LLM 교정', color: 'var(--accent-blue)' },
                ].map(({ key, label, color }) => {
                  const isModified = promptEdits[key] !== promptData.defaults[key];
                  const hasCustomDefault = promptData.original_defaults && promptData.defaults[key] !== promptData.original_defaults[key];
                  const editing = isEditing(key);
                  const requiredVars = extractVars(promptData.prompts[key]);
                  return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '0.786rem', fontWeight: 700, color }}>{label}</span>
                        {hasCustomDefault && <span style={{ fontSize: '0.571rem', color: 'var(--accent-orange)' }}>★</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {!editing ? (
                          <button onClick={() => startEdit(key)}
                            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>편집</button>
                        ) : (
                          <>
                            {isModified && (
                              <button onClick={async () => {
                                try {
                                  await resetPrompt(key);
                                  setPromptEdits(prev => ({ ...prev, [key]: promptData.defaults[key] }));
                                  setPromptData(prev => ({ ...prev, prompts: { ...prev.prompts, [key]: prev.defaults[key] } }));
                                  stopEdit(key);
                                } catch (e) { showAlert(e.message, { variant: 'error' }); }
                              }}
                                style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>초기화</button>
                            )}
                            <button onClick={async () => {
                              try {
                                await savePromptDefault(key, promptEdits[key]);
                                setPromptData(prev => ({ ...prev, defaults: { ...prev.defaults, [key]: promptEdits[key] } }));
                              } catch (e) { showAlert(e.message, { variant: 'error' }); }
                            }} disabled={promptEdits[key] === promptData.defaults[key]}
                              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (promptEdits[key] !== promptData.defaults[key] ? 'var(--accent-orange)' : 'var(--bd)'), background: promptEdits[key] !== promptData.defaults[key] ? 'var(--accent-orange)' : 'transparent', color: promptEdits[key] !== promptData.defaults[key] ? '#fff' : 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>기본값 저장</button>
                            <button onClick={async () => {
                              setPromptSaving(key);
                              try {
                                await setPrompt(key, promptEdits[key]);
                                setPromptData(prev => ({ ...prev, prompts: { ...prev.prompts, [key]: promptEdits[key] } }));
                                stopEdit(key);
                              } catch (e) { showAlert(e.message, { variant: 'error' }); }
                              finally { setPromptSaving(''); }
                            }} disabled={promptSaving === key || promptEdits[key] === promptData.prompts[key]}
                              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--accent)', background: (promptEdits[key] !== promptData.prompts[key]) ? 'var(--accent)' : 'transparent', color: (promptEdits[key] !== promptData.prompts[key]) ? '#fff' : 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>
                              {promptSaving === key ? '...' : '저장'}
                            </button>
                            <button onClick={() => {
                              setPromptEdits(prev => ({ ...prev, [key]: promptData.prompts[key] }));
                              stopEdit(key);
                            }}
                              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                          </>
                        )}
                      </div>
                    </div>
                    {editing && requiredVars.length > 0 && key !== 'stt_correction' && (
                      <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 4 }}>
                        ⚠️ 필수 변수: {requiredVars.join(', ')} — 제거 시 동작 깨짐
                      </div>
                    )}
                    {editing && key === 'stt_correction' && (
                      <div style={{
                        marginBottom: 6, padding: '8px 10px', borderRadius: 6,
                        background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)',
                        fontSize: '0.643rem', color: 'var(--c-text)', lineHeight: 1.6,
                      }}>
                        <div style={{ fontWeight: 700, color: 'var(--c-danger)', marginBottom: 2 }}>
                          필수 변수 (제거 시 동작 깨짐):
                        </div>
                        <div style={{ marginLeft: 8, marginBottom: 4 }}>
                          <code>{'{text}'}</code> — STT 원문 (반드시 포함)
                        </div>
                        <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>
                          선택 변수 (비어도 동작):
                        </div>
                        <div style={{ marginLeft: 8 }}>
                          <div><code>{'{skip_words}'}</code> — 수정 제외 단어 목록</div>
                          <div><code>{'{verses}'}</code> — 골자 참고 성구 목록 (mode 선택 시)</div>
                        </div>
                        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--bd-light)' }}>
                          <div style={{ fontWeight: 600, color: 'var(--c-muted)', marginBottom: 2 }}>예시 스니펫:</div>
                          <pre style={{
                            margin: 0, padding: 6, background: 'var(--bg-card)', borderRadius: 4,
                            fontSize: '0.643rem', fontFamily: 'monospace', color: 'var(--c-text-dark)',
                            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          }}>
{`[참고 성구 목록]
이 연설에 관련된 성구입니다. STT 인식 오류 시 이 목록의 성구로 정확히 교정하세요.
{verses}

원문:
{text}`}
                          </pre>
                          <button type="button"
                            onClick={() => {
                              const snippet = `[참고 성구 목록]\n이 연설에 관련된 성구입니다. STT 인식 오류 시 이 목록의 성구로 정확히 교정하세요.\n{verses}\n\n원문:\n{text}`;
                              navigator.clipboard?.writeText(snippet);
                            }}
                            style={{
                              marginTop: 4, padding: '2px 8px', borderRadius: 4,
                              border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)',
                              fontSize: '0.643rem', cursor: 'pointer', fontFamily: 'inherit',
                            }}>
                            📋 스니펫 복사
                          </button>
                        </div>
                      </div>
                    )}
                    {editing ? (
                      <textarea value={promptEdits[key] || ''} onChange={e => setPromptEdits(prev => ({ ...prev, [key]: e.target.value }))}
                        rows={6} style={{ display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                    ) : (
                      <div style={{ display: '-webkit-box', width: '100%', padding: '10px 12px', boxSizing: 'border-box', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', whiteSpace: 'pre-wrap', wordBreak: 'break-word', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {promptEdits[key] || ''}
                      </div>
                    )}
                    {isModified && <div style={{ fontSize: '0.643rem', color, marginTop: 2 }}>수정됨 (기본값과 다름)</div>}
                  </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--c-dim)', fontSize: '0.786rem' }}>로딩 중...</div>
            )}
          </div>}</div>

          {/* API 키 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('api')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.api ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>🔑 API 키 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.api ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.api && <div style={{ padding: 14 }}>
            <div style={{ fontSize: '0.929rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>설정</span>
              {!apiKeyStatus ? (
                <button onClick={async () => { try { setApiKeyStatus(await getApiKeys()); } catch {} }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>열기</button>
              ) : (
                <button onClick={() => { setApiKeyStatus(null); setApiKeyInputs({}); setAiError(''); }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>닫기</button>
              )}
            </div>
            {apiKeyStatus && (
              <div style={{ marginTop: 10 }}>
                {[
                  { key: 'GEMINI_API_KEY', label: 'Gemini', placeholder: 'AIza...' },
                  { key: 'ANTHROPIC_API_KEY', label: 'Claude', placeholder: 'sk-ant-...' },
                  { key: 'OPENAI_API_KEY', label: 'ChatGPT', placeholder: 'sk-...' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ width: 60, fontSize: '0.786rem', color: 'var(--c-sub)', flexShrink: 0 }}>{label}</span>
                    <input type="password" autoComplete="off" value={apiKeyInputs[key] ?? ''} onChange={e => setApiKeyInputs(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={apiKeyStatus[key] || placeholder}
                      style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: `1px solid ${apiKeyStatus[key] ? 'var(--accent)' : 'var(--bd)'}`, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                    {apiKeyStatus[key] && <span style={{ fontSize: '0.786rem', color: 'var(--accent)' }}>✓</span>}
                    {apiKeyStatus[key] && (
                      <button onClick={async () => {
                        if (!aiPassword) { setAiError('비밀번호를 입력하세요'); return; }
                        if (!await showConfirm(`${label} API 키를 삭제하시겠습니까?`, { confirmVariant: 'danger' })) return;
                        try { await saveApiKeys(aiPassword, { [key]: '' }); setApiKeyStatus(await getApiKeys()); setApiKeyInputs(prev => ({ ...prev, [key]: '' })); }
                        catch (e) { setAiError(e.message); }
                      }}
                        style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e55', background: 'transparent', color: '#e55', fontSize: '0.643rem', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <input type="password" autoComplete="off" value={aiPassword} onChange={e => { setAiPassword(e.target.value); setAiError(''); }} placeholder="비밀번호"
                    style={{ width: 100, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                  <button onClick={async () => {
                    if (!aiPassword) { setAiError('비밀번호를 입력하세요'); return; }
                    const toSave = {}; Object.entries(apiKeyInputs).forEach(([k, v]) => { if (v) toSave[k] = v; });
                    if (!Object.keys(toSave).length) return;
                    setApiKeySaving(true); setAiError('');
                    try { await saveApiKeys(aiPassword, toSave); setApiKeyStatus(await getApiKeys()); setApiKeyInputs({}); setAiError('✓ 저장 완료'); setTimeout(() => setAiError(''), 2000); }
                    catch (e) { setAiError('저장 오류: ' + e.message); }
                    finally { setApiKeySaving(false); }
                  }} disabled={apiKeySaving}
                    style={{ padding: '4px 14px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>
                    {apiKeySaving ? '저장 중...' : '저장'}
                  </button>
                </div>
                {aiError && <div style={{ marginTop: 6, fontSize: '0.786rem', color: aiError.startsWith('✓') ? 'var(--accent)' : 'var(--c-danger)' }}>{aiError}</div>}
              </div>
            )}
            {apiVersions && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)' }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 6, fontWeight: 600 }}>API 버전</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-sub)', width: 60, flexShrink: 0 }}>Claude</span>
                  <input value={apiVersions.anthropic || ''} onChange={e => setApiVersions(p => ({ ...p, anthropic: e.target.value }))}
                    placeholder="2023-06-01"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={async () => {
                    try { await saveApiVersions({ anthropic: apiVersions.anthropic }); setAiError('✓ 버전 저장 완료'); setTimeout(() => setAiError(''), 2000); }
                    catch (e) { setAiError('버전 저장 오류: ' + e.message); }
                  }} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>저장</button>
                </div>
              </div>
            )}
          </div>}</div>

          {/* 비밀번호 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('pw')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.pw ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>🔒 비밀번호 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.pw ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.pw && <div style={{ padding: 14 }}>
            <div style={{ fontSize: '0.929rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>설정</span>
              {!pwStatus ? (
                <button onClick={async () => { try { setPwStatus(await getPasswordStatus()); } catch {} }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>열기</button>
              ) : (
                <button onClick={() => { setPwStatus(null); setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwMsg(''); }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>닫기</button>
              )}
            </div>
            {pwStatus && (
              <div style={{ marginTop: 10 }}>
                <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 10, fontSize: '0.786rem', color: 'var(--c-sub)' }}>
                  상태: <b style={{ color: pwStatus.has_password ? 'var(--accent)' : 'var(--c-danger)' }}>{pwStatus.has_password ? '설정됨 ✓' : '미설정'}</b>
                </div>
                {pwStatus.has_password && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>현재 비밀번호</div>
                    <input type="password" autoComplete="off" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="현재 비밀번호"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>새 비밀번호</div>
                  <input type="password" autoComplete="off" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="새 비밀번호 (4자 이상)"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>새 비밀번호 확인</div>
                  <input type="password" autoComplete="off" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="새 비밀번호 재입력"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  {pwConfirm && pwNew !== pwConfirm && <div style={{ fontSize: '0.786rem', color: 'var(--c-danger)', marginTop: 2 }}>비밀번호가 일치하지 않습니다</div>}
                </div>
                <button onClick={async () => {
                  if (!pwNew || pwNew.length < 4) { setPwMsg('새 비밀번호는 4자 이상이어야 합니다'); return; }
                  if (pwNew !== pwConfirm) { setPwMsg('비밀번호가 일치하지 않습니다'); return; }
                  setPwChanging(true); setPwMsg('');
                  try {
                    await changePassword(pwCurrent, pwNew);
                    setPwMsg('✓ 비밀번호가 변경되었습니다');
                    setPwCurrent(''); setPwNew(''); setPwConfirm('');
                    setPwStatus(await getPasswordStatus());
                  } catch (e) { setPwMsg(e.message); }
                  finally { setPwChanging(false); }
                }} disabled={pwChanging || !pwNew || pwNew !== pwConfirm}
                  style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                    background: (!pwNew || pwNew !== pwConfirm) ? 'var(--bd)' : 'var(--accent)', color: '#fff',
                    fontSize: '0.929rem', fontWeight: 700, cursor: (!pwNew || pwNew !== pwConfirm) ? 'not-allowed' : 'pointer',
                    opacity: (!pwNew || pwNew !== pwConfirm) ? 0.5 : 1 }}>
                  {pwChanging ? '변경 중...' : pwStatus.has_password ? '비밀번호 변경' : '비밀번호 설정'}
                </button>
                {pwMsg && <div style={{ marginTop: 6, fontSize: '0.786rem', color: pwMsg.startsWith('✓') ? 'var(--accent)' : 'var(--c-danger)' }}>{pwMsg}</div>}
              </div>
            )}
          </div>}</div>
        </div>
  );
}
