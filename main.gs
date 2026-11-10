function pushHpDataToGitHub() {
  const GITHUB_TOKEN = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!GITHUB_TOKEN) {
    throw new Error("スクリプトプロパティ 'GITHUB_TOKEN' が設定されていません。");
  }
  const REPO_OWNER    = "GITHUB OWNER NAME"; // E.g., 'tsugama-eng'
  const REPO_NAME     = "GITHUB REPOSITORY NAME"; // E.g., 'lgpr'
  
  // 保存パスを定義
  const CONTENT_PATH  = "data/content.json";
  const NEWS_PATH     = "data/news.json";
  const TARGET_IMG_DIR = "img/"; 
  
  var today = new Date(); 
  var todayStr = Utilities.formatDate(today, "JST", "MM/dd/yyyy");
  
  const HP_SS_ID = PropertiesService.getScriptProperties().getProperty('HP_SS_ID');
  var bk = SpreadsheetApp.openById(HP_SS_ID);

  var folderId = PropertiesService.getScriptProperties().getProperty('IMG_DIR_ID');

  // ==========================================================================
  // 💡 【修正点】スプレッドシートから使用されている画像ファイル名を一斉に洗い出す
  // ==========================================================================
  var requiredFileNames = [];

  // 補助関数：文字列をカンマ区切りも含めてパースし配列に追加する
  function extractNames(val) {
    if (!val) return;
    var str = val.toString().trim();
    if (str === "") return;
    if (str.indexOf(",") !== -1) {
      str.split(",").forEach(function(f) {
        var clean = f.trim();
        if (clean !== "") requiredFileNames.push(clean);
      });
    } else {
      requiredFileNames.push(str);
    }
  }

  // 1. Peopleシートの画像列（I, J, K列 / 8, 9, 10番目）
  var shPeople = bk.getSheetByName('People');
  if (shPeople && shPeople.getLastRow() >= 2) {
    var pValues = shPeople.getRange(2, 9, shPeople.getLastRow() - 1, 3).getValues();
    pValues.forEach(function(row) {
      extractNames(row[0]); // pic1
      extractNames(row[1]); // pic2
      extractNames(row[2]); // pic3
    });
  }

  // 2. Linksシートのロゴ画像名列（E列 / 5番目）
  var shLinks = bk.getSheetByName('Links');
  if (shLinks && shLinks.getLastRow() >= 2) {
    // B列(2番目)からE列(5番目)までの4列を一括取得
    var lValues = shLinks.getRange(2, 2, shLinks.getLastRow() - 1, 4).getValues();
    lValues.forEach(function(row) {
      var categoryStr = row[0] ? row[0].toString().trim() : "";
      if (categoryStr === "Tools & Platforms" || categoryStr === "External Resources" || categoryStr === "Affiliations") {
        var logoImgName = row[3]; // インデックス3がE列（画像名）に相当
        extractNames(logoImgName); // 条件に一致する場合のみプッシュ対象として抽出
      }
    });
  }

  // 3. Topicsシートの画像列 (F, G, H, K列) からの抽出用
  var shTopics = bk.getSheetByName('Topics');
  if (shTopics && shTopics.getLastRow() >= 2) {
    var tHeaders = shTopics.getRange(1, 1, 1, shTopics.getLastColumn()).getValues()[0];
    var idxThumb = tHeaders.indexOf("pic_thumb");
    var idxMain = tHeaders.indexOf("pic_main");
    var idxSub = tHeaders.indexOf("pic_sub");
    var idxFeatured = tHeaders.indexOf("featured_img");
    var tValues = shTopics.getRange(2, 1, shTopics.getLastRow() - 1, shTopics.getLastColumn()).getValues();
    tValues.forEach(function(row) {
      if (idxThumb !== -1) extractNames(row[idxThumb]);
      if (idxMain !== -1) extractNames(row[idxMain]);
      if (idxSub !== -1) extractNames(row[idxSub]);
      if (idxFeatured !== -1) extractNames(row[idxFeatured]);
    });
  }

  // 4. Eventsシートの画像列 (H, I, J列) からの抽出用
  var shEvents = bk.getSheetByName('Events');
  if (shEvents && shEvents.getLastRow() >= 2) {
    var eHeaders = shEvents.getRange(1, 1, 1, shEvents.getLastColumn()).getValues()[0];
    var idxEThumb = eHeaders.indexOf("pic_thumb");
    var idxEMain = eHeaders.indexOf("pic_main");
    var idxESub = eHeaders.indexOf("pic_sub");
    var eValues = shEvents.getRange(2, 1, shEvents.getLastRow() - 1, shEvents.getLastColumn()).getValues();
    eValues.forEach(function(row) {
      if (idxEThumb !== -1) extractNames(row[idxEThumb]);
      if (idxEMain !== -1) extractNames(row[idxEMain]);
      if (idxESub !== -1) extractNames(row[idxESub]);
    });
  }

  // 重複を完全に排除したクリーンな同期対象ファイル名リストを作成
  var uniqueRequiredFiles = requiredFileNames.filter(function(item, pos, self) {
    return self.indexOf(item) === pos;
  });

  // ==========================================================================
  // 💡 洗い出した必要ファイルだけを巡回してGitHubチェック＆プッシュ
  // ==========================================================================
  var fileLinkMap = {};
  var folder = DriveApp.getFolderById(folderId);

  uniqueRequiredFiles.forEach(function(fileName) {
    // ドライブからファイル名指定でピンポイント検索 (findFileIdByName相当の処理)
    var dFiles = folder.getFilesByName(fileName);
    if (!dFiles.hasNext()) {
      Logger.log(`[警告] スプシに記載のファイルがGoogleドライブ内に見つかりません: ${fileName}`);
      return;
    }
    var file = dFiles.next();

    try {
      var path = TARGET_IMG_DIR + fileName; 
      var url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
      
      // ① GitHub上の存在チェック
      var checkOptions = {
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' },
        muteHttpExceptions: true
      };
      var checkResponse = UrlFetchApp.fetch(url, checkOptions);
      
      // 既存ファイルがあればアップロードを即スキップ
      if (checkResponse.getResponseCode() === 200) {
        Logger.log(`[HP画像スキップ] すでにGitHubに存在します: ${path}`);
        fileLinkMap[fileName] = TARGET_IMG_DIR + fileName;
        return; 
      }

      // ② なければプッシュ実行
      var base64Data = Utilities.base64Encode(file.getBlob().getBytes());
      var payload = { 
        "message": "Upload HP image: " + fileName + " (" + todayStr + ")", 
        "content": base64Data,
        "branch": "main"
      };
      
      var options = {
        method: 'put',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + GITHUB_TOKEN, 'Accept': 'application/vnd.github.v3+json' },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true 
      };
      
      var response = UrlFetchApp.fetch(url, options);
      if (response.getResponseCode() !== 200 && response.getResponseCode() !== 201) {
        throw new Error("GitHubアップロード失敗: " + response.getContentText());
      }
      
      fileLinkMap[fileName] = TARGET_IMG_DIR + fileName;
      Logger.log(`[HP画像新規プッシュ] 成功しました: ${path}`);

    } catch (e) {
      Logger.log(`画像プッシュエラー (${fileName}): ` + e.toString());
      fileLinkMap[fileName] = "https://lh3.googleusercontent.com/d/" + file.getId();
    }
  });
  
  // コンマ区切りの複数画像にも対応したパス変換ヘルパー（ロジックはそのまま維持）
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
    return { id: n.id, date: n.date, category: n.category, title: n.title, summary: n.summary, body_ja: n.body_ja, body_en: n.body_en, news_pic: n.news_pic };
  }).sort(function(a, b) { return (b.date || "").localeCompare(a.date || ""); });

  // 6. Researchmap データの取得
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

  // var ss = SpreadsheetApp.getActive();
  const RM_SS_ID = PropertiesService.getScriptProperties().getProperty('RM_SS_ID');
  var ss = SpreadsheetApp.openById(RM_SS_ID);

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
    //    name: "TARGET RESEARCHER NAME (e.g., 'Daisuke Tsugama')",
    //    id: "TARGET RESEARCHER RESEARCHMAP ID (e.g., 'tsugama')"
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

  const hpSs = SpreadsheetApp.openById(HP_SS_ID);
  const rmSs = SpreadsheetApp.openById(RM_SS_ID);
  
  const newsSheet = hpSs.getSheetByName("News");
  if (!newsSheet) return Logger.log("Error: News sheet not found.");
  
  // 💡 先頭に "id" を追加
  const newsHeaders = ["id", "date", "category", "title", "summary", "body_ja", "body_en", "news_pic", "is_sns"];

  // 💡 【ここから追記】重複しない一意のID（日付-カテゴリ-連番）を生成する関数
  const generateUniqueId = function(dateStr, categoryStr) {
    const lastRow = newsSheet.getLastRow();
    let existingIds = [];
    if (lastRow >= 2) {
      existingIds = newsSheet.getRange(2, 1, lastRow - 1, 1).getValues().map(r => String(r));
    }
    const cleanDate = dateStr.trim();
    const cleanCat = categoryStr.trim().replace(/\s+/g, "");
    const baseId = cleanDate + "-" + cleanCat;
    
    let counter = 1;
    let finalId = baseId + "-" + counter;
    while (existingIds.indexOf(finalId) !== -1) {
      counter++;
      finalId = baseId + "-" + counter;
    }
    return finalId;
  };
 
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

        const newsId = generateUniqueId(targetDate, "People");
        newsSheet.appendRow([newsId, targetDate, "People", "Update in People", summaryEnJa, bodyJa, bodyEn, ""]);
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
    const idxNewsPic = headers.indexOf('news_pic'); 
    const idxIsSns = headers.indexOf('is_sns'); 

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

          let rawNewsPicData = data[i][idxNewsPic];
          let isSns = data[i][idxIsSns];

          // newsHeaders = ["date", "category", "title", "summary", "body_ja", "body_en", "is_top"]
          // body_ja と body_en の両方に併記テキストを書き込んでおき、どちらを参照されても大丈夫なようにします
          // newsSheet.appendRow([evDate, evCat, evTitle, evSummary, combinedBody, combinedBody, ""]);
          const newsId = generateUniqueId(evDate, evCat);
          newsSheet.appendRow([newsId, evDate, evCat, evTitle, evSummary, evBodyJa, evBodyEn, rawNewsPicData, isSns]);

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
          const bodyEn = "The following paper has been published!<br>" + paperHtml;
          const summaryEnJa = "The following paper has been published! 以下の論文が公開されました。<br>" + paperHtml;

          const newsId = generateUniqueId(dateStr, "Paper");
          newsSheet.appendRow([newsId, dateStr, "Paper", "Update in Papers", summaryEnJa, bodyJa, bodyEn, "", "y"]);
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

////////////////////
// For SNS submission


/**
 * 1. 【メイン関数】高度に最適化されたSNS自動投稿実行システム（画像なし文章のみ投稿対応版）
 */
function runSnsPublisher() {
  const props = PropertiesService.getScriptProperties().getProperties();
  const ssId = props['HP_SS_ID'];
  
  if (!ssId) {
    SpreadsheetApp.getUi().alert('Script Property "HP_SS_ID" is not found.');
    return;
  }
  
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName('News');
  if (!sheet) {
    SpreadsheetApp.getUi().alert('No "News" sheet was found.');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0]; 
  
  // 列の位置を自動特定
  const idxFlag = headers.indexOf('is_sns');
  const idxSummary = headers.indexOf('summary');
  const idxXLink = headers.indexOf('x_link');
  const idxFbLink = headers.indexOf('fb_link'); 
  const idxThumb = headers.indexOf('news_pic');
  // const idxThumb = headers.indexOf('pic_thumb');
  // const idxMain = headers.indexOf('pic_main');
  // const idxSub = headers.indexOf('pic_sub');
  
  if (idxFlag === -1 || idxSummary === -1 || idxXLink === -1) {
    SpreadsheetApp.getUi().alert('必要な列（is_sns, summary, x_link, news_pic 等）が見つかりません。');
    return;
  }

  // 2行目以降をループ処理
  for (let i = 1; i < data.length; i++) {
    const metaConfig = {
      version: props['META_GRAPH_VERSION'] || 'v24.0',
      tokens: { facebook: props['FB_TOKEN'], instagram: props['FB_TOKEN'] }
    };

    const row = data[i];
    // 💡 修正：チェック対象の列を確実に「is_sns」にし、'yes' または 'y' で判定する
    const snsFlag = String(row[idxFlag]).toLowerCase().trim();
    if (snsFlag !== 'yes' && snsFlag !== 'y') continue; // SNS投稿対象外なら次の行へ

    const picVal = String(row[idxThumb]).trim(); // news_pic列からファイル名を取得

    const rawSummary = row[idxSummary];
    const rawBodyEn = String(row[headers.indexOf('body_en')]).trim();
    const catVal = String(row[headers.indexOf('category')]).trim();
    const idVal = String(row[headers.indexOf('id')]).trim();
    
    let summary = cleanHtmlForSns(rawSummary);
    let bodyEn = cleanHtmlForSns(rawBodyEn);

    const catLower = catVal.toLowerCase();
    if (idVal && !catLower.includes('paper') && !catLower.includes('people')) {
      // 本文の後に改行を2つ挟んでURLリンクを配置
      summary += `\n\nRead More: \nhttps://tsugama-eng.github.io/lgpr/#news-${idVal}`;
      bodyEn += `\n\nRead More: \nhttps://tsugama-eng.github.io/lgpr/#news-${idVal}`;
    }

    let fileNames = [];
    
    // 💡 修正：画像列が空でなく、かつフラグ用の文字列（y/yes/n/no）でなければ画像名としてパース
    if (picVal && !['yes', 'y', 'no', 'n'].includes(picVal.toLowerCase())) {
      fileNames = picVal.split(/[\n,]+/).map(n => n.trim()).filter(Boolean);
    }
    
    // 💡 方針3: 重複を排除（icrisat2026.jpg,icrisat2026.jpg -> icrisat2026.jpg へ圧縮）
    const uniqueFileNames = Array.from(new Set(fileNames));

    try {
      Logger.log(`行 ${i + 1} 処理開始。対象画像数: ${uniqueFileNames.length}枚 (${uniqueFileNames.join(', ')})`);
      
      // 💡 改善ポイント：画像が指定されている場合のみGitHubチェック・アップロードを走らせる
      const githubUrls = [];
      if (uniqueFileNames.length > 0) {
        uniqueFileNames.forEach(fileName => {
          const driveId = findFileIdByName(fileName, props.IMG_DIR_ID);
          if (driveId) {
            const rawUrl = githubUploadBlobSecure(driveId, fileName, props);
            githubUrls.push(rawUrl);
          } else {
            Logger.log(`警告: ドライブ内にファイルが見つかりません: ${fileName}`);
          }
        });
      }
      
      // ログ記録用の報告バッファ
      let reportStatus = [];

      // ==========================================
      // 💡 方針7: 各SNSを独立処理（画像ゼロでもテキストのみで通過）
      // ==========================================
      
      // ーー ① X（旧Twitter）へのリンク生成処理 ーー
      try {
        const REPO_OWNER = "tsugama-eng";
        const REPO_NAME = "lgpr";
        const newsUrl = `#news-${idVal}`;
        let summaryX = summary;
        summaryX = summary.replace(/(以下の論文が公開されました。)[\s\S]*?(https:\/\/)/, "$1\n$2");

        const xIntentUrl = generateXIntentUrl(
          summaryX, 
          githubUrls, 
          props.GITHUB_TOKEN, 
          REPO_OWNER, 
          REPO_NAME,
          newsUrl,
          catVal
        );
        sheet.getRange(i + 1, idxXLink + 1).setValue(xIntentUrl);
        reportStatus.push("X: OK");
      } catch (xError) {
        Logger.log(`行 ${i + 1} [Xエラー]: ${xError.message}`);
        reportStatus.push("X: FAILED");
      }

      // LinkedIn
      try {
      
        const liUrl = props['LI_WEBAPP_URL'];
        const liBodyEn = bodyEn.replace('!', "!\n");

        if (liUrl) {
      
          UrlFetchApp.fetch(liUrl, {
            method: 'post',
            payload: {
              secret: props['LI_SHARED_SECRET'],
              text: liBodyEn,
              imageUrls: JSON.stringify(githubUrls)
            },
            muteHttpExceptions: true
          });
      
          reportStatus.push("LI: OK");
      
        } else {
      
          reportStatus.push("LI: SKIPPED (No URL)");
      
        }
      
      } catch (liError) {
      
        Logger.log(
          `行 ${i + 1} [LIエラー]: ${liError.message}`
        );
      
        reportStatus.push(
          "LI: FAILED"
        );
      
      }

      // ーー ② Meta Graph API（Instagram & Facebook）個別独立処理 ーー
      if (props.FB_TOKEN) {
        let fbSuccess = false;
        let igSuccess = false;
        const fbPageId = PropertiesService.getScriptProperties().getProperty('FB_PAGE_ID');

        // --- A. Instagramの投稿処理 (画像がある場合のみ実行・try catchで完全防衛) ---
        if (githubUrls.length > 0 && props.IG_USER_ID) {
          try {
            Logger.log(`行 ${i + 1}: Instagramへの画像投稿を開始します...`);
            publishToInstagramSecure(metaConfig, props.IG_USER_ID, summary, githubUrls, catVal);
            igSuccess = true;
            reportStatus.push("IG: OK");
          } catch (igError) {
            // 💡 ここでIGのエラーをキャッチするため、全体のループ処理は絶対に止まりません
            igSuccess = false;
            Logger.log(`行 ${i + 1} [IGエラーによる処理のスキップ]: ${igError.message}`);
            reportStatus.push("IG: FAILED (" + igError.message + ")");
          }
        } else if (githubUrls.length === 0) {
          reportStatus.push("IG: SKIPPED (No Image)");
        } else {
          reportStatus.push("IG: SKIPPED (No IG_USER_ID)");
        }

        // --- B. Facebookの投稿処理 (画像あり/なしで自動分岐・IGの成否に関わらず必ず実行される) ---
        try {
            // 【画像あり】新しく分離した専用関数で個別投稿
            const fbSummary = summary.replace('!', "!\n");
            publishToFacebookImageSecure(metaConfig, fbSummary, githubUrls);
            fbSuccess = true;
            reportStatus.push("FB: OK (Image)");
        } catch (fbError) {
          fbSuccess = false;
          Logger.log(`行 ${i + 1} [FBエラー]: ${fbError.message}`);
          reportStatus.push("FB: FAILED (" + fbError.message + ")");
        }

        // --- C. Facebook または Instagram が失敗した場合に手動URLを追記 ---
        if (!fbSuccess && githubUrls.length > 0) {
          let fallbackUrls = [];
          let shareUrl = String(row[idxXLink]).toLowerCase().trim();
          shareUrl = shareUrl.replace(/.*url=/, "");
          const fbManualUrl = `https://www.facebook.com/sharer.php?u=${shareUrl}`;
          sheet.getRange(i + 1, idxFbLink + 1).setValue(fbManualUrl);

        } else if (!fbSuccess) {
          let shareNews = `#news-${idVal}`;
          shareNews = encodeURIComponent(shareNews);
          const fbManualUrl = `https://www.facebook.com/sharer.php?u=https://tsugama-eng.github.io/lgpr/${shareNews}`;
          sheet.getRange(i + 1, idxFbLink + 1).setValue(fbManualUrl);

        }
      } else {
        reportStatus.push("Meta: SKIPPED (No ID/Token)");
      }


      // 💡 方針6: 完了後に判定列をクリアし、最終列（データ右側の一歩先）に完了報告を書き込む
      sheet.getRange(i + 1, idxFlag + 1).setValue(''); 
      
      const lastCol = sheet.getLastColumn();
      sheet.getRange(i + 1, lastCol + 1).setValue(`[${getJstTimestamp()}] Done -> ` + reportStatus.join(', '));
      
      Logger.log(`行 ${i + 1} の全独立処理を通過しました。`);
      
    } catch (error) {
      Logger.log(`行 ${i + 1} Fatal Error: ${error.message}`);
      
      // 💡 【修正点】エラー発生時も判定列（is_sns）をクリア
      sheet.getRange(i + 1, idxFlag + 1).setValue(''); 
      
      // 💡 【修正点】最終列にタイムスタンプ付きでエラー内容を書き込む
      const lastCol = sheet.getLastColumn();
      sheet.getRange(i + 1, lastCol + 1).setValue(`[${getJstTimestamp()}] ERROR -> ${error.message}`);
    }
    if (i < data.length - 1) {
      Logger.log("20秒間待機します...");
      Utilities.sleep(20000); 
    }
  }
}

/**
 * 💡 方針4&5を完全に内包した、改善版GitHub画像プロバイダ関数
 */
function githubUploadBlobSecure(driveId, fileName, props) {
  const REPO_OWNER = "GITHUB REPOSITORY OWNER NAME"; // E.g., 'tsugama-eng'
  const REPO_NAME = "GITHUB REPOSITORY NAME"; // E.g., 'lgpr'
  
  // 💡 方針5: ターゲットフォルダを `img/` に統一指定
  const path = 'img/' + fileName; 
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const token = props.GITHUB_TOKEN;
  
  // 💡 方針4: まずimg/に探しに行く（GETリクエスト）
  const checkOptions = {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' },
    muteHttpExceptions: true
  };
  
  const checkResponse = UrlFetchApp.fetch(url, checkOptions);
  
  // 同名ファイルがすでに存在（200 OK）する場合は新規保存をスキップしてRaw URLを即帰却
  if (checkResponse.getResponseCode() === 200) {
    Logger.log(`[SNS/HP兼用画像] GitHub上に既存ファイルを検出。プッシュをスキップします: ${path}`);
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${path}`;
  }

  // 存在しない場合のみ新規にプッシュ実行
  const file = DriveApp.getFileById(driveId);
  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());

  const payload = { 
    "message": "Upload SNS/HP resource image: " + fileName, 
    "content": base64Data 
  };
  
  const options = {
    method: 'put',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true 
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  
  if (responseCode !== 200 && responseCode !== 201) {
    throw new Error("GitHub（img/）への新規アップロードに失敗しました: " + response.getContentText());
  }
  
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${path}`;
}

/**
 * 報告文字列用のタイムスタンプ生成ヘルパー
 */
function getJstTimestamp() {
  return Utilities.formatDate(new Date(), "JST", "yyyy/MM/dd HH:mm");
}


/**
 * 指定されたフォルダ内から、ファイル名をもとにGoogleドライブのファイルIDを検索する
 */
function findFileIdByName(fileName, folderId) {
  if (!folderId) throw new Error('IMG_DIR_ID がスクリプトプロパティに設定されていません。');
  const folder = DriveApp.getFolderById(folderId);
  const files = folder.getFilesByName(fileName);
  
  if (files.hasNext()) {
    return files.next().getId();
  }
  return null; 
}

/**
 * 2. 【容量クリア関数】運用が終わったらGitHubのsns_imagesフォルダ内を一括削除
 */
function clearGitHubSnsImages() {
  //const ui = SpreadsheetApp.getUi();
  //const response = ui.alert('確認', 'GitHub上のSNS一時画像をすべて削除します。Xへの投稿はお済みですか？', ui.ButtonSet.//YES_NO);
  //if (response !== ui.Button.YES) return;

  const REPO_OWNER = "tsugama-eng";
  const REPO_NAME = "lgpr";

  const props = PropertiesService.getScriptProperties().getProperties();
  const token = props.GITHUB_TOKEN; // どちらの命名でも対応可能に
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/sns_images`;

  const options = {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' },
    muteHttpExceptions: true
  };
  
  const res = UrlFetchApp.fetch(url, options);
  if (res.getResponseCode() !== 200) {
    ui.alert('フォルダが空か、または取得に失敗しました。');
    return;
  }
  
  const files = JSON.parse(res.getContentText());
  let count = 0;
  
  files.forEach(file => {
    if (file.type === 'file') {
      const deleteUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${file.path}`;
      const payload = { "message": "Cleanup ephemeral SNS image", "sha": file.sha };
      
      UrlFetchApp.fetch(deleteUrl, {
        method: 'delete', 
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + token },
        payload: JSON.stringify(payload)
      });
      count++;
    }
  });
  
  //ui.alert('完了', `${count} 個の画像をGitHubから削除し、容量を解放しました。`);
}

/* --- 改良された各種通信関数モジュール --- */

function githubUploadBlob(driveId, fileName, props) {
  const file = DriveApp.getFileById(driveId);
  const base64Data = Utilities.base64Encode(file.getBlob().getBytes());
  
  const REPO_OWNER = "GITHUB REPOSITORY OWNER NAME"; // E.g., 'tsugama-eng'
  const REPO_NAME = "GITHUB REPOSITORY NAME"; // E.g., 'lgpr'
  const path = 'sns_images/' + fileName; 
  
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`;
  const token = props.GITHUB_TOKEN || props.GH_TOKEN;
  
  // --- 【新規追加】既存ファイルのSHAをチェックする処理 ---
  let existingSha = null;
  const checkOptions = {
    method: 'get',
    headers: { 
      'Authorization': 'Bearer ' + token, 
      'Accept': 'application/vnd.github.v3+json' 
    },
    muteHttpExceptions: true
  };
  
  const checkResponse = UrlFetchApp.fetch(url, checkOptions);
  if (checkResponse.getResponseCode() === 200) {
    // 同名ファイルがすでに存在する場合、そのSHAを取り出す
    const fileInfo = JSON.parse(checkResponse.getContentText());
    existingSha = fileInfo.sha;
    Logger.log(`同名ファイルを検出したため、上書き処理に切り替えます (SHA: ${existingSha})`);
  }
  // ----------------------------------------------------

  // ペイロードの組み立て
  const payload = { 
    "message": "Upload SNS image: " + fileName, 
    "content": base64Data 
  };
  
  // SHAが存在する場合は上書き用にセット
  if (existingSha) {
    payload.sha = existingSha;
  }
  
  const options = {
    method: 'put',
    contentType: 'application/json',
    headers: { 
      'Authorization': 'Bearer ' + token, 
      'Accept': 'application/vnd.github.v3+json' 
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true 
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  Logger.log("GitHub Response Code: " + responseCode);
  if (responseCode !== 200 && responseCode !== 201) {
    throw new Error("GitHubアップロード失敗: " + responseText);
  }
  
  return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/${path}`;
}

/**
 * テストキットから移植した Meta Graph API 共通リクエスト関数
 */
function metaRequestSecure(cfg, platform, path, method, payload) {
  const host = 'https://graph.facebook.com/';
  let url = host + cfg.version + '/' + path;
  
  const options = {
    method: method || 'get',
    muteHttpExceptions: true,
    followRedirects: false,
    headers: { Authorization: 'Bearer ' + cfg.tokens[platform] }
  };
  
  if (options.method === 'get' && payload) {
    url += '?' + Object.keys(payload).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(payload[k])).join('&');
  } else if (payload) {
    options.payload = payload;
  }
  
  let response;
  try { 
    response = UrlFetchApp.fetch(url, options); 
  } catch(e) { 
    throw new Error('ネットワークエラーによりMetaとの通信に失敗しました。'); 
  }
  
  const code = response.getResponseCode();
  let result;
  try { 
    result = JSON.parse(response.getContentText()); 
  } catch(e) { 
    throw new Error(`Metaからのレスポンスを解析できませんでした (HTTP ${code})。`); 
  }
  
  if (code < 200 || code >= 300 || result.error) {
    const info = result.error || {};
    throw new Error(`Meta APIエラー (HTTP ${code} / code ${info.code}): ${info.message}`);
  }
  return result;
}


// ==========================================
// ① Instagram専用の画像投稿関数（try-catchによる安全設計）
// ==========================================

function publishToInstagramSecure(cfg, igUserId, text, imageUrls, category) {
  try {
    const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
    let containerId;

    // --- 【追加】スクリプトプロパティからSS_IDを取得し、カテゴリに応じたIGハッシュタグを結合 ---
    let fullCaption = text;
    if (category) {
      try {
        // スクリプトプロパティから HP_SS_ID を直接取得
        const ssId = PropertiesService.getScriptProperties().getProperty('HP_SS_ID');
        
        if (ssId) {
          const sheet = SpreadsheetApp.openById(ssId).getSheetByName("News_category");
          const data = sheet.getDataRange().getValues();
          let igTags = "";

          // A列のcategoryが一致する行を探す (i=1から開始)
          for (let i = 1; i < data.length; i++) {
            if (data[i][0] === category) {
              igTags = data[i][2]; // C列 (IG_tag) を取得
              break;
            }
          }

          // タグが存在すれば、本文の末尾に改行を挟んで結合
          if (igTags && igTags.trim() !== "") {
            fullCaption = `${text}\n\n${igTags.trim()}`;
          }
        } else {
          Logger.log("[Warning] スクリプトプロパティ 'HP_SS_ID' が見つかりません。");
        }
      } catch (ssError) {
        // スプシ読み込みエラーで投稿自体が落ちないよう、ログだけ残して本文のみで続行
        Logger.log(`[Warning] ハッシュタグ取得に失敗しました（本文のみで処理します）: ${ssError.message}`);
      }
    }
    // ---------------------------------------------------------------------------------

    if (urls.length === 1) {
      Logger.log("Instagram: 単一画像投稿を処理中...");
      const container = metaRequestSecure(cfg, 'instagram', `${igUserId}/media`, 'post', {
        image_url: urls[0],
        caption: fullCaption // 結合したキャプションを使用
      });
      containerId = container.id;
    } else {
      Logger.log(`Instagram: ${urls.length}枚のカルーセル投稿を処理中...`);
      const childContainerIds = [];

      // 1. 各画像の「子コンテナ」を作成
      urls.forEach((url, index) => {
        Logger.log(`子コンテナ作成中 (${index + 1}/${urls.length}): ${url}`);
        const childContainer = metaRequestSecure(cfg, 'instagram', `${igUserId}/media`, 'post', {
          image_url: url,
          is_carousel_item: 'true'
        });
        childContainerIds.push(childContainer.id);
      });

      // 2. 子コンテナの処理完了を個別に待機
      childContainerIds.forEach((id, index) => {
        let isChildFinished = false;
        for (let attempt = 0; attempt < 10; attempt++) {
          Utilities.sleep(3000);
          const status = metaRequestSecure(cfg, 'instagram', id, 'get', { fields: 'status_code' });
          if (status.status_code === 'FINISHED') {
            isChildFinished = true;
            break;
          } else if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
            throw new Error(`Instagram子コンテナ(${index + 1}枚目)の処理中にエラーが発生しました。`);
          }
        }
        if (!isChildFinished) throw new Error(`Instagram子コンテナ(${index + 1}枚目)がタイムアウトしました。`);
      });

      // 3. 子コンテナを束ねる「親コンテナ」を作成
      Logger.log("親コンテナ（カルーセル全体）を作成中...");
      const parentContainer = metaRequestSecure(cfg, 'instagram', `${igUserId}/media`, 'post', {
        media_type: 'CAROUSEL',
        children: childContainerIds.join(','),
        caption: fullCaption // 結合したキャプションを使用
      });
      containerId = parentContainer.id;
    }

    if (!containerId) throw new Error('Instagramメディアコンテナの作成に失敗しました。');
    
    // 4. 親コンテナの最終処理完了を待機
    let isFinished = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      Utilities.sleep(3000);
      Logger.log(`Instagram最終処理状況を確認中... (試行 ${attempt + 1}/10)`);
      
      const status = metaRequestSecure(cfg, 'instagram', containerId, 'get', { fields: 'status_code' });
      if (status.status_code === 'FINISHED') {
        isFinished = true;
        break;
      } else if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
        throw new Error(`Instagramの処理中にMeta側でエラーが発生しました (Status: ${status.status_code})。`);
      }
    }
    
    if (!isFinished) {
      throw new Error('Meta側でのInstagram画像処理がタイムアウトしました。');
    }
    
    // 5. 確定パブリッシュ
    const publishResult = metaRequestSecure(cfg, 'instagram', `${igUserId}/media_publish`, 'post', {
      creation_id: containerId
    });
    
    Logger.log("Instagram公開成功。Media ID: " + publishResult.id);
    return publishResult;

  } catch (igInternalError) {
    throw new Error(igInternalError.message || igInternalError.toString());
  }
}

// ==========================================
// ② Facebook専用の画像投稿関数（元のロジックを完全維持・エラー時はthrowするよう調整）
// ==========================================
function publishToFacebookImageSecure(cfg, text, imageUrls) {
  const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
  const fbPageId = PropertiesService.getScriptProperties().getProperty('FB_PAGE_ID');

  if (!fbPageId) throw new Error("FB_PAGE_ID がスクリプトプロパティに見つかりません。");
  if (!cfg.tokens || !cfg.tokens.facebook) throw new Error("Facebook用の初期トークンがありません。");

  Logger.log("Facebook: 投稿処理を開始します... (Page ID: " + fbPageId + ")");
  
  // ページアクセストークンの取得ロジック
  const accountsRes = metaRequestSecure(cfg, 'facebook', 'me/accounts', 'get');
  let pageAccessToken = null;

  if (accountsRes && accountsRes.data) {
    const targetPage = accountsRes.data.find(page => page.id === fbPageId);
    if (targetPage) {
      pageAccessToken = targetPage.access_token;
    }
  }

  if (!pageAccessToken) {
    throw new Error("対象のFacebookページのアクセストークンが見つかりませんでした。");
  }

  // トークンの上書き
  cfg.tokens.facebook = pageAccessToken;

  if (urls.length === 0) {
    Logger.log("Facebook: 画像なし（テキスト単体）投稿を処理中...");
    const fbResult = metaRequestSecure(cfg, 'facebook', `${fbPageId}/feed`, 'post', {
      message: text
    });
    Logger.log("Facebook公開成功(テキストのみ)。Post ID: " + fbResult.id);
    return fbResult;
  }

  if (urls.length === 1) {
    // 【画像が1枚の場合】
    Logger.log("Facebook: 単一画像投稿を処理中...");
    const fbResult = metaRequestSecure(cfg, 'facebook', `${fbPageId}/photos`, 'post', {
      url: urls[0],
      caption: text,
      published: 'true'
    });
    Logger.log("Facebook公開成功(単一写真)。Story ID: " + (fbResult.post_id || fbResult.id));
    return fbResult;
  } else {
    // 【画像が複数枚の場合】
    Logger.log(`Facebook: ${urls.length}枚のマルチフォト投稿を処理中...`);
    const fbPhotoIds = [];
    
    urls.forEach((url) => {
      const photoRes = metaRequestSecure(cfg, 'facebook', `${fbPageId}/photos`, 'post', {
        url: url,
        published: 'false'
      });
      fbPhotoIds.push({ media_fbid: photoRes.id });
    });
    
    const fbResult = metaRequestSecure(cfg, 'facebook', `${fbPageId}/feed`, 'post', {
      message: text,
      attached_media: JSON.stringify(fbPhotoIds)
    });
    Logger.log("Facebook公開成功(複数枚写真)。Post ID: " + fbResult.id);
    return fbResult;
  }
}

function generateXIntentUrl(text, imageUrls, token, owner, repo, newsUrl, category) {
  // 💡 対策2: 改行を取り除き、文字数を100文字程度にトリミングしてHTML構文エラーを防ぐ
  const plainText = text ? text.toString().replace(/[\r\n]+/g, " ") : "";
  const shortDesc = plainText.length > 100 ? plainText.substring(0, 100) + "..." : plainText;
  
  let xTags = "";

  if (category) {
    try {
      // スクリプトプロパティから HP_SS_ID を直接取得
      const ssId = PropertiesService.getScriptProperties().getProperty('HP_SS_ID');
   
      if (ssId) {
        const sheet = SpreadsheetApp.openById(ssId).getSheetByName("News_category");
        const data = sheet.getDataRange().getValues();
       // A列のcategoryが一致する行を探す (i=1から開始)
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === category) {
            xTags = data[i][1]; // C列 (X_tag) を取得
            break;
          }
        }

        if (xTags && xTags.trim() !== "") {
          xTags = xTags.trim()
            .replace(/#/g, '')      // すべての「#」を消去
            .split(/\s+/)           // スペース（全角半角問わず）で分割して配列化
            .join(',');             // コンマで結合
        }
      } else {
        Logger.log("[Warning] スクリプトプロパティ 'HP_SS_ID' が見つかりません。");
      }
    } catch (ssError) {
      // スプシ読み込みエラーで投稿自体が落ちないよう、ログだけ残して本文のみで続行
      Logger.log(`[Warning] ハッシュタグ取得に失敗しました（本文のみで処理します）: ${ssError.message}`);
    }
  }

  let xTargetUrl = "";

  if (imageUrls && imageUrls.length > 0) {
    const firstUrl = imageUrls[0];
    const fileName = firstUrl.substring(firstUrl.lastIndexOf('/') + 1);
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const htmlFileName = `${baseName}_${new Date().getTime()}.html`;
    const htmlPath = `x_submission/${htmlFileName}`;
    const mainImageUrl = imageUrls[0];
    
    const htmlContent = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Tsugama Lab</title>
  <meta property="og:type" content="article" />
  <meta property="og:title" content="Tsugama Lab Updates" />
  <meta property="og:description" content="${shortDesc.replace(/"/g, '&quot;')}" />
  <meta property="og:image" content="${mainImageUrl}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${mainImageUrl}" />
  <script>
    window.location.href = "https://${owner}.github.io/${repo}/${newsUrl}";
  </script>
</head>
<body>
  <p>Redirecting to Tsugama Lab...</p>
</body>
</html>`;

    commitHtmlToGitHub(htmlPath, htmlContent, token, owner, repo);
    xTargetUrl = `https://${owner}.github.io/${repo}/${htmlPath}`;
    Logger.log(`[Xシステム] OGP最適化ページを配置しました: ${xTargetUrl}`);
  } else {
    xTargetUrl = text.replace(/[\s\S]*https:/, "https:");
  }

  if (xTargetUrl) {
    // 💡 対策1: Intentのtextには長文を載せず、スッキリした導入文（または空）にして文字数制限を絶対に回避する
    // 長文はすべて上の og:description が勝手にタイムラインに表示してくれます。
    const tweetIntro = "Check Tsugama Lab Update"; 
    return `https://x.com/intent/tweet?text=${encodeURIComponent(tweetIntro)}&hashtags=${xTags}&url=${xTargetUrl}`;
  } else {
    return `https://x.com/intent/tweet?text=${encodeURIComponent(plainText)}&hashtags=${xTags}`;
  }
}

/**
 * 動的HTMLファイルをGitHubへ書き出す内部関数
 */
function commitHtmlToGitHub(path, htmlContent, token, owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  
  const payload = {
    message: "Create ephemeral OGP page for X submission",
    content: Utilities.base64Encode(htmlContent, Utilities.Charset.UTF_8),
    branch: "main"
  };
  
  const options = {
    method: 'put',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.v3+json' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true 
  };
  
  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() !== 200 && response.getResponseCode() !== 201) {
    throw new Error("X用動的OGPページのGitHubコミットに失敗しました: " + response.getContentText());
  }
}

// 💡本文のHTMLタグを綺麗にパースしてプレーンテキストにする関数
function cleanHtmlForSns(htmlString) {
  if (!htmlString) return "";
  var str = htmlString.toString();
  
  // 1. 改行系タグ（<br>, <br/>, <p>など）を通常の改行文字（\n）に置換
  str = str.replace(/<br\s*\/?>/gi, "\n");
  str = str.replace(/<\/p>/gi, "\n");
  str = str.replace(/<p>/gi, "");
  
  // 2. それ以外のすべてのHTMLタグ（<strong>や<span>など）を完全に除去
  str = str.replace(/<\/?[^>]+(>|$)/g, "");
  
  // 3. 実体参照（&amp; や &quot; など）があればデコード
  str = str.replace(/&amp;/g, "&")
           .replace(/&lt;/g, "<")
           .replace(/&gt;/g, ">")
           .replace(/&quot;/g, '"')
           .replace(/&#39;/g, "'");

  str = str.replace(/ DOI: /, " https://doi.org/")
  
  return str.trim();
}

function testLinkedInWebhook() {

  const url =
    PropertiesService
      .getScriptProperties()
      .getProperty('LI_WEBAPP_URL');

  const li_shared_secret =
    PropertiesService
      .getScriptProperties()
      .getProperty('LI_SHARED_SECRET');
  
  const githubUrls = [];
    //'https://raw.githubusercontent.com/tsugama-eng/lgpr/main/img/chuma_thumb.jpg',
    //'https://raw.githubusercontent.com/tsugama-eng/lgpr/main/img/owl_thumb.jpg',
    //'https://raw.githubusercontent.com/tsugama-eng/lgpr/main/img/liu2024_thumb.jpg'
  //];

  const res =
    UrlFetchApp.fetch(url, {
      method: 'post',
      payload: {
        secret: li_shared_secret,
        text: 'Hello from University GAS',
        imageUrls: JSON.stringify(githubUrls)
        //imageUrl: 'https://raw.githubusercontent.com/tsugama-eng/lgpr/main/img/chuma_thumb.jpg'
      }
    });

  Logger.log(
    res.getContentText()
  );
}
