import KoreanTextarea from '../../components/KoreanTextarea';
import { S } from '../../styles';
import { saveCategories, deleteServiceType } from '../../api';
import { discFormDefault, svcFormDefault, visitFormDefault } from '../../utils/formDefaults';

export default function ManageStructureOther({
  structureMode,
  discForm, setDiscForm,
  svcForm, setSvcForm,
  visitForm, setVisitForm,
  saving, saveMsg, saveTab,
  cats, setCats,
  catEditing, setCatEditing,
  catNewVal, setCatNewVal,
}) {
  return (<>
          {structureMode === 'discussion' && (<>

              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>토의 유형</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {['파수대', '성경연구', '영적보물', '기타'].map(t => (
                  <button key={t} onClick={() => setDiscForm(p => ({ ...p, sub_source: t }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (discForm.sub_source === t ? 'var(--accent-blue)' : 'var(--bd)'),
                    background: discForm.sub_source === t ? '#378ADD10' : 'var(--bg-card)', color: discForm.sub_source === t ? 'var(--accent-blue)' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{t}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>출판물 코드</div>
                  <input value={discForm.pub_code} onChange={e => setDiscForm(p => ({ ...p, pub_code: e.target.value }))} placeholder="파26 2월호" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                  <input value={discForm.date} onChange={e => setDiscForm(p => ({ ...p, date: e.target.value }))} placeholder="2604" style={{ ...S.inputField, width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>주제</div>
                <input value={discForm.topic} onChange={e => setDiscForm(p => ({ ...p, topic: e.target.value }))} placeholder="주제를 입력하세요" style={{ ...S.inputField, width: '100%' }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>질문 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                <input value={discForm.subtopic} onChange={e => setDiscForm(p => ({ ...p, subtopic: e.target.value }))} placeholder="토의 질문" style={{ ...S.inputField, width: '100%' }} />
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>키워드 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                  <input value={discForm.keywords} onChange={e => setDiscForm(p => ({ ...p, keywords: e.target.value }))} placeholder="키워드" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>성구 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                  <input value={discForm.scriptures} onChange={e => setDiscForm(p => ({ ...p, scriptures: e.target.value }))} placeholder="성구" style={{ ...S.inputField, width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>내용 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
                <KoreanTextarea value={discForm.content} onChange={v => setDiscForm(p => ({ ...p, content: v }))}
                  placeholder="내용을 입력하세요" rows={8}
                  style={{ ...S.inputField, display: 'block', width: '100%', resize: 'vertical', lineHeight: 1.9 }} />
              </div>
              <button onClick={() => saveTab(discForm, '토의', setDiscForm, discFormDefault)} disabled={saving || !discForm.content.trim()} style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
                fontSize: '1.0rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
              }}>{saving ? '저장 중...' : '저장'}</button>
              {saveMsg && <div style={{ marginTop: 8, fontSize: '0.857rem', textAlign: 'center', color: saveMsg.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{saveMsg}</div>}
          </>)}

          {/* 봉사 모임 입력 */}
          {structureMode === 'service' && (<>

              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>봉사 유형</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {(cats.service_types || []).map(t => (
                  <button key={t} onClick={() => setSvcForm(p => ({ ...p, service_type: t }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (svcForm.service_type === t ? 'var(--accent)' : 'var(--bd)'),
                    background: svcForm.service_type === t ? '#1D9E7510' : 'var(--bg-card)', color: svcForm.service_type === t ? 'var(--accent)' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{catEditing === 'service_types' && <span onClick={e => { e.stopPropagation(); const next = cats.service_types.filter(x => x !== t); setCats(p => ({ ...p, service_types: next })); saveCategories({ ...cats, service_types: next }); if (svcForm.service_type === t) setSvcForm(p => ({ ...p, service_type: '' })); }} style={{ color: 'var(--c-danger)', marginRight: 2, fontSize: '0.643rem' }}>✕</span>}{t}</button>
                ))}
                {catEditing === 'service_types' ? (
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <input value={catNewVal} onChange={e => setCatNewVal(e.target.value)} placeholder="추가" style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.786rem', width: 60, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && catNewVal.trim()) { const next = [...cats.service_types, catNewVal.trim()]; setCats(p => ({ ...p, service_types: next })); saveCategories({ ...cats, service_types: next }); setCatNewVal(''); }}} />
                    <button onClick={() => { if (catNewVal.trim()) { const key = catEditing; const next = [...(cats[key] || []), catNewVal.trim()]; setCats(p => ({ ...p, [key]: next })); saveCategories({ ...cats, [key]: next }); setCatNewVal(''); } setCatEditing(null); setCatNewVal(''); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>완료</button>
                  </div>
                ) : (
                  <button onClick={() => setCatEditing('service_types')} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+ 편집</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>인도자</div>
                  <input value={svcForm.speaker || ''} onChange={e => setSvcForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                  <input value={svcForm.date} onChange={e => setSvcForm(p => ({ ...p, date: e.target.value }))} placeholder="2604" style={{ ...S.inputField, width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>성구</div>
                  <input value={svcForm.scriptures} onChange={e => setSvcForm(p => ({ ...p, scriptures: e.target.value }))} placeholder="마 24:14; 행 5:42" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>출판물</div>
                  <input value={svcForm.pub_code} onChange={e => setSvcForm(p => ({ ...p, pub_code: e.target.value }))} placeholder="「파26.2」" style={{ ...S.inputField, width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>키워드</div>
                <input value={svcForm.keywords} onChange={e => setSvcForm(p => ({ ...p, keywords: e.target.value }))} placeholder="키워드" style={{ ...S.inputField, width: '100%' }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>내용 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
                <KoreanTextarea value={svcForm.content} onChange={v => setSvcForm(p => ({ ...p, content: v }))}
                  placeholder="대화 흐름을 기록하세요" rows={8}
                  style={{ ...S.inputField, display: 'block', width: '100%', resize: 'vertical', lineHeight: 1.9 }} />
              </div>
              {/* 선호도 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setSvcForm(p => ({ ...p, rating: p.rating === n ? 0 : n }))} style={{
                      width: 36, height: 36, borderRadius: 8, border: '1px solid ' + (n <= svcForm.rating ? 'var(--accent)' : 'var(--bd)'),
                      background: n <= svcForm.rating ? '#1D9E7518' : 'var(--bg-card)', color: n <= svcForm.rating ? 'var(--accent)' : 'var(--c-dim)',
                      fontSize: '0.786rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{n}</button>
                  ))}
                </div>
                {svcForm.rating > 0 && <span style={{ fontSize: '0.714rem', color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(svcForm.rating)}{'☆'.repeat(5 - svcForm.rating)}</span>}
                <div style={{ flex: 1 }} />
                <button onClick={() => setSvcForm(p => ({ ...p, favorite: !p.favorite }))} style={{
                  padding: '4px 12px', borderRadius: 8, border: '1px solid ' + (svcForm.favorite ? 'var(--accent-gold)' : 'var(--bd)'),
                  background: svcForm.favorite ? '#F5A62318' : 'var(--bg-card)', color: svcForm.favorite ? 'var(--accent-gold)' : 'var(--c-dim)',
                  fontSize: '0.857rem', cursor: 'pointer', fontWeight: 700,
                }}>{svcForm.favorite ? '★' : '☆'}</button>
              </div>
              <button onClick={() => saveTab(svcForm, '봉사 모임', setSvcForm, svcFormDefault)} disabled={saving || !svcForm.content.trim()} style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
                fontSize: '1.0rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
              }}>{saving ? '저장 중...' : '저장'}</button>
              {saveMsg && <div style={{ marginTop: 8, fontSize: '0.857rem', textAlign: 'center', color: saveMsg.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{saveMsg}</div>}
          </>)}

          {/* 방문 입력 */}
          {structureMode === 'visit_input' && (<>

              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>대상</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {(cats.visit_targets || []).map(t => (
                  <button key={t} onClick={() => setVisitForm(p => ({ ...p, visit_target: t, source: '방문', entry_type: 'expression' }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (visitForm.visit_target === t ? 'var(--accent-orange)' : 'var(--bd)'),
                    background: visitForm.visit_target === t ? '#D85A3010' : 'var(--bg-card)', color: visitForm.visit_target === t ? 'var(--accent-orange)' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{catEditing === 'visit_targets' && <span onClick={e => { e.stopPropagation(); const next = cats.visit_targets.filter(x => x !== t); setCats(p => ({ ...p, visit_targets: next })); saveCategories({ ...cats, visit_targets: next }); if (visitForm.visit_target === t) setVisitForm(p => ({ ...p, visit_target: '' })); }} style={{ color: 'var(--c-danger)', marginRight: 2, fontSize: '0.643rem' }}>✕</span>}{t}</button>
                ))}
                {catEditing === 'visit_targets' ? (
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <input value={catNewVal} onChange={e => setCatNewVal(e.target.value)} placeholder="추가" style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.786rem', width: 60, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && catNewVal.trim()) { const next = [...cats.visit_targets, catNewVal.trim()]; setCats(p => ({ ...p, visit_targets: next })); saveCategories({ ...cats, visit_targets: next }); setCatNewVal(''); }}} />
                    <button onClick={() => { if (catNewVal.trim()) { const key = catEditing; const next = [...(cats[key] || []), catNewVal.trim()]; setCats(p => ({ ...p, [key]: next })); saveCategories({ ...cats, [key]: next }); setCatNewVal(''); } setCatEditing(null); setCatNewVal(''); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>완료</button>
                  </div>
                ) : (
                  <button onClick={() => setCatEditing('visit_targets')} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+ 편집</button>
                )}
              </div>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>고려한 상황</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {(cats.visit_situations || []).map(t => (
                  <button key={t} onClick={() => setVisitForm(p => ({ ...p, situation: p.situation === t ? '' : t }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (visitForm.situation === t ? 'var(--accent-orange)' : 'var(--bd)'),
                    background: visitForm.situation === t ? '#D85A3010' : 'var(--bg-card)', color: visitForm.situation === t ? 'var(--accent-orange)' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                  }}>{catEditing === 'visit_situations' && <span onClick={e => { e.stopPropagation(); const next = cats.visit_situations.filter(x => x !== t); setCats(p => ({ ...p, visit_situations: next })); saveCategories({ ...cats, visit_situations: next }); if (visitForm.situation === t) setVisitForm(p => ({ ...p, situation: '' })); }} style={{ color: 'var(--c-danger)', marginRight: 2, fontSize: '0.643rem' }}>✕</span>}{t}</button>
                ))}
                {catEditing === 'visit_situations' ? (
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    <input value={catNewVal} onChange={e => setCatNewVal(e.target.value)} placeholder="추가" style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.786rem', width: 60, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && catNewVal.trim()) { const next = [...cats.visit_situations, catNewVal.trim()]; setCats(p => ({ ...p, visit_situations: next })); saveCategories({ ...cats, visit_situations: next }); setCatNewVal(''); }}} />
                    <button onClick={() => { if (catNewVal.trim()) { const key = catEditing; const next = [...(cats[key] || []), catNewVal.trim()]; setCats(p => ({ ...p, [key]: next })); saveCategories({ ...cats, [key]: next }); setCatNewVal(''); } setCatEditing(null); setCatNewVal(''); }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>완료</button>
                  </div>
                ) : (
                  <button onClick={() => setCatEditing('visit_situations')} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+ 편집</button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>방문자</div>
                  <input value={visitForm.speaker || ''} onChange={e => setVisitForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                  <input value={visitForm.date} onChange={e => setVisitForm(p => ({ ...p, date: e.target.value }))} placeholder="2604" style={{ ...S.inputField, width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>키워드</div>
                  <input value={visitForm.keywords} onChange={e => setVisitForm(p => ({ ...p, keywords: e.target.value }))} placeholder="키워드" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>성구</div>
                  <input value={visitForm.scriptures} onChange={e => setVisitForm(p => ({ ...p, scriptures: e.target.value }))} placeholder="성구" style={{ ...S.inputField, width: '100%' }} />
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>출판물</div>
                <input value={visitForm.pub_code} onChange={e => setVisitForm(p => ({ ...p, pub_code: e.target.value }))} placeholder="「파26.2」" style={{ ...S.inputField, width: '100%' }} />
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>내용 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
                <KoreanTextarea value={visitForm.content} onChange={v => setVisitForm(p => ({ ...p, content: v }))}
                  placeholder="대화 흐름을 기록하세요" rows={8}
                  style={{ ...S.inputField, display: 'block', width: '100%', resize: 'vertical', lineHeight: 1.9 }} />
              </div>
              {/* 선호도 */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8, padding: '6px 0' }}>
                <div style={{ display: 'flex', gap: 3 }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} onClick={() => setVisitForm(p => ({ ...p, rating: p.rating === n ? 0 : n }))} style={{
                      width: 36, height: 36, borderRadius: 8, border: '1px solid ' + (n <= visitForm.rating ? 'var(--accent-orange)' : 'var(--bd)'),
                      background: n <= visitForm.rating ? '#D85A3018' : 'var(--bg-card)', color: n <= visitForm.rating ? 'var(--accent-orange)' : 'var(--c-dim)',
                      fontSize: '0.786rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{n}</button>
                  ))}
                </div>
                {visitForm.rating > 0 && <span style={{ fontSize: '0.714rem', color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(visitForm.rating)}{'☆'.repeat(5 - visitForm.rating)}</span>}
                <div style={{ flex: 1 }} />
                <button onClick={() => setVisitForm(p => ({ ...p, favorite: !p.favorite }))} style={{
                  padding: '4px 12px', borderRadius: 8, border: '1px solid ' + (visitForm.favorite ? 'var(--accent-gold)' : 'var(--bd)'),
                  background: visitForm.favorite ? '#F5A62318' : 'var(--bg-card)', color: visitForm.favorite ? 'var(--accent-gold)' : 'var(--c-dim)',
                  fontSize: '0.857rem', cursor: 'pointer', fontWeight: 700,
                }}>{visitForm.favorite ? '★' : '☆'}</button>
              </div>
              <button onClick={() => saveTab(visitForm, '방문', setVisitForm, visitFormDefault)} disabled={saving || !visitForm.content.trim()} style={{
                width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--bd-medium)' : 'var(--accent-orange)', color: '#fff',
                fontSize: '1.0rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
              }}>{saving ? '저장 중...' : '저장'}</button>
              {saveMsg && <div style={{ marginTop: 8, fontSize: '0.857rem', textAlign: 'center', color: saveMsg.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{saveMsg}</div>}
          </>)}
  </>);
}
