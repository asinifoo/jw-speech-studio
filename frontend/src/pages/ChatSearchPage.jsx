import { useState, useRef, useEffect, Fragment } from 'react';
import { copyText } from '../components/copyUtil';
import { getBody } from '../utils/textHelpers';
import { parseDocument, cleanMd, sourceLabel, parseKeywords } from '../components/utils';
import { chatStream, abortGeneration, getChatSessions, getChatSession, saveChatSession, deleteChatSession, getWolStatus, uploadFile } from '../api';
import WolFiltersPanel from '../components/WolFiltersPanel';
import { useAlert } from '../providers/AlertProvider';
import { getOutlinePrefix } from '../utils/outlineFormat';

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

export default function ChatSearchPage({ fontSize, ai }) {
  const showAlert = useAlert();
  const [sessions, setSessions] = useState([]);       // [{id, title, messageCount, updated}]
  const [currentId, setCurrentId] = useState(() => { try { return localStorage.getItem('jw-chat-current') || null; } catch(e) { return null; } });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const [copied, setCopied] = useState({});
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showSessionList, setShowSessionList] = useState(false);
  const [allResults, setAllResults] = useState([]);
  const [expandedResultIdx, setExpandedResultIdx] = useState(-1);
  const [expandedCards, setExpandedCards] = useState({});
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowScrollBtn(document.documentElement.scrollHeight - window.scrollY - window.innerHeight > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const scrollOnSend = useRef(false);
  const savePending = useRef(false);
  const [searchMode, _setSearchMode] = useState(() => { try { return localStorage.getItem('jw-chat-search-mode') || 'db'; } catch { return 'db'; } });
  const setSearchMode = (m) => { _setSearchMode(m); try { localStorage.setItem('jw-chat-search-mode', m); } catch {} };
  const [wolAvailable, setWolAvailable] = useState(false);
  const [showWolFilters, setShowWolFilters] = useState(false);
  // 파일 첨부
  const fileRef = useRef(null);
  const [attachedFile, setAttachedFile] = useState(null); // { name, chars, text }
  const [fileUploading, setFileUploading] = useState(false);

  // 세션 목록 로드 + 마지막 대화 복원 + WOL 상태 확인
  useEffect(() => {
    getChatSessions().then(async d => {
      const list = d.sessions || [];
      setSessions(list);
      const restoreId = currentId || (list.length > 0 ? list[0].id : null);
      if (restoreId) {
        try {
          const data = await getChatSession(restoreId);
          setCurrentId(data.id);
          setMessages(data.messages || []);
          setAllResults(data.allResults || []);
        } catch {
          // 세션 없으면 목록의 첫 번째로 폴백
          if (list.length > 0 && restoreId !== list[0].id) {
            try {
              const data = await getChatSession(list[0].id);
              setCurrentId(data.id);
              setMessages(data.messages || []);
              setAllResults(data.allResults || []);
            } catch {}
          } else {
            setCurrentId(null);
          }
        }
      }
    }).catch(() => {});
    getWolStatus().then(s => setWolAvailable(s.available)).catch(() => {});
  }, []);

  // currentId 저장
  useEffect(() => { try { if (currentId) localStorage.setItem('jw-chat-current', currentId); else localStorage.removeItem('jw-chat-current'); } catch(e) {} }, [currentId]);

  // 메시지 변경 시 자동 저장 (디바운스, 세션 전환 안전)
  const saveIdRef = useRef(currentId);
  useEffect(() => { saveIdRef.current = currentId; }, [currentId]);
  useEffect(() => {
    if (!currentId || messages.length === 0) return;
    savePending.current = true;
    const savedId = currentId;
    const timer = setTimeout(() => {
      if (!savePending.current || saveIdRef.current !== savedId) return;
      const title = messages.find(m => m.role === 'user')?.content?.slice(0, 30) || '새 대화';
      saveChatSession(savedId, title, messages, allResults)
        .then(() => {
          setSessions(prev => {
            const exists = prev.find(s => s.id === savedId);
            if (exists) return prev.map(s => s.id === savedId ? { ...s, title, messageCount: messages.length, updated: new Date().toISOString() } : s);
            return [{ id: savedId, title, messageCount: messages.length, updated: new Date().toISOString() }, ...prev];
          });
        })
        .catch(() => {});
      savePending.current = false;
    }, 2000);
    return () => {
      clearTimeout(timer);
      // 언마운트 시 즉시 저장
      if (savePending.current && saveIdRef.current === savedId && messages.length > 0) {
        const title = messages.find(m => m.role === 'user')?.content?.slice(0, 30) || '새 대화';
        saveChatSession(savedId, title, messages, allResults).catch(() => {});
        savePending.current = false;
      }
    };
  }, [messages, allResults, currentId]);

  useEffect(() => {
    if (scrollOnSend.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      scrollOnSend.current = false;
    }
  }, [messages]);

  const doCopy = async (key, text) => {
    const ok = await copyText(text);
    if (ok) { setCopied(p => ({ ...p, [key]: true })); setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1500); }
  };

  const loadSession = async (id) => {
    try {
      const data = await getChatSession(id);
      setCurrentId(data.id);
      setMessages(data.messages || []);
      setAllResults(data.allResults || []);
      setExpandedResultIdx(-1);
      setExpandedCards({});
      setShowSessionList(false);
    } catch (e) { showAlert(e.message, { variant: 'error' }); }
  };

  const newChat = () => {
    // 현재 대화 즉시 저장
    if (currentId && messages.length > 0) {
      const title = messages.find(m => m.role === 'user')?.content?.slice(0, 30) || '새 대화';
      saveChatSession(currentId, title, messages, allResults).catch(() => {});
    }
    const id = genId();
    setCurrentId(id);
    setMessages([]);
    setAllResults([]);
    setExpandedResultIdx(-1);
    setExpandedCards({});
    setShowSessionList(false);
  };

  const removeSession = async (id, e) => {
    e.stopPropagation();
    try {
      await deleteChatSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentId === id) {
        setCurrentId(null);
        setMessages([]);
        setAllResults([]);
      }
    } catch {}
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    try {
      const res = await uploadFile(file);
      setAttachedFile({ name: res.filename, chars: res.chars, text: res.text, truncated: res.truncated });
    } catch (err) {
      showAlert('파일 업로드 실패: ' + err.message, { variant: 'error' });
    } finally {
      setFileUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    let id = currentId;
    if (!id) { id = genId(); setCurrentId(id); }
    const displayMsg = attachedFile ? `📎 ${attachedFile.name}\n${msg}` : msg;
    const userMsg = { role: 'user', content: displayMsg };
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '', loading: true }]);
    setInput('');
    setStreaming(true);
    scrollOnSend.current = true;
    setExpandedCards({});

    const fileCtx = attachedFile?.text || '';
    const fileName = attachedFile?.name || '';
    setAttachedFile(null);

    const ac = new AbortController();
    abortRef.current = ac;
    let text = '';

    try {
      await chatStream(msg, history, ai?.chatModel || '', password, (ev) => {
        if (ev.stage === 'search') {
          const results = ev.results || [];
          const mode = ev.search_mode || searchMode;
          if (results.length > 0) {
            setAllResults(prev => {
              const next = [...prev, { query: msg, results, mode }];
              setExpandedResultIdx(next.length - 1);
              return next;
            });
          }
        } else if (ev.stage === 'streaming') {
          text += ev.chunk;
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: text, loading: false };
            return next;
          });
        } else if (ev.stage === 'done') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: ev.text, loading: false };
            return next;
          });
        } else if (ev.stage === 'error') {
          setMessages(prev => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], content: '오류: ' + ev.message, loading: false, error: true };
            return next;
          });
        }
      }, ac.signal, 0, searchMode, fileCtx, fileName);
    } catch (e) {
      if (e.name !== 'AbortError') {
        setMessages(prev => {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: '오류: ' + e.message, loading: false, error: true };
          return next;
        });
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const needsPassword = ai?.chatModel && (ai.chatModel.startsWith('gemini-') || ai.chatModel.startsWith('claude-') || ai.chatModel.startsWith('gpt-'));
  const tagColor = { speech_points: 'var(--accent)', speech_expressions: 'var(--accent-orange)', publications: 'var(--accent-purple)', wol: 'var(--accent-brown)' };
  const colLabel = { speech_points: '골자', speech_expressions: '연설', publications: '출판물', wol: 'WOL' };
  const chatModelLabel = (ai.aiModels[ai.chatPlatform] || []).find(m => m.value === ai.chatModel)?.label || ai.chatModel;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>

      {/* ── 상단 바 ── */}
      <div style={{
        padding: '8px 10px', marginBottom: 8,
        borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--bd)',
      }}>
        {/* 1줄: 모델명 + 버튼 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div onClick={() => setShowModelSelector(p => !p)}
            style={{ flex: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
            <span style={{ fontSize: '0.857rem', fontWeight: 700, color: 'var(--accent-purple)', flexShrink: 0 }}>{ai.chatPlatform}</span>
            <span style={{ fontSize: '0.857rem', color: 'var(--c-text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chatModelLabel}</span>
            {ai.isChatDefaultModel && <span style={{ fontSize: '0.643rem', color: 'var(--accent-purple)', flexShrink: 0 }}>★</span>}
            <span style={{ fontSize: '0.571rem', color: 'var(--c-dim)', flexShrink: 0 }}>{showModelSelector ? '▲' : '▼'}</span>
          </div>
          <button onClick={() => setShowSessionList(p => !p)} style={{
            padding: '3px 8px', borderRadius: 8, border: '1px solid ' + (showSessionList ? 'var(--accent-purple)' : 'var(--bd)'),
            background: showSessionList ? '#7F77DD18' : 'transparent', color: showSessionList ? 'var(--accent-purple)' : 'var(--c-muted)',
            fontSize: '0.643rem', cursor: 'pointer', fontWeight: showSessionList ? 600 : 400, flexShrink: 0,
          }}>목록{sessions.length > 0 ? ` ${sessions.length}` : ''}</button>
          <button onClick={newChat} style={{
            padding: '3px 8px', borderRadius: 8, border: '1px solid var(--bd)',
            background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', flexShrink: 0,
          }}>+ 새 대화</button>
        </div>
        {/* 2줄: 설정 뱃지 */}
        {ai?.llmSettings && (
          <div style={{ display: 'flex', gap: 3, fontSize: '0.571rem', alignItems: 'center', marginTop: 5, flexWrap: 'wrap' }}>
            <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-muted)', border: '1px solid var(--bd)' }}>
              CTX {((ai.llmSettings.chat_ctx || 16384) / 1024).toFixed(0)}K
            </span>
            <span style={{ padding: '1px 5px', borderRadius: 4, background: ai.llmSettings.chat_no_think === false ? '#7F77DD18' : 'var(--bg-card)',
              color: ai.llmSettings.chat_no_think === false ? 'var(--accent-purple)' : 'var(--c-dim)', border: '1px solid ' + (ai.llmSettings.chat_no_think === false ? '#7F77DD44' : 'var(--bd)') }}>
              🧠 {ai.llmSettings.chat_no_think === false ? 'ON' : 'OFF'}
            </span>
            {ai.llmSettings.chat_max_turns && (
              <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-muted)', border: '1px solid var(--bd)' }}>
                이력 {ai.llmSettings.chat_max_turns}턴
              </span>
            )}
            {ai.llmSettings.chat_search_top_k && (
              <span style={{ padding: '1px 5px', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-muted)', border: '1px solid var(--bd)' }}>
                검색 {ai.llmSettings.chat_search_top_k}건
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 모델 선택기 ── */}
      {showModelSelector && (
        <div style={{ marginBottom: 8, padding: 10, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <select value={ai.chatPlatform} onChange={e => ai.handleChatPlatformChange(e.target.value)}
              style={{ flex: '0 0 auto', width: 100, padding: '6px 8px', borderRadius: 8, border: 'none',
                background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              {Object.keys(ai.aiModels).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <select value={ai.chatModel} onChange={e => ai.handleChatModelChange(e.target.value)}
              style={{ flex: 1, padding: '6px 8px', borderRadius: 8, border: 'none',
                background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', cursor: 'pointer' }}>
              {(ai.aiModels[ai.chatPlatform] || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <button onClick={ai.isChatDefaultModel ? ai.clearChatDefault : ai.saveChatDefault}
              style={{
                flex: '0 0 auto', padding: '5px 9px', borderRadius: 7, fontSize: '0.786rem', fontWeight: 600,
                border: `1.5px solid ${ai.isChatDefaultModel ? 'var(--accent-purple)' : 'var(--bd)'}`,
                background: ai.isChatDefaultModel ? '#7F77DD18' : 'transparent',
                color: ai.isChatDefaultModel ? 'var(--accent-purple)' : 'var(--c-sub)',
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>
              {ai.isChatDefaultModel ? '★ 기본' : '☆ 기본'}
            </button>
          </div>
          {needsPassword && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.786rem' }}>
              <span style={{ color: 'var(--c-muted)' }}>🔒</span>
              <input type={showPw ? 'text' : 'password'} autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="클라우드 모델 비밀번호"
                style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: 'none',
                  background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none' }} />
              <button onClick={() => setShowPw(p => !p)}
                style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent',
                  color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>{showPw ? '숨김' : '표시'}</button>
            </div>
          )}
        </div>
      )}

      {/* ── 세션 목록 ── */}
      {showSessionList && (
        <div style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', maxHeight: 200, overflowY: 'auto' }} className="chat-input">
          {sessions.length === 0 && (
            <div style={{ padding: 12, textAlign: 'center', fontSize: '0.786rem', color: 'var(--c-dim)' }}>저장된 대화가 없습니다</div>
          )}
          {sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s.id)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer',
              borderBottom: '1px solid var(--bd-light)',
              background: currentId === s.id ? '#7F77DD10' : 'transparent',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.857rem', fontWeight: currentId === s.id ? 700 : 400, color: currentId === s.id ? 'var(--accent-purple)' : 'var(--c-text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.title || '새 대화'}
                </div>
                <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>
                  {s.messageCount || 0}개 메시지
                </div>
              </div>
              <button onClick={(e) => removeSession(s.id, e)} style={{
                padding: '2px 6px', borderRadius: 3, border: '1px solid var(--bd)',
                background: 'transparent', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer',
              }}>삭제</button>
            </div>
          ))}
        </div>
      )}

      {/* ── 대화 영역 ── */}
      <div style={{ flex: 1, marginBottom: 8 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--c-dim)' }}>
            <div style={{ fontSize: '1.429rem', marginBottom: 8 }}>
              {{ db: '💾', wol: '🌐', db_wol: '⚡', chat: '💬' }[searchMode] || '💾'}
            </div>
            <div style={{ fontSize: '0.929rem', fontWeight: 600, color: 'var(--c-muted)', marginBottom: 6 }}>
              {{ db: 'DB 자료 검색 + AI 대화', wol: 'WOL 검색 + AI 대화', db_wol: 'DB + WOL 통합 검색', chat: '자유 대화' }[searchMode]}
            </div>
            <div style={{ fontSize: '0.786rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {searchMode === 'chat'
                ? '일상 대화, 연설 조언, 질문 등\n무엇이든 자유롭게 물어보세요'
                : searchMode === 'wol'
                ? 'wol.jw.org에서 자료를 검색하고\nAI가 답변을 정리해 줍니다'
                : '질문을 입력하면 DB에서 관련 자료를\n검색하고 AI가 답변합니다'}
            </div>
          </div>
        )}

        {messages.map((m, mi) => (
          <div key={mi} style={{ marginBottom: 12 }}>
            {m.role === 'user' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 14px', borderRadius: '16px 16px 4px 16px',
                  background: 'var(--accent)', color: '#fff', fontSize: '0.929rem', lineHeight: 1.7,
                  wordBreak: 'keep-all', whiteSpace: 'pre-wrap',
                }}>{m.content}</div>
              </div>
            )}
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                  background: 'linear-gradient(135deg, var(--accent-purple), #5B4FC4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.786rem', color: '#fff', fontWeight: 700,
                }}>AI</div>
                <div style={{ flex: 1, minWidth: 0, maxWidth: '85%' }}>
                  {m.loading && !m.content && (
                    <div style={{ padding: '10px 0', fontSize: '0.857rem', color: 'var(--c-muted)' }}>
                      <span className="dot-pulse">{searchMode === 'chat' ? '응답 생성 중' : '자료 검색 중'}</span>
                      <style>{`.dot-pulse::after { content: ''; animation: dots 1.5s steps(4,end) infinite; } @keyframes dots { 0% { content: ''; } 25% { content: '.'; } 50% { content: '..'; } 75% { content: '...'; } }`}</style>
                    </div>
                  )}
                  {m.content && (
                    <div style={{
                      padding: '10px 14px', borderRadius: '4px 16px 16px 16px',
                      background: 'var(--bg-card)', border: '1px solid var(--bd)',
                      fontSize: '0.929rem', lineHeight: 1.7, color: m.error ? 'var(--c-danger)' : 'var(--c-text)',
                      wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap',
                    }}>
                      {m.content}
                      {streaming && mi === messages.length - 1 && (
                        <span style={{ display: 'inline-block', width: 6, height: 14, background: 'var(--accent-purple)', marginLeft: 2, animation: 'blink 1s step-end infinite', verticalAlign: 'text-bottom' }} />
                      )}
                    </div>
                  )}
                  {m.content && !m.loading && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                      <button onClick={() => doCopy('msg-' + mi, m.content)} style={{
                        padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (copied['msg-' + mi] ? 'var(--accent)' : 'var(--bd)'),
                        background: copied['msg-' + mi] ? 'var(--tint-green)' : 'transparent', color: copied['msg-' + mi] ? 'var(--accent)' : 'var(--c-dim)',
                        fontSize: '0.643rem', cursor: 'pointer',
                      }}>{copied['msg-' + mi] ? '✓ 복사됨' : '복사'}</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── 검색 결과 패널 ── */}
      {allResults.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          {allResults.map((rs, rsi) => {
            const isOpen = expandedResultIdx === rsi;
            const queryShort = rs.query.length > 25 ? rs.query.slice(0, 25) + '...' : rs.query;
            const modeColor = rs.mode === 'wol' ? 'var(--accent-brown)' : rs.mode === 'db_wol' ? '#2D8FC7' : 'var(--accent)';
            return (
              <div key={rsi} style={{ marginBottom: 6 }}>
                <button onClick={() => setExpandedResultIdx(isOpen ? -1 : rsi)} style={{
                  width: '100%', padding: '8px 12px', borderRadius: isOpen ? '10px 10px 0 0' : 10,
                  border: 'none', background: isOpen ? modeColor + '15' : 'var(--bg-subtle)',
                  color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'inherit', textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: isOpen ? '0 2px 8px ' + modeColor + '18' : 'none',
                }}>
                  <span style={{ fontSize: '0.786rem', fontWeight: 700, color: '#fff', background: modeColor, width: 20, height: 20, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{rsi + 1}</span>
                  <span style={{ flex: 1, color: isOpen ? 'var(--c-text-dark)' : 'var(--c-muted)', fontWeight: isOpen ? 600 : 400 }}>{queryShort}</span>
                  {rs.mode && rs.mode !== 'db' && <span style={{ fontSize: '0.643rem', padding: '2px 6px', borderRadius: 8, fontWeight: 600, background: modeColor + '18', color: modeColor }}>{rs.mode === 'wol' ? 'WOL' : 'DB+WOL'}</span>}
                  <span style={{ fontSize: '0.786rem', color: modeColor, fontWeight: 600, padding: '2px 6px', borderRadius: 8, background: modeColor + '10' }}>{rs.results.length}건</span>
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                </button>
                {isOpen && (
                  <div style={{ padding: 8, borderRadius: '0 0 10px 10px', background: 'var(--bg-card)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }} className="chat-input">
                    {rs.results.map((r, ri) => {
                      const meta = r.metadata || {};
                      const col = r.collection || 'speech_expressions';
                      const parsed = parseDocument(r.text || '');
                      const body = getBody(r.text || '');
                      const score = Math.round((r.score || 0) / 0.035 * 100);
                      const cardKey = rsi + '-' + ri;
                      const isExp = expandedCards[cardKey];
                      const cColor = tagColor[col] || 'var(--c-muted)';
                      const gt = meta.outline_type || '';
                      const gn = meta.outline_num || '';
                      const prefix = getOutlinePrefix(gt, gn);
                      const isPub = col === 'publications';
                      const title = meta.outline_title || '';
                      const subTopic = parsed?.subtopic || meta.sub_topic || meta.subtopic || '';
                      const scripture = cleanMd(parsed?.scripture || meta.scriptures || '');
                      const metaRows = [
                        isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: 'var(--accent-purple)' },
                        isPub && meta.pub_title && { label: '출판물명', value: meta.pub_title },
                        !isPub && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
                        subTopic && { label: '소주제', value: subTopic },
                        (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: cColor },
                        scripture && { label: '성구', value: scripture, color: '#2D8FC7' },
                        (() => { const kws = parseKeywords(parsed?.keywords || meta.keywords); return kws.length > 0 && { label: '키워드', value: kws.join(', ') }; })(),
                      ].filter(Boolean);
                      return (
                        <div key={ri} onClick={() => setExpandedCards(p => ({ ...p, [cardKey]: !p[cardKey] }))} style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 8, cursor: 'pointer', border: '1px solid var(--bd-soft)', background: 'var(--bg-card)' }}>
                          <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)' }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: cColor, flexShrink: 0 }} />
                              <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || colLabel[col] || col}</span>
                              {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                              {meta.date && meta.date !== '0000' && <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>{meta.date}</span>}
                              <div style={{ flex: 1 }} />
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <span style={{ width: 44, height: 4, borderRadius: 2, background: 'var(--bg-dim)', overflow: 'hidden' }}>
                                  <span style={{ display: 'block', width: Math.min(score, 100) + '%', height: '100%', borderRadius: 2, background: score > 80 ? 'var(--accent)' : score > 50 ? '#BA7517' : 'var(--c-danger)' }} />
                                </span>
                                <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)', minWidth: 26 }}>{Math.min(score, 100)}%</span>
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                              <div style={{ flex: 1 }} />
                              {meta.wol_url && <a href={meta.wol_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 600, background: 'var(--accent-brown)', color: '#fff', textDecoration: 'none' }}>WOL ↗</a>}
                              <button onClick={e => { e.stopPropagation(); doCopy('card-' + cardKey, body); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid ' + (copied['card-' + cardKey] ? 'var(--accent)' : 'var(--bd)'), background: copied['card-' + cardKey] ? 'var(--tint-green)' : 'var(--bg-card)', color: copied['card-' + cardKey] ? 'var(--accent)' : 'var(--c-faint)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>{copied['card-' + cardKey] ? '✓ 복사됨' : '복사'}</button>
                            </div>
                          </div>
                          {metaRows.length > 0 && (
                            <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline', fontSize: '0.857rem', lineHeight: 1.8, color: 'var(--c-sub)' }}>
                              {metaRows.map((row, mi) => (<Fragment key={mi}><span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span><span style={{ fontSize: '0.786rem', color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span></Fragment>))}
                            </div>
                          )}
                          {body && (
                            <div style={{ padding: '6px 10px 10px', borderTop: '1px solid var(--bd-light)' }}>
                              <div style={{ fontSize: '0.929rem', lineHeight: 1.9, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: isExp ? (col === 'wol' ? 400 : 250) : 80, overflow: isExp ? 'auto' : 'hidden' }}>
                                {body.length > 150 && !isExp ? body.slice(0, 150) + '...' : body}
                              </div>
                              {body.length > 150 && <button onClick={e => { e.stopPropagation(); setExpandedCards(p => ({ ...p, [cardKey]: !p[cardKey] })); }} style={{ marginTop: 4, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>{isExp ? '접기' : '전체 보기'}</button>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 입력 ── */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 10 }}>
        {messages.length > 0 && showScrollBtn && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
            <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
              style={{
                width: 36, height: 36, borderRadius: 18, border: 'none',
                background: 'var(--bg-card)', color: 'var(--c-muted)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.143rem', cursor: 'pointer',
              }}>↓</button>
          </div>
        )}
      <div style={{
        borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
      }}>
        {/* WOL 불용어 관리 패널 */}
        {showWolFilters && (
          <div style={{ padding: '8px 10px 0' }}>
            <WolFiltersPanel compact={false} />
          </div>
        )}
        {/* 파일 첨부 표시 */}
        {attachedFile && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, margin: '10px 10px 0',
            padding: '8px 12px', borderRadius: 8,
            background: 'linear-gradient(135deg, #7F77DD08, #7F77DD15)',
            border: '1px solid #7F77DD25',
          }}>
            <span style={{ fontSize: '1.071rem' }}>📄</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--accent-purple)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {attachedFile.name}
              </div>
              <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginTop: 1 }}>
                {attachedFile.chars > 1000 ? `${(attachedFile.chars / 1000).toFixed(1)}K` : attachedFile.chars}자
                {attachedFile.truncated && ' · 일부만 포함됨'}
              </div>
            </div>
            <button onClick={() => setAttachedFile(null)} style={{
              width: 20, height: 20, borderRadius: 8, border: 'none',
              background: '#7F77DD20', color: 'var(--accent-purple)', fontSize: '0.786rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>✕</button>
          </div>
        )}
        {fileUploading && (
          <div style={{ margin: '8px 12px 0', fontSize: '0.786rem', color: 'var(--accent-purple)' }}>
            파일 읽는 중...
          </div>
        )}
        <input type="file" ref={fileRef} onChange={handleFileUpload}
          accept=".txt,.md,.csv,.json,.log,.pdf,.docx" style={{ display: 'none' }} />
        {/* 입력 영역 */}
        <div style={{ padding: 10 }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={searchMode === 'chat' ? '자유롭게 대화하세요...' : searchMode === 'wol' ? 'WOL에서 검색할 내용을 입력하세요...' : searchMode === 'db_wol' ? 'DB + WOL 통합 검색...' : '질문하거나 자료를 검색하세요...'}
            rows={2}
            className="chat-input"
            style={{
              width: '100%', display: 'block', padding: '8px 12px', boxSizing: 'border-box',
              border: 'none', borderRadius: 0, fontSize: '0.929rem',
              fontFamily: 'inherit', color: 'var(--c-text-dark)', background: 'transparent',
              outline: 'none', resize: 'none', lineHeight: 1.6, maxHeight: 150, overflowY: 'auto',
            }}
          />
        </div>
        {/* 하단 바: 모드 토글 + 버튼 */}
        {/* ── 첫째 줄: 모드 버튼 + 톱니바퀴 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 2px',
          borderTop: '1px solid var(--bd-light)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
          }}>
            {[
              { key: 'db', label: 'DB', icon: '💾' },
              { key: 'wol', label: 'WOL', icon: '🌐', disabled: !wolAvailable },
              { key: 'db_wol', label: 'DB+WOL', icon: '⚡', disabled: !wolAvailable },
              { key: 'chat', label: '대화', icon: '💬' },
            ].map(m => {
              const active = searchMode === m.key;
              const mColor = { db: 'var(--accent)', wol: 'var(--accent-brown)', db_wol: '#2D8FC7', chat: 'var(--accent-purple)' }[m.key] || 'var(--accent)';
              return (
                <button key={m.key} onClick={() => !m.disabled && setSearchMode(m.key)}
                  disabled={m.disabled}
                  style={{
                    padding: '5px 12px', borderRadius: 8, fontSize: '0.821rem', fontWeight: active ? 700 : 500,
                    border: 'none',
                    background: active ? 'var(--bg-card, #fff)' : 'transparent',
                    color: m.disabled ? 'var(--c-dim)' : active ? mColor : 'var(--c-muted)',
                    cursor: m.disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                    opacity: m.disabled ? 0.4 : 1, whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  }}>
                  {m.icon} {m.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* ── 둘째 줄: 모델 + 톱니바퀴 + 버튼 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '2px 10px 6px',
        }}>
          <span style={{
            fontSize: '0.786rem', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}>
            <span style={{ fontWeight: 700, color: 'var(--accent-purple)' }}>{ai.chatPlatform}</span>
            {' '}
            <span style={{ color: 'var(--c-muted)' }}>{chatModelLabel}</span>
          </span>
          {wolAvailable && (
            <button onClick={() => setShowWolFilters(p => !p)} style={{
              padding: '2px 5px', borderRadius: 8, border: 'none',
              background: showWolFilters ? '#C7842D20' : 'transparent',
              color: showWolFilters ? 'var(--accent-brown)' : 'var(--c-dim)',
              fontSize: '1.286rem', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
            }}>▾</button>
          )}
          <div style={{ flex: 1 }} />
          <button onClick={() => fileRef.current?.click()} disabled={fileUploading || streaming}
            onPointerDown={e => { e.currentTarget.style.transform = 'scale(0.88)'; }}
            onPointerUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            onPointerLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            style={{
              padding: '8px 10px', borderRadius: 8, border: 'none',
              background: attachedFile ? '#7F77DD20' : 'transparent',
              color: attachedFile ? 'var(--accent-purple)' : 'var(--c-dim)',
              fontSize: '1.286rem', fontWeight: 300, cursor: 'pointer', flexShrink: 0,
              opacity: fileUploading ? 0.5 : 1, transition: 'all 0.15s',
            }}>+</button>
          {streaming ? (
            <button onClick={() => { abortRef.current?.abort(); abortGeneration(); }} style={{
              width: 80, padding: '5px 0', borderRadius: 8, border: 'none',
              background: '#e55', color: '#fff', fontSize: '0.786rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              textAlign: 'center',
            }}>■ 중지</button>
          ) : (
            <button onClick={send} disabled={!input.trim() || (needsPassword && !password)} style={{
              width: 80, padding: '5px 0', borderRadius: 8, border: 'none',
              background: input.trim() && (!needsPassword || password) ? 'var(--accent-purple)' : 'var(--bd-medium)',
              color: '#fff', fontSize: '0.786rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              transition: 'background 0.15s', textAlign: 'center',
            }}>전송</button>
          )}
        </div>
      </div>
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
