/**
 * Reusable AI model selector with platform/model dropdowns and default toggle.
 * Also shows LLM settings info if available.
 *
 * Props: ai (return value of useAiModel hook), showGenCtx (bool, show gen ctx for local models)
 */
export default function AiModelSelector({ ai, showGenCtx = true }) {
  const { aiModels, aiPlatform, aiModel, llmSettings, isDefaultModel,
    handlePlatformChange, handleModelChange, saveDefault, clearDefault } = ai;

  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--c-muted)', marginBottom: 3 }}>AI 모델</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <select value={aiPlatform} onChange={e => handlePlatformChange(e.target.value)}
          style={{ flex: '0 0 auto', width: 100, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--bd)',
            background: 'var(--bg-input)', color: 'var(--c-text-dark)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
          {Object.keys(aiModels).map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={aiModel} onChange={e => handleModelChange(e.target.value)}
          style={{ flex: 1, padding: '6px 8px', borderRadius: 7, border: '1px solid var(--bd)',
            background: 'var(--bg-input)', color: 'var(--c-text-dark)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' }}>
          {(aiModels[aiPlatform] || []).map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <button onClick={isDefaultModel ? clearDefault : saveDefault}
          title={isDefaultModel ? '기본값 해제' : '현재 모델을 기본값으로 저장'}
          style={{
            flex: '0 0 auto', padding: '5px 9px', borderRadius: 7, fontSize: 11, fontWeight: 600,
            border: `1.5px solid ${isDefaultModel ? '#D85A30' : 'var(--bd)'}`,
            background: isDefaultModel ? '#D85A3018' : 'transparent',
            color: isDefaultModel ? '#D85A30' : 'var(--c-sub)',
            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}>
          {isDefaultModel ? '★ 기본' : '☆ 기본'}
        </button>
      </div>
      {llmSettings && showGenCtx && aiPlatform === 'Local' && (
        <div style={{ padding: '4px 8px', borderRadius: 8, background: 'var(--bg-subtle)', marginTop: 6, fontSize: 10, color: 'var(--c-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span>생성 CTX: <b style={{ color: '#D85A30' }}>{(llmSettings.gen_ctx / 1024).toFixed(0)}K</b></span>
          <span>·</span>
          <span>생성 🧠 <b style={{ color: llmSettings.gen_no_think ? 'var(--c-muted)' : '#7F77DD' }}>{llmSettings.gen_no_think ? 'OFF' : 'ON'}</b></span>
          <span style={{ fontSize: 9, color: 'var(--c-dim)' }}>Manage에서 변경</span>
        </div>
      )}
    </div>
  );
}
