import { useEffect, useState } from 'react';

/**
 * Adaptive Sheet 컨테이너.
 * 모바일 (< 768px): Bottom Sheet (아래에서 위로 슬라이드)
 * 데스크톱 (>= 768px): Right Drawer (오른쪽에서 왼쪽으로 슬라이드)
 *
 * Props:
 *   open: boolean — 열림/닫힘 제어
 *   onClose: () => void — 닫기 콜백 (ESC, backdrop, ✕ 버튼)
 *   title: string — 헤더 제목
 *   children: ReactNode — 임베드할 콘텐츠 (Gather embedded 등)
 */
export function PubSheet({ open, onClose, title = '입력', children }) {
  const [direction, setDirection] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 768 ? 'bottom' : 'right'
  );
  const [vvHeight, setVvHeight] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight : 0
  );

  useEffect(() => {
    const onResize = () => {
      setDirection(window.innerWidth < 768 ? 'bottom' : 'right');
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    const onVv = () => setVvHeight(vv.height);
    vv.addEventListener('resize', onVv);
    setVvHeight(vv.height);
    return () => vv.removeEventListener('resize', onVv);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    const originalPad = document.body.style.paddingRight;
    const sbWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (sbWidth > 0) document.body.style.paddingRight = `${sbWidth}px`;
    return () => {
      document.body.style.overflow = original;
      document.body.style.paddingRight = originalPad;
    };
  }, [open]);

  if (!open) return null;

  const isMobile = direction === 'bottom';

  const backdropStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    zIndex: 1000,
    animation: 'sheetFadeIn 200ms ease',
  };

  const sheetStyle = isMobile
    ? {
        position: 'fixed',
        left: 0, right: 0, bottom: 0,
        height: `${Math.min(vvHeight * 0.9, vvHeight - 40)}px`,
        background: 'var(--bg-card)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        animation: 'sheetSlideUp 250ms ease',
        overflow: 'hidden',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
      }
    : {
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: 'min(520px, 100%)',
        background: 'var(--bg-card)',
        zIndex: 1001,
        display: 'flex',
        flexDirection: 'column',
        animation: 'sheetSlideIn 250ms ease',
        overflow: 'hidden',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      };

  const headerStyle = {
    flexShrink: 0,
    padding: '12px 16px',
    borderBottom: '1px solid var(--bd)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'var(--bg-card)',
    gap: 8,
  };

  const contentStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: 16,
    WebkitOverflowScrolling: 'touch',
  };

  return (
    <>
      <style>{`
        @keyframes sheetFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes sheetSlideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
      <div
        style={backdropStyle}
        onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}
      />
      <div style={sheetStyle} role="dialog" aria-modal="true">
        <div style={headerStyle}>
          <div style={{
            fontWeight: 700, fontSize: '0.929rem',
            color: 'var(--c-text-dark)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{title}</div>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="닫기"
              style={{
                width: 32, height: 32, padding: 0,
                border: 'none', borderRadius: 8,
                background: 'transparent', color: 'var(--c-faint)',
                fontSize: '1.143rem', cursor: 'pointer', lineHeight: 1,
                flexShrink: 0,
              }}
            >✕</button>
          )}
        </div>
        <div style={contentStyle}>
          {children}
        </div>
      </div>
    </>
  );
}
