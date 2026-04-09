/* ===== 전역 변수 ===== */
var GAS_URL='https://script.google.com/macros/s/AKfycbwmtjpbT8g9dwr2FFIUyAvaRhCH9quBB_pFAiSYfoQXlfWwW8Qs32VXjIzf9itZgmkXgA/exec';
var S={baseDate:null,lws:null,lwe:null,tws:null,twe:null,lastSch:[],thisSch:[],yt:[],ch:{},ch2:{},ct:{},ct2:{},subs:'',nY:'',nC:'',prevWeekNum:0,prevMonth:0,prevYear:0};
var DK=['일','월','화','수','목','금','토'];

/* ===== 유틸리티 ===== */
function toast(m,t){t=t||'info';var c=document.getElementById('toast-container'),d=document.createElement('div');d.className='toast '+t;d.textContent=m;c.appendChild(d);setTimeout(function(){d.remove()},4000)}
function fmt(d){return(d.getMonth()+1)+'/'+d.getDate()+'('+DK[d.getDay()]+')'}
function fmtShort(d){return(d.getMonth()+1)+'/'+d.getDate()}
function V(id){var el=document.getElementById(id);return el?el.value:''}
function setV(id,val){var el=document.getElementById(id);if(el)el.value=val||''}
function commaNum(n){return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}
function clean(s){return(s||'').replace(/\\r/g,' ').replace(/\r/g,' ').replace(/\n/g,' ').replace(/\s+/g,' ').trim()}
function addLog(m,c){c=c||'';var b=document.getElementById('s2log');if(!b)return;var p=document.createElement('div');p.className=c;p.textContent='> '+m;b.appendChild(p);b.scrollTop=b.scrollHeight}

function cleanValue(val, fieldId){
  var v = (val||'').trim();
  v = v.replace(/^[₩￦\\Ww]+/, '').trim();
  v = v.replace(/[↓↑→←▼▲△▽]/g, '').trim();
  if(fieldId === 'ch_subs'){
    if(!/^[+\-]/.test(v) && /\d/.test(v)) v = '+' + v;
  }
  return v;
}

/* ===== 날짜 함수 ===== */
function calcDates(base){var d=new Date(base);d.setHours(0,0,0,0);var day=d.getDay();if(day!==2){var diff=(day+7-2)%7;d.setDate(d.getDate()-diff)}S.baseDate=new Date(d);S.tws=new Date(d);S.lws=new Date(d);S.lws.setDate(d.getDate()-7);S.lwe=new Date(d);S.lwe.setDate(d.getDate()-1);S.twe=new Date(d);S.twe.setDate(d.getDate()+6)}
function inRange(date,s,e){var t=new Date(date);t.setHours(0,0,0,0);var a=new Date(s);a.setHours(0,0,0,0);var b=new Date(e);b.setHours(0,0,0,0);return t>=a&&t<=b}
function sameDay(a,b){return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate()}
function daysIn(s,e){var r=[],d=new Date(s);while(d<=e){r.push(new Date(d));d.setDate(d.getDate()+1)}return r}
function weekOfMonth(d){return Math.ceil(d.getDate()/7)}

/* ===== 네비게이션 ===== */
function go(n){var ps=document.querySelectorAll('.panel');for(var i=0;i<ps.length;i++)ps[i].classList.remove('active');document.getElementById('step'+n).classList.add('active');var inds=document.querySelectorAll('.step-ind');for(var i=0;i<inds.length;i++){var s=parseInt(inds[i].getAttribute('data-s'));inds[i].classList.remove('active','done');if(s<n)inds[i].classList.add('done');if(s===n)inds[i].classList.add('active')}window.scrollTo({top:0,behavior:'smooth'})}

/* ===== Save 함수 ===== */
function saveS3(){
  S.ch={views:V('ch_views'),subs:V('ch_subs'),rev:V('ch_rev'),cpm:V('ch_cpm'),rpm:V('ch_rpm'),ctr:V('ch_ctr'),avg:V('ch_avg')};
  S.ch2={views:V('ch2_views'),subs:V('ch2_subs'),rev:V('ch2_rev'),cpm:V('ch2_cpm'),rpm:V('ch2_rpm'),ctr:V('ch2_ctr'),avg:V('ch2_avg')};
  toast('채널 현황 저장됨','success');
}
function saveS4(){
  S.ct={vv:V('ct_vv'),vw:V('ct_vw'),sv:V('ct_sv'),sw:V('ct_sw')};
  S.ct2={vv:V('ct2_vv'),vw:V('ct2_vw'),sv:V('ct2_sv'),sw:V('ct2_sw')};
  toast('콘텐츠 유형 저장됨','success');
}
function saveS5(){S.subs=V('curSubs');S.nY=V('noteY');S.nC=V('noteC');toast('저장됨','success')}

/* ===== 초기화 ===== */
document.getElementById('curSubs').addEventListener('input',function(e){
  var v=e.target.value.replace(/[^0-9]/g,'');
  if(v)e.target.value=commaNum(v);else e.target.value='';
});
document.getElementById('todayL').textContent=(function(){var d=new Date();return(d.getMonth()+1)+'/'+d.getDate()+' '+DK[d.getDay()]+'요일'})();

/* ===== 시작 버튼 ===== */
document.getElementById('btnStart').addEventListener('click',function(){
  var mv=document.getElementById('manDate').value;
  var base=mv?new Date(mv+'T00:00:00'):new Date();
  calcDates(base);
  var dd=document.getElementById('dateDisp');dd.classList.remove('hidden');
  dd.innerHTML='<span class="date-badge"><b>지난주:</b> '+fmt(S.lws)+' ~ '+fmt(S.lwe)+'</span><span class="date-badge"><b>이번주:</b> '+fmt(S.tws)+' ~ '+fmt(S.twe)+'</span>';
  setTimeout(function(){go(2);runStep2()},500);
});
