/* ── js/gas.js  v4 ─────────────────────────────────────────── */
/* GAS 프록시를 통해 일정/유튜브/팀원특이사항 데이터 수집          */
/* CORS 문제 해결: Google Docs 직접 fetch 대신 GAS doGet 사용    */

/* ══════════════════════════════════════════════════════════════
   팀원 특이사항 가져오기 (GAS 프록시)
   ══════════════════════════════════════════════════════════════ */
function fetchDocNotes(){
  if(!GAS_URL){
    console.warn('[GAS] GAS_URL not set, skipping docnotes');
    return;
  }
  log('팀원 특이사항 불러오는 중…');

  fetch(GAS_URL + '?action=docnotes')
    .then(function(r){ return r.json(); })
    .then(function(data){
      console.log('[GAS] docnotes raw:', data);
      // GAS가 {docnotes: {yangNote, choiNote}} 또는 {yangNote, choiNote} 형태 모두 처리
      var notes = data.docnotes || data;
      if(notes.yangNote){
        setV('noteY', notes.yangNote);
        console.log('[GAS] yangNote set:', notes.yangNote);
      }
      if(notes.choiNote){
        setV('noteC', notes.choiNote);
        console.log('[GAS] choiNote set:', notes.choiNote);
      }
      toast('팀원 특이사항 로드 완료');
    })
    .catch(function(e){
      console.error('[GAS] docnotes error:', e);
      toast('팀원 특이사항 로드 실패');
    });
}

/* ══════════════════════════════════════════════════════════════
   Step 2: 일정 + 유튜브 + 팀원메모 통합 로드
   ══════════════════════════════════════════════════════════════ */
function loadAndRenderS2(){
  if(!GAS_URL){
    console.warn('[GAS] GAS_URL not set');
    log('GAS_URL이 설정되지 않았습니다.');
    hideLoading();
    renderS2();
    return;
  }

  log('데이터 수집 중…');
  showLoading();

  /* GAS에 action=all 요청 → schedule + youtube + docnotes 한번에 수신 */
  fetch(GAS_URL + '?action=all')
    .then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(data){
      console.log('[GAS] all data received, keys:', Object.keys(data));

      /* ── 일정 데이터 처리 ── */
      var allRows = data.schedule || [];
      console.log('[GAS] schedule rows:', allRows.length);

      // 날짜 문자열을 Date로 변환하여 필터링
      S.lastSch = allRows.filter(function(r){
        var d = parseRowDate(r);
        return d && d >= S.lastStart && d <= S.lastEnd;
      });
      S.thisSch = allRows.filter(function(r){
        var d = parseRowDate(r);
        return d && d >= S.thisStart && d <= S.thisEnd;
      });
      console.log('[S2] lastSch:', S.lastSch.length, 'thisSch:', S.thisSch.length);

      /* ── 유튜브 데이터 처리 ── */
      var ytList = data.youtube || [];
      console.log('[GAS] youtube items:', ytList.length);

      S.ytData = ytList.filter(function(v){
        var d = new Date(v.publishedAt);
        return d >= S.lastStart && d <= S.lastEnd;
      });
      console.log('[S2] ytData (last week):', S.ytData.length);

      /* ── 팀원 특이사항 미리 저장 ── */
      if(data.docnotes){
        if(data.docnotes.yangNote) S._yangNote = data.docnotes.yangNote;
        if(data.docnotes.choiNote) S._choiNote = data.docnotes.choiNote;
        console.log('[GAS] docnotes cached:', data.docnotes);
      }

      hideLoading();
      renderS2();
      toast('데이터 로드 완료');
    })
    .catch(function(e){
      console.error('[GAS] loadAndRenderS2 error:', e);
      hideLoading();
      log('데이터 로드 실패: ' + e.message);
      toast('데이터 로드 실패: ' + e.message);

      // 실패해도 빈 상태로 렌더링하여 화면이 멈추지 않도록
      renderS2();
    });
}

/* ══════════════════════════════════════════════════════════════
   날짜 파싱 헬퍼
   ══════════════════════════════════════════════════════════════ */
function parseRowDate(row){
  // GAS에서 "2026-04-07" 또는 "4/7(화)" 형태 모두 처리
  if(row.date){
    var d = new Date(row.date);
    if(!isNaN(d.getTime())) return d;
  }
  if(row.dateStr){
    // "4/7(화)" → month=4, day=7
    var m = row.dateStr.match(/(\d{1,2})\/(\d{1,2})/);
    if(m){
      return new Date(2026, parseInt(m[1])-1, parseInt(m[2]));
    }
  }
  if(row.month && row.day){
    return new Date(2026, row.month-1, row.day);
  }
  return null;
}

/* ══════════════════════════════════════════════════════════════
   로딩 UI 토글
   ══════════════════════════════════════════════════════════════ */
function showLoading(){
  var el = document.getElementById('s2Loading');
  if(el) el.style.display = 'block';
  var content = document.getElementById('s2Content');
  if(content) content.style.display = 'none';
}

function hideLoading(){
  var el = document.getElementById('s2Loading');
  if(el) el.style.display = 'none';
  var content = document.getElementById('s2Content');
  if(content) content.style.display = 'block';
}

/* ══════════════════════════════════════════════════════════════
   renderS2: 화면에 일정/유튜브 테이블 그리기
   ══════════════════════════════════════════════════════════════ */
function renderS2(){

  /* ── 지난주 업로드 영상(유튜브) ── */
  var ytHtml = '';
  if(S.ytData && S.ytData.length > 0){
    ytHtml = '<table><tr><th>날짜</th><th>제목</th><th>조회수</th></tr>';
    S.ytData.forEach(function(v){
      var d = new Date(v.publishedAt);
      ytHtml += '<tr>';
      ytHtml += '<td>' + fmtDateLabel(d) + '</td>';
      ytHtml += '<td style="text-align:left;">' + (v.title||'') + '</td>';
      ytHtml += '<td>' + (v.viewCount||0).toLocaleString() + '</td>';
      ytHtml += '</tr>';
    });
    ytHtml += '</table>';
  } else {
    ytHtml = '<p style="color:#778899; font-size:13px;">유튜브 데이터가 없습니다.</p>';
  }
  var ytEl = document.getElementById('ytList');
  if(ytEl) ytEl.innerHTML = ytHtml;

  /* ── 지난주 일정: 날짜 | 녹화 | 특이사항 (업로드 열 제외) ── */
  var lastHtml = '<table><tr><th>날짜</th><th>스튜디오 녹화 일정</th><th>특이사항</th></tr>';
  var lastDays = [];
  try { lastDays = getDaysInRange(S.lastStart, S.lastEnd); } catch(e){ console.warn('getDaysInRange error:', e); }

  lastDays.forEach(function(day){
    var dayLabel = fmtDateLabel(day);

    // GAS에서 가져온 일정
    var sch = findScheduleForDay(S.lastSch, day);
    var record = '-', note = '-';
    if(sch){
      record = sch.studioRecord || '-';
      note = sch.note || '-';
      // 빈 문자열 처리
      if(!record || record.trim() === '') record = '-';
      if(!note || note.trim() === '') note = '-';
    }

    // docx에서 파싱한 데이터 우선 적용
    var prev = findScheduleForDay(S._prevSchedule, day);
    if(prev){
      if(prev.record && prev.record !== '-' && prev.record.trim() !== '') record = prev.record;
      if(prev.note && prev.note !== '-' && prev.note.trim() !== '') note = prev.note;
    }

    lastHtml += '<tr><td>' + dayLabel + '</td><td>' + record + '</td><td>' + note + '</td></tr>';
  });
  lastHtml += '</table>';

  var schLastEl = document.getElementById('schLast');
  if(schLastEl) schLastEl.innerHTML = lastHtml;

  /* ── 이번주 일정: 날짜 | 업로드 | 녹화 | 특이사항 ── */
  /* 같은 날 여러 일정 → "시간 내용, 시간 내용" 형식으로 합침 */
  var thisHtml = '<table><tr><th>날짜</th><th>업로드 및 예정 아이템</th><th>스튜디오 녹화 일정</th><th>특이사항</th></tr>';
  var thisDays = [];
  try { thisDays = getDaysInRange(S.thisStart, S.thisEnd); } catch(e){ console.warn('getDaysInRange error:', e); }

  thisDays.forEach(function(day){
    var dayLabel = fmtDateLabel(day);
    var dayItems = findAllScheduleForDay(S.thisSch, day);

    var uploads = [], records = [], notes = [];

    dayItems.forEach(function(item){
      // 업로드 아이템
      if(item.uploadItem && item.uploadItem !== '-' && item.uploadItem.trim() !== ''){
        uploads.push(item.uploadItem.trim());
      }
      // 녹화 일정 (이미 "09:00 성상현, 14:00 보험협회" 형태로 조합됨)
      var rec = item.studioRecord || '';
      if(rec && rec !== '-' && rec.trim() !== ''){
        records.push(rec.trim());
      }
      // 특이사항
      if(item.note && item.note !== '-' && item.note.trim() !== ''){
        notes.push(item.note.trim());
      }
    });

    thisHtml += '<tr>';
    thisHtml += '<td>' + dayLabel + '</td>';
    thisHtml += '<td>' + (uploads.join(', ') || '-') + '</td>';
    thisHtml += '<td>' + (records.join(', ') || '-') + '</td>';
    thisHtml += '<td>' + (notes.join(', ') || '-') + '</td>';
    thisHtml += '</tr>';
  });
  thisHtml += '</table>';

  var schThisEl = document.getElementById('schThis');
  if(schThisEl) schThisEl.innerHTML = thisHtml;
}

/* ══════════════════════════════════════════════════════════════
   일정 검색 헬퍼
   ══════════════════════════════════════════════════════════════ */

/* 특정 날짜의 첫 번째 일정 찾기 */
function findScheduleForDay(schArr, day){
  if(!schArr || !schArr.length) return null;
  for(var i = 0; i < schArr.length; i++){
    var d = parseRowDate(schArr[i]);
    if(d && sameDay(d, day)) return schArr[i];
  }
  return null;
}

/* 특정 날짜의 모든 일정 찾기 */
function findAllScheduleForDay(schArr, day){
  if(!schArr || !schArr.length) return [];
  var result = [];
  for(var i = 0; i < schArr.length; i++){
    var d = parseRowDate(schArr[i]);
    if(d && sameDay(d, day)) result.push(schArr[i]);
  }
  return result;
}
