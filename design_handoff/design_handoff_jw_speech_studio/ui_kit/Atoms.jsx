/* global React */
const { useState } = React;

// ───────── Buttons ─────────
const Btn = ({ children, variant = 'primary', size = 'md', ...p }) => {
  const styles = {
    primary: { background: '#1D9E75', color: '#fff' },
    secondary: { background: '#EFEFF4', color: '#3C3C43', border: '1px solid #C6C6C8' },
    tonal: { background: '#1D9E7515', color: '#1D9E75' },
    danger: { background: '#cc4444', color: '#fff' },
    disabled: { background: '#AEAEB2', color: '#fff', cursor: 'default' },
  }[variant];
  const sz = size === 'xs'
    ? { padding: '3px 8px', fontSize: '0.643rem', borderRadius: 5 }
    : size === 'sm'
    ? { padding: '5px 11px', fontSize: '0.786rem', borderRadius: 6 }
    : { padding: '8px 16px', fontSize: '0.857rem', borderRadius: 8 };
  return (
    <button {...p} style={{ ...styles, ...sz, fontFamily: 'inherit', fontWeight: 600, border: styles.border || 'none', cursor: variant === 'disabled' ? 'default' : 'pointer', ...p.style }}>
      {children}
    </button>
  );
};

const XsBtn = ({ tone = 'neutral', children, ...p }) => {
  const tones = {
    neutral: { bg: '#EFEFF4', fg: '#48484A', bd: '#D1D1D6' },
    green:   { bg: '#e6f5ec', fg: '#1D9E75', bd: '#b8e0d0' },
    orange:  { bg: '#ffeedd', fg: '#D85A30', bd: '#e8c0a8' },
    purple:  { bg: '#f8f5ff', fg: '#7F77DD', bd: '#e0dbf5' },
    blue:    { bg: '#eef6ff', fg: '#378ADD', bd: '#cce3f8' },
    red:     { bg: '#fff0f0', fg: '#cc4444', bd: '#fcc' },
    solid:   { bg: '#1D9E75', fg: '#fff',    bd: 'transparent' },
  }[tone];
  return (
    <button {...p} style={{ background: tones.bg, color: tones.fg, border: `1px solid ${tones.bd}`, borderRadius: 5, padding: '3px 8px', fontSize: '0.643rem', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', ...p.style }}>
      {children}
    </button>
  );
};

// ───────── Badges ─────────
const TAG = {
  골자:   { bg: '#e6f5ec', fg: '#1D9E75' },
  연설:   { bg: '#ffeedd', fg: '#D85A30' },
  출판물: { bg: '#fef5f0', fg: '#C7842D' },
  성구:   { bg: '#eef6ff', fg: '#378ADD' },
  예시:   { bg: '#fef5f0', fg: '#C7842D' },
  원문:   { bg: '#ffeedd', fg: '#D85A30' },
  연사메모:{ bg: '#ffeedd', fg: '#D85A30' },
};
const TagBadge = ({ kind }) => {
  const c = TAG[kind] || { bg: '#EFEFF4', fg: '#48484A' };
  return <span style={{ background: c.bg, color: c.fg, padding: '2px 7px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 700 }}>{kind}</span>;
};
const LevelBadge = ({ level = 'L2' }) => {
  const c = { L1: '#1D9E75', L2: '#D85A30', L3: '#7F77DD', L4: '#8E8E93', L5: '#AEAEB2' }[level];
  return <span style={{ background: c, color: '#fff', borderRadius: 4, padding: '0 5px', fontSize: '0.571rem', fontWeight: 700, lineHeight: '16px', display: 'inline-block', minWidth: 18, textAlign: 'center' }}>{level}</span>;
};
const LetterBadge = ({ letter, color }) => (
  <span style={{ background: color, color: '#fff', width: 18, height: 18, borderRadius: 4, fontSize: '0.643rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{letter}</span>
);
const StatusDot = ({ color = '#1D9E75' }) => (
  <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}60`, display: 'inline-block' }} />
);
const EditedBadge = () => (
  <span style={{ background: '#eef6ff', color: '#378ADD', border: '1px solid #cce3f8', padding: '2px 7px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 700 }}>편집됨</span>
);

// ───────── Score / rating ─────────
const ScoreBar = ({ label, value, color = '#1D9E75' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.786rem' }}>
    <span style={{ color: '#8E8E93', fontWeight: 600, minWidth: 50 }}>{label}</span>
    <div style={{ flex: 1, height: 6, background: '#EFEFF4', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.round(value * 100)}%`, height: '100%', background: color }} />
    </div>
    <span style={{ minWidth: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#48484A', fontSize: '0.714rem' }}>{value.toFixed(2)}</span>
  </div>
);
const Rating = ({ value, onChange }) => (
  <span style={{ display: 'inline-flex', gap: 1 }}>
    {[1,2,3,4,5].map(n => (
      <button key={n} onClick={() => onChange && onChange(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1, color: n <= value ? '#F5A623' : '#C7C7CC' }}>★</button>
    ))}
  </span>
);

// ───────── Meta grid ─────────
const MetaGrid = ({ rows }) => (
  <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', fontSize: '0.786rem', margin: 0, background: '#fefcf9', border: '1px solid #e8e0d0', borderRadius: 7, padding: '8px 10px' }}>
    {rows.map(([k, v]) => (
      <React.Fragment key={k}>
        <dt style={{ color: '#8E8E93', fontWeight: 600 }}>[{k}]</dt>
        <dd style={{ margin: 0, color: '#48484A', lineHeight: 1.7 }}>{v}</dd>
      </React.Fragment>
    ))}
  </dl>
);

// ───────── Inputs ─────────
const Input = (p) => (
  <input {...p} style={{ background: '#EFEFF4', border: 'none', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: '0.929rem', color: '#000', outline: 'none', width: '100%', boxSizing: 'border-box', ...p.style }} />
);
const Textarea = (p) => (
  <textarea {...p} style={{ background: '#EFEFF4', border: 'none', borderRadius: 8, padding: '10px 12px', fontFamily: 'inherit', fontSize: '0.929rem', color: '#000', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 80, ...p.style }} />
);

Object.assign(window, {
  JW_Btn: Btn, JW_XsBtn: XsBtn,
  JW_TagBadge: TagBadge, JW_LevelBadge: LevelBadge, JW_LetterBadge: LetterBadge,
  JW_StatusDot: StatusDot, JW_EditedBadge: EditedBadge,
  JW_ScoreBar: ScoreBar, JW_Rating: Rating,
  JW_MetaGrid: MetaGrid,
  JW_Input: Input, JW_Textarea: Textarea,
});
