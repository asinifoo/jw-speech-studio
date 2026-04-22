export default function VerseBadge({ open, scr, onClick }) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
      background: open ? 'var(--accent-purple)' : '#7F77DD0A', color: open ? '#fff' : 'var(--accent-purple)', fontWeight: 600, whiteSpace: 'nowrap',
      transition: 'all 0.15s',
    }}>📖 {scr}</span>
  );
}
