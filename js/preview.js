/* ===== [수정3] 보고서 제목 자동 생성 ===== */
function getReportTitle(){
  var year,month,week;
  if(S.prevWeekNum){
    year=S.prevYear;month=S.prevMonth;week=S.prevWeekNum+1;
    if(week>5){week=1;month++;if(month>12){month=1;year++;}}
  }else{
    var d=S.tws||new Date();year=d.getFullYear();month=d.getMonth()+1;week=weekOfMonth(d);
  }
  return '머니올라 '+year+'년 '+month+'월 '+week+'주차 보고';
}
function getReportFileName(){
  var year,month,week;
  if(S.prevWeekNum){
    year=S.prevYear;month=S.prevMonth;week=S.prevWeekNum+1;
    if(week>5){week=1;month++;if(month>12){month=1;year++;}}
  }else{
    var d=S.tws||new Date();year=d.getFullYear();month=d.getMonth()+1;week=weekOfMonth(d);
  }
  var yy=String(year).slice(-2);
  return '머니올라_'+yy+'년_'+month+'월_'+week+'주차_보고.docx';
}

/* ===== Step 6: 미리보기 ===== */
function buildPreview(){
  var a=document.getElementById('prevArea');var h='';
  var lwRange=fmtShort(S.lws)+'~'+fmtShort(S.lwe);
  var twRange=fmtShort(S.tws)+'~'+fmtShort(S.twe);
  var title=getReportTitle();

  h+='<h3>■ '+title+'</h3>';

  /* ===== 지난주 실적 테이블 ===== */
  /* [수정1] 지난주: 업로드는 유튜브 영상 섹션에 이미 표시되므로 녹화+특이사항+조회수만 표시 */
  h+='<h4 style="color:#818cf8;margin:14px 0 6px"><span class="wl last">지난주</span> '+lwRange+'</h4>';
  h+='<table class="tbl" id="t1a"><tr><th>날짜</th><th>스튜디오 녹화 일정</th><th>특이사항</th><th>조회수</th></tr>';
  var lwD=daysIn(S.lws,S.lwe);
  for(var di=0;di<lwD.length;di++){
    var d=lwD[di];var dateLabel=fmtShort(d)+'('+DK[d.getDay()]+')';
    var sch=S.lastSch.filter(function(r){return sameDay(r._date,d)});
    var record='-', noteVal='-', views='-';
    if(sch.length){
      var records=[], notes=[];
      for(var si=0;si<sch.length;si++){
        if(sch[si].studioRecord) records.push(sch[si].studioRecord);
        if(sch[si].note) notes.push(sch[si].note);
      }
      record=records.length?records.join(', '):'-';
      noteVal=notes.length?notes.join(', '):'-';
    }
    /* docx에서 추출한 _prevSchedule 보충 (GAS 데이터가 없을 때) */
    if(record==='-' && S._prevSchedule && S._prevSchedule.length){
      for(var pi=0;pi<S._prevSchedule.length;pi++){
        var ps=S._prevSchedule[pi];
        if(ps.date && ps.date.indexOf((d.getMonth()+1)+'/'+d.getDate())>-1){
          if(ps.rec) record=ps.rec;
          if(ps.note) noteVal=ps.note;
        }
      }
    }
    var vid=S.yt.filter(function(v){return sameDay(v._date,d)});
    if(vid.length) views=Number(vid[0].views).toLocaleString();
    h+='<tr><td>'+dateLabel+'</td><td contenteditable="true">'+record+'</td><td contenteditable="true">'+noteVal+'</td><td contenteditable="true">'+views+'</td></tr>';
  }
  h+='</table>';

  /* ===== 이번주 계획 테이블 ===== */
  /* [수정2] 이번주: 같은날 복수 일정 → 콤마 구분 */
  h+='<h4 style="color:#34d399;margin:14px 0 6px"><span class="wl this">이번주</span> '+twRange+'</h4>';
  h+='<table class="tbl" id="t1b"><tr><th>날짜</th><th>업로드 및 예정 아이템</th><th>스튜디오 녹화 일정</th><th>특이사항</th></tr>';
  var twD=daysIn(S.tws,S.twe);
  for(var di=0;di<twD.length;di++){
    var d=twD[di];var dateLabel=fmtShort(d)+'('+DK[d.getDay()]+')';
    var sch=S.thisSch.filter(function(r){return sameDay(r._date,d)});
    var upload='-',record='-',noteVal='-';
    if(sch.length){
      var uploads=[],records=[],notes=[];
      for(var si=0;si<sch.length;si++){
        if(sch[si].uploadItem) uploads.push(sch[si].uploadItem);
        if(sch[si].studioRecord){
          var recEntry = sch[si].recordTime ? (sch[si].recordTime+' '+sch[si].studioRecord) : sch[si].studioRecord;
          records.push(recEntry);
        }
        if(sch[si].note) notes.push(sch[si].note);
      }
      upload=uploads.length?uploads.join(', '):'-';
      record=records.length?records.join(', '):'-';
      noteVal=notes.length?notes.join(', '):'-';
    }
    h+='<tr><td>'+dateLabel+'</td><td contenteditable="true">'+upload+'</td><td contenteditable="true">'+record+'</td><td contenteditable="true">'+noteVal+'</td></tr>';
  }
  h+='</table>';

  /* ===== 채널 현황 ===== */
  h+='<h3>■ 채널 현황 ('+lwRange+')</h3>';
  h+='<table class="tbl" id="t2"><tr><th></th><th>조회수</th><th>구독자</th><th>예상 수익</th><th>재생 기반 CPM</th><th>RPM</th><th>노출 클릭률</th><th>평균 시청 지속 시간</th></tr>';
  h+='<tr><td><b>지난주</b></td><td contenteditable="true">'+(S.ch.views||'')+'</td><td contenteditable="true">'+(S.ch.subs||'')+'</td><td contenteditable="true">'+(S.ch.rev||'')+'</td><td contenteditable="true">'+(S.ch.cpm||'')+'</td><td contenteditable="true">'+(S.ch.rpm||'')+'</td><td contenteditable="true">'+(S.ch.ctr||'')+'</td><td contenteditable="true">'+(S.ch.avg||'')+'</td></tr>';
  h+='<tr><td><b>지지난주</b></td><td contenteditable="true">'+(S.ch2.views||'')+'</td><td contenteditable="true">'+(S.ch2.subs||'')+'</td><td contenteditable="true">'+(S.ch2.rev||'')+'</td><td contenteditable="true">'+(S.ch2.cpm||'')+'</td><td contenteditable="true">'+(S.ch2.rpm||'')+'</td><td contenteditable="true">'+(S.ch2.ctr||'')+'</td><td contenteditable="true">'+(S.ch2.avg||'')+'</td></tr>';
  h+='</table>';

  /* ===== 콘텐츠 유형 ===== */
  h+='<h3>■ 콘텐츠 유형별 ('+lwRange+')</h3>';
  h+='<table class="tbl" id="t3"><tr><th></th><th>조회수</th><th>시청 시간</th></tr>';
  h+='<tr><td><b>지난주 동영상</b></td><td contenteditable="true">'+(S.ct.vv||'')+'</td><td contenteditable="true">'+(S.ct.vw||'')+'</td></tr>';
  h+='<tr><td><b>지난주 Shorts</b></td><td contenteditable="true">'+(S.ct.sv||'')+'</td><td contenteditable="true">'+(S.ct.sw||'')+'</td></tr>';
  h+='<tr><td><b>지지난주 동영상</b></td><td contenteditable="true">'+(S.ct2.vv||'')+'</td><td contenteditable="true">'+(S.ct2.vw||'')+'</td></tr>';
  h+='<tr><td><b>지지난주 Shorts</b></td><td contenteditable="true">'+(S.ct2.sv||'')+'</td><td contenteditable="true">'+(S.ct2.sw||'')+'</td></tr>';
  h+='</table>';

  /* ===== 구독자 & 메모 ===== */
  h+='<h3>■ 구독자 현황</h3>';
  h+='<p id="pSubs" contenteditable="true">현재 구독자 수: <b>'+(S.subs||'')+'</b></p>';
  h+='<h3>■ 팀원별 특이사항</h3>';
  h+='<table class="tbl" id="t4"><tr><th>팀원</th><th>내용</th></tr>';
  h+='<tr><td>양영은</td><td contenteditable="true">'+(S.nY||'-')+'</td></tr>';
  h+='<tr><td>최건일</td><td contenteditable="true">'+(S.nC||'-')+'</td></tr>';
  h+='</table>';
  a.innerHTML=h;
}
