import { useState, useEffect, useCallback } from 'react';
import { healthCheck, getAiModels, saveAiModels, saveChatDefault as saveChatDefaultAPI } from '../api';

const DEFAULT_MODELS = {
  Local: [{ value: 'gemma4:26b', label: 'Gemma 4 26B' }],
  Gemini: [{ value: 'gemini-2.5-flash', label: '2.5 Flash' }],
  Claude: [{ value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' }],
  ChatGPT: [{ value: 'gpt-4o', label: 'GPT-4o' }],
};

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); if (v && typeof v === 'object') return v; } catch {}
  return fallback;
}

export default function useAiModel() {
  const [aiModels, setAiModels] = useState(() => loadJSON('jw-ai-models', DEFAULT_MODELS));
  const [defaultTick, setDefaultTick] = useState(0);
  const [llmSettings, setLlmSettings] = useState(null);

  // 생성용 모델
  const savedDefault = (() => { void defaultTick; return loadJSON('jw-ai-default', null); })();
  const [aiPlatform, setAiPlatform] = useState(savedDefault?.platform || Object.keys(aiModels)[0] || 'Gemini');
  const [aiModel, setAiModel] = useState(savedDefault?.model || (aiModels[Object.keys(aiModels)[0]] || [])[0]?.value || '');
  const isDefaultModel = !!(savedDefault && savedDefault.platform === aiPlatform && savedDefault.model === aiModel);

  // 대화용 모델
  const chatDefault = (() => { void defaultTick; return loadJSON('jw-ai-chat-default', null); })();
  const [chatPlatform, setChatPlatform] = useState(chatDefault?.platform || Object.keys(aiModels)[0] || 'Local');
  const [chatModel, setChatModel] = useState(chatDefault?.model || (aiModels[Object.keys(aiModels)[0]] || [])[0]?.value || '');
  const isChatDefaultModel = !!(chatDefault && chatDefault.platform === chatPlatform && chatDefault.model === chatModel);

  useEffect(() => {
    healthCheck().then(setLlmSettings).catch(() => {});
    getAiModels().then(data => {
      if (data.models) {
        setAiModels(data.models);
        localStorage.setItem('jw-ai-models', JSON.stringify(data.models));
      } else {
        const local = loadJSON('jw-ai-models', null);
        if (local) saveAiModels(local, null).catch(() => {});
      }
      if (data.default?.platform) {
        localStorage.setItem('jw-ai-default', JSON.stringify(data.default));
        setDefaultTick(t => t + 1);
      } else {
        const localDefault = loadJSON('jw-ai-default', null);
        if (localDefault?.platform) saveAiModels(null, localDefault).catch(() => {});
      }
      if (data.chat_default?.platform) {
        localStorage.setItem('jw-ai-chat-default', JSON.stringify(data.chat_default));
        setChatPlatform(data.chat_default.platform);
        setChatModel(data.chat_default.model);
        setDefaultTick(t => t + 1);
      }
    }).catch(() => {});
  }, []);

  const handlePlatformChange = useCallback((p) => {
    setAiPlatform(p);
    const first = aiModels[p]?.[0];
    if (first) setAiModel(first.value);
  }, [aiModels]);
  const handleModelChange = useCallback((m) => { setAiModel(m); }, []);
  const saveDefault = useCallback(() => {
    const def = { platform: aiPlatform, model: aiModel };
    localStorage.setItem('jw-ai-default', JSON.stringify(def));
    saveAiModels(null, def).catch(() => {});
    setDefaultTick(t => t + 1);
  }, [aiPlatform, aiModel]);
  const clearDefault = useCallback(() => {
    localStorage.removeItem('jw-ai-default');
    saveAiModels(null, {}).catch(() => {});
    setDefaultTick(t => t + 1);
  }, []);

  const handleChatPlatformChange = useCallback((p) => {
    setChatPlatform(p);
    const first = aiModels[p]?.[0];
    if (first) setChatModel(first.value);
  }, [aiModels]);
  const handleChatModelChange = useCallback((m) => { setChatModel(m); }, []);
  const saveChatDefault = useCallback(() => {
    const def = { platform: chatPlatform, model: chatModel };
    localStorage.setItem('jw-ai-chat-default', JSON.stringify(def));
    saveChatDefaultAPI(def).catch(() => {});
    setDefaultTick(t => t + 1);
  }, [chatPlatform, chatModel]);
  const clearChatDefault = useCallback(() => {
    localStorage.removeItem('jw-ai-chat-default');
    saveChatDefaultAPI({}).catch(() => {});
    setDefaultTick(t => t + 1);
  }, []);

  const refreshSettings = useCallback(() => {
    healthCheck().then(setLlmSettings).catch(() => {});
    getAiModels().then(data => {
      if (data.models) {
        setAiModels(data.models);
        localStorage.setItem('jw-ai-models', JSON.stringify(data.models));
      }
      if (data.default?.platform) {
        localStorage.setItem('jw-ai-default', JSON.stringify(data.default));
        setDefaultTick(t => t + 1);
      }
      if (data.chat_default?.platform) {
        localStorage.setItem('jw-ai-chat-default', JSON.stringify(data.chat_default));
        setChatPlatform(data.chat_default.platform);
        setChatModel(data.chat_default.model);
        setDefaultTick(t => t + 1);
      }
    }).catch(() => {});
  }, []);

  return {
    aiModels, aiPlatform, aiModel, llmSettings,
    isDefaultModel, handlePlatformChange, handleModelChange,
    saveDefault, clearDefault,
    chatPlatform, chatModel, isChatDefaultModel,
    handleChatPlatformChange, handleChatModelChange,
    saveChatDefault, clearChatDefault,
    refreshSettings,
  };
}
