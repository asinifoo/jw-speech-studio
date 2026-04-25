import React, { useEffect } from 'react';

export function Modal({
  title,
  children,
  actions,
  onClose,
  titleColor,
  fullscreen = false,
  maxWidth = 400,
  closeOnEsc = true,
}) {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && onClose) onClose();
  };

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, []);

  useEffect(() => {
    if (!closeOnEsc || !onClose) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [closeOnEsc, onClose]);

  const backdropStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: fullscreen ? 'flex-start' : 'center',
    justifyContent: 'center',
    padding: fullscreen ? 8 : 20,
  };

  const contentStyle = fullscreen
    ? {
        background: 'var(--bg-card)', borderRadius: 12, padding: 20,
        width: '100%', maxWidth: '100%',
        maxHeight: 'calc(100vh - 16px)', overflowY: 'auto',
      }
    : {
        background: 'var(--bg-card)', borderRadius: 12, padding: 24,
        maxWidth, width: '100%',
      };

  return (
    <div style={backdropStyle} onClick={handleBackdropClick}>
      <div style={contentStyle}>
        {title && (
          <div style={{
            fontSize: '1rem', fontWeight: 700,
            color: titleColor || 'var(--c-text-dark)', marginBottom: 8,
          }}>
            {title}
          </div>
        )}
        <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 16, whiteSpace: 'pre-wrap' }}>
          {children}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {actions}
        </div>
      </div>
    </div>
  );
}
