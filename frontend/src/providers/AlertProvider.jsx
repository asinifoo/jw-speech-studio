import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal } from '../components/Modal';

const AlertContext = createContext(null);

export function AlertProvider({ children }) {
  const [state, setState] = useState(null);
  // state: null | { title, message, variant }

  const showAlert = useCallback((message, options = {}) => {
    setState({
      title: options.title || '알림',
      message,
      variant: options.variant || 'info',
    });
  }, []);

  const handleClose = () => setState(null);

  const titleColor = (variant) => {
    if (variant === 'error') return 'var(--c-danger)';
    if (variant === 'success') return 'var(--accent)';
    return 'var(--c-text-dark)';
  };

  const btnStyle = {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: 'var(--accent)', color: '#fff',
    fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600,
  };

  return (
    <AlertContext.Provider value={showAlert}>
      {children}
      {state && (
        <Modal
          title={state.title}
          titleColor={titleColor(state.variant)}
          onClose={handleClose}
          actions={<button onClick={handleClose} style={btnStyle}>확인</button>}
        >
          {state.message}
        </Modal>
      )}
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertProvider');
  return ctx;
}
