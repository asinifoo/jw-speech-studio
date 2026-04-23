// 사용 예시:
//
// // 삭제 확인
// const confirm = useConfirm();
// const handleDelete = async () => {
//   if (!await confirm('이 항목을 삭제하시겠습니까?', {
//     title: '삭제 확인',
//     confirmLabel: '삭제',
//     confirmVariant: 'danger'
//   })) return;
//   // 삭제 실행
// };
//
// // 에러 알림
// const showAlert = useAlert();
// try { ... } catch (e) {
//   showAlert(e.message, { variant: 'error' });
// }

import React, { createContext, useContext, useState, useCallback } from 'react';
import { Modal } from '../components/Modal';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  // state: null | { title, message, confirmLabel, cancelLabel, confirmVariant, resolve }

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      setState({
        title: options.title || '확인',
        message,
        confirmLabel: options.confirmLabel || '확인',
        cancelLabel: options.cancelLabel || '취소',
        confirmVariant: options.confirmVariant || 'accent',
        resolve,
      });
    });
  }, []);

  const handleConfirm = () => {
    state?.resolve(true);
    setState(null);
  };

  const handleCancel = () => {
    state?.resolve(false);
    setState(null);
  };

  const primaryStyle = (variant) => ({
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: variant === 'danger' ? 'var(--c-danger)' : 'var(--accent)',
    color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600,
  });

  const secondaryStyle = {
    padding: '8px 16px', borderRadius: 8, border: '1px solid var(--bd)',
    background: 'var(--bg-card)', color: 'var(--c-faint)',
    fontSize: '0.786rem', cursor: 'pointer',
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title}
          onClose={handleCancel}
          actions={
            <>
              <button onClick={handleCancel} style={secondaryStyle}>
                {state.cancelLabel}
              </button>
              <button onClick={handleConfirm} style={primaryStyle(state.confirmVariant)}>
                {state.confirmLabel}
              </button>
            </>
          }
        >
          {state.message}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
