/* global React */
const { useState: useStateT } = React;

// L1 — primary nav: pill row in subtle container, active pill is white w/ shadow
const L1Tabs = ({ tabs, value, onChange }) => (
  <div style={{ background: '#EFEFF4', borderRadius: 10, padding: 4, display: 'flex', gap: 2, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
    {tabs.map(t => (
      <button key={t} onClick={() => onChange(t)}
        style={{
          padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '0.857rem', fontWeight: 600,
          color: value === t ? '#000' : '#636366',
          background: value === t ? '#fff' : 'transparent',
          boxShadow: value === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          whiteSpace: 'nowrap',
        }}>{t}</button>
    ))}
  </div>
);

// L2 — secondary filter: inverted (dark active)
const L2Tabs = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
    {tabs.map(t => {
      const label = typeof t === 'string' ? t : t.label;
      const count = typeof t === 'string' ? null : t.count;
      const key = label;
      return (
        <button key={key} onClick={() => onChange(key)}
          style={{
            padding: '5px 11px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: '0.786rem', fontWeight: 600,
            color: value === key ? '#fff' : '#8E8E93',
            background: value === key ? '#333' : '#EFEFF4',
          }}>{label}{count != null && <span style={{ marginLeft: 4, opacity: 0.7 }}>{count}</span>}</button>
      );
    })}
  </div>
);

// L3 — underline tabs with count
const L3Tabs = ({ tabs, value, onChange }) => (
  <div style={{ display: 'flex', gap: 14, borderBottom: '1px solid #E5E5EA', padding: '0 2px' }}>
    {tabs.map(t => (
      <button key={t.label} onClick={() => onChange(t.label)}
        style={{
          background: 'none', border: 'none', borderBottom: '2px solid transparent',
          padding: '8px 2px', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
          color: value === t.label ? '#1D9E75' : '#8E8E93',
          borderBottomColor: value === t.label ? '#1D9E75' : 'transparent',
        }}>
        <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>{t.label}</span>
        <span style={{ fontSize: '0.571rem', fontWeight: 600, opacity: 0.7 }}>{t.count.toLocaleString()}</span>
      </button>
    ))}
  </div>
);

window.JW_L1Tabs = L1Tabs;
window.JW_L2Tabs = L2Tabs;
window.JW_L3Tabs = L3Tabs;
