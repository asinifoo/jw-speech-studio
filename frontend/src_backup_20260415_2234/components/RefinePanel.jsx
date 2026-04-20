import { useState, useRef } from 'react';
import KoreanTextarea from './KoreanTextarea';
import PresetPills from './PresetPills';
import CopyButton from './CopyButton';
import { refineSpeechStream, abortGeneration } from '../api';

/**
 * Reusable refine (다듬기) panel for speech/service-meeting/visit scripts.
 *
 * Props:
 *   script: string - current script text
 *   onScriptChange: (text) => void
 *   password: string
 *   aiModel: string
 *   presetStorageKey: string - localStorage key for preset pills
 *   title: string - header title when not refining
 *   generating: bool - whether parent is generating (disables refine)
 *   streamProgress: number
 *   streamMsg: string
 *   error: string
 *   onError: (msg) => void
 *   onClearError: () => void
 *   onRegenerate: () => void
 */
export default function RefinePanel({
  script, onScriptChange, password, aiModel,
  presetStorageKey, title,
  generating, streamProgress, streamMsg,
  error, onError, onClearError, onRegenerate,
}) {
  const [refineMode, setRefineMode] = useState(false);
  const [refineInstr, setRefineInstr] = useState('');
  const [refinePreset, setRefinePreset] = useState('');
  const [refining, setRefining] = useState(false);
  const [rStreamProgress, setRStreamProgress] = useState(0);
  const [rStreamMsg, setRStreamMsg] = useState('');
  const abortRef = useRef(null);

  const activeProgress = refining ? rStreamProgress : streamProgress;
  const activeMsg = refining ? rStreamMsg : streamMsg;

  const doRefine = async () => {
    if (!password) { onError('비밀번호를 입력하세요'); return; }
    setRefining(true); onClearError(); setRStreamProgress(0); setRStreamMsg('다듬기 준비...');
    try {
      let streamedText = '';
      const ac = new AbortController();
      abortRef.current = ac;
      await refineSpeechStream(password, script, [refinePreset, refineInstr].filter(Boolean).join('\n'), aiModel, (ev) => {
        if (ev.stage === 'calling') { setRStreamProgress(ev.progress); setRStreamMsg(ev.message); }
        else if (ev.stage === 'streaming') { streamedText += ev.chunk; setRStreamProgress(ev.progress); setRStreamMsg('다듬기 중...'); onScriptChange(streamedText); }
        else if (ev.stage === 'done') { setRStreamProgress(100); onScriptChange(ev.speech); }
        else if (ev.stage === 'error') { onError('다듬기 오류: ' + ev.message); }
      }, undefined, ac.signal);
      setRefineMode(false);
    } catch (e) { if (e.name !== 'AbortError') onError('다듬기 오류: ' + e.message); }
    finally { abortRef.current = null; setRefining(false); setRStreamProgress(0); setRStreamMsg(''); }
  };

  const isActive = generating || refining;

  return (
    <div style={{ borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 14 }}>
      {/* Header */}
      <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', overflow: 'hidden' }}>
        {isActive && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: activeProgress >= 20 ? activeProgress + '%' : '100%',
            background: activeProgress >= 20
              ? (refining ? '#7F77DD20' : '#1D9E7520')
              : `linear-gradient(90deg, transparent, ${refining ? '#7F77DD' : '#1D9E75'}15, transparent)`,
            transition: activeProgress >= 20 ? 'width 0.3s ease' : 'none',
            animation: activeProgress < 20 ? 'shimmer 1.5s ease-in-out infinite' : 'none',
          }} />
        )}
        <span style={{ fontSize: 14, fontWeight: 700, position: 'relative' }}>
          {generating ? `${activeMsg || '생성 중...'}${activeProgress >= 20 ? ` (${activeProgress}%)` : ''}`
            : refining ? `${activeMsg || '다듬기 중...'}${activeProgress >= 20 ? ` (${activeProgress}%)` : ''}`
            : title}
        </span>
        <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
          {!isActive && !refineMode ? (
            <>
              <button onClick={() => { setRefineMode(true); setRefineInstr(''); }}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #7F77DD', background: 'var(--bg-card)', color: '#7F77DD', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>다듬기</button>
              <button onClick={onRegenerate}
                style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #D85A30', background: 'var(--bg-card)', color: '#D85A30', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>다시 만들기</button>
              <CopyButton text={script} />
            </>
          ) : !isActive && refineMode ? (
            <button onClick={() => setRefineMode(false)}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: 11, cursor: 'pointer' }}>취소</button>
          ) : isActive ? (
            <button onClick={() => { abortRef.current?.abort(); abortGeneration(); }}
              style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid #e55', background: '#e5511a', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, position: 'relative' }}>중단</button>
          ) : null}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '8px 14px', background: '#c4441a', color: '#fff', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={onClearError} style={{ border: 'none', background: 'none', color: '#fff', fontSize: 16, cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Body */}
      {refineMode ? (
        <div style={{ padding: 14 }}>
          <KoreanTextarea value={script} onChange={onScriptChange} placeholder="스크립트를 수정하세요" rows={15}
            style={{ display: 'block', width: '100%', padding: 14, boxSizing: 'border-box', border: '2px solid var(--tint-purple-input)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: 14, lineHeight: 2, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          <div style={{ marginTop: 10, borderRadius: 8, border: '1px solid var(--opt-bd)', background: 'var(--opt-bg)', padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#D85A30', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12 }}>⚙</span> 다듬기 옵션
            </div>
            <div style={{ marginBottom: 6 }}>
              <PresetPills storageKey={presetStorageKey} label="다듬기 프리셋" onChange={setRefinePreset} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--c-muted)', marginBottom: 2 }}>추가 지시사항</div>
            <KoreanTextarea value={refineInstr} onChange={setRefineInstr}
              placeholder={"다듬기 지시사항 (선택)\n\n예:\n- 도입부를 더 자연스럽게\n- 전체적으로 분량을 줄여주세요"}
              rows={3} style={{ display: 'block', width: '100%', padding: 10, boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg-input)', color: 'var(--c-text-dark)', fontSize: 13, lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
          <button onClick={doRefine} disabled={refining}
            style={{ display: 'block', width: '100%', marginTop: 10, padding: '12px 0', borderRadius: 10, border: 'none', background: refining ? 'var(--bd-medium)' : '#7F77DD', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {refining ? '다듬기 중...' : '다듬기 실행'}
          </button>
        </div>
      ) : (
        <div style={{ padding: '16px 20px', fontSize: 14, lineHeight: 2, whiteSpace: 'pre-wrap', maxHeight: 500, overflowY: 'auto' }}>
          {script}
        </div>
      )}
    </div>
  );
}
