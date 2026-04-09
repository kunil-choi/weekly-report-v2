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

/* ===== 채널 현황 OCR 파싱 (전면 재작성 v3) ===== */
/*
 * 핵심 전략 변경:
 * OCR은 테이블을 정확한 행/열로 읽지 못하는 경우가 많다.
 * 따라서 "헤더 순서 → 값 순서 매칭"에 의존하지 않고,
 * 전체 텍스트에서 키워드와 가장 가까운 값을 찾아 매칭한다.
 *
 * 추가로, 값의 고유 패턴을 이용한 검증을 한다:
 * - 평균 시청 지속 시간: HH:MM 또는 M:SS 형태 (예: 9:18)
 * - 노출 클릭률: N.N% 형태 (예: 5.7%)
 * - 예상 수익: 가장 큰 숫자 (백만 단위)
 * - 조회수: 두 번째로 큰 숫자 (백만~십만 단위)
 * - CPM, RPM: 천~만 단위 (₩ 접두어 가능)
 * - 구독자: 천~만 단위 (부호 가능)
 */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR v3 시작 ===');
  var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
  var fullText = lines.join(' ');
  console.log('OCR lines:', JSON.stringify(lines));

  /* ===== 1단계: 전체 텍스트를 하나로 합쳐서 헤더+값을 모두 포함하는 단일 문자열 만들기 ===== */

  /* ===== 2단계: 고유 패턴으로 확실한 값부터 추출 ===== */

  /* 2-1) 평균 시청 지속 시간: H:MM 또는 HH:MM 패턴 (유일한 시간 형태) */
  var avgVal = '';
  var timeMatch = fullText.match(/\d{1,2}:\d{2}/);
  if(timeMatch) avgVal = timeMatch[0];

  /* 2-2) 노출 클릭률: N.N% 패턴 (유일한 % 형태) */
  var ctrVal = '';
  var pctMatch = fullText.match(/([\d.]+)\s*%/);
  if(pctMatch) ctrVal = pctMatch[1] + '%';

  /* 2-3) 모든 숫자(콤마 포함)를 추출하되, 시간(H:MM)과 %는 제외 */
  var numText = fullText;
  /* 시간 패턴 제거 */
  numText = numText.replace(/\d{1,2}:\d{2}/g, ' ');
  /* % 앞의 숫자 제거 */
  numText = numText.replace(/[\d.]+\s*%/g, ' ');

  var allNums = [];
  var numRe = /[₩￦]?\s*([\d,]+(?:\.\d+)?)/g;
  var nm;
  while((nm = numRe.exec(numText)) !== null){
    var raw = nm[0].trim();
    var numOnly = nm[1].replace(/,/g,'');
    var numVal = parseFloat(numOnly);
    if(!isNaN(numVal) && numVal > 0){
      allNums.push({raw: raw, val: numVal, hasCurrency: /[₩￦]/.test(raw)});
    }
  }
  /* 값 크기 내림차순 정렬 */
  allNums.sort(function(a,b){ return b.val - a.val; });
  console.log('추출된 숫자들:', allNums.map(function(n){return n.raw+'('+n.val+')'}).join(', '));

  /* 2-4) 숫자 분류 규칙:
   * 유튜브 스튜디오 채널 현황에서:
   * - 예상 수익: 보통 가장 큰 숫자 (백만~천만 원)
   * - 조회수: 두 번째로 큰 숫자 (십만~백만)
   * - CPM, RPM: 천~만 단위, ₩ 접두어
   * - 구독자: 천~만 단위
   *
   * 하지만 더 신뢰할 수 있는 방법: 키워드 인접성
   */

  /* ===== 3단계: 키워드 인접 매칭 (줄 기반) ===== */
  /*
   * 각 필드의 키워드가 포함된 줄에서 가장 가까운 숫자를 찾는다.
   * 만약 같은 줄에 숫자가 없으면 바로 다음 줄에서 찾는다.
   *
   * 문제: 테이블의 헤더 행에 모든 키워드가 모여 있고,
   *       값 행에 모든 숫자가 모여 있으면 이 방법이 안 통한다.
   *
   * 해결: 헤더 행에서 키워드 순서를 파악하고, 값 행에서 순서 매칭도 병행한다.
   */

  var results = {
    ch_avg: avgVal,
    ch_ctr: ctrVal,
    ch_views: '',
    ch_subs: '',
    ch_rev: '',
    ch_cpm: '',
    ch_rpm: ''
  };

  /* ===== 4단계: 헤더-값 순서 매칭 시도 ===== */
  var fieldDefs = [
    {id:'ch_avg',  keywords:['평균 시청 지속 시간','평균시청지속시간','평균 시청 지속','시청 지속 시간','시청지속시간','시청 지속']},
    {id:'ch_cpm',  keywords:['재생 기반 CPM','재생기반 CPM','재생기반CPM','기반 CPM','기반CPM']},
    {id:'ch_rpm',  keywords:['RPM']},
    {id:'ch_views',keywords:['조회수','조회 수']},
    {id:'ch_subs', keywords:['구독자']},
    {id:'ch_rev',  keywords:['예상 수익','예상수익','수익']},
    {id:'ch_ctr',  keywords:['노출 클릭률','노출클릭률','노출 클릭율','클릭률','클릭율']}
  ];

  /* 헤더가 여러 줄에 걸쳐 있을 수 있으므로, 연속된 줄을 합쳐서 헤더 찾기 */
  var headerLine = '';
  var headerEndIdx = -1;
  for(var i=0; i<lines.length; i++){
    /* 숫자가 주를 이루는 줄(값 행)이 나오면 헤더 탐색 중단 */
    var numChars = (lines[i].match(/[\d₩￦%:,.]/g)||[]).length;
    var totalChars = lines[i].replace(/\s/g,'').length;
    if(totalChars > 0 && numChars / totalChars > 0.6){
      headerEndIdx = i;
      break;
    }
    headerLine += ' ' + lines[i];
  }
  headerLine = headerLine.trim();
  console.log('합성 헤더:', headerLine);
  console.log('헤더 끝 인덱스:', headerEndIdx);

  /* 합성 헤더에서 키워드 순서 파악 */
  var foundFields = [];
  for(var fi=0;fi<fieldDefs.length;fi++){
    var def = fieldDefs[fi];
    var bestPos = -1, bestKw = '';
    for(var ki=0;ki<def.keywords.length;ki++){
      var p = headerLine.indexOf(def.keywords[ki]);
      if(p > -1){ bestPos = p; bestKw = def.keywords[ki]; break; }
    }
    if(bestPos > -1){
      foundFields.push({id:def.id, pos:bestPos, kw:bestKw});
    }
  }
  foundFields.sort(function(a,b){return a.pos - b.pos});
  console.log('헤더 필드 순서('+foundFields.length+'개):', foundFields.map(function(f){return f.id+'@'+f.pos}).join(', '));

  /* 값 행 찾기 */
  var valLine = '';
  if(headerEndIdx >= 0 && headerEndIdx < lines.length){
    /* headerEndIdx부터 값이 있는 줄들을 모은다 */
    for(var vi=headerEndIdx; vi<Math.min(headerEndIdx+3, lines.length); vi++){
      if(/[\d]/.test(lines[vi])){
        valLine = lines[vi];
        break;
      }
    }
  }
  console.log('값 행:', valLine);

  if(valLine && foundFields.length >= 5){
    /* 값 분리: 다양한 구분자 시도 */
    var valParts = smartSplitValues(valLine);
    console.log('값 파트('+valParts.length+'개):', JSON.stringify(valParts));

    if(valParts.length === foundFields.length){
      console.log('✅ 개수 일치! 순서 매칭');
      for(var i=0;i<foundFields.length;i++){
        results[foundFields[i].id] = cleanChannelValue(valParts[i], foundFields[i].id);
        console.log('  '+foundFields[i].id+' ← "'+valParts[i]+'" → "'+results[foundFields[i].id]+'"');
      }
    } else {
      console.log('개수 불일치, 패턴 분류로 전환');
      classifyByPattern(allNums, results);
    }
  } else {
    console.log('헤더 매칭 부족('+foundFields.length+'개), 패턴 분류 사용');
    classifyByPattern(allNums, results);
  }

  /* ===== 5단계: 결과 적용 ===== */
  for(var key in results){
    if(results[key]) setV(key, results[key]);
  }

  /* 빈 필드 보충 */
  fallbackFill(lines);
  console.log('=== parseChannelOCR v3 완료 ===');
}

/* 값 행을 스마트하게 분리 */
function smartSplitValues(valLine){
  /* 1차: 탭으로 분리 */
  var parts = valLine.split(/\t+/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  if(parts.length >= 5) return parts;

  /* 2차: 3개 이상 공백으로 분리 */
  parts = valLine.split(/\s{3,}/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  if(parts.length >= 5) return parts;

  /* 3차: 2개 이상 공백으로 분리 */
  parts = valLine.split(/\s{2,}/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  if(parts.length >= 5) return parts;

  /* 4차: 단일 공백으로 분리 후, ₩+숫자 합치기 */
  parts = valLine.split(/\s+/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  var merged = [];
  for(var i=0;i<parts.length;i++){
    /* ₩ 단독 → 다음 값과 합침 */
    if(/^[₩￦]$/.test(parts[i]) && i+1<parts.length){
      merged.push(parts[i]+parts[i+1]);
      i++;
    }
    /* ↓ 등 화살표 단독 → 스킵하거나 앞/뒤 값에 합침 */
    else if(/^[↓↑→←▼▲△▽]+$/.test(parts[i])){
      /* 스킵 */
    }
    else {
      merged.push(parts[i]);
    }
  }
  return merged;
}

/* 패턴 기반 숫자 분류 */
function classifyByPattern(allNums, results){
  console.log('패턴 분류 시작, 숫자 '+allNums.length+'개');
  /*
   * 유튜브 스튜디오 채널 현황 숫자 크기 패턴:
   * 예상 수익 > 조회수 >> CPM > RPM > 구독자
   * (단, 채널 규모에 따라 다를 수 있음)
   *
   * ₩ 접두어가 있는 것: 예상 수익, CPM, RPM
   * 없는 것: 조회수, 구독자
   *
   * 분류 전략:
   * 1. ₩ 있는 것 중 가장 큰 것 = 예상 수익
   * 2. ₩ 있는 것 중 작은 2개 = CPM, RPM (큰 것이 CPM)
   * 3. ₩ 없는 것 중 가장 큰 것 = 조회수
   * 4. ₩ 없는 것 중 나머지 = 구독자
   */

  var withCurrency = allNums.filter(function(n){ return n.hasCurrency; });
  var withoutCurrency = allNums.filter(function(n){ return !n.hasCurrency; });

  /* 통화 있는 숫자 처리 */
  if(withCurrency.length >= 3){
    if(!results.ch_rev) results.ch_rev = cleanChannelValue(withCurrency[0].raw, 'ch_rev');
    if(!results.ch_cpm) results.ch_cpm = cleanChannelValue(withCurrency[1].raw, 'ch_cpm');
    if(!results.ch_rpm) results.ch_rpm = cleanChannelValue(withCurrency[2].raw, 'ch_rpm');
  } else if(withCurrency.length === 2){
    if(!results.ch_cpm) results.ch_cpm = cleanChannelValue(withCurrency[0].raw, 'ch_cpm');
    if(!results.ch_rpm) results.ch_rpm = cleanChannelValue(withCurrency[1].raw, 'ch_rpm');
  } else if(withCurrency.length === 1){
    if(!results.ch_rev) results.ch_rev = cleanChannelValue(withCurrency[0].raw, 'ch_rev');
  }

  /* 통화 없는 숫자 처리 */
  if(withoutCurrency.length >= 2){
    if(!results.ch_views) results.ch_views = cleanChannelValue(withoutCurrency[0].raw, 'ch_views');
    if(!results.ch_subs) results.ch_subs = cleanChannelValue(withoutCurrency[1].raw, 'ch_subs');
  } else if(withoutCurrency.length === 1){
    if(!results.ch_views) results.ch_views = cleanChannelValue(withoutCurrency[0].raw, 'ch_views');
  }

  /* 통화 기호 없이 모든 숫자가 왔을 때 (₩를 OCR이 인식 못한 경우) */
  if(!withCurrency.length && allNums.length >= 5){
    /* 크기 순: 수익 > 조회수 > CPM > RPM ≈ 구독자 */
    if(!results.ch_rev) results.ch_rev = cleanChannelValue(allNums[0].raw, 'ch_rev');
    if(!results.ch_views) results.ch_views = cleanChannelValue(allNums[1].raw, 'ch_views');
    /* CPM이 RPM보다 보통 크다 */
    if(!results.ch_cpm) results.ch_cpm = cleanChannelValue(allNums[2].raw, 'ch_cpm');
    if(!results.ch_subs) results.ch_subs = cleanChannelValue(allNums[3].raw, 'ch_subs');
    if(!results.ch_rpm) results.ch_rpm = cleanChannelValue(allNums[4].raw, 'ch_rpm');
  }

  console.log('패턴 분류 결과:', JSON.stringify(results));
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
  var fieldMap = [
    {id:'ch_views',kw:['조회수','조회 수'],pattern:/[\d,]+/},
    {id:'ch_subs',kw:['구독자'],pattern:/[+\-]?\s*[\d,]+/},
    {id:'ch_rev',kw:['예상 수익','예상수익','수익'],pattern:/[\d,]+/},
    {id:'ch_cpm',kw:['재생 기반 CPM','재생기반','기반 CPM','CPM'],pattern:/[\d,]+/},
    {id:'ch_rpm',kw:['RPM'],pattern:/[\d,]+/},
    {id:'ch_ctr',kw:['노출 클릭률','노출 클릭율','클릭률','클릭율'],pattern:/[\d.]+%/},
    {id:'ch_avg',kw:['평균 시청 지속','시청 지속','지속 시간','지속시간'],pattern:/\d{1,2}:\d{2}/}
  ];
  for(var fi=0;fi<fieldMap.length;fi++){
    if(V(fieldMap[fi].id)) continue; /* 이미 값이 있으면 스킵 */
    var fm=fieldMap[fi];
    for(var li=0;li<lines.length;li++){
      var line=lines[li], hasKw=false;
      for(var ki=0;ki<fm.kw.length;ki++){ if(line.indexOf(fm.kw[ki])>-1){hasKw=true;break;} }
      if(!hasKw) continue;
      var match=line.match(fm.pattern);
      if(match){setV(fm.id, cleanChannelValue(match[0],fm.id));break;}
      if(li+1<lines.length){
        var match2=lines[li+1].match(fm.pattern);
        if(match2){setV(fm.id, cleanChannelValue(match2[0],fm.id));break;}
      }
    }
  }
  if(!V('ch_avg')){var tm=fullText.match(/\d{1,2}:\d{2}/);if(tm)setV('ch_avg',tm[0]);}
}

function fallbackParse(lines){
  console.log('fallbackParse 실행');
  fallbackFill(lines);
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
