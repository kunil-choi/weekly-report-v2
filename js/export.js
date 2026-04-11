/* ── js/export.js  v3 ──────────────────────────────────────── */

function doGenerateDocx(){
  var D = window.docx;
  if(!D){
    toast('docx 라이브러리 로딩 중… 잠시 후 다시 시도해주세요.');
    return;
  }

  var Document      = D.Document;
  var Packer        = D.Packer;
  var Paragraph     = D.Paragraph;
  var TextRun       = D.TextRun;
  var Table         = D.Table;
  var TableRow      = D.TableRow;
  var TableCell     = D.TableCell;
  var WidthType     = D.WidthType;
  var BorderStyle   = D.BorderStyle;
  var AlignmentType = D.AlignmentType;
  var VerticalAlign = D.VerticalAlign;
  var ShadingType   = D.ShadingType;

  /* ── 제목/파일명 ── */
  var title = S.reportTitle || '머니올라 2026년 4월 2주차 보고';
  var fileName = S.reportFileName || '머니올라_26년_4월_2주차_보고.docx';

  /* ── 공통 스타일 ── */
  var fs = 20; // 10pt
  var fn = 'Noto Sans KR';
  var bd = {style:BorderStyle.SINGLE, size:1, color:'000000'};
  var borders = {top:bd,bottom:bd,left:bd,right:bd};
  var hdrShd = {type:ShadingType.CLEAR, fill:'D9E2F3'};

  function t(text,opts){
    opts=opts||{};
    return new TextRun({text:text||'',font:fn,size:opts.s||fs,bold:!!opts.b,color:opts.c||'000000'});
  }
  function p(text,opts){
    opts=opts||{};
    return new Paragraph({children:[t(text,opts)],spacing:{after:opts.a||100},alignment:opts.al||AlignmentType.LEFT});
  }
  function c(text,opts){
    opts=opts||{};
    return new TableCell({
      children:[new Paragraph({children:[t(text,{b:opts.b,s:opts.s})],alignment:opts.al||AlignmentType.CENTER})],
      borders:borders,
      shading:opts.sh||undefined,
      verticalAlign:VerticalAlign.CENTER,
      width:opts.w?{size:opts.w,type:WidthType.DXA}:undefined,
      columnSpan:opts.cs||undefined,
      rowSpan:opts.rs||undefined
    });
  }

  /* ── 날짜 범위 ── */
  var lastR = S.lastLabel || '3/31~4/6';
  var thisR = S.thisLabel || '4/7~4/13';
  var prevR = S.prevLabel || '3/24~3/30';

  /* ══════════════════════════════════════════════════
     1. 지난주 실적 테이블
     ══════════════════════════════════════════════════ */
  var r1h = new TableRow({children:[
    c('날짜',{b:true,sh:hdrShd,w:1200}),
    c('유튜브 업로드 콘텐츠',{b:true,sh:hdrShd,w:4500}),
    c('조회수',{b:true,sh:hdrShd,w:1500})
  ]});
  var r1rows = [r1h];

  var lastDays = getDaysInRange(S.lastStart, S.lastEnd);
  lastDays.forEach(function(day){
    var dl = fmtDateLabel(day);
    // 유튜브 영상 제목
    var yt = (S.ytData||[]).filter(function(v){ return sameDay(new Date(v.publishedAt), day); });
    var titles = yt.map(function(v){return v.title||'';}).join(', ') || '-';
    var viewSum = yt.reduce(function(s,v){return s+(v.viewCount||0);},0);
    var vs = viewSum>0 ? viewSum.toLocaleString() : '-';

    r1rows.push(new TableRow({children:[
      c(dl,{w:1200}), c(titles,{al:AlignmentType.LEFT,w:4500}), c(vs,{w:1500})
    ]}));
  });
  var tbl1 = new Table({rows:r1rows, width:{size:7200,type:WidthType.DXA}});

  /* ══════════════════════════════════════════════════
     2. 이번주 계획 테이블
     ══════════════════════════════════════════════════ */
  var r2h = new TableRow({children:[
    c('날짜',{b:true,sh:hdrShd,w:1200}),
    c('업로드 및 예정 아이템',{b:true,sh:hdrShd,w:2800}),
    c('스튜디오 녹화 일정',{b:true,sh:hdrShd,w:2800}),
    c('특이사항',{b:true,sh:hdrShd,w:2000})
  ]});
  var r2rows = [r2h];
  var thisDays = getDaysInRange(S.thisStart, S.thisEnd);
  thisDays.forEach(function(day){
    var dl = fmtDateLabel(day);
    var items = (S.thisSch||[]).filter(function(s){return sameDay(new Date(s.date),day);});
    var ups=[],recs=[],nts=[];
    items.forEach(function(it){
      if(it.uploadItem && it.uploadItem!=='-' && it.uploadItem!=='') ups.push(it.uploadItem);
      var rc=it.studioRecordClean||it.studioRecord||'';
      if(rc && rc!=='-') recs.push(rc);
      if(it.note && it.note!=='-' && it.note!=='') nts.push(it.note);
    });
    r2rows.push(new TableRow({children:[
      c(dl,{w:1200}),
      c(ups.join(', ')||'-',{al:AlignmentType.LEFT,w:2800}),
      c(recs.join(', ')||'-',{w:2800}),
      c(nts.join(', ')||'-',{w:2000})
    ]}));
  });
  var tbl2 = new Table({rows:r2rows, width:{size:8800,type:WidthType.DXA}});

  /* ══════════════════════════════════════════════════
     3. 채널 현황 (가로 8열)
     ══════════════════════════════════════════════════ */
  var chH = new TableRow({children:[
    c('',{b:true,sh:hdrShd,w:1300}),
    c('조회수',{b:true,sh:hdrShd,w:1300}),
    c('구독자',{b:true,sh:hdrShd,w:1200}),
    c('예상 수익',{b:true,sh:hdrShd,w:1200}),
    c('재생 기반 CPM',{b:true,sh:hdrShd,w:1300}),
    c('RPM',{b:true,sh:hdrShd,w:900}),
    c('노출 클릭률',{b:true,sh:hdrShd,w:1100}),
    c('평균 시청 지속 시간',{b:true,sh:hdrShd,w:1700})
  ]});
  var chR1 = new TableRow({children:[
    c(lastR),
    c(getV('ch_views')||'-'), c(getV('ch_subs')||'-'), c(getV('ch_rev')||'-'),
    c(getV('ch_cpm')||'-'), c(getV('ch_rpm')||'-'), c(getV('ch_ctr')||'-'), c(getV('ch_avg')||'-')
  ]});
  var chR2 = new TableRow({children:[
    c(prevR),
    c(getV('ch2_views')||'-'), c(getV('ch2_subs')||'-'), c(getV('ch2_rev')||'-'),
    c(getV('ch2_cpm')||'-'), c(getV('ch2_rpm')||'-'), c(getV('ch2_ctr')||'-'), c(getV('ch2_avg')||'-')
  ]});
  var tbl3 = new Table({rows:[chH,chR1,chR2], width:{size:10000,type:WidthType.DXA}});

  /* ══════════════════════════════════════════════════
     4. 콘텐츠 유형별 (4열, 날짜범위+유형+조회수+시청시간)
     ══════════════════════════════════════════════════ */
  var ctH = new TableRow({children:[
    c('',{b:true,sh:hdrShd,w:1500}),
    c('',{b:true,sh:hdrShd,w:1500}),
    c('조회수',{b:true,sh:hdrShd,w:3500}),
    c('시청 시간',{b:true,sh:hdrShd,w:3500})
  ]});
  var ctR1 = new TableRow({children:[
    c(lastR), c('동영상'), c(getV('ct_vv')||'-'), c(getV('ct_vw')||'-')
  ]});
  var ctR2 = new TableRow({children:[
    c(''), c('Shorts'), c(getV('ct_sv')||'-'), c(getV('ct_sw')||'-')
  ]});
  var ctR3 = new TableRow({children:[
    c(prevR), c('동영상'), c(getV('ct2_vv')||'-'), c(getV('ct2_vw')||'-')
  ]});
  var ctR4 = new TableRow({children:[
    c(''), c('Shorts'), c(getV('ct2_sv')||'-'), c(getV('ct2_sw')||'-')
  ]});
  var tbl4 = new Table({rows:[ctH,ctR1,ctR2,ctR3,ctR4], width:{size:10000,type:WidthType.DXA}});

  /* ══════════════════════════════════════════════════
     5. 팀원별 특이사항
     ══════════════════════════════════════════════════ */
  var ntH = new TableRow({children:[
    c('팀원',{b:true,sh:hdrShd,w:2000}), c('내용',{b:true,sh:hdrShd,w:8000})
  ]});
  var ntR1 = new TableRow({children:[c('양영은'), c(getV('noteY')||'-',{al:AlignmentType.LEFT})]});
  var ntR2 = new TableRow({children:[c('최건일'), c(getV('noteC')||'-',{al:AlignmentType.LEFT})]});
  var tbl5 = new Table({rows:[ntH,ntR1,ntR2], width:{size:10000,type:WidthType.DXA}});

  /* ══════════════════════════════════════════════════
     문서 조립
     ══════════════════════════════════════════════════ */
  var sp = function(n){ return new Paragraph({children:[],spacing:{after:n||200}}); };
  var curSubs = getV('curSubs')||'';

  var doc = new Document({
    sections:[{
      properties:{page:{margin:{top:1000,bottom:1000,left:1200,right:1200}}},
      children:[
        p('■ '+title, {b:true, s:24, a:150}),
        sp(50),

        p('▸ 지난주 실적 ('+lastR+')', {b:true, s:22, a:100}),
        tbl1, sp(),

        p('▸ 이번주 계획 ('+thisR+')', {b:true, s:22, a:100}),
        tbl2, sp(),

        p('■ 채널 현황 ('+lastR+')', {b:true, s:24, a:150}),
        tbl3, sp(),

        p('■ 콘텐츠 유형별 ('+lastR+')', {b:true, s:24, a:150}),
        tbl4, sp(),

        p('■ 구독자 현황', {b:true, s:24, a:150}),
        p('현재 구독자 수: '+curSubs),
        sp(),

        p('■ 팀원별 특이사항', {b:true, s:24, a:150}),
        tbl5
      ]
    }]
  });

  Packer.toBlob(doc).then(function(blob){
    saveAs(blob, fileName);
    toast('문서 다운로드 완료: '+fileName);
  }).catch(function(e){
    console.error('DOCX error:', e);
    toast('문서 생성 오류: '+e.message);
  });
}

var btnGen = document.getElementById('btnGen');
if(btnGen) btnGen.addEventListener('click', doGenerateDocx);
