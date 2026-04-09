/* ===== Step 2: GAS 호출 ===== */
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
        rows[i].uploadItem=clean(rows[i].uploadItem);
        rows[i].studioRecord=clean(rows[i].studioRecord);
        rows[i].note=clean(rows[i].note);
        /* recordTime 정리 */
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
    /* 날짜별 그룹핑 */
    var byDate={}, order=[];
    for(var i=0;i<S.lastSch.length;i++){
      var r=S.lastSch[i];
      var key=r.dateStr;
      if(!byDate[key]){byDate[key]={dateStr:r.dateStr,records:[],notes:[]};order.push(key);}
      if(r.studioRecord) byDate[key].records.push(r.studioRecord);
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

  /* ===== [수정2] 이번주 일정: 같은날 복수 일정 → "시간 내용, 시간 내용" ===== */
  var td=document.getElementById('schThis');
  if(!S.thisSch.length){td.innerHTML='<p class="ts tm">일정 없음</p>'}
  else{
    var byDate2={}, order2=[];
    for(var i=0;i<S.thisSch.length;i++){
      var r=S.thisSch[i];
      var key=r.dateStr;
      if(!byDate2[key]){byDate2[key]={dateStr:r.dateStr,uploads:[],records:[],notes:[]};order2.push(key);}
      if(r.uploadItem) byDate2[key].uploads.push(r.uploadItem);
      /* 녹화: 시간+내용 결합 */
      if(r.studioRecord){
        var recEntry = r.recordTime ? (r.recordTime+' '+r.studioRecord) : r.studioRecord;
        byDate2[key].records.push(recEntry);
      }
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
