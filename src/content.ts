import { ClaudeTranslator } from './utils/translator';
import { LanguageDetector } from './utils/language-detector';
import { DOMParser, TranslatableNode } from './utils/dom-parser';

class ContentScript {
  private translator: ClaudeTranslator | null = null;
  private languageDetector: LanguageDetector;
  private domParser: DOMParser;
  private floatingButton: HTMLElement | null = null;
  private translationPopup: HTMLElement | null = null;
  private selectedText: string = '';
  private fullPageTranslator: FullPageTranslator | null = null;

  constructor() {
    this.languageDetector = new LanguageDetector();
    this.domParser = new DOMParser();
    this.init();
  }

  private async init() {
    const apiKey = await this.getApiKey();
    if (apiKey) {
      this.translator = new ClaudeTranslator(apiKey);
    }

    this.createFloatingButton();
    this.createTranslationPopup();
    this.setupEventListeners();
    this.setupMessageListener();
  }

  private async getApiKey(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiKey'], (result) => {
        resolve(result.apiKey || null);
      });
    });
  }

  private createFloatingButton() {
    this.floatingButton = document.createElement('div');
    this.floatingButton.id = 'claude-translator-button';
    this.floatingButton.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
        <path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
      </svg>
    `;
    this.floatingButton.style.cssText = `
      position: absolute;
      display: none;
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      cursor: pointer;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    `;
    
    document.body.appendChild(this.floatingButton);

    this.floatingButton.addEventListener('mouseenter', () => {
      this.floatingButton!.style.transform = 'scale(1.1)';
    });

    this.floatingButton.addEventListener('mouseleave', () => {
      this.floatingButton!.style.transform = 'scale(1)';
    });
  }

  private createTranslationPopup() {
    this.translationPopup = document.createElement('div');
    this.translationPopup.id = 'claude-translator-popup';
    this.translationPopup.innerHTML = `
      <div class="translator-header">
        <h3>Claude翻訳</h3>
        <button class="close-btn">✕</button>
      </div>
      <div class="language-selector">
        <span class="lang-label" id="source-lang">日本語</span>
        <button class="swap-btn">⇄</button>
        <span class="lang-label" id="target-lang">English</span>
      </div>
      <div class="translation-content">
        <div class="source-text"></div>
        <div class="loading-spinner" style="display: none;">
          <div class="spinner"></div>
        </div>
        <div class="translated-text"></div>
      </div>
      <div class="actions">
        <button class="copy-btn">コピー</button>
      </div>
    `;
    
    document.body.appendChild(this.translationPopup);
    this.setupPopupDragging();
  }

  private setupPopupDragging() {
    const header = this.translationPopup!.querySelector('.translator-header') as HTMLElement;
    let isDragging = false;
    let currentX: number;
    let currentY: number;
    let initialX: number;
    let initialY: number;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      initialX = e.clientX - this.translationPopup!.offsetLeft;
      initialY = e.clientY - this.translationPopup!.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      this.translationPopup!.style.left = currentX + 'px';
      this.translationPopup!.style.top = currentY + 'px';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  private setupEventListeners() {
    document.addEventListener('mouseup', () => {
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        
        if (text && text.length > 0) {
          this.selectedText = text;
          this.showFloatingButton(selection!);
        } else {
          this.hideFloatingButton();
        }
      }, 10);
    });

    this.floatingButton!.addEventListener('click', async () => {
      this.hideFloatingButton();
      await this.translateSelection();
    });

    const closeBtn = this.translationPopup!.querySelector('.close-btn');
    closeBtn?.addEventListener('click', () => {
      this.hideTranslationPopup();
    });

    const swapBtn = this.translationPopup!.querySelector('.swap-btn');
    swapBtn?.addEventListener('click', async () => {
      this.swapLanguages();
      if (this.selectedText) {
        await this.translateSelection();
      }
    });

    const copyBtn = this.translationPopup!.querySelector('.copy-btn');
    copyBtn?.addEventListener('click', () => {
      const translatedText = this.translationPopup!.querySelector('.translated-text')?.textContent;
      if (translatedText) {
        navigator.clipboard.writeText(translatedText);
        (copyBtn as HTMLButtonElement).textContent = 'コピーしました！';
        setTimeout(() => {
          (copyBtn as HTMLButtonElement).textContent = 'コピー';
        }, 2000);
      }
    });

    document.addEventListener('click', (e) => {
      if (!this.translationPopup?.contains(e.target as Node) && 
          !this.floatingButton?.contains(e.target as Node)) {
        this.hideTranslationPopup();
        this.hideFloatingButton();
      }
    });
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'translateSelection') {
        this.translateSelection();
      } else if (request.action === 'translatePage') {
        this.translateFullPage();
      } else if (request.action === 'updateApiKey') {
        this.translator = new ClaudeTranslator(request.apiKey);
      }
    });
  }

  private showFloatingButton(selection: Selection) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    this.floatingButton!.style.display = 'flex';
    this.floatingButton!.style.left = `${rect.left + rect.width / 2 - 18}px`;
    this.floatingButton!.style.top = `${rect.bottom + window.scrollY + 5}px`;
  }

  private hideFloatingButton() {
    if (this.floatingButton) {
      this.floatingButton.style.display = 'none';
    }
  }

  private async translateSelection() {
    if (!this.translator) {
      alert('APIキーが設定されていません。拡張機能の設定からAPIキーを入力してください。');
      return;
    }

    this.showTranslationPopup();
    const sourceText = this.translationPopup!.querySelector('.source-text') as HTMLElement;
    const translatedText = this.translationPopup!.querySelector('.translated-text') as HTMLElement;
    const loadingSpinner = this.translationPopup!.querySelector('.loading-spinner') as HTMLElement;

    sourceText.textContent = this.selectedText;
    translatedText.textContent = '';
    loadingSpinner.style.display = 'block';

    try {
      const detectedLang = this.languageDetector.detect(this.selectedText);
      const targetLang = this.languageDetector.getTargetLanguage(this.selectedText);
      
      this.updateLanguageLabels(detectedLang === 'ja' ? 'ja' : 'en', targetLang);

      const result = await this.translator.translate({
        text: this.selectedText,
        sourceLang: 'auto',
        targetLang: targetLang
      });

      translatedText.textContent = result.translatedText;
    } catch (error) {
      translatedText.textContent = 'エラー: 翻訳に失敗しました';
      console.error('Translation error:', error);
    } finally {
      loadingSpinner.style.display = 'none';
    }
  }

  private showTranslationPopup() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.translationPopup!.style.display = 'block';
    this.translationPopup!.style.left = `${rect.left}px`;
    this.translationPopup!.style.top = `${rect.bottom + window.scrollY + 10}px`;

    const popupRect = this.translationPopup!.getBoundingClientRect();
    if (popupRect.right > window.innerWidth) {
      this.translationPopup!.style.left = `${window.innerWidth - popupRect.width - 10}px`;
    }
    if (popupRect.bottom > window.innerHeight) {
      this.translationPopup!.style.top = `${rect.top + window.scrollY - popupRect.height - 10}px`;
    }
  }

  private hideTranslationPopup() {
    if (this.translationPopup) {
      this.translationPopup.style.display = 'none';
    }
  }

  private updateLanguageLabels(sourceLang: 'ja' | 'en', targetLang: 'ja' | 'en') {
    const sourceLangLabel = this.translationPopup!.querySelector('#source-lang') as HTMLElement;
    const targetLangLabel = this.translationPopup!.querySelector('#target-lang') as HTMLElement;

    sourceLangLabel.textContent = sourceLang === 'ja' ? '日本語' : 'English';
    targetLangLabel.textContent = targetLang === 'ja' ? '日本語' : 'English';
  }

  private swapLanguages() {
    const sourceLangLabel = this.translationPopup!.querySelector('#source-lang') as HTMLElement;
    const targetLangLabel = this.translationPopup!.querySelector('#target-lang') as HTMLElement;
    
    const temp = sourceLangLabel.textContent;
    sourceLangLabel.textContent = targetLangLabel.textContent;
    targetLangLabel.textContent = temp;
  }

  private async translateFullPage() {
    if (!this.translator) {
      alert('APIキーが設定されていません。拡張機能の設定からAPIキーを入力してください。');
      return;
    }

    if (!this.fullPageTranslator) {
      this.fullPageTranslator = new FullPageTranslator(this.translator, this.domParser);
    }

    await this.fullPageTranslator.translatePage();
  }
}

class FullPageTranslator {
  private translator: ClaudeTranslator;
  private domParser: DOMParser;
  private translationBar: HTMLElement | null = null;
  private isTranslating: boolean = false;
  private translatedNodes: Map<HTMLElement, string> = new Map();
  private abortController: AbortController | null = null;

  constructor(translator: ClaudeTranslator, domParser: DOMParser) {
    this.translator = translator;
    this.domParser = domParser;
  }

  async translatePage() {
    if (this.isTranslating) {
      this.cancelTranslation();
      return;
    }

    this.showTranslationBar();
    this.isTranslating = true;
    this.abortController = new AbortController();

    const nodes = this.domParser.extractTranslatableNodes();
    const totalCount = nodes.length;
    let translatedCount = 0;

    this.updateProgress(0, totalCount);

    const visibleNodes = nodes.filter(node => this.isInViewport(node.element));
    const otherNodes = nodes.filter(node => !this.isInViewport(node.element));

    try {
      await this.translateNodes(visibleNodes, (count) => {
        translatedCount += count;
        this.updateProgress(translatedCount, totalCount);
      });

      if (!this.abortController.signal.aborted) {
        await this.translateNodes(otherNodes, (count) => {
          translatedCount += count;
          this.updateProgress(translatedCount, totalCount);
        });
      }
    } catch (error) {
      if (error !== 'aborted') {
        console.error('Translation error:', error);
      }
    }

    if (this.abortController.signal.aborted) {
      this.hideTranslationBar();
    } else {
      this.showCompleteStatus();
    }

    this.isTranslating = false;
  }

  private async translateNodes(nodes: TranslatableNode[], onProgress: (count: number) => void) {
    const batchSize = 10;
    
    for (let i = 0; i < nodes.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw 'aborted';
      }

      const batch = nodes.slice(i, i + batchSize);
      const texts = batch.map(node => node.originalText);
      
      try {
        const translations = await this.translator.batchTranslate(
          texts,
          'auto',
          batch[0].language === 'ja' ? 'en' : 'ja'
        );

        batch.forEach((node, index) => {
          if (translations[index]) {
            this.domParser.replaceTextContent(node.element, translations[index]);
            this.domParser.markAsTranslated(node.element, node.originalText);
            this.translatedNodes.set(node.element, translations[index]);
          }
        });

        onProgress(batch.length);
      } catch (error) {
        console.error('Batch translation error:', error);
      }
    }
  }

  private isInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }

  private showTranslationBar() {
    if (!this.translationBar) {
      this.translationBar = document.createElement('div');
      this.translationBar.id = 'translation-bar';
      this.translationBar.innerHTML = `
        <div class="translation-bar-content">
          <div class="progress-section">
            <span class="status-text">ページを翻訳中...</span>
            <div class="progress-bar-container">
              <div class="progress-bar"></div>
            </div>
            <span class="progress-text">
              <span id="translated-count">0</span> / <span id="total-count">0</span>
            </span>
          </div>
          <div class="action-buttons">
            <button class="toggle-btn">原文を表示</button>
            <button class="cancel-btn">キャンセル</button>
          </div>
        </div>
      `;
      document.body.appendChild(this.translationBar);

      const toggleBtn = this.translationBar.querySelector('.toggle-btn');
      toggleBtn?.addEventListener('click', () => this.toggleTranslation());

      const cancelBtn = this.translationBar.querySelector('.cancel-btn');
      cancelBtn?.addEventListener('click', () => this.cancelTranslation());
    }

    this.translationBar.classList.add('show');
  }

  private hideTranslationBar() {
    if (this.translationBar) {
      this.translationBar.classList.remove('show');
    }
  }

  private updateProgress(translated: number, total: number) {
    if (!this.translationBar) return;

    const progressBar = this.translationBar.querySelector('.progress-bar') as HTMLElement;
    const translatedCount = this.translationBar.querySelector('#translated-count');
    const totalCount = this.translationBar.querySelector('#total-count');

    const percentage = total > 0 ? (translated / total) * 100 : 0;
    progressBar.style.width = `${percentage}%`;
    
    if (translatedCount) translatedCount.textContent = translated.toString();
    if (totalCount) totalCount.textContent = total.toString();
  }

  private showCompleteStatus() {
    if (!this.translationBar) return;

    const statusText = this.translationBar.querySelector('.status-text');
    if (statusText) {
      statusText.textContent = '翻訳が完了しました';
    }
  }

  private toggleTranslation() {
    const toggleBtn = this.translationBar?.querySelector('.toggle-btn') as HTMLButtonElement;
    const isShowingOriginal = toggleBtn?.textContent === '翻訳を表示';

    this.translatedNodes.forEach((translatedText, element) => {
      if (isShowingOriginal) {
        this.domParser.replaceTextContent(element, translatedText);
      } else {
        this.domParser.restoreOriginalText(element);
      }
    });

    if (toggleBtn) {
      toggleBtn.textContent = isShowingOriginal ? '原文を表示' : '翻訳を表示';
    }
  }

  private cancelTranslation() {
    this.abortController?.abort();
    this.isTranslating = false;
    
    this.translatedNodes.forEach((_, element) => {
      this.domParser.restoreOriginalText(element);
    });
    
    this.translatedNodes.clear();
    this.hideTranslationBar();
  }
}

new ContentScript();