function doGet(e) {
  var action = (e.parameter.action || '').toLowerCase();
  var result = {};
  try {
    if (action === 'schedule') result = getSchedule();
    else if (action === 'youtube') result = getYouTube();
    else if (action === 'docnotes') result = { docnotes: getDocNotes() };
    else if (action === 'all') result = { schedule: getSchedule(), youtube: getYouTube(), docnotes: getDocNotes() };
    else result = { error: 'action 파라미터 필요 (schedule, youtube, docnotes, all)' };
  } catch (err) {
    result = { error: err.toString(), stack: err.stack };
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSchedule() {
  var docId = '1bgzLVIuVQUK9TDgY5pAzR_XcQzWKEsQaDS8f9CDDlZ8';
  var url = 'https://docs.google.com/document/d/' + docId + '/export?format=txt';
  var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  var text = response.getContentText();
  var rows = [];

  var blocks = text.split(/(?=\d{1,2}월\s*\d{1,2}일)/);

  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i].trim();
    if (!block) continue;

    var dateMatch = block.match(/^(\d{1,2})월\s*(\d{1,2})일\s*\((.)\)/);
    if (!dateMatch) continue;

    var month = parseInt(dateMatch[1]);
    var day = parseInt(dateMatch[2]);
    var dayOfWeek = dateMatch[3];
    var dateStr = dateMatch[1] + '월 ' + dateMatch[2] + '일(' + dayOfWeek + ')';

    var parts = block.split('\t');
    var recordTimeRaw = '';
    var performerRaw = '';
    var producerRaw = '';
    var editorRaw = '';
    var uploadItemRaw = '';
    var noteRaw = '';

    if (parts.length >= 2) recordTimeRaw = parts[1].replace(/;/g, ':').trim();
    if (parts.length >= 3) performerRaw = parts[2].trim();
    if (parts.length >= 4) producerRaw = parts[3].trim();
    if (parts.length >= 5) editorRaw = parts[4].trim();
    if (parts.length >= 6) uploadItemRaw = parts[5].trim();
    if (parts.length >= 8) noteRaw = parts[7].trim();

    var studioRecord = buildStudioRecord(recordTimeRaw, performerRaw);

    var recordTime = recordTimeRaw.replace(/\n/g, '\\r');
    var performer = performerRaw.replace(/\n/g, '\\r');
    var uploadItem = uploadItemRaw.replace(/\n/g, ' ').trim();
    var note = noteRaw.replace(/\n/g, ' ').trim();

    rows.push({
      dateStr: dateStr,
      month: month,
      day: day,
      recordTime: recordTime,
      performer: performer,
      producer: producerRaw.replace(/\n/g, ' ').trim(),
      editor: editorRaw.replace(/\n/g, ' ').trim(),
      uploadItem: uploadItem,
      studioRecord: studioRecord,
      note: note
    });
  }

  return { success: true, count: rows.length, rows: rows };
}

function buildStudioRecord(recordTimeRaw, performerRaw) {
  if (!recordTimeRaw && !performerRaw) return '';

  var times = recordTimeRaw.split(/\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });
  var perfs = performerRaw.split(/\n/).map(function(s){ return s.trim(); }).filter(function(s){ return s.length > 0; });

  if (times.length === 0 && perfs.length > 0) return perfs.join(', ');
  if (times.length > 0 && perfs.length === 0) return times.join(', ');

  var pairs = [];
  var maxLen = Math.max(times.length, perfs.length);
  for (var k = 0; k < maxLen; k++) {
    var t = times[k] || '';
    var p = perfs[k] || '';
    if (t && p) pairs.push(t + ' ' + p);
    else if (t) pairs.push(t);
    else if (p) pairs.push(p);
  }

  return pairs.join(', ');
}

function getYouTube() {
  var channelId = 'UCAySceX4rbSr408F1dUpuUw';
  var rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
  var videos = [];
  var xml = '';
  var lastError = '';

  // 최대 3회 재시도
  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var response = UrlFetchApp.fetch(rssUrl, {muteHttpExceptions: true});
      var code = response.getResponseCode();
      xml = response.getContentText();
      
      if (code === 200 && xml.indexOf('<entry>') !== -1) {
        break; // 성공
      } else {
        lastError = 'HTTP ' + code + ', entry 없음 (시도 ' + attempt + ')';
        xml = '';
        if (attempt < 3) Utilities.sleep(2000);
      }
    } catch (err) {
      lastError = err.toString() + ' (시도 ' + attempt + ')';
      xml = '';
      if (attempt < 3) Utilities.sleep(2000);
    }
  }

  if (!xml || xml.indexOf('<entry>') === -1) {
    return { success: true, count: 0, videos: [], note: 'RSS 수신 실패: ' + lastError };
  }

  var entryBlocks = xml.split('<entry>');
  for (var i = 1; i < entryBlocks.length; i++) {
    var block = entryBlocks[i];

    var titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
    var title = titleMatch ? titleMatch[1].trim() : '';
    title = title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

    var pubMatch = block.match(/<published>([\s\S]*?)<\/published>/);
    var published = pubMatch ? pubMatch[1].trim() : '';

    var vidMatch = block.match(/<yt:videoId>([\s\S]*?)<\/yt:videoId>/);
    var videoId = vidMatch ? vidMatch[1].trim() : '';

    var viewsMatch = block.match(/<media:statistics\s+views="(\d+)"/);
    var views = viewsMatch ? viewsMatch[1] : '0';

    if (title && published) {
      videos.push({
        title: title,
        videoId: videoId,
        published: published,
        views: views
      });
    }
  }

  return { success: true, count: videos.length, videos: videos };
}

function getDocNotes() {
  try {
    var docId = '1bgzLVIuVQUK9TDgY5pAzR_XcQzWKEsQaDS8f9CDDlZ8';
    var url = 'https://docs.google.com/document/d/' + docId + '/export?format=txt';
    var response = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
    var text = response.getContentText();

    var yangNote = '';
    var choiNote = '';

    var mY = text.match(/\*\s*양영은\s*[:：]\s*(.+)/);
    if (mY) yangNote = mY[1].trim();

    var mC = text.match(/\*\s*최건일\s*[:：]\s*(.+)/);
    if (mC) choiNote = mC[1].trim();

    return { yangNote: yangNote, choiNote: choiNote };
  } catch (err) {
    return { yangNote: '', choiNote: '', error: err.message };
  }
}
