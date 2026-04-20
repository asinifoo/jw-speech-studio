import { useState } from 'react';
import KoreanTextarea from './KoreanTextarea';

export default function PriorityMaterial({ value, onChange, publications, onPubAdd }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const pubTags = publications && publications.length > 0 ? (
    <div style={{
      padding: '6px 10px', marginBottom: 4, borderRadius: 8,
      background: 'var(--tint-purple)', border: '1px solid var(--tint-purple-bd)',
      fontSize: '0.786rem', color: '#6b5fbd', lineHeight: 1.6,
      userSelect: 'text', cursor: 'text',
    }}>
      {publications.map((p, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 4, marginBottom: 2 }}>
          <span style={{
            padding: '1px 6px',
            borderRadius: 4, background: 'var(--tint-purple-badge)', fontWeight: 600,
          }}>{p}</span>
          {onPubAdd && <button onClick={() => onPubAdd(p)} style={{
            padding: '0px 3px', borderRadius: 3, border: '1px solid #D85A30', background: 'var(--bg-card)', color: '#D85A30', fontSize: '0.571rem', cursor: 'pointer', fontWeight: 800, lineHeight: '14px',
          }}>+</button>}
        </span>
      ))}
    </div>
  ) : null;

  if (!editing && !value) {
    return (
      <div>
        {pubTags}
        <button onClick={() => setEditing(true)} style={{
          padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--c-dim)',
          background: 'transparent', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
          width: '100%', textAlign: 'center',
        }}>+ 출판물 자료 추가</button>
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        {pubTags}
        <div style={{ borderRadius: 8, border: '1px solid var(--tint-purple-input)', background: 'var(--tint-purple)', overflow: 'hidden' }}>
          <div style={{ padding: '6px 10px', background: 'var(--tint-purple-badge)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.786rem', fontWeight: 800, color: '#fff', background: '#7F77DD' }}>P</span>
            <span style={{ fontSize: '0.786rem', fontWeight: 600, color: '#6b5fbd' }}>출판물 자료</span>
            <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 4, background: '#e0dbf5', color: '#7F77DD', fontWeight: 600 }}>우선 참고</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => { if (value) setEditing(false); }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #7F77DD', background: value ? '#7F77DD' : 'var(--bd)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>확인</button>
            <button onClick={() => { onChange(''); setEditing(false); }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d0c8e8', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
          </div>
          <div style={{ padding: 8 }}>
            <KoreanTextarea value={value} onChange={onChange} placeholder={"출판물 본문을 붙여넣으세요"} rows={4}
              style={{ display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid #d0c8e8', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {pubTags}
      <div style={{ borderRadius: 8, border: '1px solid var(--tint-purple-input)', background: 'var(--tint-purple)', overflow: 'hidden' }}>
        <div style={{ padding: '6px 10px', background: 'var(--tint-purple-badge)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.786rem', fontWeight: 800, color: '#fff', background: '#7F77DD' }}>P</span>
          <span style={{ fontSize: '0.786rem', fontWeight: 600, color: '#6b5fbd' }}>출판물 자료</span>
          <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 4, background: '#e0dbf5', color: '#7F77DD', fontWeight: 600 }}>우선 참고</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setEditing(true)} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d0c8e8', background: 'var(--bg-card)', color: '#7F77DD', fontSize: '0.786rem', cursor: 'pointer' }}>수정</button>
          <button onClick={() => { onChange(''); }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #d0c8e8', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>삭제</button>
        </div>
        <div style={{ padding: '8px 10px' }}>
          <div style={{ fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
            {expanded || value.length <= 200 ? value : value.slice(0, 200) + '...'}
          </div>
          {value.length > 200 && (
            <button onClick={() => setExpanded(!expanded)} style={{ marginTop: 4, padding: '3px 10px', borderRadius: 8, border: '1px solid #d0c8e8', background: 'var(--tint-purple)', color: '#7F77DD', fontSize: '0.786rem', cursor: 'pointer' }}>{expanded ? '접기' : '전체 보기'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
