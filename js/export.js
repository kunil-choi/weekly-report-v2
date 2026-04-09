/* ===== DOCX 생성 ===== */
/* 핵심 수정: docx@7.8.2/build/index.js 는 UMD 번들이며 window.docx 로 노출됨 */

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

function buildDocTable(D,rows,headerShade){
  var tblRows=[];
  for(var ri=0;ri<rows.length;ri++){
    var cells=[];
    for(var ci=0;ci<rows[ri].length;ci++){
      var isH=(ri===0);
      var cellOpts={
        children:[new D.Paragraph({
          children:[new D.TextRun({text:rows[ri][ci]||'',bold:isH,size:20,font:'Malgun Gothic'})],
          spacing:{after:40}
        })],
        verticalAlign:D.VerticalAlign.CENTER,
        margins:{top:40,bottom:40,left:60,right:60}
      };
      if(isH&&headerShade) cellOpts.shading={fill:headerShade,type:D.ShadingType.CLEAR};
      cells.push(new D.TableCell(cellOpts));
    }
    tblRows.push(new D.TableRow({children:cells}));
  }
  return new D.Table({rows:tblRows,width:{size:9000,type:D.WidthType.DXA}});
}

function doGenerateDocx(){
  var D = window.docx;
  if(!D || !D.Document){
    toast('docx 라이브러리 로딩 중... 잠시 후 재시도합니다.','info');
    /* fallback: 올바른 URL로 재로드 시도 */
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

    children.push(new D.Paragraph({children:[new D.TextRun({text:'■ '+title,bold:true,size:28,font:'Malgun Gothic'})],spacing:{after:200}}));
    var t1=readTbl('t1');if(t1.length)children.push(buildDocTable(D,t1,'D9E2F3'));
    children.push(new D.Paragraph({text:'',spacing:{after:200}}));

    children.push(new D.Paragraph({children:[new D.TextRun({text:'■ 채널 현황 ('+fmtShort(S.lws)+'~'+fmtShort(S.lwe)+')',bold:true,size:24,font:'Malgun Gothic'})],spacing:{before:300,after:200}}));
    var t2=readTbl('t2');if(t2.length)children.push(buildDocTable(D,t2,'E2EFDA'));
    children.push(new D.Paragraph({text:'',spacing:{after:200}}));

    children.push(new D.Paragraph({children:[new D.TextRun({text:'■ 콘텐츠 유형별 ('+fmtShort(S.lws)+'~'+fmtShort(S.lwe)+')',bold:true,size:24,font:'Malgun Gothic'})],spacing:{before:300,after:200}}));
    var t3=readTbl('t3');if(t3.length)children.push(buildDocTable(D,t3,'FCE4D6'));
    children.push(new D.Paragraph({text:'',spacing:{after:200}}));

    var subsEl=document.getElementById('pSubs');
    children.push(new D.Paragraph({children:[new D.TextRun({text:'■ 구독자 현황',bold:true,size:24,font:'Malgun Gothic'})],spacing:{before:300,after:100}}));
    children.push(new D.Paragraph({children:[new D.TextRun({text:subsEl?subsEl.innerText:'',size:20,font:'Malgun Gothic'})],spacing:{after:200}}));

    children.push(new D.Paragraph({children:[new D.TextRun({text:'■ 팀원별 특이사항',bold:true,size:24,font:'Malgun Gothic'})],spacing:{before:300,after:200}}));
    var t4=readTbl('t4');if(t4.length)children.push(buildDocTable(D,t4,'DDDDDD'));

    var doc=new D.Document({sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1000,right:1000,bottom:1000,left:1000}}},children:children}]});

    D.Packer.toBlob(doc).then(function(blob){
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
      toast('문서 생성 완료: '+fname,'success');
    }).catch(function(e){console.error('Packer error:',e);toast('문서 생성 실패: '+e.message,'error');});
  }catch(e){console.error('DOCX error:',e);toast('문서 생성 오류: '+e.message,'error');}
}

document.getElementById('btnGen').addEventListener('click',function(){ doGenerateDocx(); });
