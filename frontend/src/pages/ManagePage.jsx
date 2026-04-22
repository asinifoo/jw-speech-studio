import { useState, useEffect } from 'react';
import { S } from '../styles';
import ManagePreprocessTab from './ManagePreprocessTab';
import ManageAiTab from './ManageAiTab';
import ManageDbTab from './ManageDbTab';
import ManageAddTab from './ManageAddTab';
import ManageAddQuickInput from './ManageAddQuickInput';


export default function ManagePage({ fontSize, pendingPub, clearPendingPub, onSaveReturn, pageType, onGoAdd }) {
  // Phase 5-3A: pageType='input' 도 'add' 모드로 분기 (ManagePage 내부는 addTab 렌더 경로 재사용)
  const _isAddPage = pageType === 'add' || pageType === 'input';
  const defaultMode = _isAddPage ? 'add' : 'mydb';
  const [mode, setMode] = useState(() => {
    if (_isAddPage) return 'add';
    try { const saved = localStorage.getItem('jw-manage-mode'); return (saved && saved !== 'add' && saved !== 'memo') ? saved : 'mydb'; } catch(e) { return 'mydb'; }
  });
  // 전처리 탭: 최초 진입 후 마운트 유지 (편집 중 state 보존)
  const [preprocVisited, setPreprocVisited] = useState(() => mode === 'preprocess');
  useEffect(() => { if (mode === 'preprocess' && !preprocVisited) setPreprocVisited(true); }, [mode, preprocVisited]);
  const [aiVisited, setAiVisited] = useState(() => mode === 'ai');
  useEffect(() => { if (mode === 'ai' && !aiVisited) setAiVisited(true); }, [mode, aiVisited]);
  const [dbVisited, setDbVisited] = useState(() => mode === 'mydb');
  useEffect(() => { if (mode === 'mydb' && !dbVisited) setDbVisited(true); }, [mode, dbVisited]);
  useEffect(() => { if (!_isAddPage) { try { localStorage.setItem('jw-manage-mode', mode); } catch(e) {} } }, [mode, pageType]);
  return (
    <div>
      {!_isAddPage && (
      <div style={{ ...S.pillContainer, marginBottom: 16 }}>
        {[['mydb', 'DB'], ['ai', 'AI'], ['preprocess', '전처리']].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} style={S.pillL2(mode === k)}>{l}</button>
        ))}
      </div>
      )}


      {mode === 'add' && (pageType === 'input'
        ? <ManageAddQuickInput />
        : <ManageAddTab fontSize={fontSize} pageType={pageType} mode={mode} pendingPub={pendingPub} clearPendingPub={clearPendingPub} onSaveReturn={onSaveReturn} />
      )}

      {dbVisited && (
        <div style={{ display: mode === 'mydb' ? 'contents' : 'none' }}>
          <ManageDbTab mode={mode} />
        </div>
      )}


      {aiVisited && (
        <div style={{ display: mode === 'ai' ? 'contents' : 'none' }}>
          <ManageAiTab />
        </div>
      )}

      {preprocVisited && (
        <div style={{ display: mode === 'preprocess' ? 'contents' : 'none' }}>
          <ManagePreprocessTab />
        </div>
      )}
    </div>
  );
}
