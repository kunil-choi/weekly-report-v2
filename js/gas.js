/* ── js/gas.js  v3 ─────────────────────────────────────────── */

var DOC_ID = '1bgzLVIuVQUK9TDgY5pAzR_XcQzWKEsQaDS8f9CDDlZ8';
var DOC_TXT_URL = 'https://docs.google.com/document/d/' + DOC_ID + '/export?format=txt';

/* ══════════════════════════════════════════════════════════════
   Google Docs 텍스트에서 팀원 특이사항 파싱
   ══════════════════════════════════════════════════════════════ */
function fetchDocNotes(){
  log('팀원 특이사항 불러오는 중…');
  fetch(DOC_TXT_URL)
    .then(function(r){ return r.text(); })
    .then(function(text){
      console.log('[DOC] fetched text length:', text.length);
      var yangNote = '', choiNote = '';

      // "* 양영은 : 내용" 패턴 매칭
      var mYang = text.match(/\*\s*양영은\s*[:：]\s*(.+)/);
      if(mYang) yangNote = mYang[1].trim();

      var mChoi = text.match(/\*\s*최건일\s*[:：]\s*(.+)/);
      if(mChoi) choiNote = mChoi[1].trim();

      console.log('[DOC] yangNote:', yangNote, 'choiNote:', choiNote);

      if(yangNote) setV('noteY', yangNote);
      if(choiNote) setV('noteC', choiNote);
      toast('팀원 특이사항 로드 완료');
    })
    .catch(function(e){
      console.error('Doc notes fetch error:', e);
      toast('팀원 특이사항 로드 실패: ' + e.message);
    });
}

/* ══════════════════════════════════════════════════════════════
   Google Docs 텍스트에서 일정 데이터 파싱
   ══════════════════════════════════════════════════════════════ */
function fetchDocSchedule(cb){
  log('일정 데이터 불러오는 중…');
  fetch(DOC_TXT_URL)
    .then(function(r){ return r.text(); })
    .then(function(text){
      var rows = parseDocSchedule(text);
      console.log('[DOC] parsed schedule rows:', rows.length);
      if(cb) cb(rows);
    })
    .catch(function(e){
      console.error('Doc schedule fetch error:', e);
      toast('일정 로드 실패: ' + e.message);
      if(cb) cb([]);
    });
}

function parseDocSchedule(text){
  var lines = text.split('\n');
  var rows = [];
  // 날짜 패턴: "1월 1일(목)", "4월 7일(화)" 등
  var datePat = /(\d{1,2})월\s*(\d{1,2})일\s*\(([월화수목금토일])\)/;

  for(var i = 0; i < lines.length; i++){
    var line = lines[i];
    var dm = line.match(datePat);
    if(!dm) continue;

    var month = parseInt(dm[1]);
    var day = parseInt(dm[2]);
    var dayOfWeek = dm[3];

    // 탭으로 분리된 데이터 파싱
    // 형식: 날짜 \t 녹화시간 \t 출연자 \t 제작자 \t 편집자 \t 업로드아이템 \t 리소스 \t 특이사항
    var parts = line.split('\t');

    // 날짜 이후의 데이터 추출
    var recordTime = (parts[1] || '').trim();
    var performer  = (parts[2] || '').trim();
    var producer   = (parts[3] || '').trim();
    var editor     = (parts[4] || '').trim();
    var uploadItem = (parts[5] || '').trim();
    var resource   = (parts[6] || '').trim();
    var note       = (parts[7] || '').trim();

    // 녹화 일정 조합: "시간 출연자" 형식
    var studioRecord = buildStudioRecord(recordTime, performer);

    // 연도 결정 (2026년 기준)
    var year = 2026;
    var dateObj = new Date(year, month - 1, day);

    rows.push({
      date: dateObj.toISOString(),
      dateStr: month + '/' + day + '(' + dayOfWeek + ')',
      month: month,
      day: day,
      dayOfWeek: dayOfWeek,
      recordTime: recordTime,
      performer: performer,
      producer: producer,
      editor: editor,
      uploadItem: uploadItem,
      resource: resource,
      note: note,
      studioRecord: studioRecord,
      studioRecordClean: studioRecord
    });
  }
  return rows;
}

/* ── 녹화 일정 조합: 시간+출연자를 ", "로 연결 ── */
function buildStudioRecord(recordTimeRaw, performerRaw){
  if(!recordTimeRaw && !performerRaw) return '-';
  if(!recordTimeRaw) return performerRaw || '-';
  if(!performerRaw) return recordTimeRaw || '-';

  // \r 또는 \n 으로 분리
  var times = recordTimeRaw.split(/[\r\n]+/).map(function(s){return s.trim();}).filter(Boolean);
  var perfs = performerRaw.split(/[\r\n]+/).map(function(s){return s.trim();}).filter(Boolean);

  var pairs = [];
  var maxLen = Math.max(times.length, perfs.length);
  for(var k = 0; k < maxLen; k++){
    var t = times[k] || '';
    var p = perfs[k] || '';
    if(t && p) pairs.push(t + ' ' + p);
    else if(t) pairs.push(t);
    else if(p) pairs.push(p);
  }

  return pairs.join(', ') || '-';
}

/* ══════════════════════════════════════════════════════════════
   GAS에서 유튜브 데이터 가져오기 (기존 유지)
   ══════════════════════════════════════════════════════════════ */
function fetchYouTubeData(cb){
  if(!GAS_URL){
    console.warn('GAS_URL not set');
    if(cb) cb([]);
    return;
  }
  log('유튜브 데이터 불러오는 중…');
  fetch(GAS_URL + '?action=youtube')
    .then(function(r){ return r.json(); })
    .then(function(data){
      console.log('[GAS] youtube data:', data.length, 'items');
      if(cb) cb(data);
    })
    .catch(function(e){
      console.error('YouTube fetch error:', e);
      if(cb) cb([]);
    });
}

/* ══════════════════════════════════════════════════════════════
   Step 2: 일정 + 유튜브 데이터 렌더링
   ══════════════════════════════════════════════════════════════ */
function loadAndRenderS2(){
  fetchDocSchedule(function(allRows){
    // 지난주/이번주 필터링
    S.lastSch = allRows.filter(function(r){
      var d = new Date(r.date);
      return d >= S.lastStart && d <= S.lastEnd;
    });
    S.thisSch = allRows.filter(function(r){
      var d = new Date(r.date);
      return d >= S.thisStart && d <= S.thisEnd;
    });

    console.log('[S2] lastSch:', S.lastSch.length, 'thisSch:', S.thisSch.length);

    // 유튜브 데이터
    fetchYouTubeData(function(ytList){
      S.ytData = ytList.filter(function(v){
        var d = new Date(v.publishedAt);
        return d >= S.lastStart && d <= S.lastEnd;
      });
      console.log('[S2] ytData (last week):', S.ytData.length);

      renderS2();
      toast('일정 및 유튜브 데이터 로드 완료');
    });
  });
}

function renderS2(){
  /* ── 지난주 업로드 영상(유튜브) ── */
  var ytHtml = '<table><tr><th>날짜</th><th>제목</th><th>조회수</th></tr>';
  (S.ytData||[]).forEach(function(v){
    var d = new Date(v.publishedAt);
    ytHtml += '<tr><td>' + fmtDateLabel(d) + '</td>';
    ytHtml += '<td>' + (v.title||'') + '</td>';
    ytHtml += '<td>' + (v.viewCount||0).toLocaleString() + '</td></tr>';
  });
  ytHtml += '</table>';
  var ytEl = document.getElementById('ytList');
  if(ytEl) ytEl.innerHTML = ytHtml;

  /* ── 지난주 일정: 날짜 | 녹화 | 특이사항 (업로드 열 제외) ── */
  var lastHtml = '<table><tr><th>날짜</th><th>스튜디오 녹화 일정</th><th>특이사항</th></tr>';
  var lastDays = getDaysInRange(S.lastStart, S.lastEnd);

  lastDays.forEach(function(day){
    var dayLabel = fmtDateLabel(day);
    var sch = (S.lastSch||[]).find(function(s){ return sameDay(new Date(s.date), day); });
    var record = '-', note = '-';
    if(sch){
      record = sch.studioRecordClean || sch.studioRecord || '-';
      note = sch.note || '-';
    }
    // 이전 주 보고서 docx에서 파싱한 데이터 우선 사용
    var prev = (S._prevSchedule||[]).find(function(p){ return sameDay(new Date(p.date), day); });
    if(prev){
      if(prev.record && prev.record !== '-') record = prev.record;
      if(prev.note && prev.note !== '-') note = prev.note;
    }
    lastHtml += '<tr><td>' + dayLabel + '</td><td>' + record + '</td><td>' + note + '</td></tr>';
  });
  lastHtml += '</table>';
  var schLastEl = document.getElementById('schLast');
  if(schLastEl) schLastEl.innerHTML = lastHtml;

  /* ── 이번주 일정: 날짜 | 업로드 | 녹화 | 특이사항 ── */
  /* 같은 날 여러 일정 → "시간 내용, 시간 내용" 형식 */
  var thisHtml = '<table><tr><th>날짜</th><th>업로드 및 예정 아이템</th><th>스튜디오 녹화 일정</th><th>특이사항</th></tr>';
  var thisDays = getDaysInRange(S.thisStart, S.thisEnd);

  thisDays.forEach(function(day){
    var dayLabel = fmtDateLabel(day);
    var dayItems = (S.thisSch||[]).filter(function(s){ return sameDay(new Date(s.date), day); });

    var uploads = [], records = [], notes = [];
    dayItems.forEach(function(item){
      if(item.uploadItem && item.uploadItem !== '-' && item.uploadItem !== '') uploads.push(item.uploadItem);
      var rec = item.studioRecordClean || item.studioRecord || '';
      if(rec && rec !== '-') records.push(rec);
      if(item.note && item.note !== '-' && item.note !== '') notes.push(item.note);
    });

    thisHtml += '<tr><td>' + dayLabel + '</td>';
    thisHtml += '<td>' + (uploads.join(', ') || '-') + '</td>';
    thisHtml += '<td>' + (records.join(', ') || '-') + '</td>';
    thisHtml += '<td>' + (notes.join(', ') || '-') + '</td></tr>';
  });
  thisHtml += '</table>';
  var schThisEl = document.getElementById('schThis');
  if(schThisEl) schThisEl.innerHTML = thisHtml;
}
