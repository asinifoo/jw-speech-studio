export default function VersePanel({ loading, verses, indent }) {
  const margin = indent ? '4px 0 2px 16px' : '0 0 4px';
  return (
    <div style={{ margin, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle, #EFEFF4)', border: '1px solid var(--bd-light)', fontSize: '0.786rem', lineHeight: 1.6, color: 'var(--c-text)' }}>
      {loading && <div style={{ height: 14, borderRadius: 4, background: 'linear-gradient(90deg, var(--bd-light) 25%, var(--bd-medium) 50%, var(--bd-light) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
      {!loading && (verses || []).length === 0 && <span style={{ color: 'var(--c-dim)' }}>본문을 찾을 수 없습니다.</span>}
      {!loading && (verses || []).map((v, vi) => (
        <div key={vi}><span style={{ fontWeight: 700, color: 'var(--accent-purple)', marginRight: 4 }}>{v.ref}</span>{v.text}</div>
      ))}
    </div>
  );
}
