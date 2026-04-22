export default function ScriptureUsageToggle({ value, onClick }) {
  const active = value === '낭독';
  return (
    <span onClick={onClick} style={{
      display: 'inline-block', marginLeft: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.571rem', cursor: 'pointer',
      background: active ? 'var(--accent-orange)' : 'var(--bg-subtle, #EFEFF4)', color: active ? '#fff' : 'var(--c-dim)', fontWeight: 600,
      transition: 'all 0.15s',
    }}>낭독</span>
  );
}
