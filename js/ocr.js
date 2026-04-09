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

/* ===== 채널 현황 OCR 파싱 v5 ===== */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR v5 시작 ===');
  showOcrDebug('chOcrStatus', text);

  var fullText = text.replace(/\n/g, ' ');

  /* 1) 시간 패턴 → ch_avg */
  var avgVal = '';
  var timeMatches = fullText.match(/\b\d{1,2}:\d{2}\b/g) || [];
  if(timeMatches.length > 0) avgVal = timeMatches[0];

  /* 2) 백분율 패턴 → ch_ctr */
  var ctrVal = '';
  var pm = fullText.match(/([\d.]+)\s*%/);
  if(pm) ctrVal = pm[1] + '%';

  /* 3) 통화(₩) 숫자 추출 → 수익, CPM, RPM */
  var currencyNums = [];
  var currRe = /[₩￦W][^\d]*([\d,]+(?:\.\d+)?)/g;
  var cm;
  while((cm = currRe.exec(fullText)) !== null){
    var val = parseFloat(cm[1].replace(/,/g,''));
    if(!isNaN(val)) currencyNums.push({num: cm[1], val: val});
  }
  currencyNums.sort(function(a,b){return b.val - a.val});

  var revVal='', cpmVal='', rpmVal='';
  if(currencyNums.length >= 3){
    revVal = currencyNums[0].num;
    cpmVal = currencyNums[1].num;
    rpmVal = currencyNums[2].num;
  } else if(currencyNums.length === 2){
    cpmVal = currencyNums[0].num;
    rpmVal = currencyNums[1].num;
  } else if(currencyNums.length === 1){
    revVal = currencyNums[0].num;
  }

  /* 4) 일반 숫자 추출: 시간, %, 통화 숫자를 모두 제외 */
  /* 통화로 잡힌 숫자의 val 목록 → 동일 val을 가진 일반 숫자도 제외 */
  var currVals = {};
  for(var ci=0; ci<currencyNums.length; ci++){
    currVals[currencyNums[ci].val] = true;
  }

  var cleanText = fullText;
  cleanText = cleanText.replace(/\b\d{1,2}:\d{2}\b/g, ' ');  /* 시간 제거 */
  cleanText = cleanText.replace(/[\d.]+\s*%/g, ' ');          /* % 제거 */

  var allNums = [];
  var numRe = /\b([\d,]{2,}(?:\.\d+)?)\b/g;
  var nm;
  while((nm = numRe.exec(cleanText)) !== null){
    var numStr = nm[1];
    var numVal = parseFloat(numStr.replace(/,/g,''));
    if(isNaN(numVal) || numVal <= 0) continue;
    /* 통화와 동일한 값이면 제외 */
    if(currVals[numVal]) continue;
    allNums.push({raw: numStr, val: numVal});
  }
  allNums.sort(function(a,b){return b.val - a.val});

  console.log('통화:', currencyNums.map(function(c){return c.num+'('+c.val+')'}).join(', '));
  console.log('일반숫자(통화제외):', allNums.map(function(n){return n.raw+'('+n.val+')'}).join(', '));

  /* 5) 조회수, 구독자 매칭 */
  var viewsVal='', subsVal='';
  if(allNums.length >= 2){
    viewsVal = allNums[0].raw;
    subsVal = allNums[1].raw;
  } else if(allNums.length === 1){
    viewsVal = allNums[0].raw;
  }

  /* ₩ 미인식 fallback: 통화 0개이고 일반숫자 5개 이상 */
  if(currencyNums.length === 0 && allNums.length >= 5){
    revVal = allNums[0].raw;
    viewsVal = allNums[1].raw;
    cpmVal = allNums[2].raw;
    subsVal = allNums[3].raw;
    rpmVal = allNums[4].raw;
  }

  /* 6) 결과 적용 */
  if(avgVal)   setV('ch_avg', avgVal);
  if(ctrVal)   setV('ch_ctr', ctrVal);
  if(viewsVal) setV('ch_views', viewsVal);
  if(subsVal)  setV('ch_subs', cleanChannelValue(subsVal, 'ch_subs'));
  if(revVal)   setV('ch_rev', revVal);
  if(cpmVal)   setV('ch_cpm', cpmVal);
  if(rpmVal)   setV('ch_rpm', rpmVal);

  console.log('v5 최종: views='+viewsVal+', subs='+subsVal+', rev='+revVal+', cpm='+cpmVal+', rpm='+rpmVal+', ctr='+ctrVal+', avg='+avgVal);
}

/* OCR 원문을 디버그 영역에 표시 */
function showOcrDebug(statusElId, rawText){
  var statusEl = document.getElementById(statusElId);
  if(!statusEl) return;
  var existingDbg = statusEl.parentNode.querySelector('.ocr-debug');
  if(existingDbg) existingDbg.remove();
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
