function doPost(e) {

  const props =
    PropertiesService.getScriptProperties();

  const secret =
    e.parameter.secret;

  if (
    secret !==
    props.getProperty('LI_SHARED_SECRET')
  ) {

    return ContentService
      .createTextOutput(
        'Unauthorized'
      );
  }

  const text =
    e.parameter.text || '';

  const imageUrls =
    JSON.parse(
      e.parameter.imageUrls || '[]'
    );

  const res =
    publishToLinkedIn(
      text,
      imageUrls
    );

  return ContentService
    .createTextOutput(
      JSON.stringify({
        status: res.getResponseCode(),
        body: res.getContentText()
      })
    );
}

function getLinkedInUserInfo() {

  const token =
    PropertiesService.getScriptProperties()
      .getProperty('LI_ACCESS_TOKEN');

  const res = UrlFetchApp.fetch(
    'https://api.linkedin.com/v2/userinfo',
    {
      headers: {
        Authorization: 'Bearer ' + token
      }
    }
  );

  const json =
    JSON.parse(res.getContentText());

  Logger.log(json);

  return json;
}

function registerLinkedInImage(ownerUrn, token) {

  const payload = {
    registerUploadRequest: {
      owner: ownerUrn,
      recipes: [
        "urn:li:digitalmediaRecipe:feedshare-image"
      ],
      serviceRelationships: [{
        relationshipType: "OWNER",
        identifier: "urn:li:userGeneratedContent"
      }]
    }
  };

  const res = UrlFetchApp.fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Bearer " + token,
        "X-Restli-Protocol-Version": "2.0.0"
      },
      payload: JSON.stringify(payload)
    }
  );

  return JSON.parse(res.getContentText());
}

function publishToLinkedIn(text, imageUrls) {

  if (!imageUrls || imageUrls.length === 0) {

    return publishTextOnlyToLinkedIn(text);

  }

  return publishImageToLinkedIn(
    text,
    imageUrls
  );
}

function uploadImageToLinkedIn(
  imageUrl,
  uploadUrl
) {

  const blob =
    UrlFetchApp
      .fetch(imageUrl)
      .getBlob();

  UrlFetchApp.fetch(
    uploadUrl,
    {
      method: "put",
      contentType: blob.getContentType(),
      payload: blob.getBytes()
    }
  );

}

function publishImageToLinkedIn(
  text,
  imageUrls
) {

  const token =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'LI_ACCESS_TOKEN'
      );

  const user =
    getLinkedInUserInfo();

  const ownerUrn =
    `urn:li:person:${user.sub}`;

  const mediaArray = [];

  for (const imageUrl of imageUrls) {

    const registerInfo =
      registerLinkedInImage(
        ownerUrn,
        token
      );

    const uploadUrl =
      registerInfo.value
        .uploadMechanism[
          "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
        ]
        .uploadUrl;

    const asset =
      registerInfo.value.asset;

    uploadImageToLinkedIn(
      imageUrl,
      uploadUrl
    );

    mediaArray.push({
      status: "READY",
      media: asset
    });

  }

  const payload = {
    author: ownerUrn,

    lifecycleState:
      "PUBLISHED",

    specificContent: {

      "com.linkedin.ugc.ShareContent": {

        shareCommentary: {
          text: text
        },

        shareMediaCategory:
          "IMAGE",

        media: mediaArray

      }
    },

    visibility: {

      "com.linkedin.ugc.MemberNetworkVisibility":
        "PUBLIC"

    }
  };

  const res =
    UrlFetchApp.fetch(
      'https://api.linkedin.com/v2/ugcPosts',
      {
        method: 'post',

        headers: {
          Authorization:
            'Bearer ' + token,

          'X-Restli-Protocol-Version':
            '2.0.0'
        },

        contentType:
          'application/json',

        payload:
          JSON.stringify(payload),

        muteHttpExceptions:
          true
      }
    );

  Logger.log(
    res.getResponseCode()
  );

  Logger.log(
    res.getContentText()
  );

  return res;
}

function publishTextOnlyToLinkedIn(text) {

  const token =
    PropertiesService.getScriptProperties()
      .getProperty('LI_ACCESS_TOKEN');

  const user =
    getLinkedInUserInfo();

  const payload = {
    author: `urn:li:person:${user.sub}`,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: {
          text: text
        },
        shareMediaCategory: "NONE"
      }
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility":
        "PUBLIC"
    }
  };

  const res = UrlFetchApp.fetch(
    'https://api.linkedin.com/v2/ugcPosts',
    {
      method: 'post',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Restli-Protocol-Version':
          '2.0.0'
      },
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  Logger.log(res.getResponseCode());
  Logger.log(res.getContentText());

  return res;
}

function testLinkedInPost() {

  publishTextOnlyToLinkedIn(
    'Hello LinkedIn from GAS 🚀'
  );

}
