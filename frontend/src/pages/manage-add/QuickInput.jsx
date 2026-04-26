import { useState, useEffect } from 'react';
import { S } from '../../styles';
import { draftSave } from '../../api';
import { quickFormDefault } from '../../utils/formDefaults';
import { RESET_CONFIRM_MSG } from '../../utils/formReset';
import { useConfirm } from '../../providers/ConfirmProvider';
import { MSG, getStatusColor } from '../../utils/messages';

export default function ManageQuickInput() {
  const showConfirm = useConfirm();
  const [qiForm, setQiForm] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-quick-form')) || quickFormDefault; } catch { return quickFormDefault; } });
  useEffect(() => { try { localStorage.setItem('jw-quick-form', JSON.stringify(qiForm)); } catch {} }, [qiForm]);
  const [qiSaving, setQiSaving] = useState(false);
  const [qiSaveMsg, setQiSaveMsg] = useState('');
  // Hotfix 9: 편집 모드 — 설정되면 저장 시 같은 outline_num 재사용 → draft 덮어쓰기
  const [qiEditingOutlineNum, setQiEditingOutlineNum] = useState('');

  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 12, padding: 14 }}>
      {/* ─── 빠른 입력 ─── */}
      {/* 타입 선택 — Level 2 pill */}
      <div style={{ ...S.pillContainer, marginBottom: 10 }}>
        {[
          ['speech', '연설'],
          ['discussion', '토의'],
          ['service', '봉사'],
          ['visit', '방문'],
          ['publication', '출판물'],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setQiForm(p => ({ ...p, type: k }))}
            style={S.pillL2(qiForm.type === k, 'var(--accent-orange)')}>{l}</button>
        ))}
      </div>

      {/* 타입별 필드 */}
      {qiForm.type === 'speech' && (
        <>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>연설 유형</div>
            <select value={qiForm.speech_type} onChange={e => setQiForm(p => ({ ...p, speech_type: e.target.value }))}
              style={{ ...S.inputField, width: '100%', cursor: 'pointer', appearance: 'none' }}>
              <option>공개강연</option>
              <option>생활과봉사</option>
              <option>JW방송</option>
              <option>대회</option>
              <option>기타</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>연사</div>
              <input value={qiForm.speaker} onChange={e => setQiForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...S.inputField, width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>날짜</div>
              <input value={qiForm.date} onChange={e => setQiForm(p => ({ ...p, date: e.target.value }))} placeholder="2605 (YYMM)" style={{ ...S.inputField, width: '100%' }} />
            </div>
          </div>
        </>
      )}

      {qiForm.type === 'discussion' && (<>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>발표자</div>
            <input value={qiForm.speaker} onChange={e => setQiForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...S.inputField, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>날짜</div>
            <input value={qiForm.date} onChange={e => setQiForm(p => ({ ...p, date: e.target.value }))} placeholder="2605" style={{ ...S.inputField, width: '100%' }} />
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>출판물 코드</div>
          <input value={qiForm.pub_code} onChange={e => setQiForm(p => ({ ...p, pub_code: e.target.value }))} placeholder="파26 2월호" style={{ ...S.inputField, width: '100%' }} />
        </div>
      </>)}

      {qiForm.type === 'service' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>인도자</div>
            <input value={qiForm.speaker} onChange={e => setQiForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...S.inputField, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>날짜</div>
            <input value={qiForm.date} onChange={e => setQiForm(p => ({ ...p, date: e.target.value }))} placeholder="2605" style={{ ...S.inputField, width: '100%' }} />
          </div>
        </div>
      )}

      {qiForm.type === 'visit' && (<>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>방문자</div>
            <input value={qiForm.speaker} onChange={e => setQiForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...S.inputField, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>날짜</div>
            <input value={qiForm.date} onChange={e => setQiForm(p => ({ ...p, date: e.target.value }))} placeholder="2605" style={{ ...S.inputField, width: '100%' }} />
          </div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>대상</div>
          <input value={qiForm.target} onChange={e => setQiForm(p => ({ ...p, target: e.target.value }))} placeholder="김철수" style={{ ...S.inputField, width: '100%' }} />
        </div>
      </>)}

      {qiForm.type === 'publication' && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>출판물 코드</div>
            <input value={qiForm.pub_code} onChange={e => setQiForm(p => ({ ...p, pub_code: e.target.value }))} placeholder="파26 2월호" style={{ ...S.inputField, width: '100%' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>제목</div>
            <input value={qiForm.pub_title} onChange={e => setQiForm(p => ({ ...p, pub_title: e.target.value }))} placeholder="출판물 제목" style={{ ...S.inputField, width: '100%' }} />
          </div>
        </div>
      )}

      {/* 주제 (공통 — service/publication 제외) */}
      {qiForm.type !== 'service' && qiForm.type !== 'publication' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>주제</div>
          <input value={qiForm.topic} onChange={e => setQiForm(p => ({ ...p, topic: e.target.value }))} placeholder="주제" style={{ ...S.inputField, width: '100%' }} />
        </div>
      )}

      {/* 내용 textarea */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>내용</div>
        <textarea value={qiForm.content} onChange={e => setQiForm(p => ({ ...p, content: e.target.value }))}
          placeholder="내용을 입력하세요..." rows={12}
          style={{ display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: '1px solid var(--bd-light)', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.929rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
      </div>

      {/* 편집 모드 배너 */}
      {qiEditingOutlineNum && (
        <div style={{ marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: '#D85A3010', border: '1px solid #D85A3040', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.714rem', color: 'var(--accent-orange)', fontWeight: 700 }}>📝 수정 중</span>
          <span style={{ fontSize: '0.714rem', color: 'var(--c-sub)', fontFamily: 'monospace' }}>QUICK_{qiEditingOutlineNum}</span>
          <div style={{ flexBasis: '100%', fontSize: '0.643rem', color: 'var(--c-dim)' }}>※ 연사/날짜 변경 시 새 draft로 저장됩니다</div>
        </div>
      )}

      {/* [초기화] + 저장 버튼 */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={async () => {
          if (!await showConfirm(RESET_CONFIRM_MSG)) return;
          setQiForm(quickFormDefault);
          setQiEditingOutlineNum('');
          setQiSaveMsg('');
          try { localStorage.removeItem('jw-quick-form'); } catch {}
        }} style={{
          padding: '10px 14px', borderRadius: 8, border: '1px solid var(--bd)',
          background: 'var(--bg-card)', color: 'var(--c-faint)',
          fontSize: '0.786rem', cursor: 'pointer', flexShrink: 0,
        }}>초기화</button>
        <button onClick={async () => {
          if (!qiForm.content.trim()) { setQiSaveMsg('내용을 입력해주세요'); return; }
          setQiSaving(true); setQiSaveMsg('');
          try {
            const typeCode = { speech: 'SP', discussion: 'DC', service: 'SV', visit: 'VS', publication: 'PB', other: 'ET' }[qiForm.type] || 'ET';
            const outlineNumForSave = qiEditingOutlineNum || `${typeCode}_${String(Date.now()).slice(-8)}`;
            const idPart = (qiForm.speaker || qiForm.target || qiForm.pub_code || qiForm.pub_title || '미상').trim() || '미상';
            const resp = await draftSave({
              outline_type: 'QUICK',
              outline_num: outlineNumForSave,
              outline_title: qiForm.topic || '',
              speaker: idPart,
              date: qiForm.date || '',
              mode: 'quick_input',
              quick_type: qiForm.type,
              speech_type: qiForm.speech_type || '',
              target: qiForm.target || '',
              pub_code: qiForm.pub_code || '',
              pub_title: qiForm.pub_title || '',
              free_text: qiForm.content,
              notes: {}, details: {}, free_subtopics: [],
            });
            const savedId = (resp && resp.draft_id) || '';
            const wasEditing = !!qiEditingOutlineNum;
            setQiSaveMsg(wasEditing
              ? MSG.helpers.updateByLink(savedId)
              : MSG.helpers.saveByLink(savedId));
            setQiForm(prev => ({ ...quickFormDefault, type: prev.type }));
            setQiEditingOutlineNum('');
            setTimeout(() => setQiSaveMsg(''), 4000);
          } catch (e) {
            setQiSaveMsg(MSG.fail.save + e.message);
          } finally {
            setQiSaving(false);
          }
        }} disabled={qiSaving || !qiForm.content.trim()} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
          background: qiSaving || !qiForm.content.trim() ? 'var(--bd-medium)' : 'var(--accent-orange)', color: '#fff',
          fontSize: '0.929rem', fontWeight: 700, cursor: qiSaving || !qiForm.content.trim() ? 'default' : 'pointer',
        }}>
          {qiSaving ? '저장 중...' : (qiEditingOutlineNum ? '수정 저장' : '저장')}
        </button>
      </div>

      {qiSaveMsg && (
        <div style={{ marginTop: 6, fontSize: '0.786rem', textAlign: 'center',
          color: getStatusColor(qiSaveMsg), fontWeight: 600 }}>
          {qiSaveMsg}
        </div>
      )}
    </div>
  );
}
