import { useState, useEffect } from 'react';
import { getWolFilters, saveWolFilters, resetWolFilters, saveWolFiltersAsDefault, testWolQuery } from '../api';

export default function WolFiltersPanel({ compact = true }) {
  const [open, setOpen] = useState(false);
  const [suffixes, setSuffixes] = useState('');
  const [stopwords, setStopwords] = useState('');
  const [testInput, setTestInput] = useState('');
  const [testResult, setTestResult] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState('ok');

  const load = () => {
    getWolFilters().then(d => {
      setSuffixes((d.suffixes || []).join('\n'));
      setStopwords((d.stopwords || []).join('\n'));
    }).catch(() => {});
  };

  useEffect(() => { if (!compact || open) load(); }, [open]);

  const flash = (text, type = 'ok') => {
    setMsg(text); setMsgType(type);
    setTimeout(() => setMsg(''), 3000);
  };

  const doSave = () => {
    const sfx = suffixes.split('\n').map(s => s.trim()).filter(Boolean);
    const sw = stopwords.split('\n').map(s => s.trim()).filter(Boolean);
    saveWolFilters(sfx, sw)
      .then(d => flash(`저장됨 · 접미사 ${d.suffixes} · 불용어 ${d.stopwords}`))
      .catch(e => flash('오류: ' + e.message, 'err'));
  };

  const doSaveDefault = () => {
    saveWolFiltersAsDefault()
      .then(d => flash(`나의 기본값 저장됨 · 접미사 ${d.suffixes} · 불용어 ${d.stopwords}`))
      .catch(e => flash('오류: ' + e.message, 'err'));
  };

  const doReset = () => {
    resetWolFilters().then(d => {
      load();
      const src = d.source === 'user' ? '나의 기본값' : '시스템 기본값';
      flash(`${src} 복원됨 · 접미사 ${d.suffixes} · 불용어 ${d.stopwords}`);
    }).catch(e => flash('오류: ' + e.message, 'err'));
  };

  const doTest = () => {
    if (!testInput.trim()) return;
    testWolQuery(testInput).then(d => setTestResult(d.cleaned)).catch(() => {});
  };

  if (compact && !open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)',
        background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer',
      }}>▾ 불용어</button>
    );
  }

  const sfxCount = suffixes.split('\n').filter(Boolean).length;
  const swCount = stopwords.split('\n').filter(Boolean).length;

  return (
    <div style={{
      marginTop: 8, borderRadius: 10, border: '1px solid var(--bd)',
      background: 'var(--bg-card)', overflow: 'hidden',
    }}>
      {/* 헤더 */}
      <div style={{
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
        background: 'linear-gradient(135deg, #C7842D10, #C7842D05)',
        borderBottom: '1px solid var(--bd-light)',
      }}>
        <span style={{ fontSize: '1.286rem' }}>▾</span>
        <span style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--c-text-dark)', flex: 1 }}>검색 키워드 필터</span>
        <span style={{
          fontSize: '0.643rem', color: 'var(--c-dim)', background: 'var(--bg-subtle)',
          padding: '2px 6px', borderRadius: 4,
        }}>접미사 {sfxCount} · 불용어 {swCount}</span>
        {compact && (
          <button onClick={() => setOpen(false)} style={{
            width: 20, height: 20, borderRadius: 4, border: '1px solid var(--bd)',
            background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        )}
      </div>

      <div style={{ padding: 12 }}>
        {/* 테스트 */}
        <div style={{
          marginBottom: 10, padding: '6px 10px', borderRadius: 7,
          background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)',
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', flexShrink: 0 }}>테스트</span>
            <input value={testInput} onChange={e => { setTestInput(e.target.value); setTestResult(''); }}
              onKeyDown={e => { if (e.key === 'Enter') doTest(); }}
              placeholder="문장을 입력하고 Enter"
              style={{
                flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bd)',
                background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem',
                fontFamily: 'inherit', outline: 'none',
              }} />
          </div>
          {testResult && (
            <div style={{
              fontSize: '0.786rem', fontWeight: 700, color: '#C7842D',
              padding: '4px 8px', marginTop: 4, borderRadius: 8, background: '#C7842D12',
              wordBreak: 'break-word', lineHeight: 1.5,
            }}>→ {testResult}</div>
          )}
        </div>

        {/* 접미사 / 불용어 */}
        <div style={{ display: 'flex', gap: 10 }}>
          {[
            { label: '접미사', desc: '단어 끝에서 제거', val: suffixes, set: setSuffixes, cnt: sfxCount, clr: '#C7842D' },
            { label: '불용어', desc: '단독 출현 시 제거', val: stopwords, set: setStopwords, cnt: swCount, clr: '#2D8FC7' },
          ].map(c => (
            <div key={c.label} style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.clr, flexShrink: 0 }} />
                <span style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--c-text-dark)' }}>{c.label}</span>
                <span style={{ fontSize: '0.571rem', color: 'var(--c-dim)' }}>{c.desc}</span>
              </div>
              <textarea value={c.val} onChange={e => c.set(e.target.value)}
                rows={7} className="chat-input"
                style={{
                  width: '100%', padding: '6px 8px', borderRadius: 7,
                  border: '1px solid var(--bd)', background: 'var(--bg-subtle)',
                  color: 'var(--c-text)', fontSize: '0.786rem', fontFamily: 'inherit',
                  outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box',
                }} />
            </div>
          ))}
        </div>

        {/* 버튼 */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={doSave} style={{
            padding: '5px 14px', borderRadius: 8, border: 'none', fontSize: '0.786rem', fontWeight: 700,
            background: '#C7842D', color: '#fff', cursor: 'pointer',
          }}>저장</button>
          <button onClick={doSaveDefault} style={{
            padding: '5px 14px', borderRadius: 8, border: '1px solid #2D8FC7', fontSize: '0.786rem', fontWeight: 600,
            background: 'transparent', color: '#2D8FC7', cursor: 'pointer',
          }}>기본값으로 저장</button>
          <button onClick={doReset} style={{
            padding: '5px 14px', borderRadius: 8, border: '1px solid var(--bd)', fontSize: '0.786rem',
            background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer',
          }}>기본값 복원</button>
          {msg && (
            <span style={{
              fontSize: '0.786rem', fontWeight: 600, marginLeft: 4,
              color: msgType === 'err' ? '#c44' : '#1D9E75',
            }}>{msg}</span>
          )}
        </div>
      </div>
    </div>
  );
}
