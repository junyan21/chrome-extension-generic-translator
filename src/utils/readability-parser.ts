/**
 * フルページ翻訳ツール - Google翻訳式の実装
 */

export interface TextBlock {
  element: HTMLElement;
  originalText: string;
  translatedText?: string;
  isTranslated: boolean;
  priority: number;
  uid?: string; // DeepL風のユニークID
}

export class FullPageTranslator {
  private translationState = {
    originalElements: new Map<HTMLElement, string>(),
    translatedElements: new Map<HTMLElement, string>(),
    isTranslated: false,
    elementCache: new Map<string, TextBlock>(), // UID -> TextBlock のキャッシュ
    styleCache: new Map<string, CSSStyleDeclaration>(), // UID -> スタイル情報
    translationCache: new Map<string, string>(), // テキスト -> 翻訳結果のキャッシュ
  };

  private mutationObserver: MutationObserver | null = null;
  private isTranslating: boolean = false;
  private progressCallback?: (progress: number, status: string) => void;
  private uidCounter: number = 0;
  private sourceLang: string = 'auto';
  private targetLang: string = 'ja';

  // 除外するタグ名
  private readonly excludedTags = new Set([
    "SCRIPT",
    "STYLE",
    "CODE",
    "PRE",
    "NOSCRIPT",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "SVG",
    "CANVAS",
    "NAV",
    "FOOTER",
    "HEADER", // ただしarticle内のheaderは除外しない
  ]);

  // 除外するクラス名・属性・要素
  private readonly excludedSelectors = [
    ".notranslate",
    '[translate="no"]',
    "[data-no-translate]",
    '[contenteditable="true"]',
    // UI要素
    "button",
    "input",
    "select",
    "textarea",
    // ナビゲーション関連
    '[role="navigation"]',
    '[role="menu"]',
    '[role="menubar"]',
    ".menu",
    ".nav",
    ".navbar",
    ".navigation",
    ".breadcrumb",
    // フッター・サイドバー関連
    ".footer",
    ".sidebar",
    "aside",
    // 広告・プロモーション
    ".ad",
    ".ads",
    ".advertisement",
    ".promo",
    ".promotion",
    '[class*="banner"]',
    // SNS・シェアボタン
    ".share",
    ".social",
    '[class*="share-"]',
    '[class*="social-"]',
    // その他のUI要素
    ".tooltip",
    ".modal",
    ".popup",
    ".dropdown",
  ];

  // 優先的に翻訳すべきセレクタ
  private readonly contentSelectors = [
    "article",
    "main",
    '[role="main"]',
    '[role="article"]',
    ".article",
    ".content",
    ".post",
    ".entry",
    ".story",
    // ニュースサイト向け
    ".article-body",
    ".post-content",
    ".entry-content",
    ".story-body",
  ];

  constructor() {
    this.setupMutationObserver();
  }

  /**
   * ページ全体の翻訳を実行
   */
  async translatePage(progressCallback?: (progress: number, status: string) => void): Promise<void> {
    if (this.isTranslating) {
      console.log("[FullPageTranslator] 翻訳処理中のため中止");
      return;
    }

    this.isTranslating = true;
    this.progressCallback = progressCallback;
    console.log("[FullPageTranslator] ページ翻訳を開始");

    try {
      this.updateProgress(0, "テキストブロックを抽出中...");
      
      // 翻訳対象のテキストブロックを抽出
      const textBlocks = this.extractTextBlocks();

      if (textBlocks.length === 0) {
        console.log("[FullPageTranslator] 翻訳対象のテキストが見つかりません");
        this.updateProgress(100, "翻訳対象が見つかりませんでした");
        return;
      }

      this.updateProgress(10, `${textBlocks.length}個のテキストブロックを発見`);

      // 表示領域内のブロックを優先的に翻訳
      await this.translateVisibleBlocks(textBlocks);

      // 残りのブロックを翻訳
      await this.translateRemainingBlocks(textBlocks);

      this.translationState.isTranslated = true;
      this.updateProgress(100, "翻訳完了");
      console.log("[FullPageTranslator] 翻訳完了", this.translationState.translatedElements);
    } catch (error) {
      console.error("[FullPageTranslator] 翻訳エラー:", error);
      this.updateProgress(0, "翻訳エラーが発生しました");
    } finally {
      this.isTranslating = false;
    }
  }

  /**
   * テキストブロックの抽出（可視要素のみ）
   */
  private extractTextBlocks(): TextBlock[] {
    console.log("[FullPageTranslator] テキストブロックの抽出を開始...");

    const blocks: TextBlock[] = [];
    
    // まず、メインコンテンツ領域を特定
    let contentRoot: Element | Document = document;
    for (const selector of this.contentSelectors) {
      const contentElement = document.querySelector(selector);
      if (contentElement) {
        contentRoot = contentElement;
        console.log(`[FullPageTranslator] メインコンテンツ領域を発見: ${selector}`);
        break;
      }
    }

    // 翻訳対象の要素を収集
    const blockElements = contentRoot.querySelectorAll(
      "p, h1, h2, h3, h4, h5, h6, li, td, th, div, span, a, label, time, address, blockquote, figcaption"
    );

    let visibleCount = 0;
    let hiddenCount = 0;
    let excludedCount = 0;

    blockElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      
      // 子要素を持つ要素で、その子要素が既に翻訳対象の場合はスキップ
      const hasTranslatableChildren = Array.from(element.children).some(child => 
        blocks.some(block => block.element === child)
      );
      
      if (!hasTranslatableChildren && this.shouldTranslateElement(htmlElement)) {
        const text = this.getDirectTextContent(htmlElement);
        if (text.length > 1) { // 1文字以上のテキストのみ
          blocks.push({
            element: htmlElement,
            originalText: text,
            isTranslated: false,
            priority: this.calculatePriority(htmlElement),
          });
          visibleCount++;
        }
      } else if (!this.isElementVisible(htmlElement)) {
        hiddenCount++;
      } else {
        excludedCount++;
      }
    });

    // メインコンテンツ外でも重要な要素は追加（ページタイトルなど）
    if (contentRoot !== document) {
      const pageTitle = document.querySelector('h1');
      if (pageTitle && !blocks.some(b => b.element === pageTitle) && this.shouldTranslateElement(pageTitle)) {
        const text = this.getDirectTextContent(pageTitle);
        if (text.length > 1) {
          blocks.push({
            element: pageTitle,
            originalText: text,
            isTranslated: false,
            priority: 300, // 最高優先度
          });
        }
      }
    }

    console.log(`[FullPageTranslator] ${blocks.length}個の可視テキストブロックを抽出（${hiddenCount}個の非表示、${excludedCount}個の除外要素をスキップ）`);
    return blocks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 要素の直接のテキストコンテンツを取得（子要素のテキストを除く）
   */
  private getDirectTextContent(element: HTMLElement): string {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      }
    }
    return text.trim();
  }

  /**
   * 表示領域内のブロックを翻訳（バッチ処理）
   */
  private async translateVisibleBlocks(blocks: TextBlock[]): Promise<void> {
    const visibleBlocks = this.getVisibleBlocks(blocks).filter(block => !block.isTranslated);
    console.log(`[FullPageTranslator] ${visibleBlocks.length}個の表示ブロックを翻訳`);

    if (visibleBlocks.length === 0) {
      return;
    }

    this.updateProgress(15, `表示中のテキストをバッチ翻訳中...`);
    await this.translateBlocksBatch(visibleBlocks);
    
    const progress = Math.min(60, 15 + (visibleBlocks.length / blocks.length) * 45);
    this.updateProgress(progress, `表示中のテキスト翻訳完了 (${visibleBlocks.length}個)`);
  }

  /**
   * 残りのブロックを翻訳（バッチ処理）
   */
  private async translateRemainingBlocks(blocks: TextBlock[]): Promise<void> {
    const remainingBlocks = blocks.filter((block) => !block.isTranslated);
    console.log(`[FullPageTranslator] ${remainingBlocks.length}個の残りブロックを翻訳`);

    if (remainingBlocks.length === 0) {
      return;
    }

    // 大きなバッチサイズで処理（Claude APIのトークン制限を考慮）
    const maxTokensPerBatch = 15000; // 最大限大きなバッチサイズ
    const batches = this.createBatches(remainingBlocks, maxTokensPerBatch);
    
    let completedBatches = 0;
    
    for (const batch of batches) {
      this.updateProgress(
        60 + (completedBatches / batches.length) * 39, 
        `残りのテキストをバッチ翻訳中... (${completedBatches + 1}/${batches.length})`
      );
      
      await this.translateBlocksBatch(batch);
      completedBatches++;
      
      // API制限を避けるための最小限の遅延
      if (completedBatches < batches.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * バッチでブロックを翻訳
   */
  private async translateBlocksBatch(blocks: TextBlock[]): Promise<void> {
    if (blocks.length === 0) return;

    try {
      // 翻訳するテキストを収集
      const textsToTranslate = blocks.map(block => block.originalText);
      
      // バッチ翻訳を実行
      const translatedTexts = await this.translateTextsBatch(textsToTranslate);
      
      // 結果を各ブロックに適用
      blocks.forEach((block, index) => {
        const translatedText = translatedTexts[index] || block.originalText;
        this.applyTranslationToBlock(block, translatedText);
      });

    } catch (error) {
      console.error("[FullPageTranslator] バッチ翻訳エラー:", error);
      // エラー時は個別翻訳にフォールバック
      for (const block of blocks) {
        await this.translateBlock(block);
      }
    }
  }

  /**
   * 個別ブロックの翻訳（フォールバック用）
   */
  private async translateBlock(block: TextBlock): Promise<void> {
    try {
      const translatedText = await this.translateText(block.originalText);
      this.applyTranslationToBlock(block, translatedText);
    } catch (error) {
      console.error("[FullPageTranslator] ブロック翻訳エラー:", error);
    }
  }

  /**
   * 翻訳結果をブロックに適用（DeepL風の属性管理付き）
   */
  private applyTranslationToBlock(block: TextBlock, translatedText: string): void {
    // UIDの生成と割り当て
    if (!block.uid) {
      block.uid = `dl-${++this.uidCounter}-${Date.now()}`;
    }

    // 原文を保存
    this.translationState.originalElements.set(block.element, block.originalText);
    
    // スタイル情報をキャッシュ
    const computedStyle = window.getComputedStyle(block.element);
    this.translationState.styleCache.set(block.uid, computedStyle);

    // DeepL風の属性を設定
    this.markElementWithDeepLAttributes(block.element, {
      uid: block.uid,
      original: false,
      translated: true,
      sourceLang: this.detectLanguage(block.originalText),
      targetLang: this.targetLang,
      originalText: this.encodeBase64(block.originalText),
      processing: false,
      error: false
    });

    // 翻訳文の要素を作成（より高度なスタイル保持）
    const translatedElement = this.createTranslatedElement(block, translatedText, computedStyle);
    
    // レイアウト崩れを防ぐための調整
    this.adjustLayoutForTranslation(block.element, translatedElement, computedStyle);
    
    // 初期状態では翻訳文を表示し、原文を非表示にする
    translatedElement.style.display = computedStyle.display;
    block.element.style.display = 'none';
    block.element.setAttribute('data-original-display', computedStyle.display);

    // 翻訳文を元の要素の直後に挿入
    block.element.parentNode?.insertBefore(translatedElement, block.element.nextSibling);

    // 翻訳状態を保存
    this.translationState.translatedElements.set(block.element, translatedText);
    this.translationState.elementCache.set(block.uid, block);
    block.isTranslated = true;
    
    // 翻訳キャッシュに保存
    this.translationState.translationCache.set(block.originalText, translatedText);
  }

  /**
   * DeepL風の属性を要素に設定
   */
  private markElementWithDeepLAttributes(element: HTMLElement, attributes: {
    uid: string;
    original: boolean;
    translated: boolean;
    sourceLang: string;
    targetLang: string;
    originalText: string;
    processing: boolean;
    error: boolean;
  }): void {
    element.setAttribute('data-dl-uid', attributes.uid);
    element.setAttribute('data-dl-original', attributes.original.toString());
    element.setAttribute('data-dl-translated', attributes.translated.toString());
    element.setAttribute('data-dl-source-lang', attributes.sourceLang);
    element.setAttribute('data-dl-target-lang', attributes.targetLang);
    element.setAttribute('data-dl-original-text', attributes.originalText);
    element.setAttribute('data-dl-processing', attributes.processing.toString());
    element.setAttribute('data-dl-error', attributes.error.toString());
  }

  /**
   * 翻訳済み要素の作成（高度なスタイル保持）
   */
  private createTranslatedElement(block: TextBlock, translatedText: string, computedStyle: CSSStyleDeclaration): HTMLElement {
    const translatedElement = document.createElement(block.element.tagName.toLowerCase());
    
    // 元のクラスを継承し、翻訳済みクラスを追加
    translatedElement.className = block.element.className;
    translatedElement.classList.add('dl-translated-text');
    
    // DeepL風の属性を設定
    this.markElementWithDeepLAttributes(translatedElement, {
      uid: `${block.uid}-translated`,
      original: false,
      translated: true,
      sourceLang: this.detectLanguage(block.originalText),
      targetLang: this.targetLang,
      originalText: this.encodeBase64(block.originalText),
      processing: false,
      error: false
    });
    
    // 全ての重要なスタイルを継承
    const importantStyles = [
      // テキスト関連
      'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
      'line-height', 'letter-spacing', 'word-spacing', 'text-align', 'text-indent',
      'text-decoration', 'text-transform', 'white-space', 'word-break', 'word-wrap',
      // 色関連
      'color', 'background-color', 'opacity',
      // レイアウト関連
      'display', 'position', 'float', 'clear',
      'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
      'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'border', 'border-radius',
      // フレックスボックス/グリッド
      'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
      'grid-template-columns', 'grid-template-rows', 'grid-gap',
      // その他
      'overflow', 'z-index', 'box-sizing'
    ];
    
    importantStyles.forEach(prop => {
      const value = computedStyle.getPropertyValue(prop);
      if (value && value !== 'auto' && value !== 'normal') {
        (translatedElement.style as any)[prop] = value;
      }
    });

    // インライン要素の構造を保持して翻訳テキストを設定
    this.applyTranslatedTextWithStructure(block.element, translatedElement, translatedText);
    
    return translatedElement;
  }

  /**
   * インライン要素の構造を保持して翻訳テキストを適用
   */
  private applyTranslatedTextWithStructure(originalElement: HTMLElement, translatedElement: HTMLElement, translatedText: string): void {
    // シンプルなテキストノードのみの場合
    if (originalElement.childNodes.length === 1 && originalElement.childNodes[0].nodeType === Node.TEXT_NODE) {
      translatedElement.textContent = translatedText;
      return;
    }

    // 複雑な構造を持つ場合（リンク、強調など）
    const hasInlineElements = Array.from(originalElement.childNodes).some(
      node => node.nodeType === Node.ELEMENT_NODE && 
             ['A', 'STRONG', 'EM', 'B', 'I', 'SPAN', 'CODE', 'MARK'].includes((node as Element).tagName)
    );

    if (hasInlineElements) {
      // 元の構造をコピーして、テキストノードのみ置換
      translatedElement.innerHTML = originalElement.innerHTML;
      const textNodes = this.getTextNodes(translatedElement);
      
      // 翻訳テキストを適切に分割して適用（簡略版）
      if (textNodes.length > 0) {
        textNodes[0].textContent = translatedText;
        for (let i = 1; i < textNodes.length; i++) {
          textNodes[i].textContent = '';
        }
      }
    } else {
      translatedElement.textContent = translatedText;
    }
  }

  /**
   * テキストノードを取得
   */
  private getTextNodes(element: HTMLElement): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node as Text);
    }
    
    return textNodes;
  }

  /**
   * レイアウト崩れを防ぐための調整
   */
  private adjustLayoutForTranslation(originalElement: HTMLElement, translatedElement: HTMLElement, computedStyle: CSSStyleDeclaration): void {
    // 文字数の差を計算
    const originalLength = originalElement.textContent?.length || 0;
    const translatedLength = translatedElement.textContent?.length || 0;
    const lengthRatio = translatedLength / originalLength;

    // 大幅に文字数が増えた場合の処理
    if (lengthRatio > 1.5) {
      // フォントサイズを微調整（最大10%まで）
      const fontSize = parseFloat(computedStyle.fontSize);
      if (fontSize > 12) { // 12px以上の場合のみ調整
        const adjustedSize = Math.max(fontSize * 0.9, 12);
        translatedElement.style.fontSize = `${adjustedSize}px`;
      }

      // 行の高さも調整
      const lineHeight = computedStyle.lineHeight;
      if (lineHeight !== 'normal') {
        const lineHeightValue = parseFloat(lineHeight);
        if (!isNaN(lineHeightValue)) {
          translatedElement.style.lineHeight = `${lineHeightValue * 0.95}`;
        }
      }
    }

    // 固定幅要素の場合の処理
    if (computedStyle.width !== 'auto' && !computedStyle.width.includes('%')) {
      translatedElement.style.overflow = 'hidden';
      translatedElement.style.textOverflow = 'ellipsis';
      translatedElement.style.whiteSpace = 'nowrap';
      
      // ツールチップで全文を表示
      if (lengthRatio > 1.2) {
        translatedElement.title = translatedElement.textContent || '';
      }
    }
  }

  /**
   * Base64エンコード
   */
  private encodeBase64(text: string): string {
    try {
      return btoa(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (match, p1) => {
        return String.fromCharCode(parseInt(p1, 16));
      }));
    } catch (e) {
      return '';
    }
  }

  /**
   * 言語検出
   */
  private detectLanguage(text: string): string {
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);
    
    if (hasJapanese && !hasEnglish) return 'ja';
    if (hasEnglish && !hasJapanese) return 'en';
    if (hasJapanese && hasEnglish) {
      // 日本語の文字数が多い場合は日本語と判定
      const japaneseCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g) || []).length;
      const englishCount = (text.match(/[a-zA-Z]/g) || []).length;
      return japaneseCount > englishCount ? 'ja' : 'en';
    }
    
    return 'auto';
  }

  /**
   * 表示領域内のブロックを取得（スクロール位置を考慮）
   */
  private getVisibleBlocks(blocks: TextBlock[]): TextBlock[] {
    const viewportTop = window.scrollY;
    const viewportBottom = window.scrollY + window.innerHeight;
    const margin = 100; // ビューポートの少し外側も含める

    return blocks.filter((block) => {
      const rect = block.element.getBoundingClientRect();
      const elementTop = rect.top + window.scrollY;
      const elementBottom = rect.bottom + window.scrollY;
      
      // ビューポート内または近くにある要素
      return elementBottom >= (viewportTop - margin) && 
             elementTop <= (viewportBottom + margin);
    });
  }

  /**
   * 要素の翻訳可否を判定（より厳密な可視性チェック）
   */
  private shouldTranslateElement(element: HTMLElement): boolean {
    // article内のheaderは翻訳対象
    const isHeaderInArticle = element.tagName === 'HEADER' && 
      element.closest('article, main, [role="main"], [role="article"]');
    
    // 除外タグのチェック（article内のheaderは例外）
    if (!isHeaderInArticle && this.excludedTags.has(element.tagName)) {
      return false;
    }

    // 除外セレクタのチェック
    for (const selector of this.excludedSelectors) {
      if (element.matches(selector)) {
        return false;
      }
    }

    // より厳密な可視性チェック
    if (!this.isElementVisible(element)) {
      return false;
    }

    // 空のテキストコンテンツはスキップ
    const text = element.textContent?.trim() || '';
    if (text.length < 2) {
      return false;
    }

    // aria-label="advertisement"などの広告要素を除外
    if (element.getAttribute('aria-label')?.toLowerCase().includes('advertis')) {
      return false;
    }

    return true;
  }

  /**
   * 要素が実際に表示されているかチェック
   */
  private isElementVisible(element: HTMLElement): boolean {
    // getBoundingClientRectで実際の表示領域をチェック
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // computedStyleで詳細なチェック
    const style = window.getComputedStyle(element);
    
    // 基本的な非表示チェック
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0') {
      return false;
    }

    // position: fixedやabsoluteで画面外にある要素
    if (rect.bottom < 0 || rect.top > window.innerHeight ||
        rect.right < 0 || rect.left > window.innerWidth) {
      return false;
    }

    // 親要素も再帰的にチェック
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || 
          parentStyle.visibility === 'hidden') {
        return false;
      }
      parent = parent.parentElement;
    }

    return true;
  }

  /**
   * 要素の優先度を計算（セマンティックHTMLを考慮）
   */
  private calculatePriority(element: HTMLElement): number {
    let priority = 0;

    // メインコンテンツ内の要素は高優先度
    for (const selector of this.contentSelectors) {
      if (element.closest(selector)) {
        priority += 200;
        break;
      }
    }

    // 見出しタグの優先度（H1が最高）
    if (element.tagName.match(/^H[1-6]$/)) {
      const level = parseInt(element.tagName[1]);
      priority += 150 - (level * 10);
      
      // article内の見出しはさらに高優先度
      if (element.closest('article, main')) {
        priority += 50;
      }
    }

    // 段落タグの優先度
    if (element.tagName === "P") {
      priority += 50;
      
      // 文字数が多い段落は高優先度
      const textLength = element.textContent?.length || 0;
      if (textLength > 100) {
        priority += 20;
      }
    }

    // リストアイテムの優先度
    if (element.tagName === "LI") {
      priority += 30;
      
      // article内のリストは高優先度
      if (element.closest('article, main')) {
        priority += 20;
      }
    }

    // テーブルセルの優先度
    if (element.tagName === "TD" || element.tagName === "TH") {
      priority += 20;
    }

    // time要素（日付）の優先度
    if (element.tagName === "TIME") {
      priority += 40;
    }

    // 著者情報の優先度
    if (element.matches('[rel="author"], .author, .byline, [class*="author"]')) {
      priority += 60;
    }

    return priority;
  }

  /**
   * バッチでテキストを翻訳（キャッシュ機能付き）
   */
  private async translateTextsBatch(texts: string[]): Promise<string[]> {
    try {
      // キャッシュから翻訳を取得
      const results: string[] = [];
      const textsToTranslate: string[] = [];
      const indexMap: number[] = [];
      
      texts.forEach((text, index) => {
        const cached = this.translationState.translationCache.get(text);
        if (cached) {
          results[index] = cached;
        } else {
          textsToTranslate.push(text);
          indexMap.push(index);
        }
      });
      
      // 全てキャッシュにある場合は即座に返す
      if (textsToTranslate.length === 0) {
        console.log(`[FullPageTranslator] 全て（${texts.length}個）キャッシュから取得`);
        return results;
      }
      
      console.log(`[FullPageTranslator] ${textsToTranslate.length}個を翻訳、${results.filter(r => r).length}個はキャッシュから取得`);
      
      // Chrome Extension API経由でバッチ翻訳を実行
      const translatedTexts = await new Promise<string[]>((resolve, reject) => {
        const request = {
          action: 'translate',
          prompt: this.buildBatchTranslationPrompt(textsToTranslate)
        };

        chrome.runtime.sendMessage(request, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || '翻訳に失敗しました'));
          } else if (!response) {
            reject(new Error('拡張機能との通信に失敗しました'));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            const result = this.parseBatchTranslationResponse(response.translatedText, textsToTranslate.length);
            resolve(result);
          }
        });
      });
      
      // 結果をマージしてキャッシュに保存
      translatedTexts.forEach((translatedText, i) => {
        const originalIndex = indexMap[i];
        const originalText = texts[originalIndex];
        results[originalIndex] = translatedText;
        
        // キャッシュに保存
        if (translatedText && translatedText !== originalText) {
          this.translationState.translationCache.set(originalText, translatedText);
        }
      });
      
      return results;
    } catch (error) {
      console.error('[FullPageTranslator] バッチ翻訳エラー:', error);
      return texts; // エラー時は原文を返す
    }
  }

  /**
   * 個別テキストの翻訳（フォールバック用）
   */
  private async translateText(text: string): Promise<string> {
    try {
      // Chrome Extension API経由で翻訳を実行
      return new Promise((resolve, reject) => {
        const request = {
          action: 'translate',
          prompt: this.buildTranslationPrompt(text)
        };

        chrome.runtime.sendMessage(request, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message || '翻訳に失敗しました'));
          } else if (!response) {
            reject(new Error('拡張機能との通信に失敗しました'));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.translatedText || text);
          }
        });
      });
    } catch (error) {
      console.error('[FullPageTranslator] 翻訳エラー:', error);
      return text; // エラー時は原文を返す
    }
  }

  /**
   * バッチ翻訳プロンプトの構築
   */
  private buildBatchTranslationPrompt(texts: string[]): string {
    // 最初のテキストで言語検出を行う
    const sampleText = texts.join(' ');
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(sampleText);
    const hasEnglish = /[a-zA-Z]/.test(sampleText);
    
    let sourceLang = 'auto';
    let targetLang = 'ja';
    
    if (hasJapanese && !hasEnglish) {
      sourceLang = 'ja';
      targetLang = 'en';
    } else if (hasEnglish && !hasJapanese) {
      sourceLang = 'en';
      targetLang = 'ja';
    }

    const numberedTexts = texts.map((text, i) => `[${i + 1}] ${text}`).join('\n\n');

    return `You are a professional Japanese-English translator. Translate the following numbered texts while preserving their meaning, tone, and formatting.

Source language: ${sourceLang === 'auto' ? 'Detect automatically' : sourceLang}
Target language: ${targetLang}

Rules:
- Maintain natural fluency in the target language
- Preserve formatting (line breaks, spacing)
- For technical terms, keep original if commonly used as-is
- Return ONLY the translations with their corresponding numbers
- Each translation should be on a new line with format: [number] translated text

Texts to translate:
${numberedTexts}`;
  }

  /**
   * 個別翻訳プロンプトの構築
   */
  private buildTranslationPrompt(text: string): string {
    // 言語検出を行う
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
    const hasEnglish = /[a-zA-Z]/.test(text);
    
    let sourceLang = 'auto';
    let targetLang = 'ja';
    
    if (hasJapanese && !hasEnglish) {
      sourceLang = 'ja';
      targetLang = 'en';
    } else if (hasEnglish && !hasJapanese) {
      sourceLang = 'en';
      targetLang = 'ja';
    }

    return `You are a professional Japanese-English translator. Translate the following text while preserving its meaning, tone, and formatting.

Source language: ${sourceLang === 'auto' ? 'Detect automatically' : sourceLang}
Target language: ${targetLang}

Rules:
- Maintain natural fluency in the target language
- Preserve formatting (line breaks, spacing)
- For technical terms, keep original if commonly used as-is
- Return ONLY the translation without explanations

Text to translate:
${text}`;
  }

  /**
   * バッチ翻訳結果のパース
   */
  private parseBatchTranslationResponse(response: string, expectedCount: number): string[] {
    const lines = response.split('\n')
      .filter(line => line.trim().match(/^\[\d+\]/))
      .map(line => line.replace(/^\[\d+\]\s*/, ''));

    // 期待する数と一致しない場合は、可能な限り補完
    if (lines.length !== expectedCount) {
      console.warn(`[FullPageTranslator] バッチ翻訳の結果数が一致しません。期待: ${expectedCount}, 実際: ${lines.length}`);
      
      // 不足分を空文字で補完
      while (lines.length < expectedCount) {
        lines.push('');
      }
      
      // 余分な部分を削除
      if (lines.length > expectedCount) {
        lines.splice(expectedCount);
      }
    }

    return lines;
  }

  /**
   * バッチの作成（トークン制限を考慮、最適化版）
   */
  private createBatches(blocks: TextBlock[], maxTokensPerBatch: number): TextBlock[][] {
    const batches: TextBlock[][] = [];
    let currentBatch: TextBlock[] = [];
    let currentTokenCount = 0;
    let currentCharCount = 0;
    const maxCharsPerBatch = 50000; // 文字数制限も追加

    for (const block of blocks) {
      const estimatedTokens = this.estimateTokens(block.originalText);
      const charCount = block.originalText.length;
      
      // トークン数または文字数のいずれかが制限を超える場合
      if ((currentTokenCount + estimatedTokens > maxTokensPerBatch || 
           currentCharCount + charCount > maxCharsPerBatch) && 
          currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [block];
        currentTokenCount = estimatedTokens;
        currentCharCount = charCount;
      } else {
        currentBatch.push(block);
        currentTokenCount += estimatedTokens;
        currentCharCount += charCount;
      }
      
      // バッチあたりの最大要素数も制限（100個）
      if (currentBatch.length >= 100) {
        batches.push(currentBatch);
        currentBatch = [];
        currentTokenCount = 0;
        currentCharCount = 0;
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    console.log(`[FullPageTranslator] ${blocks.length}個のブロックを${batches.length}個のバッチに分割`);
    return batches;
  }

  /**
   * トークン数の推定
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * 翻訳の切り替え（Google翻訳スタイル）
   */
  toggleTranslation(): void {
    console.log(`[FullPageTranslator] 翻訳切り替え: ${this.translationState.isTranslated ? '原文' : '翻訳'} に切り替え`);
    
    this.translationState.originalElements.forEach((_, element) => {
      const translatedElement = element.nextElementSibling as HTMLElement;
      if (translatedElement?.classList.contains("translated-text")) {
        const originalDisplay = element.getAttribute('data-original-display') || 'block';
        
        if (this.translationState.isTranslated) {
          // 翻訳文→原文に切り替え
          element.style.display = originalDisplay;
          translatedElement.style.display = "none";
        } else {
          // 原文→翻訳文に切り替え
          element.style.display = "none";
          translatedElement.style.display = originalDisplay;
        }
      }
    });

    this.translationState.isTranslated = !this.translationState.isTranslated;
  }

  /**
   * MutationObserverの設定（最適化版）
   */
  private setupMutationObserver(): void {
    let debounceTimer: number | null = null;
    let pendingMutations = new Set<HTMLElement>();
    
    this.mutationObserver = new MutationObserver((mutations) => {
      if (!this.translationState.isTranslated || this.isTranslating) return;

      mutations.forEach((mutation) => {
        // 翻訳済み要素の変更は無視
        const target = mutation.target as HTMLElement;
        if (target.classList?.contains('dl-translated-text') || 
            target.hasAttribute('data-dl-uid')) {
          return;
        }
        
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              // 翻訳済み要素でない場合のみ処理
              if (!element.classList.contains('dl-translated-text') && 
                  !element.hasAttribute('data-dl-uid') &&
                  this.shouldTranslateElement(element)) {
                
                // コンテンツ領域内の変更のみを追跡
                const isInContentArea = this.contentSelectors.some(selector => 
                  element.closest(selector) !== null
                );
                
                if (isInContentArea) {
                  pendingMutations.add(element);
                }
              }
            }
          });
          
          // 削除されたノードもチェック
          mutation.removedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as HTMLElement;
              if (element.hasAttribute('data-dl-uid')) {
                // 翻訳済み要素が削除された場合のクリーンアップ
                const uid = element.getAttribute('data-dl-uid');
                if (uid) {
                  this.translationState.elementCache.delete(uid);
                  this.translationState.styleCache.delete(uid);
                }
              }
            }
          });
        } else if (mutation.type === "characterData") {
          // テキストノードの変更も検知
          const parentElement = mutation.target.parentElement;
          if (parentElement && 
              !parentElement.classList.contains('dl-translated-text') &&
              !parentElement.hasAttribute('data-dl-uid') &&
              this.shouldTranslateElement(parentElement)) {
            pendingMutations.add(parentElement);
          }
        }
      });

      if (pendingMutations.size > 0) {
        // デバウンスを使用して連続した変更をまとめて処理
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        
        debounceTimer = window.setTimeout(() => {
          const elementsToTranslate = Array.from(pendingMutations);
          pendingMutations.clear();
          this.translateNewElements(elementsToTranslate);
          debounceTimer = null;
        }, 300); // 300ms待ってから新規コンテンツを翻訳
      }
    });

    // 監視オプションを最適化
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: false, // 古い値は不要
      attributes: false, // 属性変更は監視しない
    });
  }

  /**
   * 新規要素の翻訳（指定された要素のみ）
   */
  private async translateNewElements(elements: HTMLElement[]): Promise<void> {
    if (this.isTranslating || !this.translationState.isTranslated || elements.length === 0) return;

    // 翻訳対象のテキストブロックを抽出
    const newBlocks: TextBlock[] = [];
    
    elements.forEach(element => {
      // すでに翻訳済みの要素はスキップ
      if (this.translationState.originalElements.has(element) || 
          element.hasAttribute('data-dl-uid')) {
        return;
      }
      
      // 要素内のテキストブロックを収集
      const blockElements = element.querySelectorAll(
        "p, h1, h2, h3, h4, h5, h6, li, td, th, div, span, a, label, time, address, blockquote, figcaption"
      );
      
      // 要素自体もチェック
      if (this.shouldTranslateElement(element)) {
        const text = this.getDirectTextContent(element);
        if (text.length > 1) {
          newBlocks.push({
            element: element,
            originalText: text,
            isTranslated: false,
            priority: this.calculatePriority(element),
          });
        }
      }
      
      // 子要素もチェック
      blockElements.forEach(blockElement => {
        const htmlElement = blockElement as HTMLElement;
        if (this.shouldTranslateElement(htmlElement) && 
            !this.translationState.originalElements.has(htmlElement)) {
          const text = this.getDirectTextContent(htmlElement);
          if (text.length > 1) {
            newBlocks.push({
              element: htmlElement,
              originalText: text,
              isTranslated: false,
              priority: this.calculatePriority(htmlElement),
            });
          }
        }
      });
    });

    if (newBlocks.length > 0) {
      console.log(`[FullPageTranslator] ${newBlocks.length}個の新しいブロックを翻訳`);
      
      // 翻訳中フラグを立てる
      this.isTranslating = true;
      
      try {
        // 優先度の高い順にソート
        newBlocks.sort((a, b) => b.priority - a.priority);
        
        // 新しいコンテンツをバッチ翻訳
        const visibleNewBlocks = this.getVisibleBlocks(newBlocks);
        if (visibleNewBlocks.length > 0) {
          await this.translateBlocksBatch(visibleNewBlocks);
        }
        
        // 残りのブロックも翻訳（バックグラウンドで）
        const remainingNewBlocks = newBlocks.filter(block => !block.isTranslated);
        if (remainingNewBlocks.length > 0) {
          // バックグラウンドで非同期に翻訳
          setTimeout(async () => {
            const batches = this.createBatches(remainingNewBlocks, 15000);
            for (const batch of batches) {
              if (this.translationState.isTranslated) { // 翻訳状態が維持されている場合のみ
                await this.translateBlocksBatch(batch);
                await new Promise(resolve => setTimeout(resolve, 100)); // APIレート制限対策
              }
            }
          }, 100);
        }
      } finally {
        this.isTranslating = false;
      }
    }
  }

  /**
   * 新規コンテンツの翻訳（従来のメソッド、互換性のために残す）
   */
  private async translateNewContent(): Promise<void> {
    const newBlocks = this.extractTextBlocks().filter(
      (block) => !this.translationState.originalElements.has(block.element)
    );
    
    if (newBlocks.length > 0) {
      const elements = newBlocks.map(block => block.element);
      await this.translateNewElements(elements);
    }
  }

  /**
   * 進捗状況の更新
   */
  private updateProgress(progress: number, status: string): void {
    if (this.progressCallback) {
      this.progressCallback(Math.round(progress), status);
    }
  }

  /**
   * 翻訳状態のリセット
   */
  reset(): void {
    console.log("[FullPageTranslator] 翻訳状態をリセット");
    
    this.translationState.originalElements.forEach((_, element) => {
      const translatedElement = element.nextElementSibling;
      if (translatedElement?.classList.contains("translated-text")) {
        translatedElement.remove();
      }
      
      // 元の表示状態に戻す
      const originalDisplay = element.getAttribute('data-original-display') || 'block';
      element.style.display = originalDisplay;
      element.removeAttribute('data-original-display');
    });

    this.translationState.originalElements.clear();
    this.translationState.translatedElements.clear();
    this.translationState.isTranslated = false;
    this.isTranslating = false;
  }
}

// 使用例:
// const translator = new FullPageTranslator();
// translator.translatePage(); // ページ全体を翻訳
// translator.toggleTranslation(); // 原文/翻訳文の切り替え
// translator.reset(); // 翻訳をリセット
