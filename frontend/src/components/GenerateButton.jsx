import { abortGeneration } from '../api';

/**
 * Reusable generate button with streaming progress bar.
 *
 * Props:
 *   onClick: () => void
 *   disabled: bool
 *   generating: bool
 *   streamProgress: number (0-100)
 *   streamMsg: string
 *   label: string - button text when not generating
 *   abortRef: React ref - abort controller ref
 */
export default function GenerateButton({ onClick, disabled, generating, streamProgress, streamMsg, label, abortRef }) {
  return (
    <>
      <button onClick={onClick} disabled={disabled || generating}
        style={{
          display: 'block', width: '100%', padding: 0, borderRadius: 10, border: 'none',
          background: generating ? 'var(--bd-medium)' : disabled ? 'var(--bd)' : '#1D9E75',
          color: '#fff', fontSize: '1.0rem', fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          overflow: 'hidden', position: 'relative', minHeight: 46,
        }}>
        {generating && streamProgress >= 20 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: streamProgress + '%', background: '#1D9E75',
            transition: 'width 0.3s ease', borderRadius: 10,
          }} />
        )}
        {generating && streamProgress > 0 && streamProgress < 20 && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 10,
            background: 'linear-gradient(90deg, transparent, #1D9E7540, transparent)',
            animation: 'shimmer 1.5s ease-in-out infinite',
          }} />
        )}
        <span style={{ position: 'relative', zIndex: 1, display: 'block', padding: '13px 0' }}>
          {generating
            ? `${streamMsg || '생성 중...'}${streamProgress >= 20 ? ` (${streamProgress}%)` : ''}`
            : label}
        </span>
      </button>
      {generating && (
        <button onClick={() => { abortRef.current?.abort(); abortGeneration(); }}
          style={{
            display: 'block', width: '100%', marginTop: 6, padding: '10px 0', borderRadius: 10,
            border: '1px solid #e55', background: 'transparent', color: '#e55',
            fontSize: '0.929rem', fontWeight: 700, cursor: 'pointer',
          }}>
          ■ 중단
        </button>
      )}
    </>
  );
}
