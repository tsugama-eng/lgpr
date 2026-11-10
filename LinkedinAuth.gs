function getLinkedinService() {
  const liClientId = PropertiesService.getScriptProperties().getProperty('LI_CLIENT_ID');
  const liClientSecret = PropertiesService.getScriptProperties().getProperty('LI_CLIENT_SECRET');

  return OAuth2.createService('Linkedin')
    .setAuthorizationBaseUrl('https://www.linkedin.com/oauth/v2/authorization')
    .setTokenUrl('https://www.linkedin.com/oauth/v2/accessToken')
    .setClientId(liClientId)
    .setClientSecret(liClientSecret)
    .setCallbackFunction('authCallback')
    .setPropertyStore(PropertiesService.getUserProperties())
    .setScope('w_member_social openid profile')
    .setParam('prompt', 'consent')
    // 👇 LinkedIn向けにトークンリクエストのペイロード形式を明示的に指定（ライブラリの仕様による）
    .setTokenPayloadHandler(function(payload) {
      return payload; // デフォルトで問題ないことが多いですが、エラーが出る場合はここやHeadersを調整します
    });
}

// 💡 実行してログを確認する関数（デバッグ用ログ付き）
function logAuthUrl() {
  // 事前にキャッシュを完全にリセット
  getLinkedinService().reset();

  const liClientId = PropertiesService.getScriptProperties().getProperty('LI_CLIENT_ID');
  Logger.log('【デバッグ】読み込んだClient IDの最初の3文字: ' + (liClientId ? liClientId.substring(0, 3) + '***' : '⚠️空（undefined）です！'));

  var service = getLinkedinService();
  var authorizationUrl = service.getAuthorizationUrl();
  Logger.log('▼ 以下のURLをコピーしてブラウザで開いてください：');
  Logger.log(authorizationUrl);
}

function testLinkedIn() {

  const service = getLinkedinService();

  Logger.log("CLIENT_ID=");
  Logger.log(
    PropertiesService.getScriptProperties()
      .getProperty('LI_CLIENT_ID')
  );

  Logger.log("REDIRECT_URI=");
  Logger.log(service.getRedirectUri());

  Logger.log("AUTH_URL=");
  Logger.log(service.getAuthorizationUrl());
}


// The above was for debugging


function sendLinkedInAuthMail() {

  const service =
    getLinkedinService();

  service.reset();

  const authUrl =
    service.getAuthorizationUrl();

  let me =
    Session.getEffectiveUser()
      .getEmail();
  
  // An additional email address can be added as follows
  // me = me + ', ADDITIONAL EMAIL ADDRESS';

  MailApp.sendEmail({
    to: me,
    subject:
      'LinkedIn Token Renewal',
    htmlBody:
      `
      LinkedInトークンを更新してください。<br><br>

      <a href="${authUrl}">
      認証する
      </a>
      `
  });

}

function checkLinkedInToken() {

  const expiresAt =
    Number(
      PropertiesService
        .getScriptProperties()
        .getProperty(
          'LI_TOKEN_EXPIRES_AT'
        )
    );

  const daysLeft =
    (expiresAt - Date.now())
    / (1000 * 60 * 60 * 24);

  Logger.log(
    'daysLeft=' + daysLeft
  );

  if (daysLeft < 10) {

    sendLinkedInAuthMail();

  }

}

function authCallback(e) {

  try {

    Logger.log("===== CALLBACK =====");
    Logger.log(JSON.stringify(e));

    const code = e.parameter.code;

    Logger.log("CODE:");
    Logger.log(code);

    const payload = {
      grant_type: 'authorization_code',
      code: code,
      client_id:
        PropertiesService
          .getScriptProperties()
          .getProperty('LI_CLIENT_ID'),

      client_secret:
        PropertiesService
          .getScriptProperties()
          .getProperty('LI_CLIENT_SECRET'),

      redirect_uri:
        getLinkedinService().getRedirectUri()
    };

    const response = UrlFetchApp.fetch(
      'https://www.linkedin.com/oauth/v2/accessToken',
      {
        method: 'post',
        payload: payload,
        muteHttpExceptions: true
      }
    );

    Logger.log("STATUS:");
    Logger.log(response.getResponseCode());

    Logger.log("BODY:");
    Logger.log(response.getContentText());

    return HtmlService.createHtmlOutput(
      'LinkedIn callback succeeded.<br>Check GAS logs.'
    );

  } catch(err) {

    Logger.log("ERROR:");
    Logger.log(err);

    return HtmlService.createHtmlOutput(
      'ERROR: ' + err
    );
  }
}
