function pushHpDataToGitHub() {
  const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!GITHUB_TOKEN) {
    throw new Error("スクリプトプロパティ 'GITHUB_TOKEN' が設定されていません。");
  }
  const REPO_OWNER    = "GitHub Repository Owner Name";
  const REPO_NAME     = "GitHub Repository Name";
  
  // 💡 保存パスを2つ定義
  const CONTENT_PATH  = "data/content.json";
  const NEWS_PATH     = "data/news.json";
  
  var today = new Date(); 
  var todayStr = Utilities.formatDate(today, "JST", "MM/dd/yyyy");
  
  const HP_SS_ID = PropertiesService.getScriptProperties().getProperty('HP_SS_ID');
  var bk = SpreadsheetApp.openById(HP_SS_ID);

  // Alternatively the spreadsheet could be designated as follows
  // var bk = SpreadsheetApp.openById('Spread Sheet ID for HP contents');

  // 画像直リンク用マップの事前作成
  var folderId = PropertiesService.getScriptProperties().getProperty('IMG_DIR_ID');
  // Alternatively the spreadsheet could be designated as follows
  // var folderId = "Google Drive Image Directory ID"; 

  var folder = DriveApp.getFolderById(folderId);
  var files = folder.getFiles();
  var fileLinkMap = {};
  while (files.hasNext()) {
    var file = files.next();
    fileLinkMap[file.getName().trim()] = "https://lh3.googleusercontent.com/d/" + file.getId();
  }
  
  // コンマ区切りの複数画像にも対応した直リンク変換ヘルパー
  function getUrlOrName(name) {
    if (!name) return "";
    var nameStr = name.toString().trim();
    if (nameStr.indexOf(",") !== -1) {
      var filesArray = nameStr.split(",");
      var linksArray = filesArray.map(function(f) {
        var cleanFileName = f.trim();
        return fileLinkMap[cleanFileName] ? fileLinkMap[cleanFileName] : cleanFileName;
      });
      return linksArray.join(",");
    }
    return fileLinkMap[nameStr] ? fileLinkMap[nameStr] : nameStr;
  }

  // シートからオブジェクト配列を取得するヘルパー
  function getSheetDataAsObjects(ss, sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return [];

    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0];
    var result = [];

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        var val = row[c];
        if (val instanceof Date) {
          val = Utilities.formatDate(val, "JST", "yyyy-MM-dd");
        } else if (val !== null && val !== undefined) {
          val = val.toString();
        } else {
          val = "";
        }
        obj[headers[c]] = val;
      }
      result.push(obj);
    }
    return result;
  }

  // 1. People データの取得
  var sh = bk.getSheetByName('People');
  var last_row = sh.getLastRow();
  var membersData = [];
  if (last_row >= 2) {
    var memberValues = sh.getRange(2, 1, last_row - 1, 11).getValues();
    for (var i = 0; i < memberValues.length; i++) {
      var row = memberValues[i];
      membersData.push({
        name_en:  row[0].toString(),
        name_ja:  row[1].toString(),
        lab:      row[2].toString(),
        grade:    row[3].toString(),
        title_en: row[4].toString(),
        title_ja: row[5].toString(),
        intro1:   row[6].toString(),
        intro2:   row[7].toString(),
        pic1:     getUrlOrName(row[8]),
        pic2:     getUrlOrName(row[9]),
        pic3:     getUrlOrName(row[10]),
        pic2_id:  row[9].toString().replace(/\..*/, ""),
        pic3_id:  row[10].toString().replace(/\..*/, "")
      });
    }
  }
 
  // 2. Links データの取得（ロゴ画像対応版）
  var linksData = [];
  var linkSh = bk.getSheetByName('Links');
  if (linkSh) {
    var linkLastRow = linkSh.getLastRow();
    if (linkLastRow >= 2) {
      // 4列から5列に変更して画像名(E列)まで取得
      var linkValues = linkSh.getRange(2, 1, linkLastRow - 1, 5).getValues();
      for (var j = 0; j < linkValues.length; j++) {
        var row = linkValues[j];
        var categoryStr = row[1].toString();
        if (categoryStr === "Tools & Platforms" || categoryStr === "Affiliations" || categoryStr === "External Resources") {
          
          // 5列目（インデックス4）からロゴ画像名を取得し、URLに変換（空なら空文字）
          var logoImgName = row[4] ? row[4].toString().trim() : "";
          var logoUrl = logoImgName ? getUrlOrName(logoImgName) : "";

          linksData.push({ 
            item: row[0].toString(), 
            category: categoryStr, 
            description: row[2].toString(), 
            link: row[3].toString(),
            pic: logoUrl // 新規プロパティとして追加
          });
        }
      }
    }
  }

  // 3. Topics データの取得（GAS修正部分）
  var topicsRaw = getSheetDataAsObjects(bk, "Topics");
  var topicsData = topicsRaw.map(function(t) {
    return {
      id: t.id, 
      title: t.title, 
      summary: t.summary, 
      body_ja: t.body_ja, 
      body_en: t.body_en,
      pic_thumb: getUrlOrName(t.pic_thumb), 
      pic_main: getUrlOrName(t.pic_main), 
      pic_sub: getUrlOrName(t.pic_sub),
      references: t.references,
      featured_order: t.featured_order ? parseInt(t.featured_order, 10) : null,
      featured_img: getUrlOrName(t.featured_img) // ファイル名からGoogle Drive直リンクURLへ自動変換
    };
  });

  // 4. Events データの取得
  var eventsRaw = getSheetDataAsObjects(bk, "Events");
  var eventsData = eventsRaw.map(function(e) {
    return {
      id: e.id, date: e.date, category: e.category, title: e.title, summary: e.summary, body_ja: e.body_ja, body_en: e.body_en,
      pic_thumb: getUrlOrName(e.pic_thumb), pic_main: getUrlOrName(e.pic_main), pic_sub: getUrlOrName(e.pic_sub)
    };
  }).sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });

  // 🔥 5. News データの取得（別ファイル書き出し用として確保）
  var newsRaw = getSheetDataAsObjects(bk, "News");
  var newsData = newsRaw.map(function(n) {
    return { date: n.date, category: n.category, title: n.title, summary: n.summary, body_ja: n.body_ja, body_en: n.body_en, is_top: n.is_top };
  }).sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });

  // 6. Researchmap データの取得
  // var rmBk = SpreadsheetApp.openById("1TmgHvmCcYofeXBiWl5-9TKVUrXJpyD_4o1WC5jyTTDc");
  const RM_SS_ID = PropertiesService.getScriptProperties().getProperty('RM_SS_ID');
  var rmBk = SpreadsheetApp.openById(RM_SS_ID);

  var papersData = getSheetDataAsObjects(rmBk, "published_papers");
  var awardsData = getSheetDataAsObjects(rmBk, "awards");
  var grantsData = getSheetDataAsObjects(rmBk, "research_projects");
  
  papersData.sort(function(a, b) { return (b["publication_date"] || "").localeCompare(a["publication_date"] || ""); });
  awardsData.sort(function(a, b) { return (b["award_date"] || "").localeCompare(a["award_date"] || ""); });
  grantsData.sort(function(a, b) {
    var comp = (b["to_date"] || "").localeCompare(a["to_date"] || "");
    return comp === 0 ? (b["from_date"] || "").localeCompare(a["from_date"] || "") : comp;
  });
  
  // トップページ可視化集計用ロジック
  var speciesTrend = {};
  var wordCloudData = { "2009-2018": {}, "2018-2024": {}, "2024-": {} };
  var speciesMap = {
    "Arabidopsis": /arabidopsis|thaliana|シロイヌナズナ/i, "Asparagus": /asparagus|アスパラガス/i,
    "Buckwheat": /buckwheat|fagopyrum|ソバ|ダッタンソバ/i, "Millet": /millet|pennisetum|cenchrus|トウジンビエ/i, "Rice": /rice|oryza|イネ/i
  };
  var cloudKeywords = [
    "AGB1", "VIP1", "PCR", "Overexpress", "Mutant", "Interact", "GWAS", "Signal", "Mechanical", "Drought",
    "NGS", "RNA-Seq", "Edit", "CRISPR", "Transcription factor", "Pollen", "System", "Database", "Tool", "Browser"
  ];

  papersData.forEach(function(p) {
    var fullTextLower = ((p["paper_title.en"] || "") + " " + (p["paper_title.ja"] || "") + " " + (p["description.en"] || "")).toLowerCase();
    var yearMatch = (p["publication_date"] || "").match(/^\d{4}/);
    if (!yearMatch) return;
    var year = parseInt(yearMatch, 10);

    if (!speciesTrend[year]) {
      speciesTrend[year] = { year: year, Arabidopsis: 0, Asparagus: 0, Buckwheat: 0, Millet: 0, Rice: 0, total: 0 };
    }
    speciesTrend[year].total++;
    for (var sp in speciesMap) { if (speciesMap[sp].test(fullTextLower)) speciesTrend[year][sp]++; }

    var era = "2009-2018";
    if (year >= 2024) era = "2024-";
    else if (year >= 2018) era = "2018-2024";

    cloudKeywords.forEach(function(kw) {
      if (fullTextLower.indexOf(kw.toLowerCase()) !== -1) {
        wordCloudData[era][kw] = (wordCloudData[era][kw] || 0) + 1;
      }
    });
  });

  var speciesTrendArray = Object.keys(speciesTrend).sort().map(function(y) { return speciesTrend[y]; });
  var formattedCloud = Object.keys(wordCloudData).map(function(era) {
    var keywordsArr = Object.keys(wordCloudData[era]).map(function(kw) { return { text: kw, count: wordCloudData[era][kw] }; });
    return { period: era, keywords: keywordsArr };
  });

  // 💡 ① content.json データの組み立て（newsを含まない）
  var contentResult = {
    lastUpdate: todayStr,
    members: membersData,
    papers: papersData,
    honors: { grants: grantsData, awards: awardsData },
    links: linksData,
    topics: topicsData,
    events: eventsData,
    topCharts: { speciesTrend: speciesTrendArray, wordCloud: formattedCloud }
  };

  // 💡 ② news.json データの組み立て
  var newsResult = {
    lastUpdate: todayStr,
    news: newsData
  };

  // 🛠️ GitHubへの送信処理用内部ヘルパー関数
  function commitFileToGitHub(path, jsonObject, message) {
    var jsonString = JSON.stringify(jsonObject, null, 2);
    var url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
    
    // 既存ファイルのSHAを取得
    var response = UrlFetchApp.fetch(url, { method: "get", headers: { "Authorization": `token ${GITHUB_TOKEN}` }, muteHttpExceptions: true });
    var sha = response.getResponseCode() === 200 ? JSON.parse(response.getContentText()).sha : "";
    
    var payload = {
      message: message + " (" + todayStr + ")",
      content: Utilities.base64Encode(jsonString, Utilities.Charset.UTF_8),
      branch: "main"
    };
    if (sha) payload.sha = sha;
    
    UrlFetchApp.fetch(url, {
      method: "put",
      headers: { "Authorization": `token ${GITHUB_TOKEN}`, "Content-Type": "application/json" },
      payload: JSON.stringify(payload)
    });
    Logger.log("GitHubへの保存完了: " + path);
  }

  // 🔥 2つのファイルを順次コミット実行
  commitFileToGitHub(CONTENT_PATH, contentResult, "Update HP content via Google Sheets");
  commitFileToGitHub(NEWS_PATH, newsResult, "Update HP news via Google Sheets");
}


// Researchmap information extraction
function flattenObject(obj, prefix, out) {

  prefix = prefix || "";
  out = out || {};

  if (obj === null || obj === undefined) {
    return out;
  }

  Object.keys(obj).forEach(function(key) {

    var value = obj[key];

    var newKey =
      prefix
      ? prefix + "." + key
      : key;

    if (
      value !== null &&
      typeof value === "object"
    ) {

      if (Array.isArray(value)) {

        out[newKey] =
          JSON.stringify(value);

      } else {

        flattenObject(
          value,
          newKey,
          out
        );

      }

    } else {

      out[newKey] = value;

    }

  });


  return out;
}

function fetchCategory(
  researcherId,
  category
){

  var start = 1;

  var allItems = [];

  while(true){

    var url =
      "https://api.researchmap.jp/" +
      researcherId +
      "/" +
      category +
      "?format=json&start=" +
      start;

    Logger.log(url);

    var json =
      JSON.parse(
        UrlFetchApp.fetch(url)
        .getContentText()
      );

    var items =
      json.items || [];

    allItems =
      allItems.concat(items);

    Logger.log(
      category +
      " : " +
      allItems.length +
      "/" +
      json.total_items
    );

    if(
      allItems.length >=
      json.total_items
    ){
      break;
    }

    start += items.length;

    if(items.length === 0){
      break;
    }

  }

  return allItems;
}

function buildRecordKey(type, row) {

  if (row["rm:id"]) {
    return type + "|" + row["rm:id"];
  }

  if (row["@id"]) {
    return type + "|" + row["@id"];
  }

  return type + "|" + JSON.stringify(row);

}

function getSheetMap(sheet) {

  var map = {};

  if (sheet.getLastRow() < 2) {
    return map;
  }

  var data =
    sheet.getDataRange()
      .getValues();

  var headers = data[0];

  var keyCol =
    headers.indexOf("record_key");

  var modifiedCol =
    headers.indexOf("rm:modified");

  if (keyCol < 0) {
    return map;
  }

  for (var i = 1; i < data.length; i++) {

    var key =
      data[i][keyCol];

    if (key) {

      map[key] = {
        row: i + 1,
        modified:
          modifiedCol >= 0
          ? data[i][modifiedCol]
          : ""
      };

    }

  }

  return map;

}

function syncAllResearchmap() {

  const RM_SS_ID = PropertiesService.getScriptProperties().getProperty('RM_SS_ID');
  var ss = SpreadsheetApp.openById(RM_SS_ID);
  
  // Alternatively the sheet could be designated as follows
  // var ss = SpreadsheetApp.getActive();
  // var ss = SpreadsheetApp.openById("Spread Sheet ID for Researchmap Data");

  var categories = [

    "research_interests",
    "research_areas",
    "research_experience",
    "education",
    "committee_memberships",
    "awards",
    "published_papers",
    "misc",
    "teaching_experience",
    "association_memberships",
    "research_projects"

  ];

  categories.forEach(function(type){

    Logger.log("=== " + type + " ===");

    var sheet =
      ss.getSheetByName(type);

    if(!sheet){

      sheet =
        ss.insertSheet(type);

      sheet.getRange(
        1,
        1,
        1,
        6
      ).setValues([[
        "record_key",
        "record_type",
        "researcher_name",
        "researcher_id",
        "last_sync",
        "rm:modified"
      ]]);

    }

    var headers =
      sheet.getRange(
        1,
        1,
        1,
        sheet.getLastColumn()
      ).getValues()[0];

    var sheetMap =
      getSheetMap(sheet);

    var insertCount = 0;
    var updateCount = 0;
    var skipCount = 0;


    //var researcherName = "Daisuke Tsugama";
    //var researcherId = "tsugama";

    // ==========================================================================
    // 💡 【将来のループ対応版】Peopleシートから researchmap_id を持つ全員のデータを抽出
    // ==========================================================================
    const HP_SS_ID = PropertiesService.getScriptProperties().getProperty('HP_SS_ID');
    const hpSs = SpreadsheetApp.openById(HP_SS_ID);
    const peopleSheet = hpSs.getSheetByName("People");
    if (!peopleSheet) {
      throw new Error("'People' シートが見つかりません。");
    }

    const peopleData = peopleSheet.getDataRange().getValues();
    const peopleHeaders = peopleData[0];
  
    const idxName = peopleHeaders.indexOf("name");
    const idxRmId = peopleHeaders.indexOf("researchmap_id");

    if (idxName === -1 || idxRmId === -1) {
      throw new Error("'People' シートに 'name' または 'researchmap_id' 列が存在しません。");
    }

    // 1. 対象となる研究者全員を格納する配列を作成
    let targetResearchers = [];

    // 2行目から順にスキャンし、すべての対象者を配列にプッシュ
    for (let i = 1; i < peopleData.length; i++) {
      let row = peopleData[i];
      let rmId = String(row[idxRmId]).trim();
      let name = String(row[idxName]).trim();
    
      // researchmap_id が入力されているメンバーをすべて配列に格納
      if (rmId !== "") {
        targetResearchers.push({
          name: name,
          id: rmId
        });
      }
    }

    // 2. 配列が空だった場合の安全なフォールバック措置
    //if (targetResearchers.length === 0) {
    //  Logger.log("警告: researchmap_id を持つメンバーが1人も見つかりませんでした。デフォルト値を使用します。");
    //  targetResearchers.push({
    //    name: "Daisuke Tsugama",
    //    id: "tsugama"
    //  });
    //}

    // 3. 【現状の処理】配列の中の「1個目」を今回の同期処理に使用する
    let currentResearcher = targetResearchers[0];
    var researcherName = currentResearcher.name;
    var researcherId = currentResearcher.id;

    // Logger.log("発見された総対象者数: " + targetResearchers.length + "人");
    // Logger.log("今回の同期対象（1個目）: " + researcherName + " (ID: " + researcherId + ")");
    // ==========================================================================

    try {

        Logger.log(
          researcherName +
          " : " +
          type
        );

        var items =
          fetchCategory(
            researcherId,
            type
          );

        items.forEach(function(item){

          var row =
            flattenObject(item);

          row.record_type =
            type;

          row.researcher_name =
            researcherName;

          row.researcher_id =
            researcherId;

          row.last_sync =
            new Date();

          row.record_key = buildRecordKey( type, row );

          var existing = sheetMap[ row.record_key ];
          if (type === "published_papers" && !existing && row.display === "disclosed" && row.publication_date) {
            var dateStr = String(row.publication_date).trim();
    
            // 「YYYY-MM」または「YYYY-MM-DD」の形式のみ許可（年のみの「YYYY」は除外）
            if (/^\d{4}-\d{2}/.test(dateStr)) {
              // "2026-12" のような月まで指定の場合、Dateパース用に "-01" を補完して安全に比較
              if (dateStr.length === 7) {
                dateStr += "-01";
              }
            
              var pubDate = new Date(dateStr);
              var halfYearAgo = new Date();
              halfYearAgo.setMonth(halfYearAgo.getMonth() - 6);
            
              if (!isNaN(pubDate.getTime()) && pubDate >= halfYearAgo) {
                row.display = "news";
              }
            }
          }

          var added = false;

          Object.keys(row)
            .forEach(function(k){

              if(
                headers.indexOf(k)
                < 0
              ){

                headers.push(k);
                added = true;

              }

            });

          if(added){

            sheet.getRange(
              1,
              1,
              1,
              headers.length
            ).setValues([
              headers
            ]);

          }

          var existing =
            sheetMap[
              row.record_key
            ];

          var values =
            headers.map(function(h){

              return row[h] !== undefined
                ? row[h]
                : "";

            });

          /*
             新規
          */

          if(!existing){

            sheet.appendRow(values);

            sheetMap[
              row.record_key
            ] = {
              row:
                sheet.getLastRow(),
              modified:
                row["rm:modified"] || ""
            };

            insertCount++;

            return;
          }

          /*
             変更なし
          */

          if(
            existing.modified &&
            String(existing.modified) ===
            String(
              row["rm:modified"] || ""
            )
          ){

            skipCount++;

            return;
          }

          /*
             更新
          */

          sheet.getRange(
            existing.row,
            1,
            1,
            headers.length
          ).setValues([
            values
          ]);

          sheetMap[
            row.record_key
          ].modified =
            row["rm:modified"] || "";

          updateCount++;

        });

    } catch(e){

        Logger.log(
          researcherId +
          " : " +
          type +
          " ERROR"
        );

        Logger.log(e);

    }


    Logger.log(
      type +
      " : insert=" +
      insertCount +
      ", update=" +
      updateCount +
      ", skip=" +
      skipCount
    );

  });
}

function updateHomepageNews() {
  // スプレッドシートIDの設定

  const HP_SS_ID = PropertiesService.getScriptProperties().getProperty('HP_SS_ID');
  const RM_SS_ID = PropertiesService.getScriptProperties().getProperty('RM_SS_ID');

  // Alternatively the sheets could be disignated as follows
  // const HP_SS_ID = "Spread Sheet ID for HP Contents";
  // const RM_SS_ID = "Spread Sheet ID for Researchmap Data";

  const hpSs = SpreadsheetApp.openById(HP_SS_ID);
  const rmSs = SpreadsheetApp.openById(RM_SS_ID);
  
  const newsSheet = hpSs.getSheetByName("News");
  if (!newsSheet) return Logger.log("Error: News sheet not found.");
  
  const newsHeaders = ["date", "category", "title", "summary", "body_ja", "body_en", "is_top"];

  // 💡 【共通ヘルパー関数】日付を「yyyy-mm-dd」の文字列に安全に変換する
  const formatDate = function(val) {
    if (!val) return "";
    if (val instanceof Date) {
      // Dateオブジェクトの場合はGASのタイムゾーンで yyyy-mm-dd に変換
      return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
    }
    // すでに文字列の場合、スラッシュ(/)をハイフン(-)に置換
    let str = String(val).trim().replace(/\//g, "-");
    // yyyy-mm-dd のパターンを満たしているかチェック（前方一致）
    return /^\d{4}-\d{2}-\d{2}/.test(str) ? str.substring(0, 10) : str;
  };
  
  // ----------------------------------------------------
  // 1. People シートの処理
  // ----------------------------------------------------
  const peopleSheet = hpSs.getSheetByName("People");
  if (peopleSheet) {
    const data = peopleSheet.getDataRange().getValues();
    const headers = data[0]; 
    
    const idxName = headers.indexOf("name");
    const idxNameJa = headers.indexOf("name_ja");
    const idxPhd = headers.indexOf("phd_award");
    const idxGrad = headers.indexOf("graduation");
    const idxLeft = headers.indexOf("left");
    
    for (let i = 1; i < data.length; i++) {
      let row = data[i];
      let name = row[idxName] || "";
      let nameJa = row[idxNameJa] || "";
      
      // 💡 修正：String() ではなく、formatDateヘルパーを通して安全に取得
      let phdDate = formatDate(row[idxPhd]);
      let gradDate = formatDate(row[idxGrad]);
      let leftDate = formatDate(row[idxLeft]);

      let matchedType = null;
      let targetDate = "";
      let cellColIdx = -1;
      
      if (phdDate) { matchedType = "phd_award"; targetDate = phdDate; cellColIdx = idxPhd; }
      else if (gradDate) { matchedType = "graduation"; targetDate = gradDate; cellColIdx = idxGrad; }
      else if (leftDate) { matchedType = "left"; targetDate = leftDate; cellColIdx = idxLeft; }
      
      if (matchedType) {
        let bodyEn = "";
        let bodyJa = "";
        
        if (matchedType === "phd_award") {
          bodyEn = name + " obtained the Ph.D. degree on " + targetDate + ". Congrats!";
          bodyJa = nameJa + "さんが博士号を取得しました。おめでとうございます！";
        } else if (matchedType === "graduation") {
          bodyEn = name + " graduated on " + targetDate + ". Congrats!";
          bodyJa = nameJa + "さんが卒業/修了しました。おめでとうございます！";
        } else if (matchedType === "left") {
          bodyEn = name + " left this lab on " + targetDate + " with all credits obtained. " + name + " will prepare for the defence meeting.";
          bodyJa = nameJa + "さんが単位取得退学しました。審査会に向けて準備を進める予定です。";
        }

        let summaryEnJa = bodyEn + " " + bodyJa;

        newsSheet.appendRow([targetDate, "People", "Update in People", summaryEnJa, bodyJa, bodyEn, ""]);
        peopleSheet.getRange(i + 1, cellColIdx + 1).setValue("");
      }
    }
  }

  // ----------------------------------------------------
  // 2. Events シートの処理
  // ----------------------------------------------------
  const eventsSheet = hpSs.getSheetByName("Events");
  if (eventsSheet) {
    const data = eventsSheet.getDataRange().getValues();
    const headers = data[0];
    const idxIsNews = headers.indexOf("is_news");
    
    if (idxIsNews !== -1) {
      for (let i = 1; i < data.length; i++) {
        let val = String(data[i][idxIsNews]).toLowerCase();
        if (val === "y" || val === "yes") {
          let evDate    = formatDate(data[i][headers.indexOf("date")]);
          let evCat     = String(data[i][headers.indexOf("category")] || "Events");
          let evTitle   = String(data[i][headers.indexOf("title")] || "Notice");
          let evSummary = String(data[i][headers.indexOf("summary")] || "");
          
          let evBodyJa  = String(data[i][headers.indexOf("body_ja")] || "");
          let evBodyEn  = String(data[i][headers.indexOf("body_en")] || "");
          
          // 💡 Summaryは元のまま独立させ、長い「Body」だけを改行で繋いで日英併記にする
          // let combinedBody = evBodyEn + "\n\n" + evBodyJa;

          // newsHeaders = ["date", "category", "title", "summary", "body_ja", "body_en", "is_top"]
          // body_ja と body_en の両方に併記テキストを書き込んでおき、どちらを参照されても大丈夫なようにします
          // newsSheet.appendRow([evDate, evCat, evTitle, evSummary, combinedBody, combinedBody, ""]);
          newsSheet.appendRow([evDate, evCat, evTitle, evSummary, evBodyJa, evBodyEn, ""]);

          eventsSheet.getRange(i + 1, idxIsNews + 1).setValue("");
        }
      }
    }
  }

  // ----------------------------------------------------
  // 3. Researchmap (published_papers) シートの処理
  // ----------------------------------------------------
  const papersSheet = rmSs.getSheetByName("published_papers");
  if (papersSheet) {
    const data = papersSheet.getDataRange().getValues();
    const headers = data[0];
    const idxDisplay = headers.indexOf("display");
    
    if (idxDisplay !== -1) {
      for (let i = 1; i < data.length; i++) {
        let displayVal = String(data[i][idxDisplay]).trim();
        if (displayVal === "news") {
          let p = {};
          headers.forEach((h, idx) => {
            p[h] = data[i][idx];
          });
          
          const title = p["paper_title.en"] || p["paper_title.ja"] || "";
          const authors = parseNamesForNews(p["authors.en"] || p["authors.ja"]);
          const journal = p["publication_name.en"] || p["publication_name.ja"] || "";
          const volume = p["volume"] ? " Vol. " + p["volume"] : "";
          const pages = p["starting_page"] ? ", pp. " + p["starting_page"] + "-" + (p["ending_page"] || p["starting_page"]) : "";
          
          // 💡 修正：論文の出版日を安全にフォーマット
          let dateStr = formatDate(p["publication_date"]);
          let yearMatch = String(dateStr).match(/^\d{4}/);
          let yearOnly = yearMatch ? yearMatch[0] : String(dateStr);
          const dateSuffix = yearOnly ? " (" + yearOnly + ")" : "";
          const doiHtml = formatDoiForNews(p["identifiers.doi"]);
          
          const paperHtml = "<strong>" + title + "</strong><br>" +
                            "<span style=\"color: #444;\">" + authors + "</span><br>" +
                            "<span style=\"color: #666; font-style: italic;\">" + journal + "</span>" + volume + pages + dateSuffix + "." + doiHtml;
          
          const bodyJa = "以下の論文が公開されました。<br>" + paperHtml;
          const bodyEn = "The following paper has been published.<br>" + paperHtml;
          const summaryEnJa = "The following paper has been published. 以下の論文が公開されました。<br>" + paperHtml;

          // 💡 修正：整形済みの日付（yyyy-mm-dd）を書き込む
          newsSheet.appendRow([dateStr, "Papers", "Update in Papers", summaryEnJa, bodyJa, bodyEn, ""]);
          papersSheet.getRange(i + 1, idxDisplay + 1).setValue("disclosed");
        }
      }
    }
  }
}

// ----------------------------------------------------
// 論文パース用 補助関数群
// ----------------------------------------------------
function parseNamesForNews(authorsData) {
  if (!authorsData) return "";
  try {
    // JSON文字列だった場合はパースして名前をカンマ区切りで結合
    const arr = JSON.parse(authorsData);
    if (Array.isArray(arr)) {
      return arr.map(obj => obj.name || "").join(", ");
    }
  } catch(e) {}
  return String(authorsData);
}

function formatDoiForNews(doi) {
  if (!doi) return "";
  // JSONパースが必要なケースをケア
  try {
    if (typeof doi === 'string' && (doi.startsWith('{') || doi.startsWith('['))) {
      let parsed = JSON.parse(doi);
      if (Array.isArray(parsed) && parsed.length > 0) doi = parsed[0];
      else if (parsed.doi) doi = parsed.doi;
    }
  } catch(e) {}
  return " DOI: <a href=\"https://doi.org/" + doi + "\" target=\"_blank\">" + doi + "</a>";
}
