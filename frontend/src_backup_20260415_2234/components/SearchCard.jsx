import { useState, Fragment } from 'react';
import ScoreBar from './ScoreBar';
import KoreanTextarea from './KoreanTextarea';
import { parseDocument, tagColor, tagLabel, sourceLabel, cleanMd } from './utils';
import { dbUpdate, dbDelete } from '../api';

export default function SearchCard({ item, checked, onToggle, editedText, onEditText, cardKey, cardPubs, setCardPub, onDbDelete, onItemUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [viewingPubs, setViewingPubs] = useState({});
  const [viewingTexts, setViewingTexts] = useState({});
  const [dbEditing, setDbEditing] = useState(false);
  const [dbEditValue, setDbEditValue] = useState('');
  const [dbEditMeta, setDbEditMeta] = useState({});
  const [dbStatus, setDbStatus] = useState('');
  const col = item.collection || 'speech_points';
  const meta = item.metadata || {};
  const originalText = item.text || '';
  const displayText = editedText !== undefined && editedText !== null ? editedText : originalText;
  const parsed = parseDocument(displayText);
  const isFiltered = item.filtered;
  const isEdited = editedText !== undefined && editedText !== null && editedText !== originalText;
  const content = parsed?.content || displayText || '';
  const isLong = content.length > 150;

  // em 단위 (기준 14px)
  const em = (px) => `${+(px / 14).toFixed(3)}em`;

  const startEdit = (e) => {
    e.stopPropagation();
    setEditValue(displayText);
    setEditing(true);
    setExpanded(true);
  };

  const confirmEdit = (e) => {
    e.stopPropagation();
    onEditText(editValue);
    setEditing(false);
  };

  const restoreOriginal = (e) => {
    e.stopPropagation();
    onEditText(null);
    setEditing(false);
  };

  const startDbEdit = (e) => {
    e.stopPropagation();
    setDbEditValue(originalText);
    setDbEditMeta({ point_content: meta.point_content || '', pub_code: meta.pub_code || '', keywords: parsed?.keywords || '', scriptures: parsed?.scripture || '', outline_title: meta.outline_title || meta.topic || '', source: meta.source || '', sub_source: meta.sub_source || '', service_type: meta.service_type || '' });
    setDbEditing(true);
  };

  const saveDb = async (e) => {
    e.stopPropagation();
    setDbStatus('저장 중...');
    try {
      let finalText = dbEditValue;
      const tagUpdates = [['출처', dbEditMeta.source || ''], ['골자', dbEditMeta.outline_title ? (meta.outline_num ? meta.outline_num + ' - ' : '') + dbEditMeta.outline_title : ''], ['요점', dbEditMeta.point_content || ''], ['키워드', dbEditMeta.keywords || ''], ['성구', dbEditMeta.scriptures || ''], ['출판물', dbEditMeta.pub_code || '']];
      for (const [tag, val] of tagUpdates) { const regex = new RegExp(`^\\[${tag}\\].*$`, 'm'); if (regex.test(finalText)) { finalText = val ? finalText.replace(regex, `[${tag}] ${val}`) : finalText.replace(regex, '').replace(/\n{3,}/g, '\n\n'); } else if (val) { const idx = finalText.indexOf('\n\n'); if (idx >= 0) finalText = finalText.slice(0, idx) + `\n[${tag}] ${val}` + finalText.slice(idx); else finalText = `[${tag}] ${val}\n\n` + finalText; } }
      finalText = finalText.replace(/\n{3,}/g, '\n\n').trim();
      await dbUpdate(col, item.id, finalText, dbEditMeta);
      if (onItemUpdate) onItemUpdate(finalText, dbEditMeta);
      onEditText(null);
      setDbStatus('저장 완료');
      setTimeout(() => { setDbStatus(''); setDbEditing(false); }, 1000);
    } catch (err) { setDbStatus('오류: ' + err.message); }
  };

  const deleteDb = async (e) => {
    e.stopPropagation();
    if (!confirm('이 항목을 DB에서 삭제하시겠습니까?')) return;
    setDbStatus('삭제 중...');
    try {
      await dbDelete(col, item.id);
      setDbStatus('삭제 완료');
      if (onDbDelete) onDbDelete();
    } catch (err) { setDbStatus('오류: ' + err.message); }
  };

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden', fontSize: 14,
      border: isFiltered ? '1px solid var(--tint-red-bd)' : isEdited ? '1px solid var(--tint-blue-bd)' : '1px solid var(--bd-soft)',
      background: isFiltered ? 'var(--tint-red-soft)' : isEdited ? 'var(--tint-blue-soft)' : 'var(--bg-card)',
      opacity: checked ? 1 : 0.5,
    }}>
      <div onClick={onToggle} style={{
        padding: '8px 10px', cursor: 'pointer',
        background: isFiltered ? 'var(--tint-red)' : 'var(--bg-subtle)',
        borderBottom: '1px solid var(--bd-light)',
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="checkbox" checked={checked} readOnly style={{ cursor: 'pointer', accentColor: tagColor[col] || 'var(--c-muted)' }} />
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: tagColor[col] || 'var(--c-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: em(11), fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || meta.source || tagLabel[col] || col}</span>
          {meta.speaker && <span style={{ fontSize: em(11), color: 'var(--c-faint)' }}>{meta.speaker}</span>}
          {meta.date && meta.date !== '0000' && <span style={{ fontSize: em(10), color: 'var(--c-dim)' }}>{meta.date}</span>}
          {meta.tags && (() => {
            const t = meta.tags;
            const badges = [];
            if (t.includes('표현')) badges.push({ label: '표현', bg: '#D85A30' });
            if (t.includes('예시(실화)')) badges.push({ label: '예시·실화', bg: '#C7842D' });
            if (t.includes('예시(비유)')) badges.push({ label: '예시·비유', bg: '#C7842D' });
            if (t.includes('예시(성경)')) badges.push({ label: '예시·성경', bg: '#2D8FC7' });
            if (!badges.length && t.includes('예시')) badges.push({ label: '예시', bg: '#C7842D' });
            return badges.map((b, bi) => <span key={bi} style={{ fontSize: em(8), padding: '1px 5px', borderRadius: 3, background: b.bg, color: '#fff', fontWeight: 700 }}>{b.label}</span>);
          })()}
          {meta.service_type && meta.service_type !== '일반' && <span style={{ fontSize: em(9), padding: '1px 5px', borderRadius: 3, background: 'var(--tint-green-soft)', color: '#2e7d32', fontWeight: 600 }}>{meta.service_type}</span>}
          {isFiltered && <span style={{ fontSize: em(10), fontWeight: 700, color: '#c44' }}>LLM 제외</span>}
          {isEdited && <span style={{ fontSize: em(9), padding: '1px 4px', borderRadius: 3, background: 'var(--tint-blue)', color: '#378ADD', fontWeight: 600 }}>편집됨</span>}
          <div style={{ flex: 1 }} />
          <ScoreBar score={item.score || 0} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          {meta.search_source && <span style={{ fontSize: em(9), color: 'var(--c-dim)', padding: '0 4px', borderRadius: 3, background: 'var(--bg)' }}>{meta.search_source}</span>}
          <div style={{ flex: 1 }} />
          {!editing && !dbEditing && (
            <>
              <button onClick={startEdit} style={{
                padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)',
                background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: em(9), cursor: 'pointer', minWidth: 32, textAlign: 'center',
              }}>수정</button>
              <button onClick={startDbEdit} style={{
                padding: '2px 6px', borderRadius: 4, border: '1px solid var(--tint-red-bd)',
                background: 'var(--bg-card)', color: '#c44', fontSize: em(9), cursor: 'pointer', minWidth: 32, textAlign: 'center',
              }}>DB</button>
            </>
          )}
        </div>
      </div>
      <div style={{ padding: '8px 10px', fontSize: em(12), lineHeight: 1.8, color: 'var(--c-sub)' }}>
        {parsed?.isReference ? (
          parsed.sections.map((sec, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{
                display: 'inline-block', fontSize: em(10), padding: '1px 6px', borderRadius: 4,
                background: 'var(--tint-orange)', color: '#D85A30', fontWeight: 600, marginRight: 6,
              }}>{sec.label}</span>
              <span style={{ fontSize: em(12), color: 'var(--c-hint)' }}>
                {expanded || sec.content.length <= 80 ? sec.content : sec.content.slice(0, 80) + '...'}
              </span>
            </div>
          ))
        ) : (() => {
          const gt = meta.outline_type || '';
          const gn = meta.outline_num || '';
          const isPub = col === 'publications';
          let prefix = '';
          if ((gt === '공개강연' || gt.startsWith('S-34')) && gn) prefix = 'S-34_' + gn.replace(/^0+/, '').padStart(3, '0');
          else if (gt === '기념식' || gt.startsWith('S-31')) prefix = 'S-31_기념식';
          else if (gt.startsWith('JWBC-')) prefix = gn ? gt + '_' + gn : gt;
          else if (gn) prefix = gn;
          const title = isPub ? (meta.outline_title || '') : (meta.outline_title || '');
          const subTopic = parsed?.subtopic || meta.sub_topic || meta.subtopic || '';
          const scripture = cleanMd(parsed?.scripture || meta.scriptures || '');
          const metaRows = [
            isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: '#7F77DD' },
            isPub && meta.pub_title && { label: '출판물명', value: meta.pub_title },
            !isPub && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
            subTopic && { label: '소주제', value: subTopic },
            (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: tagColor[col] },
            scripture && { label: '성구', value: scripture, color: '#2D8FC7' },
            (parsed?.keywords || meta.keywords) && { label: '키워드', value: parsed?.keywords || meta.keywords },
          ].filter(Boolean);
          return metaRows.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline' }}>
              {metaRows.map((row, mi) => (
                <Fragment key={mi}>
                  <span style={{ fontSize: em(9), color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                  <span style={{ fontSize: em(10), color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                </Fragment>
              ))}
            </div>
          ) : null;
        })()}
      </div>
      {col !== 'publications' && item.publications && item.publications.length > 0 && (
        <div style={{ padding: '4px 10px 6px', borderTop: '1px solid var(--tint-purple-bd)', background: 'var(--tint-purple)' }}>
          {item.publications.map((pub, pbi) => {
            const bodyText = (pub.text || '').split('\n').filter(l => !l.startsWith('[') && l.trim() !== '').join('\n').trim();
            const pubKey = cardKey + '-' + pbi;
            const isAdded = cardPubs[pubKey];
            const isViewing = viewingPubs[pbi];
            return (
              <div key={pbi} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: em(10) }}>
                  <span style={{ fontSize: em(8), padding: '1px 3px', borderRadius: 2, background: '#7F77DD', color: '#fff', fontWeight: 800, flexShrink: 0, marginTop: 2 }}>P</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: '#6b5fbd', fontWeight: 600 }}>{pub.pub_code}</span>
                    <div style={{ color: 'var(--c-faint)', fontSize: em(10), lineHeight: 1.5, marginTop: 1, wordBreak: 'keep-all' }}>{pub.point_content}</div>
                  </div>
                  {!isAdded && !isViewing && (
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setViewingPubs(prev => ({ ...prev, [pbi]: true }));
                      setViewingTexts(prev => ({ ...prev, [pbi]: bodyText }));
                    }} style={{
                      padding: '1px 6px', borderRadius: 3, border: '1px solid var(--tint-purple-input)',
                      background: 'var(--bg-card)', color: '#7F77DD', fontSize: em(9), cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                    }}>보기</button>
                  )}
                  {isViewing && !isAdded && (
                    <>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setCardPub(pubKey, viewingTexts[pbi] || bodyText);
                        setViewingPubs(prev => { const n = { ...prev }; delete n[pbi]; return n; });
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid #1D9E75',
                        background: 'var(--tint-green)', color: '#1D9E75', fontSize: em(9), cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                      }}>추가</button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setViewingPubs(prev => { const n = { ...prev }; delete n[pbi]; return n; });
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid var(--bd)',
                        background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: em(9), cursor: 'pointer', flexShrink: 0,
                      }}>닫기</button>
                    </>
                  )}
                  {isAdded && (
                    <>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setViewingTexts(prev => ({ ...prev, [pbi]: isAdded }));
                        setViewingPubs(prev => ({ ...prev, [pbi]: true }));
                        setCardPub(pubKey, null);
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid var(--tint-purple-input)',
                        background: 'var(--bg-card)', color: '#7F77DD', fontSize: em(9), cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                      }}>수정</button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setCardPub(pubKey, null);
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid var(--bd)',
                        background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: em(9), cursor: 'pointer', flexShrink: 0,
                      }}>삭제</button>
                    </>
                  )}
                </div>
                {isViewing && !isAdded && (
                  <div style={{ marginTop: 4 }}>
                    <KoreanTextarea
                      value={viewingTexts[pbi] || bodyText}
                      onChange={(val) => setViewingTexts(prev => ({ ...prev, [pbi]: val }))}
                      rows={6}
                      style={{
                        display: 'block', width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                        borderRadius: 8, border: '1px solid var(--tint-purple-input)', background: 'var(--bg-card)',
                        fontSize: em(13), lineHeight: 1.9, color: 'var(--c-text)', fontFamily: 'inherit',
                        outline: 'none', resize: 'vertical', maxHeight: 132, overflowY: 'auto',
                      }}
                    />
                  </div>
                )}
                {isAdded && (
                  <div style={{
                    marginTop: 4, padding: '6px 8px', borderRadius: 8,
                    background: 'var(--tint-green-bg)', border: '1px solid var(--tint-green-bd)',
                    fontSize: em(13), lineHeight: 1.9, color: 'var(--c-text)',
                    whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
                    maxHeight: 132, overflowY: 'auto',
                  }}>{isAdded}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {editing ? (
        <div style={{ padding: '0 10px 8px' }}>
          <div style={{ borderTop: '1px solid var(--tint-blue-bd)', paddingTop: 8 }}>
            <KoreanTextarea
              value={editValue}
              onChange={setEditValue}
              placeholder="내용을 편집하세요"
              rows={6}
              style={{
                display: 'block', width: '100%', padding: 10, boxSizing: 'border-box',
                border: '1px solid var(--tint-blue-bd)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--c-text-dark)',
                fontSize: em(12), lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <button onClick={confirmEdit} style={{
                padding: '3px 10px', borderRadius: 8, border: '1px solid #378ADD',
                background: editValue ? '#378ADD' : 'var(--bd)', color: '#fff', fontSize: em(11), cursor: 'pointer', fontWeight: 600,
              }}>확인</button>
              {isEdited && (
                <button onClick={restoreOriginal} style={{
                  padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)',
                  background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: em(11), cursor: 'pointer',
                }}>원래대로</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} style={{
                padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)',
                background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: em(11), cursor: 'pointer',
              }}>취소</button>
            </div>
          </div>
        </div>
      ) : (
        content && !parsed?.isReference && (
          <div style={{ padding: '0 10px 8px' }}>
            <div style={{
              fontSize: em(13), lineHeight: 1.8, color: 'var(--c-text)',
              borderTop: '1px solid var(--bd-light)', paddingTop: 8,
              whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
            }}>
              {expanded || !isLong ? content : content.slice(0, 150) + '...'}
            </div>
            {isLong && (
              <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                style={{ marginTop: 4, padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-input)', color: 'var(--c-faint)', fontSize: em(11), cursor: 'pointer' }}>
                {expanded ? '접기' : '전체 보기'}
              </button>
            )}
          </div>
        )
      )}
      {dbEditing && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--tint-red-bd)' }}>
          <div style={{ fontSize: em(10), fontWeight: 600, color: '#c44', marginBottom: 6 }}>DB 직접 편집</div>
          {(meta.mode === 'manual' || meta.pub_type === 'manual') && (<>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>출처</div>
              <select value={dbEditMeta.source || ''} onChange={e => { const s = e.target.value; setDbEditMeta(p => ({ ...p, source: s, sub_source: s === '연설' ? '공개 강연' : s === '토의' ? '파수대' : '', service_type: '' })); }}
                style={{ width: '100%', padding: '3px 4px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(10), outline: 'none', boxSizing: 'border-box' }}>
                {['연설', '토의', '봉사 모임', '방문', 'JW 방송', '메모'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>구분</div>
              <input value={dbEditMeta.sub_source || ''} onChange={e => setDbEditMeta(p => ({ ...p, sub_source: e.target.value }))}
                style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(10), outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {(dbEditMeta.source === '봉사 모임' || dbEditMeta.sub_source === '기타 연설' || dbEditMeta.service_type) && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>종류</div>
                <input value={dbEditMeta.service_type || ''} onChange={e => setDbEditMeta(p => ({ ...p, service_type: e.target.value }))}
                  style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(10), outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>주제</div>
              <input value={dbEditMeta.outline_title || ''} onChange={e => setDbEditMeta(p => ({ ...p, outline_title: e.target.value }))}
                style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>출판물</div>
              <input value={dbEditMeta.pub_code || ''} onChange={e => setDbEditMeta(p => ({ ...p, pub_code: e.target.value }))}
                style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>요점</div>
            <input value={dbEditMeta.point_content || ''} onChange={e => setDbEditMeta(p => ({ ...p, point_content: e.target.value }))}
              style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(11), outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>키워드</div>
              <input value={dbEditMeta.keywords || ''} onChange={e => setDbEditMeta(p => ({ ...p, keywords: e.target.value }))}
                placeholder="쉼표 구분" style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: em(9), color: 'var(--c-muted)', marginBottom: 1 }}>성구</div>
              <input value={dbEditMeta.scriptures || ''} onChange={e => setDbEditMeta(p => ({ ...p, scriptures: e.target.value }))}
                placeholder="사 53:3" style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: em(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          </>)}
          <KoreanTextarea
            value={dbEditValue}
            onChange={setDbEditValue}
            rows={8}
            style={{
              display: 'block', width: '100%', padding: 10, boxSizing: 'border-box',
              border: '1px solid var(--tint-red-bd)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--c-text-dark)',
              fontSize: em(12), lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
            <button onClick={saveDb} style={{
              padding: '3px 10px', borderRadius: 8, border: '1px solid #D85A30',
              background: '#D85A30', color: '#fff', fontSize: em(11), cursor: 'pointer', fontWeight: 600,
            }}>DB 저장</button>
            <button onClick={deleteDb} style={{
              padding: '3px 10px', borderRadius: 8, border: '1px solid #c44',
              background: 'var(--bg-card)', color: '#c44', fontSize: em(11), cursor: 'pointer',
            }}>DB 삭제</button>
            <button onClick={(e) => { e.stopPropagation(); setDbEditing(false); setDbStatus(''); }} style={{
              padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)',
              background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: em(11), cursor: 'pointer',
            }}>취소</button>
            {dbStatus && <span style={{ fontSize: em(10), color: dbStatus.startsWith('오류') ? '#c44' : '#1D9E75', fontWeight: 600 }}>{dbStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
