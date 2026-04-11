/* ===== DOCX 생성 ===== */
/* docx@7.8.2/build/index.js → UMD 번들, window.docx 로 접근 */

function readTbl(id){
  var tbl=document.getElementById(id);if(!tbl)return[];
  var rows=tbl.querySelectorAll('tr');var data=[];
  for(var i=0;i<rows.length;i++){
    var cells=rows[i].querySelectorAll('th,td');var row=[];
    for(var j=0;j<cells.length;j++)row.push((cells[j].innerText||cells[j].textContent||'').trim());
    data.push(row);
  }
  return data;
}

function buildDocTable(D,rows,colWidths,headerShade){
  var tblRows=[];
  for(var ri=0;ri<rows.length;ri++){
    var cells=[];
    for(var ci=0;ci<rows[ri].length;ci++){
      var isH=(ri===0);
      var cellOpts={
        children:[new D.Paragraph({
          children:[new D.TextRun({text:rows[ri][ci]||'',bold:isH,size:18,font:'맑은 고딕'})],
          spacing:{after:20,before:20},
          alignment: isH ? D.AlignmentType.CENTER : D.AlignmentType.LEFT
        })],
        verticalAlign:D.VerticalAlign.CENTER,
        margins:{top:30,bottom:30,left:50,right:50}
      };
      if(isH&&headerShade) cellOpts.shading={fill:headerShade,type:D.ShadingType.CLEAR};
      if(colWidths&&colWidths[ci]) cellOpts.width={size:colWidths[ci],type:D.WidthType.DXA};
      cells.push(new D.TableCell(cellOpts));
    }
    tblRows.push(new D.TableRow({children:cells}));
  }
  var tblOpts={rows:tblRows,width:{size:9600,type:D.WidthType.DXA}};
  return new D.Table(tblOpts);
}

function doGenerateDocx(){
  var D = window.docx;
  if(!D || !D.Document){
    toast('docx 라이브러리 로딩 중... 잠시 후 다시 시도해주세요.','info');
    var s = document.createElement('script');
    s.src = 'https://unpkg.com/docx@7.8.2/build/index.js';
    s.onload = function(){
      D = window.docx;
      if(D && D.Document){ doGenerateDocx(); }
      else { toast('docx 라이브러리 로딩 실패. 새로고침 해주세요.','error'); }
    };
    s.onerror = function(){ toast('docx CDN 연결 실패.','error'); };
    document.head.appendChild(s);
    return;
  }

  try{
    var title = getReportTitle();
    var fname = getReportFileName();
    var children=[];

    /* 제목 */
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:'■ '+title,bold:true,size:28,font:'맑은 고딕'})],
      spacing:{after:200}
    }));

    /* 지난주 실적 테이블 */
    var t1a=readTbl('t1a');
    if(t1a.length){
      children.push(new D.Paragraph({
        children:[new D.TextRun({text:'▸ 지난주 실적 ('+fmtShort(S.lws)+'~'+fmtShort(S.lwe)+')',bold:true,size:22,font:'맑은 고딕',color:'4472C4'})],
        spacing:{before:200,after:100}
      }));
      children.push(buildDocTable(D,t1a,[1200,3200,2800,2400],'D9E2F3'));
      children.push(new D.Paragraph({text:'',spacing:{after:120}}));
    }

    /* 이번주 계획 테이블 */
    var t1b=readTbl('t1b');
    if(t1b.length){
      children.push(new D.Paragraph({
        children:[new D.TextRun({text:'▸ 이번주 계획 ('+fmtShort(S.tws)+'~'+fmtShort(S.twe)+')',bold:true,size:22,font:'맑은 고딕',color:'00B050'})],
        spacing:{before:200,after:100}
      }));
      children.push(buildDocTable(D,t1b,[1200,2800,2800,2800],'E2EFDA'));
      children.push(new D.Paragraph({text:'',spacing:{after:120}}));
    }

    /* 채널 현황 */
    var t2=readTbl('t2');
    if(t2.length){
      children.push(new D.Paragraph({
        children:[new D.TextRun({text:'■ 채널 현황 ('+fmtShort(S.lws)+'~'+fmtShort(S.lwe)+')',bold:true,size:24,font:'맑은 고딕'})],
        spacing:{before:300,after:100}
      }));
      children.push(buildDocTable(D,t2,null,'D9E2F3'));
      children.push(new D.Paragraph({text:'',spacing:{after:120}}));
    }

    /* 콘텐츠 유형 */
    var t3=readTbl('t3');
    if(t3.length){
      children.push(new D.Paragraph({
        children:[new D.TextRun({text:'■ 콘텐츠 유형별 ('+fmtShort(S.lws)+'~'+fmtShort(S.lwe)+')',bold:true,size:24,font:'맑은 고딕'})],
        spacing:{before:300,after:100}
      }));
      children.push(buildDocTable(D,t3,null,'FCE4D6'));
      children.push(new D.Paragraph({text:'',spacing:{after:120}}));
    }

    /* 구독자 현황 */
    var subsEl=document.getElementById('pSubs');
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:'■ 구독자 현황',bold:true,size:24,font:'맑은 고딕'})],
      spacing:{before:300,after:80}
    }));
    children.push(new D.Paragraph({
      children:[new D.TextRun({text:subsEl?(subsEl.innerText||subsEl.textContent):'',size:20,font:'맑은 고딕'})],
      spacing:{after:120}
    }));

    /* 팀원 특이사항 */
    var t4=readTbl('t4');
    if(t4.length){
      children.push(new D.Paragraph({
        children:[new D.TextRun({text:'■ 팀원별 특이사항',bold:true,size:24,font:'맑은 고딕'})],
        spacing:{before:300,after:100}
      }));
      children.push(buildDocTable(D,t4,[2000,7600],'DDDDDD'));
    }

    var doc=new D.Document({
      sections:[{
        properties:{
          page:{
            size:{width:12240,height:15840},
            margin:{top:1000,right:1000,bottom:1000,left:1000}
          }
        },
        children:children
      }]
    });

    D.Packer.toBlob(doc).then(function(blob){
      /* FileSaver 사용 또는 수동 다운로드 */
      if(typeof saveAs === 'function'){
        saveAs(blob,fname);
      } else {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = fname;
        document.body.appendChild(a); a.click();
        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      }
      toast('문서 생성 완료: '+fname,'success');
    }).catch(function(e){console.error('Packer error:',e);toast('문서 생성 실패: '+e.message,'error');});
  }catch(e){console.error('DOCX error:',e);toast('문서 생성 오류: '+e.message,'error');}
}

document.getElementById('btnGen').addEventListener('click',function(){ doGenerateDocx(); });
