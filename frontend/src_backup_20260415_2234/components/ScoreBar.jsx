export default function ScoreBar({ score }) {
  const isRRF = score < 0.1;
  const pct = isRRF ? Math.round(score / 0.035 * 100) : Math.round(score * 100);
  const display = Math.min(pct, 100);
  const c = display > 80 ? '#1D9E75' : display > 50 ? '#BA7517' : '#c44';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 4, borderRadius: 2, background: 'var(--bg-dim)', overflow: 'hidden' }}>
        <div style={{ width: display + '%', height: '100%', borderRadius: 2, background: c }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--c-muted)', minWidth: 26 }}>{display}%</span>
    </div>
  );
}

