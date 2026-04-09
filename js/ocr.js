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

/* ===== 채널 현황 OCR 파싱 ===== */
function parseChannelOCR(text){
  console.log('=== parseChannelOCR 시작 ===');
  var lines = text.split('\n').map(function(l){ return l.trim(); }).filter(function(l){ return l.length > 0; });
  var fullText = lines.join(' ');
  var headerIdx = -1, bestScore = 0;
  var allKeywords = ['조회수','구독자','수익','CPM','RPM','클릭률','클릭율','시청 지속','시청지속'];
  for(var i=0;i<lines.length;i++){
    var score=0;
    for(var k=0;k<allKeywords.length;k++){ if(lines[i].indexOf(allKeywords[k])>-1) score++; }
    if(score>bestScore){bestScore=score;headerIdx=i;}
  }
  if(headerIdx>=0 && bestScore>=3){
    var hLine = lines[headerIdx];
    var valIdx = -1;
    for(var vi=headerIdx+1;vi<Math.min(headerIdx+4,lines.length);vi++){
      if(/\d/.test(lines[vi])){valIdx=vi;break;}
    }
    if(valIdx>=0){
      var fieldDefs = [
        {kw:['평균 시청 지속','평균시청지속','시청 지속 시간','시청지속시간','시청 지속'],id:'ch_avg'},
        {kw:['재생 기반 CPM','재생기반 CPM','기반 CPM','재생 기반'],id:'ch_cpm'},
        {kw:['RPM'],id:'ch_rpm'},
        {kw:['조회수'],id:'ch_views'},
        {kw:['구독자'],id:'ch_subs'},
        {kw:['예상 수익','예상수익','수익'],id:'ch_rev'},
        {kw:['노출 클릭률','노출 클릭율','클릭률','클릭율'],id:'ch_ctr'}
      ];
      var found = [];
      for(var fi=0;fi<fieldDefs.length;fi++){
        var def=fieldDefs[fi], pos=-1, matchedKw='';
        var sorted=def.kw.slice().sort(function(a,b){return b.length-a.length;});
        for(var ki=0;ki<sorted.length;ki++){
          var p=hLine.indexOf(sorted[ki]);
          if(p>-1){pos=p;matchedKw=sorted[ki];break;}
        }
        if(pos>-1) found.push({id:def.id,pos:pos,kw:matchedKw,endPos:pos+matchedKw.length});
      }
      found.sort(function(a,b){return a.pos-b.pos;});
      var vLine = lines[valIdx];
      var vParts = vLine.split(/\t+|\s{2,}/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
      if(found.length === vParts.length){
        for(var pi=0;pi<found.length;pi++) setV(found[pi].id, cleanValue(vParts[pi],found[pi].id));
      } else {
        var valPositions=[], sf=0;
        for(var vi2=0;vi2<vParts.length;vi2++){
          var idx2=vLine.indexOf(vParts[vi2],sf);
          valPositions.push({val:vParts[vi2],pos:idx2,center:idx2+vParts[vi2].length/2});
          sf=idx2+vParts[vi2].length;
        }
        for(var fi2=0;fi2<found.length;fi2++){
          var hCenter=found[fi2].pos+(found[fi2].endPos-found[fi2].pos)/2;
          var bestDist=99999,bestV='';
          for(var vi3=0;vi3<valPositions.length;vi3++){
            var dist=Math.abs(hCenter-valPositions[vi3].center);
            if(dist<bestDist){bestDist=dist;bestV=valPositions[vi3].val;}
          }
          setV(found[fi2].id, cleanValue(bestV,found[fi2].id));
        }
      }
    }
  }
  var fieldMap = [
    {id:'ch_views',kw:['조회수','조회 수'],pattern:/[\d,]+/},
    {id:'ch_subs',kw:['구독자'],pattern:/[\d,]+/},
    {id:'ch_rev',kw:['예상 수익','예상수익','수익'],pattern:/[\d,]+/},
    {id:'ch_cpm',kw:['재생 기반 CPM','재생기반','기반 CPM','CPM'],pattern:/[\d,]+/},
    {id:'ch_rpm',kw:['RPM'],pattern:/[\d,]+/},
    {id:'ch_ctr',kw:['노출 클릭률','노출 클릭율','클릭률','클릭율'],pattern:/[\d\.]+%/},
    {id:'ch_avg',kw:['평균 시청 지속','시청 지속','지속 시간','지속시간'],pattern:/\d+:\d+|\d+분\s*\d+초/}
  ];
  for(var fi=0;fi<fieldMap.length;fi++){
    if(V(fieldMap[fi].id)) continue;
    var fm=fieldMap[fi];
    for(var li=0;li<lines.length;li++){
      var line=lines[li], hasKw=false;
      for(var ki=0;ki<fm.kw.length;ki++){ if(line.indexOf(fm.kw[ki])>-1){hasKw=true;break;} }
      if(!hasKw) continue;
      var match=line.match(fm.pattern);
      if(match){setV(fm.id, cleanValue(match[0],fm.id));break;}
      if(li+1<lines.length){var match2=lines[li+1].match(fm.pattern);if(match2){setV(fm.id, cleanValue(match2[0],fm.id));break;}}
    }
  }
  if(!V('ch_avg')){var tm=fullText.match(/\d+:\d+/);if(tm)setV('ch_avg',tm[0]);}
  if(!V('ch_views')){
    var allNums=fullText.match(/[\d,]+/g);
    if(allNums){var mx=0,ms='';for(var ni=0;ni<allNums.length;ni++){var n=parseInt(allNums[ni].replace(/,/g,''),10);if(n>mx&&n>10000){mx=n;ms=allNums[ni];}}if(ms)setV('ch_views',ms);}
  }
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
