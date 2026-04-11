/* ── js/ocr.js  v7 ─────────────────────────────────────────── */
/* 채널현황: v5 (정상 작동 확인 버전 그대로 복원)                  */
/* 콘텐츠유형: v3 (완전 재작성)                                   */
/* OCR 디버그 박스: 완전 제거                                     */

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

/* ══════════════════════════════════════════════════════════════
   채널현황 파서 v5 (정상 작동 — 그대로 복원)
   ══════════════════════════════════════════════════════════════ */
function parseChannelOCR(text){
  console.log('[CH-OCR v5] raw:\n'+text);
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
  var currVals={};
  while((cm=currPat.exec(all))){
    var cv=parseFloat(cm[1].replace(/,/g,''));
    currNums.push(cv);
    currVals[cv]=true;
  }
  currNums.sort(function(a,b){return b-a;});
  var rev = currNums[0]||'';
  var cpm = currNums[1]||'';
  var rpm = currNums[2]||'';
  console.log('[CH-OCR v5] currency nums:', currNums);

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
  console.log('[CH-OCR v5] plain nums:', plainNums);

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

/* ══════════════════════════════════════════════════════════════
   콘텐츠 유형별 파서 v3 (완전 재작성)
   ══════════════════════════════════════════════════════════════ */
function parseContentOCR(text){
  console.log('[CT-OCR v3] raw:\n'+text);

  var lines=text.split(/\n/).map(function(l){return l.trim();}).filter(Boolean);

  /* ── 동영상 / Shorts 행 찾기 ── */
  var videoLine='', shortsLine='';
  for(var i=0;i<lines.length;i++){
    var lo=lines[i].toLowerCase();
    if(!videoLine && (/동영상/.test(lines[i]) || /video/i.test(lines[i]))){
      videoLine=lines[i];
      if(i+1<lines.length && /\d/.test(lines[i+1])){
        videoLine+=' '+lines[i+1];
      }
    }
    if(!shortsLine && (/shorts/i.test(lo) || /쇼츠/.test(lines[i]))){
      shortsLine=lines[i];
      if(i+1<lines.length && /\d/.test(lines[i+1])){
        shortsLine+=' '+lines[i+1];
      }
    }
  }
  console.log('[CT-OCR v3] videoLine:', videoLine);
  console.log('[CT-OCR v3] shortsLine:', shortsLine);

  /* ── 행에서 숫자 + 퍼센트 추출 ── */
  function extractRow(line){
    if(!line) return {n1:'',p1:'',n2:'',p2:''};

    // 키워드 제거
    var data=line.replace(/^.*?(동영상|[Ss]horts|쇼츠|[Vv]ideo)\s*/,'');

    // 시간 형식 제거
    data=data.replace(/\d{1,2}:\d{2}(:\d{2})?/g,' ');

    // 모든 토큰 추출
    var tokens=[];
    var re=/([\d,]+\.?\d*)\s*(%)?/g;
    var m;
    while((m=re.exec(data))){
      var val=m[1].replace(/,/g,'');
      var isPct=!!m[2];
      var numVal=parseFloat(val);

      // 1자리 노이즈 제거
      if(val.length===1 && numVal<10 && !isPct) continue;

      tokens.push({raw:m[1], num:numVal, pct:isPct});
    }
    console.log('[CT-OCR v3] tokens:', JSON.stringify(tokens));

    var nums=[], pcts=[];
    for(var j=0;j<tokens.length;j++){
      if(tokens[j].pct) pcts.push(tokens[j]);
      else nums.push(tokens[j]);
    }

    // 퍼센트 보정
    function fixPct(p){
      var v=parseFloat(p);
      if(isNaN(v)) return p;
      if(v>100) return (v/10).toFixed(1)+'%';
      return v+'%';
    }

    return {
      n1: nums[0]?nums[0].raw:'',
      p1: pcts[0]?fixPct(pcts[0].num):'',
      n2: nums[1]?nums[1].raw:'',
      p2: pcts[1]?fixPct(pcts[1].num):''
    };
  }

  var vr=extractRow(videoLine);
  var sr=extractRow(shortsLine);

  console.log('[CT-OCR v3] video parsed:', JSON.stringify(vr));
  console.log('[CT-OCR v3] shorts parsed:', JSON.stringify(sr));

  /* ── 퍼센트 교차 보정 ── */
  function pVal(s){return parseFloat(String(s).replace('%',''))||0;}
  if(vr.p1 && !sr.p1) sr.p1=(100-pVal(vr.p1)).toFixed(1)+'%';
  if(sr.p1 && !vr.p1) vr.p1=(100-pVal(sr.p1)).toFixed(1)+'%';
  if(vr.p2 && !sr.p2) sr.p2=(100-pVal(vr.p2)).toFixed(1)+'%';
  if(sr.p2 && !vr.p2) vr.p2=(100-pVal(sr.p2)).toFixed(1)+'%';

  /* ── 조회수 vs 시청시간 열 구분 ── */
  var vn1=parseFloat(String(vr.n1).replace(/,/g,''))||0;
  var vn2=parseFloat(String(vr.n2).replace(/,/g,''))||0;
  var viewFirst = !(vn2>0 && vn1>0 && vn2>vn1*10);

  if(viewFirst){
    setV('ct_vv', formatManPct(vr.n1, vr.p1));
    setV('ct_vw', formatManPct(vr.n2, vr.p2));
    setV('ct_sv', formatManPct(sr.n1, sr.p1));
    setV('ct_sw', formatManPct(sr.n2, sr.p2));
  } else {
    setV('ct_vw', formatManPct(vr.n1, vr.p1));
    setV('ct_vv', formatManPct(vr.n2, vr.p2));
    setV('ct_sw', formatManPct(sr.n1, sr.p1));
    setV('ct_sv', formatManPct(sr.n2, sr.p2));
  }
}

/* ── 이미지 업로드 핸들러 ────────────────────────────────── */
var chImgEl=document.getElementById('chImg');
if(chImgEl) chImgEl.addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return;
  ['ch_views','ch_subs','ch_rev','ch_cpm','ch_rpm','ch_ctr','ch_avg'].forEach(function(id){setV(id,'');});
  var prev=document.getElementById('chImgP');
  if(prev){ prev.src=URL.createObjectURL(f); prev.style.display='block'; }
  var st=document.getElementById('chOcrStatus');
  if(st) st.textContent='';
  runOCR(f, st, parseChannelOCR);
});

var ctImgEl=document.getElementById('ctImg');
if(ctImgEl) ctImgEl.addEventListener('change',function(e){
  var f=e.target.files[0]; if(!f) return;
  ['ct_vv','ct_vw','ct_sv','ct_sw','ct2_vv','ct2_vw','ct2_sv','ct2_sw'].forEach(function(id){setV(id,'');});
  var prev=document.getElementById('ctImgP');
  if(prev){ prev.src=URL.createObjectURL(f); prev.style.display='block'; }
  var st=document.getElementById('ctOcrStatus');
  if(st) st.textContent='';
  runOCR(f, st, parseContentOCR);
});
