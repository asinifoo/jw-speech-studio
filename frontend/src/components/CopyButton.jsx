import { useState } from 'react';
import { copyText } from './copyUtil';

export default function CopyButton({ text, label = '복사', copiedLabel = '복사됨', style = {} }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button onClick={handleCopy} style={{
      padding: '4px 10px', borderRadius: 8,
      border: '1px solid ' + (copied ? '#1D9E75' : 'var(--bd)'),
      background: copied ? 'var(--tint-green)' : 'var(--bg-card)',
      color: copied ? '#1D9E75' : 'var(--c-faint)',
      fontSize: '0.786rem', cursor: 'pointer', fontWeight: copied ? 600 : 400,
      transition: 'all 0.2s',
      ...style,
    }}>{copied ? copiedLabel : label}</button>
  );
}
