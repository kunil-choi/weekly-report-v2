/* ===== OCR 공통 함수 ===== */
function runOCR(imageFile,statusElId,callback){
  var statusEl=document.getElementById(statusElId);
  if(statusEl)statusEl.textContent='🔍 OCR 인식 중... (최초 실행 시 한국어 데이터 다운로드로 30초~1분 소요)';
  Tesseract.recognize(imageFile,'kor+eng',{
    logger:function(m){
      if(statusEl && m.status)statusEl.textContent='🔍 '+m.status+(m.progress?' ('+Math.round(m.progress*100)+'%)':'');
    }
  }).then(function(result){
    var text=result.data.text;
    console.log('OCR raw text:\n',text);
    if(statusEl){statusEl.textContent='✅ OCR 완료';statusEl.style.color='#34d399'}
    toast('OCR 인식 완료','success');
    if(callback)callback(text);
  }).catch(function(err){
    console.error('OCR error',err);
    if(statusEl){statusEl.textContent='❌ OCR 실패: '+err.message;statusEl.style.color='#f87171'}
    toast('OCR 실패','error');
  });
}

/* ===== 채널 현황 OCR 파싱 v4 ===== */
/*
 * v4 전략: OCR 원문 디버그 + 견고한 파싱
 *
 * OCR이 테이블을 읽는 3가지 패턴:
 * A) 헤더 한 줄 + 값 한 줄 (이상적)
 * B) 헤더 여러 줄 + 값 한 줄
 * C) 헤더와 값이 교대로 (열별로 읽음)
 *
 * 모든 경우를 처리하는 접근:
 * 1. 전체 텍스트에서 7개 값을 패턴으로 먼저 추출
 * 2. 키워드 위치와의 관계로 매칭
 */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR v4 시작 ===');

  /* OCR 원문을 디버그 영역에 표시 */
  showOcrDebug('chOcrStatus', text);

  var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
  var fullText = text.replace(/\n/g, ' ');

  /* ===== 1단계: 전체 텍스트에서 7종류 값 패턴 추출 ===== */

  /* 1-1) 시간 패턴 (평균 시청 지속): H:MM 또는 HH:MM */
  var avgVal = '';
  var timeMatches = fullText.match(/\b\d{1,2}:\d{2}\b/g) || [];
  if(timeMatches.length > 0) avgVal = timeMatches[0];

  /* 1-2) 백분율 패턴 (노출 클릭률): N.N% */
  var ctrVal = '';
  var pctMatches = fullText.match(/([\d.]+)\s*%/g) || [];
  if(pctMatches.length > 0){
    var pm = pctMatches[0].match(/([\d.]+)\s*%/);
    if(pm) ctrVal = pm[1] + '%';
  }

  /* 1-3) 통화 패턴 (₩ 접두어): ₩N,NNN */
  var currencyMatches = [];
  var currRe = /[₩￦W]\s*([\d,]+(?:\.\d+)?)/g;
  var cm;
  while((cm = currRe.exec(fullText)) !== null){
    var numVal = parseFloat(cm[1].replace(/,/g,''));
    if(!isNaN(numVal)) currencyMatches.push({raw: cm[0], num: cm[1], val: numVal});
  }
  currencyMatches.sort(function(a,b){return b.val - a.val});

  /* 1-4) 일반 숫자 (₩ 없고, 시간/% 아닌 것) */
  var plainText = fullText;
  /* 시간 제거 */
  plainText = plainText.replace(/\b\d{1,2}:\d{2}\b/g, '###TIME###');
  /* % 숫자 제거 */
  plainText = plainText.replace(/[\d.]+\s*%/g, '###PCT###');
  /* ₩ 숫자 제거 */
  plainText = plainText.replace(/[₩￦W]\s*[\d,]+(?:\.\d+)?/g, '###CURR###');

  var plainNums = [];
  var plainRe = /\b([\d,]{2,}(?:\.\d+)?)\b/g;
  var pn;
  while((pn = plainRe.exec(plainText)) !== null){
    var numVal = parseFloat(pn[1].replace(/,/g,''));
    if(!isNaN(numVal) && numVal > 0) plainNums.push({raw: pn[1], val: numVal});
  }
  plainNums.sort(function(a,b){return b.val - a.val});

  console.log('시간:', avgVal);
  console.log('백분율:', ctrVal);
  console.log('통화('+currencyMatches.length+'):', currencyMatches.map(function(c){return c.raw}).join(', '));
  console.log('일반숫자('+plainNums.length+'):', plainNums.map(function(n){return n.raw+'('+n.val+')'}).join(', '));

  /* ===== 2단계: 값 매칭 ===== */
  /*
   * 유튜브 스튜디오 채널 현황 7개 필드:
   * - 평균 시청 지속 시간 → 시간 패턴 (유일)
   * - 노출 클릭률 → 백분율 패턴 (유일)
   * - 예상 수익 → ₩ + 가장 큰 숫자
   * - 재생 기반 CPM → ₩ + 두 번째 큰 숫자
   * - RPM → ₩ + 세 번째 큰 숫자
   * - 조회수 → 일반숫자 중 가장 큰 것
   * - 구독자 → 일반숫자 중 두 번째 큰 것
   */

  var revVal='', cpmVal='', rpmVal='';
  if(currencyMatches.length >= 3){
    revVal = currencyMatches[0].num;
    cpmVal = currencyMatches[1].num;
    rpmVal = currencyMatches[2].num;
  } else if(currencyMatches.length === 2){
    /* CPM이 보통 RPM보다 크다 */
    cpmVal = currencyMatches[0].num;
    rpmVal = currencyMatches[1].num;
  } else if(currencyMatches.length === 1){
    revVal = currencyMatches[0].num;
  }

  var viewsVal='', subsVal='';
  if(plainNums.length >= 2){
    viewsVal = plainNums[0].raw;
    subsVal = plainNums[1].raw;
  } else if(plainNums.length === 1){
    viewsVal = plainNums[0].raw;
  }

  /* ₩가 하나도 인식 안 된 경우: 모든 숫자를 크기 순으로 분류 */
  if(currencyMatches.length === 0 && plainNums.length >= 5){
    revVal = plainNums[0].raw;   /* 가장 큰 숫자 = 수익 */
    viewsVal = plainNums[1].raw; /* 두 번째 = 조회수 */
    cpmVal = plainNums[2].raw;   /* 세 번째 = CPM */
    subsVal = plainNums[3].raw;  /* 네 번째 = 구독자 */
    rpmVal = plainNums[4].raw;   /* 다섯 번째 = RPM */
  }

  /* ===== 3단계: 결과 적용 ===== */
  if(avgVal)   setV('ch_avg', avgVal);
  if(ctrVal)   setV('ch_ctr', ctrVal);
  if(viewsVal) setV('ch_views', viewsVal);
  if(subsVal)  setV('ch_subs', cleanChannelValue(subsVal, 'ch_subs'));
  if(revVal)   setV('ch_rev', revVal);
  if(cpmVal)   setV('ch_cpm', cpmVal);
  if(rpmVal)   setV('ch_rpm', rpmVal);

  console.log('최종 결과: views='+viewsVal+', subs='+subsVal+', rev='+revVal+', cpm='+cpmVal+', rpm='+rpmVal+', ctr='+ctrVal+', avg='+avgVal);
}

/* OCR 원문을 디버그 영역에 표시 */
function showOcrDebug(statusElId, rawText){
  var statusEl = document.getElementById(statusElId);
  if(!statusEl) return;
  /* 기존 디버그 박스가 있으면 제거 */
  var existingDbg = statusEl.parentNode.querySelector('.ocr-debug');
  if(existingDbg) existingDbg.remove();
  /* 새 디버그 박스 생성 */
  var dbg = document.createElement('details');
  dbg.className = 'ocr-debug';
  dbg.style.cssText = 'margin-top:8px;background:#0f1117;border:1px solid #334155;border-radius:6px;padding:8px;font-size:11px;';
  var sum = document.createElement('summary');
  sum.style.cssText = 'cursor:pointer;color:#60a5fa;font-size:12px;';
  sum.textContent = '🔍 OCR 원문 보기 (디버그)';
  var pre = document.createElement('pre');
  pre.style.cssText = 'white-space:pre-wrap;color:#94a3b8;margin-top:6px;max-height:200px;overflow-y:auto;';
  pre.textContent = rawText;
  dbg.appendChild(sum);
  dbg.appendChild(pre);
  statusEl.parentNode.insertBefore(dbg, statusEl.nextSibling);
}

/* 채널 값 정리 */
function cleanChannelValue(val, fieldId){
  var v = (val||'').trim();
  v = v.replace(/^[₩￦]+\s*/,'').trim();
  v = v.replace(/[↓↑→←▼▲△▽]/g,'').trim();
  if(fieldId === 'ch_subs'){
    if(!/^[+\-]/.test(v) && /\d/.test(v)) v = '+' + v;
  }
  if(fieldId === 'ch_ctr'){
    if(/\d/.test(v) && v.indexOf('%')===-1) v = v + '%';
  }
  return v;
}

/* 빈 필드 보충 */
function fallbackFill(lines){
  var fullText = lines.join(' ');
  if(!V('ch_avg')){var tm=fullText.match(/\d{1,2}:\d{2}/);if(tm)setV('ch_avg',tm[0]);}
}

/* ===== 콘텐츠 유형: 만 단위 변환 ===== */
function formatManPct(numStr, pctStr){
  var n = parseFloat((numStr||'').replace(/,/g,''));
  var p = parseFloat((pctStr||'').replace(/[()%]/g,'').trim());
  if(isNaN(n) || isNaN(p)) return '';
  var manStr;
  if(n >= 10000){
    var man = n / 10000;
    manStr = man >= 100 ? Math.round(man)+'만' : man.toFixed(1).replace(/\.0$/,'')+'만';
  } else if(n >= 1000){
    manStr = commaNum(Math.round(n));
  } else {
    manStr = n % 1 === 0 ? String(n) : n.toFixed(1);
  }
  return manStr + '(' + p.toFixed(1).replace(/\.0$/,'') + '%)';
}

/* ===== 콘텐츠 유형 OCR 파싱 ===== */
function parseContentOCR(text){
  console.log('=== parseContentOCR 시작 ===');
  showOcrDebug('ctOcrStatus', text);
  var lines = text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
  for(var i=0;i<lines.length;i++) console.log('CL'+i+':',lines[i]);
  function getAllNumbers(line){
    var result=[];var timeless=line.replace(/\d+:\d+/g,function(m){return ' '.repeat(m.length);});
    var re=/(\d[\d,]*\.?\d*)/g;var m;
    while((m=re.exec(timeless))!==null){result.push({val:m[1],pos:m.index});}
    return result;
  }
  function parseDataRow(line){
    var allNums=getAllNumbers(line);
    var pctPositions=[];var pctRe=/%/g;var pm;
    while((pm=pctRe.exec(line))!==null){pctPositions.push(pm.index);}
    var dataNums=[],pctNums=[];
    for(var ni=0;ni<allNums.length;ni++){
      var numEnd=allNums[ni].pos+allNums[ni].val.length;var isPct=false;
      for(var pi=0;pi<pctPositions.length;pi++){
        var gap=line.substring(numEnd,pctPositions[pi]);
        if(gap.length<=3&&/^\s*$/.test(gap)){isPct=true;break;}
      }
      if(isPct){pctNums.push(allNums[ni].val);}else{dataNums.push(allNums[ni].val);}
    }
    return{viewNum:dataNums[0]||'',viewPct:pctNums[0]||'',watchNum:dataNums[1]||'',watchPct:pctNums[1]||''};
  }
  var videoRow=null,shortsRow=null;
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(/합계/.test(line))continue;
    var isVideo=/동영상/.test(line);var isShorts=/[Ss]horts|쇼츠/.test(line);
    if(!isVideo&&!isShorts)continue;
    var data=parseDataRow(line);
    if((!data.viewNum||!data.viewPct||!data.watchNum||!data.watchPct)&&i+1<lines.length&&!/합계|동영상|[Ss]horts|쇼츠/.test(lines[i+1])){
      data=parseDataRow(line+'  '+lines[i+1]);
    }
    if(isVideo)videoRow=data;if(isShorts)shortsRow=data;
  }
  function fixPct(p1str,p2str){
    var p1=parseFloat(p1str);var p2=parseFloat(p2str);
    if(isNaN(p1)&&isNaN(p2))return[p1str,p2str];
    if(isNaN(p1)&&!isNaN(p2))return[String(Math.round((100-p2)*10)/10),String(p2)];
    if(!isNaN(p1)&&isNaN(p2))return[String(p1),String(Math.round((100-p1)*10)/10)];
    var sum=p1+p2;
    if(sum>=99&&sum<=101)return[String(p1),String(p2)];
    if(sum>=900&&sum<=1100)return[String(Math.round(p1/10*10)/10),String(Math.round(p2/10*10)/10)];
    if(p1>100){var f1=p1/10;if(Math.abs(f1+p2-100)<3)return[String(Math.round(f1*10)/10),String(p2)];}
    if(p2>100){var f2=p2/10;if(Math.abs(p1+f2-100)<3)return[String(p1),String(Math.round(f2*10)/10)];}
    if(p1>100)p1=p1/10;if(p2>100)p2=p2/10;
    return[String(Math.round(p1*10)/10),String(Math.round(p2*10)/10)];
  }
  if(videoRow&&shortsRow){
    var fv=fixPct(videoRow.viewPct,shortsRow.viewPct);videoRow.viewPct=fv[0];shortsRow.viewPct=fv[1];
    var fw=fixPct(videoRow.watchPct,shortsRow.watchPct);videoRow.watchPct=fw[0];shortsRow.watchPct=fw[1];
  }else if(shortsRow&&!videoRow){
    var sp=parseFloat(shortsRow.viewPct);if(!isNaN(sp)&&sp>100)shortsRow.viewPct=String(Math.round(sp/10*10)/10);
    var swp=parseFloat(shortsRow.watchPct);if(!isNaN(swp)&&swp>100)shortsRow.watchPct=String(Math.round(swp/10*10)/10);
  }
  var colOrder='views_first';
  for(var i=0;i<lines.length;i++){
    if(/조회\s*수/.test(lines[i])&&/시청/.test(lines[i])){
      var vp=lines[i].search(/조회\s*수/);var wp=lines[i].search(/시청/);
      if(wp>=0&&vp>=0&&wp<vp)colOrder='watch_first';break;
    }
  }
  if(videoRow){
    var vv=formatManPct(videoRow.viewNum,videoRow.viewPct);var vw=formatManPct(videoRow.watchNum,videoRow.watchPct);
    if(colOrder==='views_first'){setV('ct_vv',vv);setV('ct_vw',vw);}else{setV('ct_vw',vv);setV('ct_vv',vw);}
  }
  if(shortsRow){
    var sv=formatManPct(shortsRow.viewNum,shortsRow.viewPct);var sw=formatManPct(shortsRow.watchNum,shortsRow.watchPct);
    if(colOrder==='views_first'){setV('ct_sv',sv);setV('ct_sw',sw);}else{setV('ct_sw',sv);setV('ct_sv',sw);}
  }
}

/* ===== [수정5] 이미지 업로드 핸들러 ===== */
document.getElementById('chImg').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var img=document.getElementById('chImgP');img.src=URL.createObjectURL(f);img.classList.remove('hidden');
  ['ch_views','ch_subs','ch_rev','ch_cpm','ch_rpm','ch_ctr','ch_avg'].forEach(function(id){setV(id,'');});
  document.getElementById('chOcrStatus').textContent='';
  document.getElementById('chOcrStatus').style.color='#fbbf24';
  runOCR(f,'chOcrStatus',parseChannelOCR);
});
document.getElementById('ctImg').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var img=document.getElementById('ctImgP');img.src=URL.createObjectURL(f);img.classList.remove('hidden');
  ['ct_vv','ct_vw','ct_sv','ct_sw'].forEach(function(id){setV(id,'');});
  document.getElementById('ctOcrStatus').textContent='';
  document.getElementById('ctOcrStatus').style.color='#fbbf24';
  runOCR(f,'ctOcrStatus',parseContentOCR);
});
