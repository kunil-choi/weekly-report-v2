/* ── js/ocr.js  v6 ─────────────────────────────────────────── */

/* ── OCR 실행 ────────────────────────────────────────────── */
function runOCR(img, statusEl, cb){
  if(statusEl) statusEl.textContent='OCR 처리 중…';
  Tesseract.recognize(img,'kor+eng',{logger:function(m){
    if(statusEl && m.status) statusEl.textContent=m.status+' '+(m.progress*100|0)+'%';
  }}).then(function(r){
    if(statusEl) statusEl.textContent='OCR 완료';
    cb(r.data.text);
  }).catch(function(e){
    if(statusEl) statusEl.textContent='OCR 오류: '+e.message;
    console.error('OCR error',e);
  });
}

/* ── 채널현황 파서 (v5 — 정상 작동 확인) ─────────────────── */
function parseChannelOCR(text){
  console.log('[CH-OCR] raw:\n'+text);
  var lines=text.split(/\n/).map(function(l){return l.trim();}).filter(Boolean);
  var all=lines.join(' ');

  /* 1) 평균 시청 시간 H:MM */
  var avg=''; var mAvg=all.match(/(\d{1,2}:\d{2})/);
  if(mAvg) avg=mAvg[1];

  /* 2) 클릭률 N.N% */
  var ctr=''; var mCtr=all.match(/([\d.]+)\s*%/);
  if(mCtr) ctr=mCtr[1]+'%';

  /* 3) 통화값 ₩ */
  var currPat=/[₩￦W＼]\s*([\d,]+(?:\.\d+)?)/g;
  var cm, currNums=[];
  var currVals={};                       // 통화로 잡힌 숫자값 맵
  while((cm=currPat.exec(all))){
    var cv=parseFloat(cm[1].replace(/,/g,''));
    currNums.push(cv);
    currVals[cv]=true;
  }
  currNums.sort(function(a,b){return b-a;});
  var rev = currNums[0]||'';
  var cpm = currNums[1]||'';
  var rpm = currNums[2]||'';
  console.log('[CH-OCR] currency nums:', currNums);

  /* 4) 일반 숫자 (통화 제외) */
  var noTime=all.replace(/\d{1,2}:\d{2}/g,'__');
  var noPct=noTime.replace(/([\d.]+)\s*%/g,'__');
  var noCurr=noPct.replace(/[₩￦W＼]\s*[\d,]+(?:\.\d+)?/g,'__');
  var numPat=/([\d,]{2,})/g;
  var nm, plainNums=[];
  while((nm=numPat.exec(noCurr))){
    var pv=parseFloat(nm[1].replace(/,/g,''));
    if(pv>0 && !currVals[pv]) plainNums.push(pv);
  }
  plainNums.sort(function(a,b){return b-a;});
  var views=plainNums[0]||'';
  var subs =plainNums[1]||'';
  console.log('[CH-OCR] plain nums:', plainNums);

  /* 5) 값 세팅 */
  function fmt(n){return n?Number(n).toLocaleString():'';}
  setV('ch_views',fmt(views));
  setV('ch_subs', subs?('+'+fmt(subs)):'');
  setV('ch_rev',  fmt(rev));
  setV('ch_cpm',  fmt(cpm));
  setV('ch_rpm',  fmt(rpm));
  setV('ch_ctr',  ctr);
  setV('ch_avg',  avg);

  if(!avg){ fallbackFill(all); }
}

function cleanChannelValue(v,field){
  v=v.replace(/[₩￦W＼]/g,'').replace(/[\s]/g,'').replace(/^[+\-]?0+(?=\d)/,'');
  if(field==='ch_subs' && !/^[+\-]/.test(v)) v='+'+v;
  if(field==='ch_ctr' && v && !/%/.test(v)) v=v+'%';
  return v;
}

function fallbackFill(all){
  if(!getV('ch_avg')){
    var m=all.match(/(\d{1,2}:\d{2})/);
    if(m) setV('ch_avg',m[1]);
  }
}

/* ── 숫자 포맷 (만 단위 + 퍼센트) ───────────────────────── */
function formatManPct(numStr,pctStr){
  var n=parseFloat(String(numStr).replace(/,/g,''));
  if(isNaN(n)) return String(numStr)+(pctStr?'('+pctStr+')':'');
  var display;
  if(n>=10000){
    var man=n/10000;
    display=(man%1===0?man.toFixed(0):man.toFixed(1))+'만';
  } else {
    display=n.toLocaleString();
  }
  return pctStr ? display+'('+pctStr+')' : display;
}

/* ── 콘텐츠 유형 파서 (v3 — 완전 재작성) ────────────────── */
function parseContentOCR(text){
  console.log('[CT-OCR] raw:\n'+text);

  var lines=text.split(/\n/).map(function(l){return l.trim();}).filter(Boolean);
  var all=lines.join(' ');

  /* ── 행 감지: 동영상 / Shorts 키워드가 포함된 줄 찾기 ── */
  var videoLine='', shortsLine='';
  for(var i=0;i<lines.length;i++){
    var lo=lines[i].toLowerCase();
    if(!videoLine && (/동영상/.test(lines[i]) || /video/i.test(lines[i]))){
      // 다음 줄이 숫자로 시작하면 합치기
      videoLine=lines[i];
      if(i+1<lines.length && /^\d/.test(lines[i+1].replace(/[^\d]/,''))){
        videoLine+=' '+lines[i+1];
      }
    }
    if(!shortsLine && (/shorts/i.test(lo) || /쇼츠/.test(lines[i]))){
      shortsLine=lines[i];
      if(i+1<lines.length && /^\d/.test(lines[i+1].replace(/[^\d]/,''))){
        shortsLine+=' '+lines[i+1];
      }
    }
  }
  console.log('[CT-OCR] videoLine:', videoLine);
  console.log('[CT-OCR] shortsLine:', shortsLine);

  /* ── 행에서 숫자 + 퍼센트 추출 ── */
  function extractRow(line){
    if(!line) return {n1:'',p1:'',n2:'',p2:''};

    // 키워드 제거
    var data=line.replace(/^.*?(동영상|[Ss]horts|쇼츠|[Vv]ideo)\s*/,'');

    // 시간 형식(H:MM:SS 등) 제거 — 숫자로 오인 방지
    data=data.replace(/\d{1,2}:\d{2}(:\d{2})?/g,' ');

    // 모든 토큰 추출: 숫자 또는 퍼센트
    var tokens=[];
    var re=/([\d,]+\.?\d*)\s*(%)?/g;
    var m;
    while((m=re.exec(data))){
      var val=m[1].replace(/,/g,'');
      var isPct=!!m[2];
      var numVal=parseFloat(val);

      // 1자리 노이즈 제거 (£1, [J 등에서 나온 1)
      if(val.length===1 && numVal<10 && !isPct) continue;

      tokens.push({raw:m[1], num:numVal, pct:isPct});
    }
    console.log('[CT-OCR] tokens:', JSON.stringify(tokens));

    // 숫자와 퍼센트 분리
    var nums=[], pcts=[];
    for(var j=0;j<tokens.length;j++){
      if(tokens[j].pct){
        pcts.push(tokens[j]);
      } else {
        nums.push(tokens[j]);
      }
    }

    // 퍼센트가 숫자에 비해 비정상적으로 크면 보정 (327% → 32.7%)
    function fixPct(p){
      var v=parseFloat(p);
      if(isNaN(v)) return p;
      if(v>100) return (v/10).toFixed(1)+'%';
      return v+'%';
    }

    var n1=nums[0]?nums[0].raw:'';
    var p1=pcts[0]?fixPct(pcts[0].num):'';
    var n2=nums[1]?nums[1].raw:'';
    var p2=pcts[1]?fixPct(pcts[1].num):'';

    return {n1:n1, p1:p1, n2:n2, p2:p2};
  }

  var vr=extractRow(videoLine);
  var sr=extractRow(shortsLine);

  console.log('[CT-OCR] video parsed:', vr);
  console.log('[CT-OCR] shorts parsed:', sr);

  /* ── 퍼센트 교차 보정 ── */
  // 동영상 + Shorts 의 p1 합이 ~100이어야 하고, p2 합도 ~100이어야 함
  function pVal(s){return parseFloat(String(s).replace('%',''))||0;}

  var vp1=pVal(vr.p1), sp1=pVal(sr.p1);
  var vp2=pVal(vr.p2), sp2=pVal(sr.p2);

  // 합이 안 맞으면 빈 쪽을 100-x로 채움
  if(vr.p1 && !sr.p1 && vp1>0) sr.p1=(100-vp1).toFixed(1)+'%';
  if(sr.p1 && !vr.p1 && sp1>0) vr.p1=(100-sp1).toFixed(1)+'%';
  if(vr.p2 && !sr.p2 && vp2>0) sr.p2=(100-vp2).toFixed(1)+'%';
  if(sr.p2 && !vr.p2 && sp2>0) vr.p2=(100-sp2).toFixed(1)+'%';

  /* ── 조회수 vs 시청시간 열 구분 ── */
  // 일반적으로 조회수 > 시청시간(시간 단위), 조회수 열이 먼저 나옴
  var vn1=parseFloat(String(vr.n1).replace(/,/g,''))||0;
  var vn2=parseFloat(String(vr.n2).replace(/,/g,''))||0;

  var viewFirst=true;
  // 두번째 수가 첫번째보다 훨씬 크면 시청시간이 먼저일 수 있음
  if(vn2>0 && vn1>0 && vn2>vn1*10) viewFirst=false;

  var vidView, vidViewP, vidWatch, vidWatchP;
  var shrView, shrViewP, shrWatch, shrWatchP;

  if(viewFirst){
    vidView=vr.n1; vidViewP=vr.p1; vidWatch=vr.n2; vidWatchP=vr.p2;
    shrView=sr.n1; shrViewP=sr.p1; shrWatch=sr.n2; shrWatchP=sr.p2;
  } else {
    vidWatch=vr.n1; vidWatchP=vr.p1; vidView=vr.n2; vidViewP=vr.p2;
    shrWatch=sr.n1; shrWatchP=sr.p1; shrView=sr.n2; shrViewP=sr.p2;
  }

  /* ── UI 세팅 ── */
  setV('ct_vv', formatManPct(vidView, vidViewP));
  setV('ct_vw', formatManPct(vidWatch, vidWatchP));
  setV('ct_sv', formatManPct(shrView, shrViewP));
  setV('ct_sw', formatManPct(shrWatch, shrWatchP));
}

/* ── 이미지 업로드 핸들러 ────────────────────────────────── */
// 채널현황 이미지
var chImgEl=document.getElementById('chImg');
if(chImgEl) chImgEl.addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return;

  // 기존 데이터 초기화
  ['ch_views','ch_subs','ch_rev','ch_cpm','ch_rpm','ch_ctr','ch_avg'].forEach(function(id){setV(id,'');});

  // 이미지 미리보기
  var prev=document.getElementById('chImgP');
  if(prev){ prev.src=URL.createObjectURL(f); prev.style.display='block'; }

  // 상태 초기화
  var st=document.getElementById('chOcrStatus');
  if(st) st.textContent='';

  runOCR(f, st, parseChannelOCR);
});

// 콘텐츠유형 이미지
var ctImgEl=document.getElementById('ctImg');
if(ctImgEl) ctImgEl.addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return;

  // 기존 데이터 초기화
  ['ct_vv','ct_vw','ct_sv','ct_sw','ct2_vv','ct2_vw','ct2_sv','ct2_sw'].forEach(function(id){setV(id,'');});

  // 이미지 미리보기
  var prev=document.getElementById('ctImgP');
  if(prev){ prev.src=URL.createObjectURL(f); prev.style.display='block'; }

  // 상태 초기화
  var st=document.getElementById('ctOcrStatus');
  if(st) st.textContent='';

  runOCR(f, st, parseContentOCR);
});
