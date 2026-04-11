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

/* ===== 채널 현황 OCR 파싱 v5.2 ===== */
/* v5 기반, CPM/RPM 통화 매칭 강화, 디버그박스 제거 */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR v5.2 시작 ===');

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
  /* OCR이 ₩를 W, V, \\, ￦ 등으로 인식할 수 있으므로 패턴 확장 */
  var currencyNums = [];
  var currRe = /[₩￦WV＼\\][^\d]*([\d,]+(?:\.\d+)?)/g;
  var cm;
  while((cm = currRe.exec(fullText)) !== null){
    var val = parseFloat(cm[1].replace(/,/g,''));
    if(!isNaN(val) && val >= 100) currencyNums.push({num: cm[1], val: val, raw: cm[0]});
  }

  /* 중복 제거 */
  var seenCurr = {};
  currencyNums = currencyNums.filter(function(c){
    if(seenCurr[c.val]) return false;
    seenCurr[c.val] = true;
    return true;
  });

  currencyNums.sort(function(a,b){return b.val - a.val});

  /* 통화값 맵 (일반숫자에서 제외용) */
  var currVals = {};
  for(var ci=0; ci<currencyNums.length; ci++){
    currVals[currencyNums[ci].val] = true;
  }

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

  console.log('통화 매칭:', currencyNums.map(function(c){return c.raw+'→'+c.num+'('+c.val+')'}).join(' | '));

  /* 4) 일반 숫자 추출: 시간, %, 통화 숫자를 모두 제외 */
  var cleanText = fullText;
  cleanText = cleanText.replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  cleanText = cleanText.replace(/[\d.]+\s*%/g, ' ');

  var allNums = [];
  var numRe = /\b([\d,]{2,}(?:\.\d+)?)\b/g;
  var nm;
  while((nm = numRe.exec(cleanText)) !== null){
    var numStr = nm[1];
    var numVal = parseFloat(numStr.replace(/,/g,''));
    if(isNaN(numVal) || numVal <= 0) continue;
    if(currVals[numVal]) continue;
    allNums.push({raw: numStr, val: numVal});
  }
  allNums.sort(function(a,b){return b.val - a.val});

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

  /* 통화 2개만 잡혔고 일반숫자 3개 이상이면 가장 큰 일반숫자가 수익일 수 있음 */
  if(currencyNums.length === 2 && !revVal && allNums.length >= 1){
    /* 가장 큰 일반숫자가 CPM보다 훨씬 크면 수익으로 간주 */
    if(allNums[0].val > currencyNums[0].val * 10){
      revVal = allNums[0].raw;
      viewsVal = allNums.length >= 2 ? allNums[1].raw : '';
      subsVal = allNums.length >= 3 ? allNums[2].raw : '';
    }
  }

  /* 6) 결과 적용 */
  if(avgVal)   setV('ch_avg', avgVal);
  if(ctrVal)   setV('ch_ctr', ctrVal);
  if(viewsVal) setV('ch_views', viewsVal);
  if(subsVal)  setV('ch_subs', cleanChannelValue(subsVal, 'ch_subs'));
  if(revVal)   setV('ch_rev', revVal);
  if(cpmVal)   setV('ch_cpm', cpmVal);
  if(rpmVal)   setV('ch_rpm', rpmVal);

  console.log('v5.2 최종: views='+viewsVal+', subs='+subsVal+', rev='+revVal+', cpm='+cpmVal+', rpm='+rpmVal+', ctr='+ctrVal+', avg='+avgVal);
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

/* ===== 콘텐츠 유형: 만 단위 변환 (소수점 보정) ===== */
function formatManPct(numStr, pctStr){
  var n = parseFloat((numStr||'').replace(/,/g,''));
  var p = parseFloat((pctStr||'').replace(/[()%]/g,'').trim());
  if(isNaN(n) || isNaN(p)) return '';
  var manStr;
  if(n >= 10000){
    var man = n / 10000;
    /* 항상 소수점 1자리 표시 (59591.6 → 6.0만, 326262 → 32.6만) */
    manStr = man.toFixed(1) + '만';
  } else if(n >= 1000){
    manStr = commaNum(Math.round(n));
  } else {
    manStr = n % 1 === 0 ? String(n) : n.toFixed(1);
  }
  return manStr + '(' + p.toFixed(1) + '%)';
}

/* ===== 콘텐츠 유형 OCR 파싱 v3 ===== */
function parseContentOCR(text){
  console.log('=== parseContentOCR v3 시작 ===');
  var lines = text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
  for(var i=0;i<lines.length;i++) console.log('CL'+i+':',lines[i]);

  /* 동영상 / Shorts 행 찾기 */
  var videoLine='', shortsLine='';
  for(var i=0;i<lines.length;i++){
    var lo=lines[i].toLowerCase();
    if(/합계/.test(lines[i])) continue;
    if(!videoLine && /동영상/.test(lines[i])){
      videoLine=lines[i];
      if(i+1<lines.length && /\d/.test(lines[i+1]) && !/합계|동영상|shorts|쇼츠/i.test(lines[i+1])){
        videoLine+='  '+lines[i+1];
      }
    }
    if(!shortsLine && (/shorts/i.test(lo) || /쇼츠/.test(lines[i]))){
      shortsLine=lines[i];
      if(i+1<lines.length && /\d/.test(lines[i+1]) && !/합계|동영상|shorts|쇼츠/i.test(lines[i+1])){
        shortsLine+='  '+lines[i+1];
      }
    }
  }
  console.log('videoLine:', videoLine);
  console.log('shortsLine:', shortsLine);

  /* 행에서 숫자+퍼센트 추출 */
  function extractRow(line){
    if(!line) return {n1:'',p1:'',n2:'',p2:''};

    var data=line.replace(/^.*?(동영상|[Ss]horts|쇼츠)/,'');
    /* 시간 형식 제거 */
    data=data.replace(/\d{1,2}:\d{2}(:\d{2})?/g,' ');

    var tokens=[];
    var re=/([\d,]+\.?\d*)\s*(%)?/g;
    var m;
    while((m=re.exec(data))){
      var val=m[1].replace(/,/g,'');
      var isPct=!!m[2];
      var numVal=parseFloat(val);
      /* 1자리 노이즈 제거 (£1, [J 등에서 나온 1) */
      if(val.length===1 && numVal<10 && !isPct) continue;
      tokens.push({raw:m[1], num:numVal, pct:isPct});
    }
    console.log('tokens:', JSON.stringify(tokens));

    var nums=[], pcts=[];
    for(var j=0;j<tokens.length;j++){
      if(tokens[j].pct) pcts.push(tokens[j]);
      else nums.push(tokens[j]);
    }

    function fixPct(p){
      var v=parseFloat(p);
      if(isNaN(v)) return p;
      if(v>100) return (v/10).toFixed(1);
      return String(v);
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

  console.log('video parsed:', JSON.stringify(vr));
  console.log('shorts parsed:', JSON.stringify(sr));

  /* 퍼센트 교차 보정 */
  function pVal(s){return parseFloat(s)||0;}
  if(vr.p1 && !sr.p1 && pVal(vr.p1)>0) sr.p1=String(Math.round((100-pVal(vr.p1))*10)/10);
  if(sr.p1 && !vr.p1 && pVal(sr.p1)>0) vr.p1=String(Math.round((100-pVal(sr.p1))*10)/10);
  if(vr.p2 && !sr.p2 && pVal(vr.p2)>0) sr.p2=String(Math.round((100-pVal(vr.p2))*10)/10);
  if(sr.p2 && !vr.p2 && pVal(sr.p2)>0) vr.p2=String(Math.round((100-pVal(sr.p2))*10)/10);

  /* 합이 ~100이 되도록 보정 */
  if(vr.p1 && sr.p1){
    var sum1=pVal(vr.p1)+pVal(sr.p1);
    if(sum1>=900 && sum1<=1100){vr.p1=String(Math.round(pVal(vr.p1)/10*10)/10);sr.p1=String(Math.round(pVal(sr.p1)/10*10)/10);}
  }
  if(vr.p2 && sr.p2){
    var sum2=pVal(vr.p2)+pVal(sr.p2);
    if(sum2>=900 && sum2<=1100){vr.p2=String(Math.round(pVal(vr.p2)/10*10)/10);sr.p2=String(Math.round(pVal(sr.p2)/10*10)/10);}
  }

  /* 열 순서 판단 */
  var colOrder='views_first';
  for(var i=0;i<lines.length;i++){
    if(/조회\s*수/.test(lines[i])&&/시청/.test(lines[i])){
      var vp=lines[i].search(/조회\s*수/);var wp=lines[i].search(/시청/);
      if(wp>=0&&vp>=0&&wp<vp)colOrder='watch_first';break;
    }
  }

  if(vr.n1){
    var vv=formatManPct(vr.n1,vr.p1);var vw=formatManPct(vr.n2,vr.p2);
    if(colOrder==='views_first'){setV('ct_vv',vv);setV('ct_vw',vw);}
    else{setV('ct_vw',vv);setV('ct_vv',vw);}
  }
  if(sr.n1){
    var sv=formatManPct(sr.n1,sr.p1);var sw=formatManPct(sr.n2,sr.p2);
    if(colOrder==='views_first'){setV('ct_sv',sv);setV('ct_sw',sw);}
    else{setV('ct_sw',sv);setV('ct_sv',sw);}
  }
}

/* ===== 이미지 업로드 핸들러 (재업로드 시 기존 데이터 초기화) ===== */
document.getElementById('chImg').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var img=document.getElementById('chImgP');img.src=URL.createObjectURL(f);img.classList.remove('hidden');
  ['ch_views','ch_subs','ch_rev','ch_cpm','ch_rpm','ch_ctr','ch_avg'].forEach(function(id){setV(id,'');});
  /* 기존 디버그 박스 제거 */
  var oldDbg=document.querySelector('#step3 .ocr-debug');if(oldDbg)oldDbg.remove();
  document.getElementById('chOcrStatus').textContent='';
  document.getElementById('chOcrStatus').style.color='#fbbf24';
  runOCR(f,'chOcrStatus',parseChannelOCR);
});
document.getElementById('ctImg').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var img=document.getElementById('ctImgP');img.src=URL.createObjectURL(f);img.classList.remove('hidden');
  ['ct_vv','ct_vw','ct_sv','ct_sw'].forEach(function(id){setV(id,'');});
  var oldDbg=document.querySelector('#step4 .ocr-debug');if(oldDbg)oldDbg.remove();
  document.getElementById('ctOcrStatus').textContent='';
  document.getElementById('ctOcrStatus').style.color='#fbbf24';
  runOCR(f,'ctOcrStatus',parseContentOCR);
});
