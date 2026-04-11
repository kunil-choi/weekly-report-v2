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

/* ===== 채널 현황 OCR 파싱 v6 ===== */
/* 키워드(라벨) 기반 파싱 → 패턴 기반 보완 이중 전략 */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR v6 시작 ===');

  var lines = text.split('\n').map(function(l){return l.trim();}).filter(function(l){return l.length>0;});
  var fullText = text.replace(/\n/g, ' ');

  for(var i=0;i<lines.length;i++) console.log('LINE'+i+': ['+lines[i]+']');

  var R = {views:'', subs:'', rev:'', cpm:'', rpm:'', ctr:'', avg:''};

  /* ── 헬퍼 함수들 ── */

  /* 문자열에서 첫 번째 통화 숫자 추출 (₩, ￦ 우선, 그 다음 일반 큰 숫자) */
  function grabCurrency(str){
    var m = str.match(/[₩￦＼]\s*([\d,]+(?:\.\d+)?)/);
    if(m) return m[1];
    /* W가 단어 일부가 아닌 경우만 (W 앞이 알파벳이 아닌 경우) */
    m = str.match(/(?:^|[^a-zA-Z])W([\d,]+(?:\.\d+)?)/);
    if(m) return m[1];
    /* \숫자 */
    m = str.match(/\\([\d,]+(?:\.\d+)?)/);
    if(m) return m[1];
    /* 통화기호 없이 숫자만 있는 경우 */
    m = str.match(/([\d,]{3,}(?:\.\d+)?)/);
    if(m) return m[1];
    return '';
  }

  /* 문자열에서 첫 번째 일반 숫자 추출 (+/- 부호 포함) */
  function grabNumber(str){
    var m = str.match(/([+\-])?\s*([\d,]+(?:\.\d+)?)/);
    if(!m) return '';
    var sign = m[1] || '';
    return sign + m[2];
  }

  /* 퍼센트 추출 */
  function grabPercent(str){
    var m = str.match(/([\d.]+)\s*%/);
    return m ? m[1]+'%' : '';
  }

  /* 시간(mm:ss) 추출 */
  function grabTime(str){
    var m = str.match(/(\d{1,2}:\d{2})/);
    return m ? m[1] : '';
  }

  /* ──────────────────────────────────────────
     방법 A: 키워드(라벨) 근처에서 값을 찾기
     YouTube Analytics의 라벨은 값의 바로 위 또는 같은 줄에 있음
     ────────────────────────────────────────── */

  /* 라인 인덱스 기반 검색: 키워드가 있는 라인 + 다음 라인에서 값 추출 */
  var fullLower = fullText.toLowerCase();

  /* 키워드 → 필드 매핑 (우선순위 순) */
  var kwDefs = [
    {field:'avg',  kws:['평균 시청 지속 시간','평균시청지속시간','평균 시청 지속시간','시청 지속 시간','average view duration','view duration'], extract: grabTime},
    {field:'ctr',  kws:['노출 클릭률','노출클릭률','클릭률','impressions click-through','click-through rate','ctr'], extract: grabPercent},
    {field:'rev',  kws:['예상 수익','예상수익','estimated revenue'], extract: grabCurrency},
    {field:'cpm',  kws:['재생 기반 cpm','재생기반 cpm','재생 기반cpm','playback-based cpm','playback based cpm'], extract: grabCurrency},
    {field:'rpm',  kws:['rpm'], extract: grabCurrency},
    {field:'views',kws:['조회수','조회 수'], extract: grabNumber},
    {field:'subs', kws:['구독자','구독 자','subscribers'], extract: grabNumber}
  ];

  /* 라인 단위 검색 */
  for(var ki=0; ki<kwDefs.length; ki++){
    var def = kwDefs[ki];
    if(R[def.field]) continue;

    for(var kwi=0; kwi<def.kws.length; kwi++){
      if(R[def.field]) break;
      var kw = def.kws[kwi].toLowerCase();

      for(var li=0; li<lines.length; li++){
        if(R[def.field]) break;
        var lineLower = lines[li].toLowerCase();
        var kwPos = lineLower.indexOf(kw);
        if(kwPos === -1) continue;

        /* 같은 줄에서 키워드 뒤의 텍스트 검색 */
        var afterKw = lines[li].substring(kwPos + kw.length);
        var val = def.extract(afterKw);

        /* 같은 줄에 없으면 다음 줄 검색 */
        if(!val && li+1 < lines.length){
          val = def.extract(lines[li+1]);
        }

        /* RPM 특수 처리: CPM과 같은 줄에 있을 때 두 번째 통화값 */
        if(def.field === 'rpm' && !val){
          /* fullText에서 RPM 키워드 뒤 검색 */
          var rpmIdx = fullLower.indexOf('rpm');
          if(rpmIdx > -1){
            var afterRpm = fullText.substring(rpmIdx + 3, rpmIdx + 60);
            val = grabCurrency(afterRpm);
          }
        }

        if(val){
          R[def.field] = val;
          console.log('A: '+def.field+' = "'+val+'" (키워드: "'+def.kws[kwi]+'" @ line '+li+')');
        }
      }
    }
  }

  /* fullText 기반 보완 (라인 단위에서 못 찾은 경우) */
  for(var ki=0; ki<kwDefs.length; ki++){
    var def = kwDefs[ki];
    if(R[def.field]) continue;

    for(var kwi=0; kwi<def.kws.length; kwi++){
      if(R[def.field]) break;
      var kw = def.kws[kwi].toLowerCase();
      var idx = fullLower.indexOf(kw);
      if(idx === -1) continue;

      var after = fullText.substring(idx + kw.length, idx + kw.length + 80);
      var val = def.extract(after);
      if(val){
        R[def.field] = val;
        console.log('A(full): '+def.field+' = "'+val+'" (키워드: "'+def.kws[kwi]+'")');
      }
    }
  }

  console.log('방법A 결과:', JSON.stringify(R));

  /* ──────────────────────────────────────────
     방법 B: 패턴 기반 보완 (비어있는 필드만 채움)
     ────────────────────────────────────────── */

  /* B-1) 시간 → avg */
  if(!R.avg){
    var tm = fullText.match(/\b(\d{1,2}:\d{2})\b/g);
    if(tm && tm.length) R.avg = tm[0];
  }

  /* B-2) 퍼센트 → ctr */
  if(!R.ctr){
    var pm = fullText.match(/([\d.]+)\s*%/);
    if(pm) R.ctr = pm[1]+'%';
  }

  /* B-3) 통화 숫자 → rev, cpm, rpm */
  if(!R.rev || !R.cpm || !R.rpm){
    var currNums = [];
    var currRe = /[₩￦]\s*([\d,]+(?:\.\d+)?)/g;
    var cm;
    while((cm = currRe.exec(fullText)) !== null){
      var v = parseFloat(cm[1].replace(/,/g,''));
      if(!isNaN(v) && v >= 100) currNums.push({num:cm[1], val:v});
    }
    /* 비단어 W + 숫자 */
    var currRe2 = /(?:^|[^a-zA-Z])W([\d,]+(?:\.\d+)?)/g;
    while((cm = currRe2.exec(fullText)) !== null){
      var v = parseFloat(cm[1].replace(/,/g,''));
      if(!isNaN(v) && v >= 100){
        var dup = false;
        for(var d=0;d<currNums.length;d++) if(currNums[d].val===v){dup=true;break;}
        if(!dup) currNums.push({num:cm[1], val:v});
      }
    }
    currNums.sort(function(a,b){return b.val - a.val;});
    /* 이미 할당된 값 제외 */
    var usedC = {};
    if(R.rev) usedC[parseFloat(R.rev.replace(/,/g,''))] = true;
    if(R.cpm) usedC[parseFloat(R.cpm.replace(/,/g,''))] = true;
    if(R.rpm) usedC[parseFloat(R.rpm.replace(/,/g,''))] = true;
    currNums = currNums.filter(function(c){return !usedC[c.val];});

    console.log('통화B:', currNums.map(function(c){return c.num}).join(', '));

    var ci = 0;
    if(!R.rev && currNums[ci]){R.rev = currNums[ci].num; ci++;}
    if(!R.cpm && currNums[ci]){R.cpm = currNums[ci].num; ci++;}
    if(!R.rpm && currNums[ci]){R.rpm = currNums[ci].num; ci++;}
  }

  /* B-4) 일반 숫자 → views, subs */
  if(!R.views || !R.subs){
    var usedVals = {};
    ['rev','cpm','rpm','views','subs'].forEach(function(f){
      if(R[f]){
        var nv = parseFloat(R[f].replace(/[+\-,]/g,''));
        if(!isNaN(nv)) usedVals[nv] = true;
      }
    });

    /* 통화·시간·퍼센트를 제거한 텍스트에서 숫자 추출 */
    var ct = fullText;
    ct = ct.replace(/\d{1,2}:\d{2}/g,' ');
    ct = ct.replace(/[\d.]+\s*%/g,' ');
    ct = ct.replace(/[₩￦＼]\s*[\d,]+(?:\.\d+)?/g,' ');
    ct = ct.replace(/(?:^|[^a-zA-Z])W[\d,]+/g,' ');
    ct = ct.replace(/\\[\d,]+/g,' ');

    var nums = [];
    var nRe = /([+\-])?\s*([\d,]{2,}(?:\.\d+)?)/g;
    var nm;
    while((nm = nRe.exec(ct)) !== null){
      var raw = nm[2];
      var nv = parseFloat(raw.replace(/,/g,''));
      if(isNaN(nv) || nv <= 0) continue;
      if(usedVals[nv]) continue;
      var signed = !!nm[1];
      nums.push({raw:raw, val:nv, signed:signed, sign:nm[1]||''});
    }

    /* 구독자: +/- 부호가 있는 숫자 */
    if(!R.subs){
      var signedArr = nums.filter(function(n){return n.signed;});
      if(signedArr.length){
        R.subs = signedArr[0].sign + signedArr[0].raw;
        usedVals[signedArr[0].val] = true;
      }
    }
    /* 조회수: 부호 없는 가장 큰 숫자 */
    if(!R.views){
      var unsigned = nums.filter(function(n){return !n.signed && !usedVals[n.val];});
      unsigned.sort(function(a,b){return b.val - a.val;});
      if(unsigned.length) R.views = unsigned[0].raw;
    }
    /* 구독자 fallback: 부호 없는 두 번째 큰 숫자 */
    if(!R.subs){
      var unsigned2 = nums.filter(function(n){return !usedVals[n.val];});
      unsigned2.sort(function(a,b){return b.val - a.val;});
      if(unsigned2.length >= 2) R.subs = unsigned2[1].raw;
    }
  }

  console.log('v6 최종:', JSON.stringify(R));

  /* ── 결과 적용 ── */
  if(R.views) setV('ch_views', R.views);
  if(R.subs)  setV('ch_subs', cleanChannelValue(R.subs, 'ch_subs'));
  if(R.rev)   setV('ch_rev', R.rev);
  if(R.cpm)   setV('ch_cpm', R.cpm);
  if(R.rpm)   setV('ch_rpm', R.rpm);
  if(R.ctr)   setV('ch_ctr', R.ctr);
  if(R.avg)   setV('ch_avg', R.avg);
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

/* ===== 콘텐츠 유형: 만 단위 변환 ===== */
function formatManPct(numStr, pctStr){
  var n = parseFloat((numStr||'').replace(/,/g,''));
  var p = parseFloat((pctStr||'').replace(/[()%]/g,'').trim());
  if(isNaN(n) || isNaN(p)) return '';
  var manStr;
  if(n >= 10000){
    var man = n / 10000;
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

  function extractRow(line){
    if(!line) return {n1:'',p1:'',n2:'',p2:''};
    var data=line.replace(/^.*?(동영상|[Ss]horts|쇼츠)/,'');
    data=data.replace(/\d{1,2}:\d{2}(:\d{2})?/g,' ');

    var tokens=[];
    var re=/([\d,]+\.?\d*)\s*(%)?/g;
    var m;
    while((m=re.exec(data))){
      var val=m[1].replace(/,/g,'');
      var isPct=!!m[2];
      var numVal=parseFloat(val);
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

  function pVal(s){return parseFloat(s)||0;}
  if(vr.p1 && !sr.p1 && pVal(vr.p1)>0) sr.p1=String(Math.round((100-pVal(vr.p1))*10)/10);
  if(sr.p1 && !vr.p1 && pVal(sr.p1)>0) vr.p1=String(Math.round((100-pVal(sr.p1))*10)/10);
  if(vr.p2 && !sr.p2 && pVal(vr.p2)>0) sr.p2=String(Math.round((100-pVal(vr.p2))*10)/10);
  if(sr.p2 && !vr.p2 && pVal(sr.p2)>0) vr.p2=String(Math.round((100-pVal(sr.p2))*10)/10);

  if(vr.p1 && sr.p1){
    var sum1=pVal(vr.p1)+pVal(sr.p1);
    if(sum1>=900 && sum1<=1100){vr.p1=String(Math.round(pVal(vr.p1)/10*10)/10);sr.p1=String(Math.round(pVal(sr.p1)/10*10)/10);}
  }
  if(vr.p2 && sr.p2){
    var sum2=pVal(vr.p2)+pVal(sr.p2);
    if(sum2>=900 && sum2<=1100){vr.p2=String(Math.round(pVal(vr.p2)/10*10)/10);sr.p2=String(Math.round(pVal(sr.p2)/10*10)/10);}
  }

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

/* ===== 이미지 업로드 핸들러 ===== */
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
