export default function KoreanTextarea({ value, onChange, placeholder, rows, style }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { e.stopPropagation(); }}
      placeholder={placeholder}
      rows={rows}
      style={style}
    />
  );
}

