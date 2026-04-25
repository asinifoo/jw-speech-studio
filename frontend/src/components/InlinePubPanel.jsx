import { useEffect, useRef, useState } from 'react';
import { dbAdd, lookupPubTitle } from '../api';

const inputStyle = {
  width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none',
  background: 'var(--bg-subtle)', color: 'var(--c-text)', fontSize: '0.786rem',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '0.643rem', fontWeight: 600, color: 'var(--c-faint)',
  marginBottom: 2, display: 'block',
};

const btnStyle = {
  height: 24, padding: '0 10px', borderRadius: 5, fontSize: '0.714rem',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', lineHeight: 1, fontWeight: 600,
};

export default function InlinePubPanel({ pubCode, outlineMeta, contentHint, onSaved, onClose }) {
  const [pubForm, setPubForm] = useState({
    pub_code: pubCode || '',
    pub_title: '',
    reference: '',
    content: contentHint || '',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lookupTimerRef = useRef(null);

  useEffect(() => {
    setPubForm(p => ({ ...p, pub_code: pubCode || '' }));
  }, [pubCode]);

  useEffect(() => {
    const code = pubForm.pub_code?.trim();
    if (!code) return;
    if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current);
    lookupTimerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await lookupPubTitle(code);
        if (res && (res.pub_title || res.reference)) {
          setPubForm(p => ({
            ...p,
            pub_title: p.pub_title || res.pub_title || '',
            reference: p.reference || res.reference || '',
          }));
        }
      } catch (_) {
        // 자동 매칭 실패는 silent
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (lookupTimerRef.current) clearTimeout(lookupTimerRef.current); };
  }, [pubForm.pub_code]);

  const handleSave = async () => {
    setError('');
    if (!pubForm.pub_code.trim()) { setError('출판물 약호를 입력하세요.'); return; }
    if (!pubForm.content.trim()) { setError('본문을 입력하세요.'); return; }
    setSaving(true);
    try {
      const meta = outlineMeta || {};
      const payload = {
        entry_type: 'publication',
        pub_code: pubForm.pub_code.trim(),
        pub_title: pubForm.pub_title.trim(),
        reference: pubForm.reference.trim(),
        content: pubForm.content.trim(),
        outline_type: meta.outline_type || '',
        outline_num: meta.outline_num || '',
        version: meta.version || '',
        point_id: meta.point_num || '',
        outline_title: meta.outline_title || '',
        subtopic: meta.subtopic || '',
      };
      const res = await dbAdd(payload);
      if (onSaved) onSaved(res);
      if (onClose) onClose();
    } catch (e) {
      setError(e?.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      marginTop: 6, padding: 10, borderRadius: 8,
      border: '1px solid var(--bd-soft)', background: 'var(--bg-card)',
    }}>
      <div style={{ display: 'grid', gap: 6 }}>
        <div>
          <label style={labelStyle}>출판물 약호</label>
          <input
            value={pubForm.pub_code}
            onChange={e => setPubForm(p => ({ ...p, pub_code: e.target.value }))}
            placeholder="「파24」 5/15 7면 2항"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>출판물명 {loading && <span style={{ color: 'var(--c-dim)', fontWeight: 400 }}>(자동 매칭 중...)</span>}</label>
          <input
            value={pubForm.pub_title}
            onChange={e => setPubForm(p => ({ ...p, pub_title: e.target.value }))}
            placeholder="자동 채워짐"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>참조</label>
          <input
            value={pubForm.reference}
            onChange={e => setPubForm(p => ({ ...p, reference: e.target.value }))}
            placeholder="7면 2항"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>본문</label>
          <textarea
            value={pubForm.content}
            onChange={e => setPubForm(p => ({ ...p, content: e.target.value }))}
            rows={4}
            placeholder="출판물 본문 내용"
            style={{ ...inputStyle, padding: '8px 10px', resize: 'vertical', minHeight: 60, fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 6, padding: '6px 8px', borderRadius: 5, background: 'var(--tint-red)', color: '#c44', fontSize: '0.714rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}>
        <button
          onClick={onClose}
          disabled={saving}
          style={{
            ...btnStyle,
            border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)',
            opacity: saving ? 0.5 : 1,
          }}
        >닫기</button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...btnStyle,
            border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff',
            opacity: saving ? 0.6 : 1,
          }}
        >{saving ? '저장 중...' : '저장'}</button>
      </div>
    </div>
  );
}
