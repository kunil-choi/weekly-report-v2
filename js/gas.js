/* ===== Step 2: GAS 호출 ===== */

/* [핵심] \r 구분된 녹화 데이터를 "시간 출연자, 시간 출연자" 형태로 변환 */
function parseRecordPairs(recordTimeRaw, performerRaw){
  if(!recordTimeRaw && !performerRaw) return '';
  /* \r 또는 실제 개행을 구분자로 사용 */
  var sep = /\\r|\r|\n/;
  var times = (recordTimeRaw||'').split(sep).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  var perfs = (performerRaw||'').split(sep).map(function(s){return s.trim()}).filter(function(s){return s.length>0});

  if(times.length===0 && perfs.length===0) return '';

  /* 시간과 출연자 수가 같으면 1:1 매칭 */
  if(times.length === perfs.length){
    var pairs=[];
    for(var i=0;i<times.length;i++){
      pairs.push(times[i]+' '+perfs[i]);
    }
    return pairs.join(', ');
  }
  /* 시간만 있거나 출연자만 있는 경우 */
  if(times.length>0 && perfs.length===0) return times.join(', ');
  if(times.length===0 && perfs.length>0) return perfs.join(', ');
  /* 개수 불일치 시 가능한 만큼 매칭, 나머지는 이어붙임 */
  var pairs=[];
  var maxLen=Math.max(times.length,perfs.length);
  for(var i=0;i<maxLen;i++){
    var t=times[i]||'';
    var p=perfs[i]||'';
    pairs.push((t+(t&&p?' ':'')+p).trim());
  }
  return pairs.join(', ');
}

/* studioRecord 필드도 \r 구분으로 "시간 내용, 시간 내용"으로 정리 */
function cleanStudioRecord(studioRecordRaw, recordTimeRaw, performerRaw){
  /* recordTime과 performer가 모두 있으면 그걸로 조합 (더 정확) */
  var fromPairs = parseRecordPairs(recordTimeRaw, performerRaw);
  if(fromPairs) return fromPairs;
  /* fallback: studioRecord 자체를 \r 기준으로 정리 */
  if(!studioRecordRaw) return '';
  var sep = /\\r|\r|\n/;
  var parts = studioRecordRaw.split(sep).map(function(s){return s.trim()}).filter(function(s){return s.length>0});
  return parts.join(', ');
}

function runStep2(){
  var st=document.getElementById('s2status');
  document.getElementById('s2log').innerHTML='';
  st.textContent='Google Apps Script 호출 중...';
  addLog('=== 데이터 수집 시작 ===');
  fetch(GAS_URL+'?action=all').then(function(r){return r.json()}).then(function(data){
    addLog('API 응답 수신','ok');
    if(data.schedule&&data.schedule.success){
      var rows=data.schedule.rows||[];
      var yr=S.baseDate.getFullYear();
      for(var i=0;i<rows.length;i++){
        rows[i]._date=new Date(yr,rows[i].month-1,rows[i].day);
        /* 원본 보존 (clean 전) - \r 파싱에 필요 */
        rows[i]._rawRecordTime = rows[i].recordTime || '';
        rows[i]._rawPerformer = rows[i].performer || '';
        rows[i]._rawStudioRecord = rows[i].studioRecord || '';
        /* 녹화 일정: "시간 출연자, 시간 출연자" 형태로 정리 */
        rows[i].studioRecordClean = cleanStudioRecord(rows[i].studioRecord, rows[i].recordTime, rows[i].performer);
        rows[i].uploadItem=clean(rows[i].uploadItem);
        rows[i].studioRecord=clean(rows[i].studioRecord);
        rows[i].note=clean(rows[i].note);
        rows[i].recordTime=clean(rows[i].recordTime||'');
      }
      S.lastSch=rows.filter(function(r){return inRange(r._date,S.lws,S.lwe)});
      S.thisSch=rows.filter(function(r){return inRange(r._date,S.tws,S.twe)});
      addLog('일정: 전체 '+rows.length+'건 / 지난주 '+S.lastSch.length+'건, 이번주 '+S.thisSch.length+'건','ok');
      toast('일정표 수집 완료','success');
    }else{addLog('일정표 실패','err')}
    if(data.youtube&&data.youtube.success){
      var vids=data.youtube.videos||[];
      for(var i=0;i<vids.length;i++){vids[i]._date=new Date(vids[i].published);vids[i].title=clean(vids[i].title)}
      S.yt=vids.filter(function(v){return inRange(v._date,S.lws,S.lwe)});
      S.yt.sort(function(a,b){return a._date-b._date});
      addLog('유튜브: 전체 '+vids.length+'건 / 지난주 '+S.yt.length+'건','ok');
      toast('유튜브 수집 완료','success');
    }else{addLog('유튜브 실패','err')}
    document.getElementById('s2load').classList.add('hidden');
    document.getElementById('s2result').classList.remove('hidden');
    renderS2();
  }).catch(function(e){addLog('오류: '+e.message,'err');document.getElementById('s2load').classList.add('hidden');document.getElementById('s2result').classList.remove('hidden')});
}

/* ===== Step 2 렌더링 ===== */
function renderS2(){
  /* 유튜브 */
  var yd=document.getElementById('ytR');
  if(!S.yt.length){yd.innerHTML='<p class="ts tm">영상 없음</p>'}
  else{var h='<table class="tbl"><tr><th>날짜</th><th>제목</th><th>조회수</th></tr>';for(var i=0;i<S.yt.length;i++){var v=S.yt[i];h+='<tr><td>'+fmt(v._date)+'</td><td>'+v.title+'</td><td>'+Number(v.views).toLocaleString()+'</td></tr>'}h+='</table>';yd.innerHTML=h}

  /* ===== [수정1] 지난주 일정: 녹화 + 특이사항만 표시 (업로드 컬럼 제거) ===== */
  var ld=document.getElementById('schLast');
  if(!S.lastSch.length){ld.innerHTML='<p class="ts tm">일정 없음</p>'}
  else{
    var byDate={}, order=[];
    for(var i=0;i<S.lastSch.length;i++){
      var r=S.lastSch[i];
      var key=r.dateStr;
      if(!byDate[key]){byDate[key]={dateStr:r.dateStr,records:[],notes:[]};order.push(key);}
      if(r.studioRecordClean) byDate[key].records.push(r.studioRecordClean);
      if(r.note) byDate[key].notes.push(r.note);
    }
    var h='<table class="tbl"><tr><th>날짜</th><th>녹화</th><th>특이사항</th></tr>';
    for(var oi=0;oi<order.length;oi++){
      var g=byDate[order[oi]];
      h+='<tr><td>'+g.dateStr+'</td>';
      h+='<td>'+(g.records.length?g.records.join(', '):'-')+'</td>';
      h+='<td>'+(g.notes.length?g.notes.join(', '):'-')+'</td></tr>';
    }
    h+='</table>';ld.innerHTML=h;
  }

  /* ===== [수정2] 이번주 일정: 녹화를 "시간 내용, 시간 내용" 형태로 표시 ===== */
  var td=document.getElementById('schThis');
  if(!S.thisSch.length){td.innerHTML='<p class="ts tm">일정 없음</p>'}
  else{
    var byDate2={}, order2=[];
    for(var i=0;i<S.thisSch.length;i++){
      var r=S.thisSch[i];
      var key=r.dateStr;
      if(!byDate2[key]){byDate2[key]={dateStr:r.dateStr,uploads:[],records:[],notes:[]};order2.push(key);}
      if(r.uploadItem) byDate2[key].uploads.push(r.uploadItem);
      /* 녹화: 이미 정리된 studioRecordClean 사용 */
      if(r.studioRecordClean) byDate2[key].records.push(r.studioRecordClean);
      if(r.note) byDate2[key].notes.push(r.note);
    }
    var h='<table class="tbl"><tr><th>날짜</th><th>업로드</th><th>녹화</th><th>특이사항</th></tr>';
    for(var oi=0;oi<order2.length;oi++){
      var g=byDate2[order2[oi]];
      h+='<tr><td>'+g.dateStr+'</td>';
      h+='<td>'+(g.uploads.length?g.uploads.join(', '):'-')+'</td>';
      h+='<td>'+(g.records.length?g.records.join(', '):'-')+'</td>';
      h+='<td>'+(g.notes.length?g.notes.join(', '):'-')+'</td></tr>';
    }
    h+='</table>';td.innerHTML=h;
  }
}
