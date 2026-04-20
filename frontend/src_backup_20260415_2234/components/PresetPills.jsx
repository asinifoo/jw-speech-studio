import { useState, useEffect, useRef, useCallback } from 'react';
import { getPresets, savePresets } from '../api';

export default function PresetPills({ storageKey, onChange, label }) {
  const [presets, setPresets] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef(null);

  // 서버에서 로드
  useEffect(() => {
    getPresets(storageKey).then(d => {
      setPresets(d.presets || []);
      setChecked(new Set(d.checked || []));
      setLoaded(true);
    }).catch(() => {
      // 서버 실패 시 localStorage 폴백
      try { setPresets(JSON.parse(localStorage.getItem(storageKey + '-presets')) || []); } catch(e) {}
      try { setChecked(new Set(JSON.parse(localStorage.getItem(storageKey + '-checked')) || [])); } catch(e) {}
      setLoaded(true);
    });
  }, [storageKey]);

  // 서버에 저장 (디바운스)
  const syncToServer = useCallback((p, c) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePresets(storageKey, p, [...c]).catch(() => {});
      // localStorage도 백업
      try { localStorage.setItem(storageKey + '-presets', JSON.stringify(p)); } catch(e) {}
      try { localStorage.setItem(storageKey + '-checked', JSON.stringify([...c])); } catch(e) {}
    }, 500);
  }, [storageKey]);

  // presets/checked 변경 시 서버 동기화 + onChange 콜백
  useEffect(() => {
    if (!loaded) return;
    syncToServer(presets, checked);
  }, [presets, checked, loaded, syncToServer]);

  useEffect(() => {
    if (onChange) onChange(presets.filter((_, i) => checked.has(i)).join('\n'));
  }, [checked, presets]);

  if (!loaded) return null;

  if (presets.length === 0 && !adding) {
    return (<div>{label && <div style={{ fontSize: 10, color: 'var(--c-muted)', marginBottom: 3 }}>{label}</div>}<button onClick={() => setAdding(true)} style={{ padding: '4px 10px', borderRadius: 20, border: '1px dashed var(--bd-medium)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: 10, cursor: 'pointer' }}>+ 프리셋 추가</button></div>);
  }

  return (
    <div>
      {label && <div style={{ fontSize: 10, color: 'var(--c-muted)', marginBottom: 3 }}>{label}</div>}
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
      {presets.map((p, i) => (
        <div key={i} style={{ position: 'relative', display: 'inline-flex' }}>
          <button onClick={() => !editing && setChecked(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })} style={{
            padding: '4px 10px', borderRadius: 20, border: '1px solid ' + (checked.has(i) ? '#1D9E75' : 'var(--bd)'),
            background: checked.has(i) ? 'var(--tint-green)' : 'var(--bg-card)', color: checked.has(i) ? '#1D9E75' : 'var(--c-faint)',
            fontSize: 10, cursor: 'pointer', fontWeight: checked.has(i) ? 600 : 400, display: 'flex', alignItems: 'center', gap: 3,
          }}>{checked.has(i) ? '✓' : '○'} {p}</button>
          {editing && <span onClick={() => { const n = presets.filter((_, j) => j !== i); setPresets(n); setChecked(prev => { const nc = new Set(); prev.forEach(v => { if (v < i) nc.add(v); else if (v > i) nc.add(v - 1); }); return nc; }); }}
            style={{ position: 'absolute', top: -5, right: -5, width: 14, height: 14, borderRadius: '50%', background: '#c44', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}>×</span>}
        </div>
      ))}
      {!adding && !editing && <button onClick={() => setAdding(true)} style={{ padding: '4px 8px', borderRadius: 20, border: '1px dashed var(--bd-medium)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: 10, cursor: 'pointer' }}>+</button>}
      {!adding && <button onClick={() => setEditing(p => !p)} style={{ padding: '4px 6px', borderRadius: 20, border: '1px solid ' + (editing ? '#c44' : 'var(--bd)'), background: editing ? 'var(--tint-red)' : 'var(--bg-card)', color: editing ? '#c44' : 'var(--c-dim)', fontSize: 9, cursor: 'pointer' }}>{editing ? '완료' : '편집'}</button>}
      {adding && (
        <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
          <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="지시사항 입력"
            style={{ padding: '3px 8px', border: '1px solid #1D9E75', borderRadius: 20, fontSize: 10, width: 120, outline: 'none' }}
            onKeyDown={e => { if (e.key === 'Enter' && newText.trim()) { setPresets(p => [...p, newText.trim()]); setNewText(''); setAdding(false); }}} />
          <button onClick={() => { if (newText.trim()) { setPresets(p => [...p, newText.trim()]); setNewText(''); setAdding(false); }}}
            style={{ padding: '3px 8px', borderRadius: 20, border: '1px solid #1D9E75', background: 'var(--tint-green)', color: '#1D9E75', fontSize: 9, cursor: 'pointer' }}>추가</button>
          <button onClick={() => { setAdding(false); setNewText(''); }}
            style={{ padding: '3px 6px', borderRadius: 20, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: 9, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
    </div>
  );
}
