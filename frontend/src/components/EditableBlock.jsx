import { useState } from 'react';
import KoreanTextarea from './KoreanTextarea';

export default function EditableBlock({ value, onChange, label, icon, color, borderColor, bgColor, headerBg, placeholder, buttonLabel }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!editing && !value) {
    return (
      <button onClick={() => setEditing(true)} style={{
        padding: '6px 12px', borderRadius: 8, border: '1px dashed var(--c-dim)',
        background: 'transparent', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
        width: '100%', textAlign: 'center',
      }}>{buttonLabel || '+ ' + label + ' 추가'}</button>
    );
  }

  if (editing) {
    return (
      <div style={{ borderRadius: 8, border: '1px solid ' + borderColor, background: bgColor, overflow: 'hidden' }}>
        <div style={{
          padding: '6px 10px', background: headerBg,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{
            width: 20, height: 20, borderRadius: 4, flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.786rem', fontWeight: 800, color: '#fff', background: color,
          }}>{icon}</span>
          <span style={{ fontSize: '0.786rem', fontWeight: 600, color: color }}>{label}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => { if (value) setEditing(false); }} style={{
            padding: '2px 8px', borderRadius: 4, border: '1px solid ' + color,
            background: value ? color : 'var(--bd)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600,
          }}>확인</button>
          <button onClick={() => { onChange(''); setEditing(false); }} style={{
            padding: '2px 8px', borderRadius: 4, border: '1px solid ' + borderColor,
            background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer',
          }}>취소</button>
        </div>
        <div style={{ padding: 8 }}>
          <KoreanTextarea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={4}
            style={{
              display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box',
              border: '1px solid ' + borderColor, borderRadius: 8, background: 'var(--bg-card)', color: 'var(--c-text-dark)',
              fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ borderRadius: 8, border: '1px solid ' + borderColor, background: bgColor, overflow: 'hidden' }}>
      <div style={{
        padding: '6px 10px', background: headerBg,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: 4, flexShrink: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.786rem', fontWeight: 800, color: '#fff', background: color,
        }}>{icon}</span>
        <span style={{ fontSize: '0.786rem', fontWeight: 600, color: color }}>{label}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => setEditing(true)} style={{
          padding: '2px 8px', borderRadius: 4, border: '1px solid ' + borderColor,
          background: 'var(--bg-card)', color: color, fontSize: '0.786rem', cursor: 'pointer',
        }}>수정</button>
        <button onClick={() => { onChange(''); }} style={{
          padding: '2px 8px', borderRadius: 4, border: '1px solid ' + borderColor,
          background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer',
        }}>삭제</button>
      </div>
      <div style={{ padding: '8px 10px' }}>
        <div style={{
          fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-text)',
          whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
        }}>
          {expanded || value.length <= 200 ? value : value.slice(0, 200) + '...'}
        </div>
        {value.length > 200 && (
          <button onClick={() => setExpanded(!expanded)} style={{
            marginTop: 4, padding: '3px 10px', borderRadius: 8,
            border: '1px solid ' + borderColor, background: bgColor,
            color: color, fontSize: '0.786rem', cursor: 'pointer',
          }}>{expanded ? '접기' : '전체 보기'}</button>
        )}
      </div>
    </div>
  );
}
