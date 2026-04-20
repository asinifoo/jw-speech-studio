import { S } from '../styles';
import { useState, useCallback, Fragment } from 'react';
import ScoreBar from './ScoreBar';
import KoreanTextarea from './KoreanTextarea';
import { parseDocument, tagColor, tagLabel, sourceLabel, cleanMd, parseKeywords } from './utils';
import { dbUpdate, dbDelete } from '../api';

const PRESETS = {
  default:  { actionBtn: S.btnXsAccent,  dangerBtn: S.btnXsDanger },
  readonly: { actionBtn: S.btnXsPurple,  dangerBtn: S.btnXsDanger },
  raw:      { actionBtn: S.btnXsOrange,  dangerBtn: S.btnXsDanger },
};

export default function SearchCard({ item, checked, onToggle, editedText, onEditText, cardKey, cardPubs, setCardPub, onDbDelete, onItemUpdate, preset = 'default' }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const P = PRESETS[preset] || PRESETS.default;
  const [editValue, setEditValue] = useState('');
  const [viewingPubs, setViewingPubs] = useState({});
  const [viewingTexts, setViewingTexts] = useState({});
  const [refsExpanded, setRefsExpanded] = useState(false);
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

  // rem 단위 (기준 14px)
  const rem = (px) => `${+(px / 14).toFixed(3)}rem`;

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
    setDbEditMeta({ point_content: meta.point_content || '', pub_code: meta.pub_code || '', keywords: parsed?.keywords || '', scriptures: parsed?.scripture || '', outline_title: meta.outline_title || meta.topic || '', source: meta.source || '', sub_source: meta.sub_source || '', service_type: meta.service_type || '', rating: parseInt(meta.rating || '0'), favorite: meta.favorite === 'true', memo: meta.memo || '', importance: parseInt(meta.importance || '0'), rating_note: meta.rating_note || '' });
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
      const saveMeta = { ...dbEditMeta, rating: String(dbEditMeta.rating || 0), favorite: dbEditMeta.favorite ? 'true' : 'false', importance: String(dbEditMeta.importance || 0), memo: dbEditMeta.memo || '', rating_note: dbEditMeta.rating_note || '' };
      await dbUpdate(col, item.id, finalText, saveMeta);
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

  const headerClick = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
    if (preset !== 'readonly' && onToggle) onToggle();
  }, [preset, onToggle]);

  const cardBg = isFiltered ? 'var(--tint-red-soft)' : isEdited ? 'var(--tint-blue-soft)' : 'var(--bg-card)';

  return (
    <div style={{
      ...S.cardItem,
      border: isFiltered ? '1px solid var(--tint-red-bd)' : isEdited ? '1px solid var(--tint-blue-bd)' : S.cardItem.border,
      background: cardBg,
      opacity: checked ? 1 : 0.5,
    }}>
      <div onClick={headerClick} style={{
        ...S.cardItemHeader,
        cursor: preset !== 'readonly' ? 'pointer' : 'default',
        background: isFiltered ? 'var(--tint-red)' : S.cardItemHeader.background,
      }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {preset !== 'readonly' && <input type="checkbox" checked={checked} readOnly onClick={(e) => { e.stopPropagation(); if (onToggle) onToggle(); }} style={{ cursor: 'pointer', accentColor: tagColor[col] || 'var(--c-muted)' }} />}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: tagColor[col] || 'var(--c-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: rem(11), fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || meta.source || tagLabel[col] || col}</span>
          {meta.source === 'discussion' && (meta.discussion_type || meta.sub_source) && <span style={{ fontSize: rem(9), padding: '1px 5px', borderRadius: 3, background: '#378ADD15', color: 'var(--accent-blue)', fontWeight: 600 }}>{meta.discussion_type || meta.sub_source}</span>}
          {meta.speaker && <span style={{ fontSize: rem(11), color: 'var(--c-faint)' }}>{meta.speaker}</span>}
          {meta.date && meta.date !== '0000' && <span style={{ fontSize: rem(10), color: 'var(--c-dim)' }}>{meta.date}</span>}
          {meta.tags && (() => {
            const t = meta.tags;
            const badges = [];
            if (t.includes('표현')) badges.push({ label: '표현', bg: 'var(--accent-orange)' });
            if (t.includes('예시(실화)')) badges.push({ label: '예시·실화', bg: 'var(--accent-brown)' });
            if (t.includes('예시(비유)')) badges.push({ label: '예시·비유', bg: 'var(--accent-brown)' });
            if (t.includes('예시(성경)')) badges.push({ label: '예시·성경', bg: '#2D8FC7' });
            if (!badges.length && t.includes('예시')) badges.push({ label: '예시', bg: 'var(--accent-brown)' });
            return badges.map((b, bi) => <span key={bi} style={{ fontSize: rem(8), padding: '1px 5px', borderRadius: 3, background: b.bg, color: '#fff', fontWeight: 700 }}>{b.label}</span>);
          })()}
          {meta.service_type && meta.service_type !== '일반' && <span style={{ fontSize: rem(9), padding: '1px 5px', borderRadius: 3, background: 'var(--tint-green-soft)', color: '#2e7d32', fontWeight: 600 }}>{meta.service_type}</span>}
          {meta.visit_target && <span style={{ fontSize: rem(9), padding: '1px 5px', borderRadius: 3, background: '#D85A3015', color: 'var(--accent-orange)', fontWeight: 600 }}>{meta.visit_target}</span>}
          {meta.favorite === 'true' && <span style={{ fontSize: rem(10), color: 'var(--accent-gold)' }}>★</span>}
          {parseInt(meta.rating || '0') > 0 && <span style={{ fontSize: rem(8), color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(parseInt(meta.rating))}{'☆'.repeat(5 - parseInt(meta.rating))}</span>}
          {meta.rating_note && <span style={{ fontSize: rem(9), color: 'var(--c-hint)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.rating_note}</span>}
          {parseInt(meta.importance || '0') > 0 && <span style={{ fontSize: rem(9), padding: '1px 5px', borderRadius: 3, background: '#378ADD18', color: 'var(--accent-blue)', fontWeight: 700 }}>★{parseInt(meta.importance)}</span>}
          {isFiltered && <span style={{ fontSize: rem(10), fontWeight: 700, color: 'var(--c-danger)' }}>LLM 제외</span>}
          {isEdited && <span style={{ fontSize: rem(9), padding: '1px 4px', borderRadius: 3, background: 'var(--tint-blue)', color: 'var(--accent-blue)', fontWeight: 600 }}>편집됨</span>}
          <div style={{ flex: 1 }} />
          <ScoreBar score={item.score || 0} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          {meta.search_source && <span style={{ fontSize: rem(9), color: 'var(--c-dim)', padding: '0 4px', borderRadius: 3, background: 'var(--bg)' }}>{meta.search_source}</span>}
          <div style={{ flex: 1 }} />
          {!editing && !dbEditing && (
            preset === 'readonly' ? (
              <button onClick={(e) => { e.stopPropagation(); if (navigator.clipboard) navigator.clipboard.writeText(content); }} style={P.actionBtn}>복사</button>
            ) : (
              <>
                <button onClick={startEdit} style={P.actionBtn}>수정</button>
                <button onClick={startDbEdit} style={P.dangerBtn}>DB</button>
              </>
            )
          )}
        </div>
      </div>
      {!editing && !dbEditing && (
      <div style={{ padding: '8px 10px', fontSize: rem(12), lineHeight: 1.8, color: 'var(--c-sub)' }}>
        {parsed?.isReference ? (
          parsed.sections.map((sec, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <span style={{
                display: 'inline-block', fontSize: rem(10), padding: '1px 6px', borderRadius: 4,
                background: 'var(--tint-orange)', color: 'var(--accent-orange)', fontWeight: 600, marginRight: 6,
              }}>{sec.label}</span>
              <span style={{ fontSize: rem(12), color: 'var(--c-hint)' }}>
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
          const isDisc = meta.source === 'discussion';
          const isSvc = meta.source === '봉사 모임' || meta.source === 'service';
          const isVisit = meta.source === '방문' || meta.source === 'visit';
          const discTopic = meta.topic || parsed?.topic || meta.outline_title || '';
          const discQuestion = meta.question || parsed?.question || meta.subtopic || '';
          const svcTopic = meta.topic || parsed?.topic || meta.outline_title || '';
          const svcSituation = meta.situation || parsed?.situation || '';
          const metaRows = [
            isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: 'var(--accent-purple)' },
            isPub && meta.pub_title && meta.pub_title !== meta.pub_code && { label: '출판물명', value: meta.pub_title },
            isDisc && meta.pub_code && { label: '출판물', value: meta.pub_code, color: 'var(--accent-purple)' },
            isDisc && discTopic && { label: '주제', value: discTopic },
            isDisc && discQuestion && { label: '질문', value: discQuestion, color: 'var(--accent-blue)' },
            (isSvc || isVisit) && svcTopic && { label: '주제', value: svcTopic },
            isVisit && meta.visit_target && { label: '대상', value: meta.visit_target, color: 'var(--accent-orange)' },
            (isSvc || isVisit) && svcSituation && { label: '상황', value: svcSituation },
            !isPub && !isDisc && !isSvc && !isVisit && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
            !isPub && !isDisc && !isSvc && !isVisit && subTopic && { label: '소주제', value: subTopic },
            !isDisc && !isSvc && !isVisit && (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: tagColor[col] },
            scripture && { label: '성구', value: scripture, color: '#2D8FC7' },
            (parsed?.keywords || meta.keywords) && (() => {
              const kwsRaw = parsed?.keywords || meta.keywords;
              const kws = isPub ? parseKeywords(kwsRaw) : null;
              const display = isPub ? kws.join(', ') : kwsRaw;
              return display ? { label: '키워드', value: display } : null;
            })(),
          ].filter(Boolean);
          return metaRows.length > 0 ? (
            <div style={S.cardItemMeta}>
              {metaRows.map((row, mi) => (
                <Fragment key={mi}>
                  <span style={{ fontSize: rem(9), color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                  <span style={{ fontSize: rem(10), color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                </Fragment>
              ))}
            </div>
          ) : null;
        })()}
      </div>
      )}
      {!editing && !dbEditing && meta.memo && (
        <div style={{
          margin: '0 10px 6px', padding: '4px 8px',
          background: 'var(--bg-subtle)', borderRadius: 4,
          fontSize: rem(11), color: 'var(--c-sub)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>💭 {meta.memo}</div>
      )}
      {!editing && !dbEditing && col === 'publications' && (() => {
        const refs = Array.isArray(meta.referenced_by) ? meta.referenced_by : (() => { try { return JSON.parse(meta.referenced_by_json || '[]'); } catch { return []; } })();
        const meaningfulRefs = refs.filter(r => (r.outline_type || '').trim() || (r.outline_num || '').trim() || (r.point_num || '').trim() || (r.outline_title || '').trim() || (r.subtopic_title || '').trim() || (r.point_text || '').trim());
        if (!meaningfulRefs.length) return null;
        return (
          <div style={{ padding: '4px 10px 6px', borderTop: '1px solid var(--tint-purple-bd)', background: 'var(--tint-purple)' }}>
            <div onClick={(e) => { e.stopPropagation(); setRefsExpanded(v => !v); }} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 0', cursor: 'pointer', fontSize: rem(11), color: 'var(--c-sub)', userSelect: 'none',
            }}>
              <span>📚 {meaningfulRefs.length}개 골자에서 사용</span>
              <span style={{ fontSize: rem(9), color: 'var(--c-dim)' }}>{refsExpanded ? '▲' : '▼'}</span>
            </div>
            {refsExpanded && (
              <div style={{ marginTop: 4, padding: '6px 8px', background: 'var(--bg-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {meaningfulRefs.map((r, i) => (
                  <div key={i} style={{ fontSize: rem(10), paddingBottom: i < meaningfulRefs.length - 1 ? 6 : 0, borderBottom: i < meaningfulRefs.length - 1 ? '1px solid var(--bd)' : 'none' }}>
                    <div style={{ fontWeight: 600, color: 'var(--c-text)', marginBottom: 2 }}>
                      {[r.outline_type, r.outline_num].filter(Boolean).join('_')}
                      {r.outline_year ? ` (${r.outline_year}년)` : ''}
                      {r.version ? ` v${r.version}` : ''}
                      {r.point_num ? ` 요점 ${r.point_num}` : ''}
                    </div>
                    {r.outline_title && <div style={{ color: 'var(--c-sub)', marginBottom: 1 }}>주제: {r.outline_title}</div>}
                    {r.subtopic_title && <div style={{ color: 'var(--c-hint)', fontSize: rem(9), marginBottom: 1 }}>소주제: {r.subtopic_title}</div>}
                    {r.point_text && <div style={{ color: 'var(--c-text)' }}>요점: {r.point_text}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
      {!editing && !dbEditing && col !== 'publications' && item.publications && item.publications.length > 0 && (
        <div style={{ padding: '4px 10px 6px', borderTop: '1px solid var(--tint-purple-bd)', background: 'var(--tint-purple)' }}>
          {item.publications.map((pub, pbi) => {
            const bodyText = (pub.text || '').split('\n').filter(l => !l.startsWith('[') && l.trim() !== '').join('\n').trim();
            const pubKey = cardKey + '-' + pbi;
            const isAdded = cardPubs[pubKey];
            const isViewing = viewingPubs[pbi];
            return (
              <div key={pbi} style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: rem(10) }}>
                  <span style={{ fontSize: rem(8), padding: '1px 3px', borderRadius: 2, background: 'var(--accent-purple)', color: '#fff', fontWeight: 800, flexShrink: 0, marginTop: 2 }}>P</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: '#6b5fbd', fontWeight: 600 }}>{pub.pub_code}</span>
                    <div style={{ color: 'var(--c-faint)', fontSize: rem(10), lineHeight: 1.5, marginTop: 1, wordBreak: 'keep-all' }}>{pub.point_content}</div>
                  </div>
                  {!isAdded && !isViewing && (
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setViewingPubs(prev => ({ ...prev, [pbi]: true }));
                      setViewingTexts(prev => ({ ...prev, [pbi]: bodyText }));
                    }} style={{
                      padding: '1px 6px', borderRadius: 3, border: '1px solid var(--tint-purple-input)',
                      background: 'var(--bg-card)', color: 'var(--accent-purple)', fontSize: rem(9), cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                    }}>보기</button>
                  )}
                  {isViewing && !isAdded && (
                    <>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setCardPub(pubKey, viewingTexts[pbi] || bodyText);
                        setViewingPubs(prev => { const n = { ...prev }; delete n[pbi]; return n; });
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid var(--accent)',
                        background: 'var(--tint-green)', color: 'var(--accent)', fontSize: rem(9), cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                      }}>추가</button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setViewingPubs(prev => { const n = { ...prev }; delete n[pbi]; return n; });
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid var(--bd)',
                        background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: rem(9), cursor: 'pointer', flexShrink: 0,
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
                        background: 'var(--bg-card)', color: 'var(--accent-purple)', fontSize: rem(9), cursor: 'pointer', fontWeight: 600, flexShrink: 0,
                      }}>수정</button>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setCardPub(pubKey, null);
                      }} style={{
                        padding: '1px 6px', borderRadius: 3, border: '1px solid var(--bd)',
                        background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: rem(9), cursor: 'pointer', flexShrink: 0,
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
                        borderRadius: 8, border: 'none', background: 'var(--bg-subtle)',
                        fontSize: rem(13), lineHeight: 1.9, color: 'var(--c-text)', fontFamily: 'inherit',
                        outline: 'none', resize: 'vertical', maxHeight: 132, overflowY: 'auto',
                      }}
                    />
                  </div>
                )}
                {isAdded && (
                  <div style={{
                    marginTop: 4, padding: '6px 8px', borderRadius: 8,
                    background: 'var(--tint-green-bg)', border: '1px solid var(--tint-green-bd)',
                    fontSize: rem(13), lineHeight: 1.9, color: 'var(--c-text)',
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
                display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box',
                border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)',
                fontSize: rem(12), lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              <button onClick={confirmEdit} style={{
                padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-blue)',
                background: editValue ? 'var(--accent-blue)' : 'var(--bd)', color: '#fff', fontSize: rem(11), cursor: 'pointer', fontWeight: 600,
              }}>확인</button>
              {isEdited && (
                <button onClick={restoreOriginal} style={{
                  padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)',
                  background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: rem(11), cursor: 'pointer',
                }}>원래대로</button>
              )}
              <button onClick={(e) => { e.stopPropagation(); setEditing(false); }} style={{
                padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)',
                background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: rem(11), cursor: 'pointer',
              }}>취소</button>
            </div>
          </div>
        </div>
      ) : (
        content && !parsed?.isReference && (
          <div style={{ padding: '0 10px 8px' }}>
            <div className={expanded ? 'chat-input' : ''} style={{
              fontSize: rem(13), lineHeight: 1.8, color: 'var(--c-text)',
              borderTop: '1px solid var(--bd-light)', paddingTop: 8,
              whiteSpace: 'pre-wrap', wordBreak: 'keep-all',
              maxHeight: expanded ? 400 : '4.2em',
              overflow: expanded ? 'auto' : 'hidden',
              transition: 'max-height 0.2s ease',
              position: isLong && !expanded ? 'relative' : undefined,
            }}>
              {content}
              {isLong && !expanded && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2em', background: `linear-gradient(transparent, ${cardBg})`, pointerEvents: 'none' }} />
              )}
            </div>
            {isLong && (
              <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                style={{ marginTop: 4, padding: '4px 12px', borderRadius: 8, border: '1px solid var(--bd-light)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {expanded ? '접기' : '전체 보기'}
              </button>
            )}
          </div>
        )
      )}
      {dbEditing && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--tint-red-bd)' }}>
          <div style={{ fontSize: rem(10), fontWeight: 600, color: 'var(--c-danger)', marginBottom: 6 }}>DB 직접 편집</div>
          {(meta.mode === 'manual' || meta.pub_type === 'manual') && (<>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>출처</div>
              <select value={dbEditMeta.source || ''} onChange={e => { const s = e.target.value; setDbEditMeta(p => ({ ...p, source: s, sub_source: s === '연설' ? '공개 강연' : s === '토의' ? '파수대' : '', service_type: '' })); }}
                style={{ width: '100%', padding: '3px 4px', border: 'none', borderRadius: 4, fontSize: rem(10), outline: 'none', boxSizing: 'border-box' }}>
                {['연설', '토의', '봉사 모임', '방문', 'JW 방송', '메모'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>구분</div>
              <input value={dbEditMeta.sub_source || ''} onChange={e => setDbEditMeta(p => ({ ...p, sub_source: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(10), outline: 'none', boxSizing: 'border-box' }} />
            </div>
            {(dbEditMeta.source === '봉사 모임' || dbEditMeta.sub_source === '기타 연설' || dbEditMeta.service_type) && (
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>종류</div>
                <input value={dbEditMeta.service_type || ''} onChange={e => setDbEditMeta(p => ({ ...p, service_type: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(10), outline: 'none', boxSizing: 'border-box' }} />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>주제</div>
              <input value={dbEditMeta.outline_title || ''} onChange={e => setDbEditMeta(p => ({ ...p, outline_title: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>출판물</div>
              <input value={dbEditMeta.pub_code || ''} onChange={e => setDbEditMeta(p => ({ ...p, pub_code: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>요점</div>
            <input value={dbEditMeta.point_content || ''} onChange={e => setDbEditMeta(p => ({ ...p, point_content: e.target.value }))}
              style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(11), outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>키워드</div>
              <input value={dbEditMeta.keywords || ''} onChange={e => setDbEditMeta(p => ({ ...p, keywords: e.target.value }))}
                placeholder="쉼표 구분" style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: rem(9), color: 'var(--c-muted)', marginBottom: 1 }}>성구</div>
              <input value={dbEditMeta.scriptures || ''} onChange={e => setDbEditMeta(p => ({ ...p, scriptures: e.target.value }))}
                placeholder="사 53:3" style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 4, fontSize: rem(11), outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>
          </>)}
          <KoreanTextarea
            value={dbEditValue}
            onChange={setDbEditValue}
            rows={8}
            style={{
              display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box',
              border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)',
              fontSize: rem(12), lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
            }}
          />
          {/* 별점 + 즐겨찾기 */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, padding: '4px 0' }}>
            <span style={{ fontSize: rem(10), color: 'var(--c-dim)', minWidth: 36 }}>평가</span>
            <div style={{ display: 'flex', gap: 2 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={(e) => { e.stopPropagation(); setDbEditMeta(p => ({ ...p, rating: p.rating === n ? 0 : n })); }} style={{
                  width: 28, height: 28, borderRadius: 6, border: '1px solid ' + (n <= (dbEditMeta.rating || 0) ? 'var(--accent-gold)' : 'var(--bd)'),
                  background: n <= (dbEditMeta.rating || 0) ? '#F5A62318' : 'var(--bg-card)', color: n <= (dbEditMeta.rating || 0) ? 'var(--accent-gold)' : 'var(--c-dim)',
                  fontSize: rem(10), fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                }}>{n}</button>
              ))}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setDbEditMeta(p => ({ ...p, favorite: !p.favorite })); }} style={{
              padding: '3px 10px', borderRadius: 6, border: '1px solid ' + (dbEditMeta.favorite ? 'var(--accent-gold)' : 'var(--bd)'),
              background: dbEditMeta.favorite ? '#F5A62318' : 'var(--bg-card)', color: dbEditMeta.favorite ? 'var(--accent-gold)' : 'var(--c-dim)',
              fontSize: rem(11), cursor: 'pointer', fontWeight: 700,
            }}>{dbEditMeta.favorite ? '★' : '☆'}</button>
          </div>
          {/* speech_expressions: rating_note */}
          {col === 'speech_expressions' && (
            <div style={{ marginTop: 4 }}>
              <input type="text" value={dbEditMeta.rating_note || ''} onChange={(e) => { e.stopPropagation(); setDbEditMeta(p => ({ ...p, rating_note: e.target.value })); }} placeholder="별점 이유 / 선호 이유"
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-card)', fontSize: rem(11), fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)' }} />
            </div>
          )}
          {/* speech_points: 중요도 + 메모 */}
          {col === 'speech_points' && (
            <>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                <span style={{ fontSize: rem(10), color: 'var(--c-dim)', minWidth: 36 }}>중요도</span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={(e) => { e.stopPropagation(); setDbEditMeta(p => ({ ...p, importance: p.importance === n ? 0 : n })); }} style={{
                      width: 28, height: 28, borderRadius: 6, border: '1px solid ' + (n <= (dbEditMeta.importance || 0) ? 'var(--accent-blue)' : 'var(--bd)'),
                      background: n <= (dbEditMeta.importance || 0) ? '#378ADD18' : 'var(--bg-card)', color: n <= (dbEditMeta.importance || 0) ? 'var(--accent-blue)' : 'var(--c-dim)',
                      fontSize: rem(10), fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}>{n}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 6 }}>
                <textarea value={dbEditMeta.memo || ''} onChange={(e) => { e.stopPropagation(); setDbEditMeta(p => ({ ...p, memo: e.target.value })); }} placeholder="연설 준비 메모 / 사후 참고" rows={2}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-card)', fontSize: rem(11), fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.6, color: 'var(--c-text-dark)' }} />
              </div>
            </>
          )}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
            <button onClick={saveDb} style={{
              padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-orange)',
              background: 'var(--accent-orange)', color: '#fff', fontSize: rem(11), cursor: 'pointer', fontWeight: 600,
            }}>DB 저장</button>
            <button onClick={deleteDb} style={{
              padding: '3px 10px', borderRadius: 8, border: '1px solid var(--c-danger)',
              background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: rem(11), cursor: 'pointer',
            }}>DB 삭제</button>
            <button onClick={(e) => { e.stopPropagation(); setDbEditing(false); setDbStatus(''); }} style={{
              padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)',
              background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: rem(11), cursor: 'pointer',
            }}>취소</button>
            {dbStatus && <span style={{ fontSize: rem(10), color: dbStatus.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{dbStatus}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
