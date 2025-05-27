# Claude Translator Chrome Extension

DeepL風の日英翻訳Chrome拡張機能です。Claude APIを使用して高品質な翻訳を提供します。

## 機能

- **テキスト選択翻訳**: テキストを選択するとフローティングボタンが表示され、クリックで翻訳
- **フルページ翻訳**: ページ全体を段階的に翻訳（ビューポート内を優先）
- **キーボードショートカット**:
  - `Ctrl/Cmd + Shift + Y`: 選択テキストを翻訳
  - `Ctrl/Cmd + Shift + T`: ページ全体を翻訳
- **言語自動検出**: 日本語⇔英語を自動で判別
- **翻訳結果のキャッシュ**: 同じテキストの再翻訳を高速化

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. ビルド

```bash
npm run build
```

開発時は以下のコマンドでファイル変更を監視:

```bash
npm run watch
```

### 3. Chrome拡張機能として読み込み

1. Chromeで `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をONにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. `dist` フォルダを選択

### 4. APIキーの設定

1. 拡張機能のアイコンを右クリックし「オプション」を選択
2. [Anthropic Console](https://console.anthropic.com/)でAPIキーを取得
3. 設定画面でAPIキーを入力して保存

## 使い方

### テキスト選択翻訳

1. ウェブページ上でテキストを選択
2. 表示されるフローティングボタンをクリック
3. 翻訳結果がポップアップで表示される

### フルページ翻訳

以下のいずれかの方法:
- 拡張機能のポップアップから「ページ全体を翻訳」をクリック
- ページ上で右クリックして「ページ全体を翻訳」を選択
- キーボードショートカット `Ctrl/Cmd + Shift + T` を使用

### ポップアップでのクイック翻訳

1. 拡張機能のアイコンをクリック
2. テキストを入力
3. 「翻訳する」ボタンをクリック

## プロジェクト構造

```
chrome-extension-generic-translator/
├── dist/               # ビルド出力
├── src/
│   ├── background.ts   # バックグラウンドサービスワーカー
│   ├── content.ts      # コンテンツスクリプト
│   ├── popup.ts        # ポップアップのスクリプト
│   ├── options.ts      # 設定画面のスクリプト
│   ├── utils/
│   │   ├── translator.ts        # Claude API翻訳ロジック
│   │   ├── dom-parser.ts        # DOM解析（フルページ翻訳用）
│   │   └── language-detector.ts # 言語検出
│   └── styles.css      # スタイルシート
├── manifest.json       # 拡張機能マニフェスト
├── popup.html          # ポップアップHTML
├── options.html        # 設定画面HTML
└── icons/              # アイコンファイル
```

## 開発

### TypeScript

このプロジェクトはTypeScriptで書かれています。型定義は `@types/chrome` パッケージを使用しています。

### ビルドシステム

`esbuild` を使用して高速なビルドを実現しています。`build.js` でビルド設定を管理しています。

### スタイリング

- ポップアップと設定画面: Tailwind CSS (CDN版)
- コンテンツスクリプト: カスタムCSS (`src/styles.css`)

## 注意事項

- Claude APIの利用には料金が発生します
- APIキーは安全に管理してください
- 大量のテキストを翻訳する場合はAPI制限に注意してください

## ライセンス

MITライセンス