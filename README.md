<p align="center">
  <img src="lgpr_system.png" alt="System Icon" width="90%" style="vertical-align: middle;" />
</p>

# Automated Website Generation & Update System

This is an integrated system designed to automate the content updates and deployment of our lab website (HTML/JavaScript) (https://tsugama-eng.github.io/lgpr/) by leveraging Google Sheets and the Researchmap API.

## 📊 System Architecture Diagram
The system automatically coordinates data flows as illustrated in the architecture diagram below:

1. **Researchmap Synchronization**: `GAS: syncAllResearchmap` fetches the latest publication and award records via the Researchmap API. **[1. Request -> 2. Return]**
2. **Spreadsheet Ingestion**: The retrieved data is populated into the "Google Spreadsheet for Researchmap". **[3. Update]**
3. **Automated News/Event Extraction**: `GAS: updateHomepageNews` detects new papers or updates in lab members (e.g., graduations, Ph.D. awards) and automatically integrates them into the "News" sheet. **[4. News]**
4. **GitHub Deployment**: `GAS: pushHpDataToGitHub` merges all data streams and commits them directly to this repository as `content.json` and `news.json`. **[5. Integration -> 6. Push]**
5. **Client-side Rendering**: The HTML/JavaScript on the website reads these JSON files and dynamically renders a UI for users.

---

## Important GAS Functions
    *   `syncAllResearchmap()`: Automatically syncs data from Researchmap.
    *   `updateHomepageNews()`: Tracks sheet changes and automatically formats and feeds new logs into the News stream.
    *   `pushHpDataToGitHub()`: Cleans data streams, resolves the newly added 5th column image references, and pushes the final JSON outputs to GitHub.

---

# Automated Website Generation & Update System

私達の研究室HP (https://tsugama-eng.github.io/lgpr/) のGoogle スプレッドシートおよび Researchmap API を活用し、研究室ウェブサイト（HTML/JavaScript）のコンテンツを半自動で更新・配信するシステムです。

## 📊 システム概要図
本システムは以下のフロー（構成図通り）で自動連携を行っています。

1. **Researchmap 同期**: `GAS: syncAllResearchmap` が API を叩き最新の業績データを取得 [1. Request -> 2. Return]
2. **ローカルスプレッドシート反映**: 取得したデータを「Google Spreadsheet for Researchmap」に格納 [3. Update]
3. **お知らせ・イベント自動抽出**: `GAS: updateHomepageNews` が、新着論文やメンバーの卒業・学位取得情報を検知し、自動的に「News」シートへ統合 [4. News]
4. **GitHub 配信**: `GAS: pushHpDataToGitHub` がウェブサイト用データを統合し、`content.json` および `news.json` としてリポジトリへ直接コミット [5. Integration -> 6. Push]
5. **クライアント描画**: 配信された JSON データを、ウェブサイト側の HTML/JavaScript が UI へと動的にレンダリングします。

---

## GASにおける主要な関数
    *   `syncAllResearchmap()`: Researchmap からのデータ同期。
    *   `updateHomepageNews()`: スプレッドシート内PeopleとEventsの変更、新規論文の公開を検知して News を生成。
    *   `pushHpDataToGitHub()`: データを収集・統合して GitHub へプッシュ。
