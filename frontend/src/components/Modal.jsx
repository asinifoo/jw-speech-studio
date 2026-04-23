import React from 'react';

export function Modal({ title, children, actions, onClose, titleColor }) {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && onClose) onClose();
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: 'var(--bg-card)', borderRadius: 12, padding: 24,
          maxWidth: 400, width: '100%',
        }}
      >
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
