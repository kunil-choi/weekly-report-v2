/* ── Google Apps Script (서버 측) ── */

function doGet(e) {
  var action = (e.parameter.action || 'all').toLowerCase();
  var result = {};

  if (action === 'all' || action === 'schedule') {
    result.schedule = getScheduleFromDoc();
  }
  if (action === 'all' || action === 'youtube') {
    result.youtube = getYouTubeData();
  }
  if (action === 'all' || action === 'docnotes') {
    result.docnotes = getDocNotes();
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Google Docs에서 일정 파싱 */
function getScheduleFromDoc() {
  var docId = '1bgzLVIuVQUK9TDgY5pAzR_XcQzWKEsQaDS8f9CDDlZ8';
  var doc = DocumentApp.openById(docId);
  var tables = doc.getBody().getTables();
  var rows = [];

  // 첫 번째 큰 테이블 (일정 테이블) 찾기
  for (var t = 0; t < tables.length; t++) {
    var table = tables[t];
    if (table.getNumRows() < 5) continue; // 작은 테이블 스킵

    for (var r = 1; r < table.getNumRows(); r++) {
      var row = table.getRow(r);
      if (row.getNumCells() < 7) continue;

      var dateStr = row.getCell(0).getText().trim();
      // 날짜 패턴 확인
      var dm = dateStr.match(/(\d{1,2})월\s*(\d{1,2})일\s*\(([월화수목금토일])\)/);
      if (!dm) continue;

      var month = parseInt(dm[1]);
      var day = parseInt(dm[2]);
      var dayOfWeek = dm[3];

      var recordTime = row.getCell(1).getText().trim();
      var performer = row.getCell(2).getText().trim();
      var producer = row.getCell(3).getText().trim();
      var editor = row.getCell(4).getText().trim();
      var uploadItem = row.getCell(5).getText().trim();
      var note = row.getNumCells() > 7 ? row.getCell(7).getText().trim() : '';

      // 녹화 일정 조합
      var studioRecord = buildRecord(recordTime, performer);

      rows.push({
        date: '2026-' + pad(month) + '-' + pad(day),
        dateStr: month + '/' + day + '(' + dayOfWeek + ')',
        month: month,
        day: day,
        recordTime: recordTime,
        performer: performer,
        producer: producer,
        editor: editor,
        uploadItem: uploadItem,
        note: note,
        studioRecord: studioRecord
      });
    }
  }
  return rows;
}

function buildRecord(timeStr, perfStr) {
  if (!timeStr && !perfStr) return '-';
  var times = timeStr.split(/\n/).map(function(s){return s.trim();}).filter(Boolean);
  var perfs = perfStr.split(/\n/).map(function(s){return s.trim();}).filter(Boolean);
  var pairs = [];
  var max = Math.max(times.length, perfs.length);
  for (var i = 0; i < max; i++) {
    var t = times[i] || '';
    var p = perfs[i] || '';
    if (t && p) pairs.push(t + ' ' + p);
    else if (t) pairs.push(t);
    else if (p) pairs.push(p);
  }
  return pairs.join(', ') || '-';
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

/* 팀원 특이사항 */
function getDocNotes() {
  var docId = '1bgzLVIuVQUK9TDgY5pAzR_XcQzWKEsQaDS8f9CDDlZ8';
  var doc = DocumentApp.openById(docId);
  var text = doc.getBody().getText();

  var yangNote = '', choiNote = '';
  var mYang = text.match(/\*\s*양영은\s*[:：]\s*(.+)/);
  if (mYang) yangNote = mYang[1].trim();
  var mChoi = text.match(/\*\s*최건일\s*[:：]\s*(.+)/);
  if (mChoi) choiNote = mChoi[1].trim();

  return { yangNote: yangNote, choiNote: choiNote };
}

/* 유튜브 데이터 (기존 함수 유지) */
function getYouTubeData() {
  // 기존 유튜브 데이터 수집 코드 그대로 유지
  // ...
}
