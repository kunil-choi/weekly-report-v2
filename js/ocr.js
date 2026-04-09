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

/* ===== 채널 현황 OCR 파싱 (전면 재작성) ===== */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR 시작 ===');
  var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
  console.log('OCR lines:', JSON.stringify(lines));

  /*
   * 전략: 헤더 행에서 각 키워드의 순서(왼→오)를 파악하고,
   * 값 행에서 같은 순서의 값을 추출하여 1:1 매칭한다.
   *
   * 유튜브 스튜디오 채널 현황 테이블의 가능한 헤더:
   * 평균 시청 지속 시간, 재생 기반 CPM, RPM, 조회수, 구독자, 예상 수익, 노출 클릭률
   * (순서는 사용자 설정에 따라 다를 수 있음)
   */

  /* 키워드 정의 - 긴 것부터 매칭하기 위해 순서 중요 */
  var fieldDefs = [
    {id:'ch_avg',  keywords:['평균 시청 지속 시간','평균시청지속시간','평균 시청 지속','시청 지속 시간','시청지속시간','시청 지속']},
    {id:'ch_cpm',  keywords:['재생 기반 CPM','재생기반 CPM','재생기반CPM','기반 CPM','기반CPM']},
    {id:'ch_rpm',  keywords:['RPM']},
    {id:'ch_views',keywords:['조회수','조회 수']},
    {id:'ch_subs', keywords:['구독자']},
    {id:'ch_rev',  keywords:['예상 수익','예상수익','수익']},
    {id:'ch_ctr',  keywords:['노출 클릭률','노출클릭률','노출 클릭율','클릭률','클릭율']}
  ];

  /* 1) 헤더 행 찾기: 가장 많은 키워드가 매치되는 행 */
  var headerIdx = -1, bestScore = 0;
  for(var i=0;i<lines.length;i++){
    var score=0;
    var testLine = lines[i];
    for(var fi=0;fi<fieldDefs.length;fi++){
      for(var ki=0;ki<fieldDefs[fi].keywords.length;ki++){
        if(testLine.indexOf(fieldDefs[fi].keywords[ki])>-1){score++;break;}
      }
    }
    if(score>bestScore){bestScore=score;headerIdx=i;}
  }

  if(headerIdx<0 || bestScore<3){
    console.log('헤더 행을 찾지 못함, fallback 사용');
    fallbackParse(lines);
    return;
  }

  var hLine = lines[headerIdx];
  console.log('헤더 행['+headerIdx+']:', hLine);

  /* 2) 헤더 행에서 각 필드의 위치(pos)를 추출하고, pos 순으로 정렬 → 열 순서 확보 */
  var foundFields = [];
  for(var fi=0;fi<fieldDefs.length;fi++){
    var def = fieldDefs[fi];
    var bestPos = -1, bestKw = '';
    /* 긴 키워드부터 시도 (이미 keywords 배열이 긴것→짧은것 순) */
    for(var ki=0;ki<def.keywords.length;ki++){
      var p = hLine.indexOf(def.keywords[ki]);
      if(p > -1){ bestPos = p; bestKw = def.keywords[ki]; break; }
    }
    if(bestPos > -1){
      foundFields.push({id:def.id, pos:bestPos, kw:bestKw});
    }
  }
  foundFields.sort(function(a,b){return a.pos - b.pos});
  console.log('헤더 필드 순서:', foundFields.map(function(f){return f.id+'@'+f.pos}).join(', '));

  if(foundFields.length < 3){
    console.log('매칭된 헤더가 3개 미만, fallback');
    fallbackParse(lines);
    return;
  }

  /* 3) 값 행 찾기: 헤더 바로 다음 행부터 숫자가 포함된 행 */
  var valLine = '';
  for(var vi=headerIdx+1; vi<Math.min(headerIdx+4, lines.length); vi++){
    if(/\d/.test(lines[vi])){
      valLine = lines[vi];
      console.log('값 행['+vi+']:', valLine);
      break;
    }
  }
  if(!valLine){
    console.log('값 행을 찾지 못함, fallback');
    fallbackParse(lines);
    return;
  }

  /* 4) 값 행을 탭 또는 2개 이상 공백으로 분리 */
  var valParts = valLine.split(/\t+|\s{2,}/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  console.log('값 파트('+valParts.length+'개):', JSON.stringify(valParts));

  /* 5) 핵심: 필드 개수와 값 개수가 같으면 순서대로 1:1 매칭 */
  if(foundFields.length === valParts.length){
    console.log('개수 일치! 순서 매칭 사용');
    for(var i=0;i<foundFields.length;i++){
      var rawVal = valParts[i];
      var cleaned = cleanChannelValue(rawVal, foundFields[i].id);
      console.log('  '+foundFields[i].id+' ← "'+rawVal+'" → "'+cleaned+'"');
      setV(foundFields[i].id, cleaned);
    }
  } else {
    /*
     * 개수 불일치 시: 값을 더 세밀하게 분리 시도
     * (OCR이 공백 없이 값을 붙여 읽은 경우)
     */
    console.log('개수 불일치 (헤더:'+foundFields.length+', 값:'+valParts.length+'), 재분리 시도');

    /* 값을 단일 공백으로도 분리 시도 */
    var valParts2 = valLine.split(/\s+/).map(function(s){return s.trim()}).filter(function(s){return s.length>0});

    /* ₩ 기호가 붙은 값을 합치기: "₩6,414" → 하나로 */
    var merged = [];
    for(var vi=0;vi<valParts2.length;vi++){
      if(valParts2[vi].match(/^[₩￦\\W]$/) && vi+1<valParts2.length){
        merged.push(valParts2[vi]+valParts2[vi+1]);
        vi++;
      } else {
        merged.push(valParts2[vi]);
      }
    }
    console.log('재분리 결과('+merged.length+'개):', JSON.stringify(merged));

    if(merged.length === foundFields.length){
      for(var i=0;i<foundFields.length;i++){
        var cleaned = cleanChannelValue(merged[i], foundFields[i].id);
        console.log('  '+foundFields[i].id+' ← "'+merged[i]+'" → "'+cleaned+'"');
        setV(foundFields[i].id, cleaned);
      }
    } else {
      /* 최후의 방법: 값의 특성(패턴)으로 매칭 */
      console.log('패턴 기반 매칭 시도');
      patternMatch(foundFields, valLine, lines);
    }
  }

  /* 6) 빈 필드에 대해 fallback 보충 */
  fallbackFill(lines);
}

/* 채널 값 정리: ₩ 제거, 화살표 제거, 구독자에 + 추가 등 */
function cleanChannelValue(val, fieldId){
  var v = (val||'').trim();
  /* ₩, ￦, W 접두어 제거 */
  v = v.replace(/^[₩￦]+\s*/,'').trim();
  /* 화살표, 특수문자 제거 */
  v = v.replace(/[↓↑→←▼▲△▽]/g,'').trim();
  /* 구독자: +/- 없으면 + 추가 */
  if(fieldId === 'ch_subs'){
    if(!/^[+\-]/.test(v) && /\d/.test(v)) v = '+' + v;
  }
  /* 클릭률: % 확인 */
  if(fieldId === 'ch_ctr'){
    if(/\d/.test(v) && v.indexOf('%')===-1) v = v + '%';
  }
  return v;
}

/* 패턴 기반 매칭: 값의 형태로 어떤 필드인지 추정 */
function patternMatch(foundFields, valLine, lines){
  var fullText = lines.join(' ');

  /* 각 필드별 값 패턴 정의 */
  var patterns = {
    'ch_avg':  {re:/\d{1,2}:\d{2}/, desc:'시간:분 형태'},
    'ch_ctr':  {re:/[\d.]+\s*%/, desc:'백분율'},
    'ch_cpm':  {re:/[₩￦]?\s*[\d,]+/, desc:'통화'},
    'ch_rpm':  {re:/[₩￦]?\s*[\d,]+/, desc:'통화'},
    'ch_views':{re:/[\d,]{4,}/, desc:'큰 숫자'},
    'ch_subs': {re:/[+\-]?\s*[\d,]+/, desc:'부호 숫자'},
    'ch_rev':  {re:/[₩￦]?\s*[\d,]+/, desc:'통화'}
  };

  /* 시간 패턴 먼저 (가장 명확) */
  if(!V('ch_avg')){
    var tm = fullText.match(/\d{1,2}:\d{2}/);
    if(tm) setV('ch_avg', tm[0]);
  }
  /* 백분율 (클릭률) */
  if(!V('ch_ctr')){
    var pm = fullText.match(/([\d.]+)\s*%/);
    if(pm) setV('ch_ctr', pm[1]+'%');
  }

  /* 나머지는 키워드 인접 방식으로 */
  for(var fi=0;fi<foundFields.length;fi++){
    var fid = foundFields[fi].id;
    if(V(fid)) continue; /* 이미 채워진 것은 스킵 */

    for(var li=0;li<lines.length;li++){
      if(lines[li].indexOf(foundFields[fi].kw)>-1){
        /* 같은 행 또는 다음 행에서 숫자 추출 */
        var numMatch = lines[li].match(/[\d,]+\.?\d*/);
        if(numMatch){
          setV(fid, cleanChannelValue(numMatch[0], fid));
          break;
        }
        if(li+1<lines.length){
          var numMatch2 = lines[li+1].match(/[\d,]+\.?\d*/);
          if(numMatch2){
            setV(fid, cleanChannelValue(numMatch2[0], fid));
            break;
          }
        }
      }
    }
  }
}

/* 빈 필드 보충: 키워드-값 인접 방식 */
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
    if(V(fieldMap[fi].id)) continue;
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

/* 헤더를 못 찾았을 때의 fallback */
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

/* ===== [수정5] 이미지 업로드 핸들러 - 재업로드 시 기존 데이터 초기화 ===== */
document.getElementById('chImg').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var img=document.getElementById('chImgP');img.src=URL.createObjectURL(f);img.classList.remove('hidden');
  /* 기존 채널 데이터 초기화 */
  ['ch_views','ch_subs','ch_rev','ch_cpm','ch_rpm','ch_ctr','ch_avg'].forEach(function(id){setV(id,'');});
  document.getElementById('chOcrStatus').textContent='';
  document.getElementById('chOcrStatus').style.color='#fbbf24';
  runOCR(f,'chOcrStatus',parseChannelOCR);
});
document.getElementById('ctImg').addEventListener('change',function(e){
  var f=e.target.files[0];if(!f)return;
  var img=document.getElementById('ctImgP');img.src=URL.createObjectURL(f);img.classList.remove('hidden');
  /* 기존 콘텐츠 데이터 초기화 */
  ['ct_vv','ct_vw','ct_sv','ct_sw'].forEach(function(id){setV(id,'');});
  document.getElementById('ctOcrStatus').textContent='';
  document.getElementById('ctOcrStatus').style.color='#fbbf24';
  runOCR(f,'ctOcrStatus',parseContentOCR);
});
