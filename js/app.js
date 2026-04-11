/* ── js/app.js  v3 ─────────────────────────────────────────── */

/* ── 전역 설정 ── */
var GAS_URL = ''; // Google Apps Script 웹앱 URL (유튜브 데이터용)

/* ── 상태 객체 ── */
var S = {
  baseDate: null,
  lastStart: null, lastEnd: null,
  thisStart: null, thisEnd: null,
  lastLabel: '', thisLabel: '', prevLabel: '',
  lastSch: [], thisSch: [],
  ytData: [],
  _prevSchedule: [],   // 이전 docx에서 파싱한 녹화/특이사항
  reportTitle: '',
  reportFileName: '',
  ch: {},              // 채널현황 지난주
  ch2: {},             // 채널현황 지지난주
  ct: {},              // 콘텐츠유형 지난주
  ct2: {},             // 콘텐츠유형 지지난주
  curSubs: ''
};

/* ══════════════════════════════════════════════════════════════
   유틸리티 함수
   ══════════════════════════════════════════════════════════════ */

/* 토스트 알림 */
function toast(msg, dur){
  dur = dur || 3000;
  var el = document.getElementById('toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;font-size:14px;transition:opacity .3s;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.display = 'block';
  clearTimeout(el._tid);
  el._tid = setTimeout(function(){
    el.style.opacity = '0';
    setTimeout(function(){ el.style.display = 'none'; }, 300);
  }, dur);
}

/* 로그 (화면 + 콘솔) */
function log(msg){
  console.log('[APP]', msg);
  var el = document.getElementById('logArea');
  if(el) el.textContent = msg;
}

/* 날짜 포맷 */
function fmtDate(d){
  var mm = d.getMonth()+1;
  var dd = d.getDate();
  return mm + '/' + dd;
}

function fmtDateLabel(d){
  var days = ['일','월','화','수','목','금','토'];
  return (d.getMonth()+1) + '/' + d.getDate() + '(' + days[d.getDay()] + ')';
}

function fmtDateShort(d){
  return (d.getMonth()+1) + '/' + d.getDate();
}

/* 입력값 get/set */
function getV(id){
  var el = document.getElementById(id);
  if(!el) return '';
  return (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') ? el.value : el.textContent;
}

function setV(id, val){
  var el = document.getElementById(id);
  if(!el) return;
  if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.value = val;
  else el.textContent = val;
}

/* 숫자 포맷 (쉼표) */
function fmtNum(n){
  if(typeof n === 'string') n = parseFloat(n.replace(/,/g, ''));
  if(isNaN(n)) return '';
  return n.toLocaleString();
}

/* 문자열 정리 */
function clean(s){
  if(!s) return '';
  return String(s).replace(/[\r\n]+/g, ' ').trim();
}

function cleanValue(v){
  if(!v) return '';
  v = String(v).trim();
  // 구독자 변화: +/- 유지
  v = v.replace(/[^\d.,+\-:%만원₩￦]/g, '');
  return v;
}

/* ══════════════════════════════════════════════════════════════
   날짜 유틸리티
   ══════════════════════════════════════════════════════════════ */

/* 기준 날짜로부터 주간 범위 계산 */
function calcWeeks(base){
  // base는 이번 주에 속하는 날짜
  // 이번 주: 이번 주 월요일 ~ 일요일
  // 지난 주: 지난 주 월요일 ~ 일요일
  var d = new Date(base);
  var dow = d.getDay(); // 0=일, 1=월 ...
  if(dow === 0) dow = 7; // 일요일을 7로

  // 이번 주 월요일
  var thisMon = new Date(d);
  thisMon.setDate(d.getDate() - (dow - 1));
  thisMon.setHours(0,0,0,0);

  // 이번 주 일요일
  var thisSun = new Date(thisMon);
  thisSun.setDate(thisMon.getDate() + 6);
  thisSun.setHours(23,59,59,999);

  // 지난 주
  var lastMon = new Date(thisMon);
  lastMon.setDate(thisMon.getDate() - 7);
  var lastSun = new Date(thisMon);
  lastSun.setDate(thisMon.getDate() - 1);
  lastSun.setHours(23,59,59,999);

  // 지지난 주
  var prevMon = new Date(lastMon);
  prevMon.setDate(lastMon.getDate() - 7);
  var prevSun = new Date(lastMon);
  prevSun.setDate(lastMon.getDate() - 1);
  prevSun.setHours(23,59,59,999);

  return {
    thisStart: thisMon, thisEnd: thisSun,
    lastStart: lastMon, lastEnd: lastSun,
    prevStart: prevMon, prevEnd: prevSun
  };
}

/* 날짜 범위 내 모든 날짜 배열 */
function getDaysInRange(start, end){
  var days = [];
  var d = new Date(start);
  d.setHours(0,0,0,0);
  var e = new Date(end);
  e.setHours(23,59,59,999);
  while(d <= e){
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/* 같은 날짜 비교 */
function sameDay(a, b){
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

/* 날짜 범위 라벨 생성 */
function rangeLabel(start, end){
  return fmtDate(start) + '~' + fmtDate(end);
}

/* 월의 몇째 주 계산 */
function weekOfMonth(d){
  var firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
  var dow = firstDay.getDay();
  if(dow === 0) dow = 7;
  return Math.ceil((d.getDate() + dow - 1) / 7);
}

/* ══════════════════════════════════════════════════════════════
   네비게이션 / 패널 전환
   ══════════════════════════════════════════════════════════════ */
function goStep(n){
  // 패널 전환
  document.querySelectorAll('.panel').forEach(function(el){
    el.style.display = 'none';
  });
  var target = document.getElementById('step' + n);
  if(target) target.style.display = 'block';

  // 진행 표시 업데이트
  updateProgress(n);

  // Step별 초기화 액션
  if(n === 2){
    loadAndRenderS2();
  }
  if(n === 5){
    fetchDocNotes();
  }
  if(n === 6){
    buildPreview();
  }
}

function updateProgress(n){
  for(var i = 1; i <= 6; i++){
    var el = document.getElementById('prog' + i);
    if(!el) continue;
    el.classList.remove('active', 'done');
    if(i < n) el.classList.add('done');
    if(i === n) el.classList.add('active');
  }
}

/* 다음/이전 버튼 */
function nextStep(current){
  goStep(current + 1);
}

function prevStep(current){
  goStep(current - 1);
}

/* ══════════════════════════════════════════════════════════════
   Step 3, 4, 5 저장 함수
   ══════════════════════════════════════════════════════════════ */
function saveS3(){
  S.ch = {
    views: getV('ch_views'),
    subs: getV('ch_subs'),
    rev: getV('ch_rev'),
    cpm: getV('ch_cpm'),
    rpm: getV('ch_rpm'),
    ctr: getV('ch_ctr'),
    avg: getV('ch_avg')
  };
  S.ch2 = {
    views: getV('ch2_views'),
    subs: getV('ch2_subs'),
    rev: getV('ch2_rev'),
    cpm: getV('ch2_cpm'),
    rpm: getV('ch2_rpm'),
    ctr: getV('ch2_ctr'),
    avg: getV('ch2_avg')
  };
  toast('채널 현황 저장 완료');
}

function saveS4(){
  S.ct = {
    vv: getV('ct_vv'), vw: getV('ct_vw'),
    sv: getV('ct_sv'), sw: getV('ct_sw')
  };
  S.ct2 = {
    vv: getV('ct2_vv'), vw: getV('ct2_vw'),
    sv: getV('ct2_sv'), sw: getV('ct2_sw')
  };
  toast('콘텐츠 유형 저장 완료');
}

function saveS5(){
  S.curSubs = getV('curSubs');
  toast('구독자/특이사항 저장 완료');
}

/* ══════════════════════════════════════════════════════════════
   구독자 수 입력 시 쉼표 포맷
   ══════════════════════════════════════════════════════════════ */
var subsInput = document.getElementById('curSubs');
if(subsInput){
  subsInput.addEventListener('input', function(){
    var raw = this.value.replace(/[^\d]/g, '');
    if(raw) this.value = parseInt(raw).toLocaleString();
  });
}

/* ══════════════════════════════════════════════════════════════
   Step 1: 시작 버튼
   ══════════════════════════════════════════════════════════════ */
var btnStart = document.getElementById('btnStart');
if(btnStart){
  btnStart.addEventListener('click', function(){
    // 수동 날짜 또는 오늘 날짜
    var manualDate = getV('manualDate');
    var base;
    if(manualDate){
      base = new Date(manualDate);
    } else {
      base = new Date();
    }
    S.baseDate = base;

    // 주간 범위 계산
    var weeks = calcWeeks(base);
    S.lastStart = weeks.lastStart;
    S.lastEnd   = weeks.lastEnd;
    S.thisStart = weeks.thisStart;
    S.thisEnd   = weeks.thisEnd;
    S.prevStart = weeks.prevStart;
    S.prevEnd   = weeks.prevEnd;

    S.lastLabel = rangeLabel(weeks.lastStart, weeks.lastEnd);
    S.thisLabel = rangeLabel(weeks.thisStart, weeks.thisEnd);
    S.prevLabel = rangeLabel(weeks.prevStart, weeks.prevEnd);

    console.log('[START] lastLabel:', S.lastLabel, 'thisLabel:', S.thisLabel, 'prevLabel:', S.prevLabel);

    // 날짜 배지 표시
    var badgeLast = document.getElementById('badgeLast');
    var badgeThis = document.getElementById('badgeThis');
    if(badgeLast) badgeLast.textContent = '지난주: ' + S.lastLabel;
    if(badgeThis) badgeThis.textContent = '이번주: ' + S.thisLabel;

    // 보고서 제목/파일명 생성
    // 업로드된 docx에서 추출한 주차 정보가 있으면 다음 주차로
    if(S._docWeekInfo){
      var info = S._docWeekInfo;
      var nextWeek = info.week + 1;
      var nextMonth = info.month;
      var nextYear = info.year;
      // 5주차 초과 시 다음 달 1주차로
      if(nextWeek > 5){
        nextWeek = 1;
        nextMonth++;
        if(nextMonth > 12){ nextMonth = 1; nextYear++; }
      }
      S.reportTitle = '머니올라 ' + nextYear + '년 ' + nextMonth + '월 ' + nextWeek + '주차 보고';
      S.reportFileName = '머니올라_' + String(nextYear).slice(2) + '년_' + nextMonth + '월_' + nextWeek + '주차_보고.docx';
    } else {
      // 이번 주 기준으로 자동 생성
      var wom = weekOfMonth(weeks.thisStart);
      var m = weeks.thisStart.getMonth() + 1;
      var y = weeks.thisStart.getFullYear();
      S.reportTitle = '머니올라 ' + y + '년 ' + m + '월 ' + wom + '주차 보고';
      S.reportFileName = '머니올라_' + String(y).slice(2) + '년_' + m + '월_' + wom + '주차_보고.docx';
    }

    console.log('[START] title:', S.reportTitle, 'file:', S.reportFileName);
    toast('주간 범위 설정 완료');

    // 다음 단계로
    setTimeout(function(){ goStep(2); }, 500);
  });
}

/* ══════════════════════════════════════════════════════════════
   Step 1: docx 파일 업로드 → docx-parse.js 에서 처리
   (파일 선택 이벤트는 docx-parse.js 에서 바인딩)
   ══════════════════════════════════════════════════════════════ */

/* ── 초기화: Step 1 표시 ── */
goStep(1);
