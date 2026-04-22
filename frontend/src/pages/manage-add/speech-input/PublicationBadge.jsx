export default function PublicationBadge({ text }) {
  if (!text) return null;
  return (
    <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', background: '#9C27B00A', color: '#9C27B0', fontWeight: 600, whiteSpace: 'nowrap' }}>📚 {text}</span>
  );
}
