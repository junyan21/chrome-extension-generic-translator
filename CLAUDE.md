# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのプロジェクトで作業する際の包括的なガイドです。

## 🎯 プロジェクト概要

**Claude Translator Chrome Extension** - Google翻訳・DeepLスタイルの多言語翻訳Chrome拡張機能

### 主要機能
- **テキスト選択翻訳**: DeepLスタイルのフローティングポップアップ
- **フルページ翻訳**: Google翻訳/DeepL両スタイル対応
- **多言語対応**: 日本語、英語、中国語、韓国語の自動検出・翻訳
- **レイアウト保持**: 元のCSSスタイルを完全維持

## 🏗️ アーキテクチャ設計

### Chrome Extension Manifest V3
- **background.ts**: サービスワーカー（API呼び出し、メッセージ処理）
- **content.ts**: コンテンツスクリプト（UI制御、翻訳管理）
- **popup.ts**: 拡張機能ポップアップ
- **options.ts**: 設定画面（APIキー管理、テスト機能）

### 核心モジュール
- **translator.ts**: Claude API統合・翻訳処理
- **readability-parser.ts**: フルページ翻訳エンジン（DeepL風実装）
- **language-detector.ts**: 多言語自動検出
- **dom-parser.ts**: DOM解析・テキスト抽出

## 🛠️ 開発手順・手法

### 1. 初期セットアップ
```bash
npm install              # 依存関係インストール
npm run build           # プロダクションビルド
npm run watch          # 開発時ファイル監視
npm run clean          # distディレクトリクリア
```

### 2. 開発ワークフロー

#### Chrome拡張機能開発サイクル
1. **コード変更** → `npm run watch` で自動ビルド
2. **Chrome Extensions** (`chrome://extensions/`) でリロード
3. **デバッグ**: 
   - Background: 拡張機能詳細 → Service Worker
   - Content Scripts: ウェブページのDevToolsコンソール
   - Popup: ポップアップ右クリック → 検証

#### TypeScript + esbuild構成
- **esbuild**: 高速バンドル・トランスパイル
- **型安全性**: `@types/chrome` で拡張機能API型定義
- **モジュラー設計**: 機能別ファイル分割

### 3. 技術実装アプローチ

#### フルページ翻訳エンジン設計
**DeepL風属性管理システム**:
```typescript
// 各翻訳要素に状態追跡属性を付与
data-dl-uid="unique-id"
data-dl-translated="true"
data-dl-original-text="base64-encoded"
data-original-display="block"
```

**レイアウト保持戦略**:
- `getComputedStyle()` で元スタイル取得・保存
- `!important` CSSルールで強制的スタイル適用
- 日本語テキストラッピング専用処理

**可視性制御**:
- `isElementVisible()` での厳密な表示判定
- `display: none` 要素の適切な除外・復元
- 親要素の可視性を再帰的チェック

#### 翻訳処理の最適化
**バッチ処理システム**:
```typescript
const MAX_TOKENS_PER_BATCH = 15000;
// 複数テキストを一括翻訳してAPI呼び出し削減
```

**翻訳キャッシュ**:
```typescript
Map<string, string> // originalText → translatedText
// 同一テキストの再翻訳を回避
```

### 4. UI/UX実装手法

#### DeepLスタイル翻訳ポップアップ
- **ドラッグ可能**: `mousedown/mousemove/mouseup` イベント
- **言語切り替え**: ドロップダウンUI + 言語検出連携
- **コピー機能**: `navigator.clipboard.writeText()`

#### Google翻訳スタイル翻訳バー
- **進捗表示**: リアルタイム翻訳状況更新
- **原文/翻訳切り替え**: `toggleTranslation()` メソッド
- **完全復元**: `reset()` でDOMを元状態に戻す

## 🔧 開発コマンド詳細

### ビルド・開発
```bash
npm run build    # プロダクションビルド（TypeScript → JavaScript）
npm run watch    # 開発モード（ファイル変更監視）
npm run clean    # dist/ディレクトリ削除
```

### デバッグ・テスト
- **APIキーテスト**: options.html の「APIキーをテスト」ボタン
- **翻訳テスト**: 
  1. テキスト選択翻訳でクイックテスト
  2. フルページ翻訳で大規模テスト
- **エラー処理**: コンソールログで詳細トレース

## 🚀 主要技術課題と解決策

### 1. レイアウト崩れ対策
**問題**: 翻訳後の文字数変化でページレイアウトが崩れる
**解決**: 
- 元のCSSスタイルを`getComputedStyle()`で完全保存
- `!important`ルールで翻訳要素に強制適用
- 日本語の長文に対する`word-break: break-all`

### 2. 非表示要素の処理
**問題**: `display: none`要素が翻訳され、復元時に見えなくなる
**解決**:
- 翻訳前の厳密な可視性チェック
- `data-original-display`属性での元状態保存
- 復元時のインテリジェントなデフォルト値設定

### 3. 動的コンテンツ対応
**問題**: JavaScript生成コンテンツの翻訳タイミング
**解決**:
- `MutationObserver`で DOM変更を監視
- `IntersectionObserver`でビューポート内要素を追跡
- 定期的な未翻訳要素スキャン（3秒間隔）

### 4. 翻訳品質・パフォーマンス
**問題**: API呼び出し回数とレスポンス時間
**解決**:
- バッチ処理による一括翻訳（最大15,000トークン）
- 翻訳結果キャッシュでの重複回避
- エラーハンドリングと再試行機能

## 🔍 デバッグ・トラブルシューティング

### よくある問題と対処法

#### 1. 翻訳が表示されない
- `console.log`でAPIレスポンス確認
- DOM要素の可視性チェック
- キャッシュクリア後の再テスト

#### 2. レイアウトが崩れる
- `getComputedStyle`の保存状況確認
- CSS `!important`ルールの適用確認
- 親要素のスタイル継承チェック

#### 3. API呼び出しエラー
- APIキーの有効性確認（テスト機能使用）
- ネットワーク接続状況確認
- Claude APIの制限・状況確認

### デバッグログの活用
```typescript
console.log('[ComponentName] 処理内容:', データ);
// 統一されたログフォーマットで追跡しやすく
```

## 📋 コーディング規約

### TypeScript
- **厳密型定義**: interface/type の積極活用
- **null安全**: Optional chaining (`?.`) とnullチェック
- **エラーハンドリング**: try-catch とPromise.catch

### Chrome Extension
- **Manifest V3準拠**: service worker使用
- **セキュリティ**: CSP (Content Security Policy) 対応
- **パーミッション**: 必要最小限の権限要求

### CSS/スタイル
- **Tailwind CSS**: ポップアップ・設定画面
- **カスタムCSS**: コンテンツスクリプト用
- **レスポンシブ**: 各画面サイズ対応

## 🎯 将来的な拡張・改善方向

### 機能拡張
- **追加言語**: フランス語、スペイン語、ドイツ語等
- **翻訳エンジン選択**: Claude/GPT/Gemini の切り替え
- **カスタムプロンプト**: 専門分野特化翻訳

### パフォーマンス改善
- **WebAssembly**: 言語検出の高速化
- **Web Workers**: 重い処理のバックグラウンド実行
- **IndexedDB**: 大量キャッシュの永続化

### UI/UX向上
- **アニメーション**: 翻訳プロセスの視覚的フィードバック
- **カスタマイズ**: テーマ・色設定
- **ショートカット**: より多様なキーボード操作

## 🛡️ セキュリティ・プライバシー

### APIキー管理
- `chrome.storage.sync` での安全な保存
- メモリ上での一時的保持のみ
- ネットワーク経由での平文送信回避

### ユーザーデータ
- **翻訳テキスト**: ローカルキャッシュのみ
- **閲覧履歴**: 一切収集・送信しない
- **プライバシー**: オフライン動作可能な部分は分離

## 🏆 開発成果物

### 完成した主要機能
1. **テキスト選択翻訳**: DeepLスタイルのポップアップで高品質翻訳
2. **フルページ翻訳**: レイアウト保持しながらページ全体を翻訳
3. **多言語対応**: 4言語の自動検出・相互翻訳
4. **UI/UX**: Google翻訳・DeepLに匹敵するユーザー体験

### 技術的達成
- Chrome Extension Manifest V3完全対応
- TypeScript + esbuildによる高速開発環境
- DeepL風属性管理による状態追跡
- レイアウト崩れ防止の包括的ソリューション

このプロジェクトは、実用的で高品質なChrome拡張機能として、Google翻訳・DeepLに匹敵する翻訳体験を提供することを目指しています。