# Automated Website Generation & Update System

Google スプレッドシートおよび Researchmap API を活用し、研究室ウェブサイト（HTML/JavaScript）のコンテンツを自動で更新・配信するシステムです。

## 📊 システム概要図
本システムは以下のフロー（構成図通り）で自動連携を行っています。

1. **Researchmap 同期**: `GAS: syncAllResearchmap` が API を叩き最新の業績データを取得 [1. Request -> 2. Return]
2. **ローカルスプレッドシート反映**: 取得したデータを「Google Spreadsheet for Researchmap」に格納 [3. Update]
3. **お知らせ・イベント自動抽出**: `GAS: updateHomepageNews` が、新着論文やメンバーの卒業・学位取得情報を検知し、自動的に「News」シートへ統合 [4. News]
4. **GitHub 配信**: `GAS: pushHpDataToGitHub` がすべてのデータを統合し、`content.json` および `news.json` としてリポジトリへ直接コミット [5. Integration -> 6. Push]
5. **クライアント描画**: 配信された JSON データを、ウェブサイト側の HTML/JavaScript がリキッド・レスポンシブなテック調 UI へと動的にレンダリングします。

---

## 🛠️ 今回のアップデート：Links セクションの仕様変更

データベースやウェブツールの紹介をより視覚的かつ直感的に行うため、**Links セクションの拡張および UI 刷新（省コード流用デザイン）**を行いました。

### 1. データ構造の拡張 (3カテゴリ化)
Google スプレッドシート（`Links` シート）側で管理するカテゴリを以下の **3つに分類・整理** しました。
*   **`Tools & Platforms`** (旧 Web Tools & Databases): 研究室が開発・提供するデータベースやツール（※ロゴ画像によるカード表示対象）
*   **`Affiliations`**: 所属組織、関連学会、研究センターなど（テキストリンク形式）
*   **`External Resources`** [★新規追加]: その他の外部関連リソース（テキストリンク形式）

### 2. ロゴ画像（正方形）の自動直リンク変換
*   `Links` シートの 5 列目（E列）にロゴ用の画像ファイル名（例: `Turnip.avif`）を追記することで、GAS 内の `fileLinkMap` が Google ドライブの共有フォルダから該当ファイルを自動検知します。
*   自動取得された固有 ID をベースに、ウェブから直接参照可能な直リンク URL（`https://googleusercontent.com{ID}`）へと自動変換され、JSON の `pic` プロパティへ格納されます。

### 3. クライアント UI の刷新 (既存 CSS の流用＋ピンポイント上書き案)
サイト全体のコード量を最小限に抑えつつ、正方形ロゴを美しく配置するため、既存の `project-grid` / `project-card` クラスをそのまま流用して上書きするアプローチを採用しました。

*   **正方形（1:1）のアイコン枠**: インラインスタイル（`aspect-ratio: 1/1; width: 110px;`）をピンポイント適用し、あらゆる正方形ロゴが中央に綺麗に収まるダッシュボード・アプリストア風のレイアウトを実現。
*   **ホバーエフェクトの継承**: 既存の `.clickable:hover` がそのまま適用されるため、カードが上に 5px 浮き上がり、テック調の無機質な世界観を崩さずに洗練された動的 UI を維持しています。

---

## 📁 主要ファイル構成

*   `style2.css` / インラインCSS: サイト全体のモダンゴシック・等幅フォントベースのデザイン、およびベースとなるグリッドレイアウト（`.project-grid` / `.project-card`）を定義。
*   `index.html` (JavaScript部): `loadLabData()` 内で 3 つのコンテナ（`#links-tools-container`, `#links-affiliations-container`, `#links-external-container`）へ JSON データを条件分岐で動的レンダリング。
*   `GASコード（Google Apps Script）`:
    *   `syncAllResearchmap()`: Researchmap からの自動データ同期。
    *   `updateHomepageNews()`: スプレッドシート内の変更、新規論文の公開を検知して News を生成。
    *   `pushHpDataToGitHub()`: 今回拡張した 5 列目のロゴ画像名を含め、データをクレンジングして GitHub へプッシュ。

---

## 🚀 運用・メンテナンス手順

1.  **新しいツールやプラットフォームを追加する場合**:
    *   研究室メンバー用 Google スプレッドシートの `Links` シートを開きます。
    *   `category` 列に `Tools & Platforms` を指定します。
    *   E列（5列目）に、指定の Google ドライブフォルダ内にある正方形ロゴのファイル名（拡張子含む）を入力します。
2.  **自動反映**:
    *   トリガー設定された GAS が実行されると、GitHub 経由で即座に公開ウェブサイト側がアイコン付きのダッシュボードカード形式で自動更新されます。
