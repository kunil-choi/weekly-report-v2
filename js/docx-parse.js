/* ===== Step 1: 지난주 보고서 DOCX 파싱 ===== */
document.getElementById('fi1').addEventListener('change',function(e){
  var f=e.target.files[0];
  if(!f)return;
  document.getElementById('fn1').textContent='📎 '+f.name;
  document.getElementById('prevDocStatus').textContent='📄 보고서 파싱 중...';

  /* [수정3] 파일명에서 주차 정보 추출 */
  var fnMatch = f.name.match(/(\d{2,4})\s*년?\s*_?\s*(\d{1,2})\s*월\s*_?\s*(\d{1,2})\s*주차/);
  if(fnMatch){
    S.prevYear = parseInt(fnMatch[1],10);
    if(S.prevYear<100) S.prevYear += 2000;
    S.prevMonth = parseInt(fnMatch[2],10);
    S.prevWeekNum = parseInt(fnMatch[3],10);
  }

  var reader=new FileReader();
  reader.onload=function(ev){
    mammoth.convertToHtml({arrayBuffer:ev.target.result}).then(function(result){
      parsePrevReport(result.value);
      document.getElementById('prevDocStatus').textContent='✅ 지지난주 데이터 자동 추출 완료';
      document.getElementById('prevDocStatus').style.color='#34d399';
      toast('지난주 보고서에서 지지난주 데이터를 추출했습니다','success');
    }).catch(function(err){
      console.error('mammoth error',err);
      document.getElementById('prevDocStatus').textContent='❌ 파싱 실패: '+err.message;
      document.getElementById('prevDocStatus').style.color='#f87171';
    });
  };
  reader.readAsArrayBuffer(f);
});

function parsePrevReport(html){
  console.log('parsePrevReport HTML length:',html.length);

  /* [수정3] HTML 내에서도 제목/주차 정보 추출 시도 */
  var titleMatch = html.match(/머니올라[^<]*?(\d{2,4})\s*년?\s*_?\s*(\d{1,2})\s*월\s*_?\s*(\d{1,2})\s*주차/);
  if(titleMatch && !S.prevWeekNum){
    S.prevYear = parseInt(titleMatch[1],10);
    if(S.prevYear<100) S.prevYear += 2000;
    S.prevMonth = parseInt(titleMatch[2],10);
    S.prevWeekNum = parseInt(titleMatch[3],10);
  }

  var div=document.createElement('div');
  div.innerHTML=html;
  var tables=div.querySelectorAll('table');

  /* [수정1] docx에서 일정 테이블 파싱: 녹화, 특이사항만 추출 */
  S._prevSchedule = [];

  for(var ti=0;ti<tables.length;ti++){
    var rows=tables[ti].querySelectorAll('tr');
    var headerText='';
    if(rows.length>0){
      var ths=rows[0].querySelectorAll('td,th');
      for(var j=0;j<ths.length;j++) headerText+=(ths[j].textContent||'')+' ';
    }
    headerText=headerText.trim();

    /* 채널 현황 테이블 */
    if(headerText.indexOf('CPM')>-1 && headerText.indexOf('RPM')>-1){
      if(rows.length>=2){
        var cells=rows[1].querySelectorAll('td');
        if(cells.length>=8){
          setV('ch2_views',(cells[1]||{}).textContent||'');
          setV('ch2_subs',(cells[2]||{}).textContent||'');
          setV('ch2_rev',(cells[3]||{}).textContent||'');
          setV('ch2_cpm',(cells[4]||{}).textContent||'');
          setV('ch2_rpm',(cells[5]||{}).textContent||'');
          setV('ch2_ctr',(cells[6]||{}).textContent||'');
          setV('ch2_avg',(cells[7]||{}).textContent||'');
        }
      }
    }

    /* 콘텐츠 유형 테이블 */
    if(headerText.indexOf('시청')>-1 && !headerText.match(/CPM/)){
      for(var ri=1;ri<rows.length;ri++){
        var cells=rows[ri].querySelectorAll('td');
        if(cells.length<3)continue;
        var rowText='';
        for(var ci=0;ci<cells.length;ci++) rowText+=(cells[ci].textContent||'')+' ';
        
        /* 조회수와 시청시간은 항상 마지막 2개 셀 */
        var viewsCell=(cells[cells.length-2]||{}).textContent||'';
        var watchCell=(cells[cells.length-1]||{}).textContent||'';
        
        if(rowText.indexOf('동영상')>-1){
          setV('ct2_vv',viewsCell);
          setV('ct2_vw',watchCell);
        }
        if(rowText.match(/쇼츠|Shorts|shorts/i)){
          setV('ct2_sv',viewsCell);
          setV('ct2_sw',watchCell);
        }
      }
    }

    /* [수정1] 일정 테이블에서 녹화/특이사항 추출 */
    if(headerText.indexOf('날짜')>-1 && (headerText.indexOf('녹화')>-1 || headerText.indexOf('스튜디오')>-1)){
      /* 헤더에서 각 컬럼 인덱스 찾기 */
      var hdCells = rows[0].querySelectorAll('td,th');
      var colDate=-1, colRec=-1, colNote=-1;
      for(var ci=0;ci<hdCells.length;ci++){
        var ct=(hdCells[ci].textContent||'').trim();
        if(ct.indexOf('날짜')>-1) colDate=ci;
        if(ct.indexOf('녹화')>-1 || ct.indexOf('스튜디오')>-1) colRec=ci;
        if(ct.indexOf('특이')>-1) colNote=ci;
      }
      for(var ri=1;ri<rows.length;ri++){
        var cells=rows[ri].querySelectorAll('td');
        var dateVal = colDate>=0 && cells[colDate] ? (cells[colDate].textContent||'').trim() : '';
        var recVal  = colRec>=0 && cells[colRec]  ? (cells[colRec].textContent||'').trim() : '';
        var noteVal = colNote>=0 && cells[colNote] ? (cells[colNote].textContent||'').trim() : '';
        if(dateVal){
          S._prevSchedule.push({date:dateVal, rec:recVal, note:noteVal});
        }
      }
    }
  }
  console.log('_prevSchedule extracted:', S._prevSchedule.length, 'rows');
}
