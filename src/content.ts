import { ClaudeTranslator } from "./utils/translator";
import { LanguageDetector } from "./utils/language-detector";
import { FullPageTranslator as NewFullPageTranslator } from "./utils/readability-parser";

class ContentScript {
  private translator: ClaudeTranslator | null = null;
  private languageDetector: LanguageDetector;
  private floatingButton: HTMLElement | null = null;
  private translationPopup: HTMLElement | null = null;
  private translationBar: HTMLElement | null = null;
  private selectedText: string = "";
  private fullPageTranslator: NewFullPageTranslator | null = null;

  constructor() {
    this.languageDetector = new LanguageDetector();
    this.init();
  }

  private async init() {
    const apiKey = await this.getApiKey();
    if (apiKey) {
      this.translator = new ClaudeTranslator(apiKey);
    }

    this.createFloatingButton();
    this.createTranslationPopup();
    this.createTranslationBar();
    this.setupEventListeners();
    this.setupMessageListener();
  }

  private async getApiKey(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["apiKey"], (result) => {
        resolve(result.apiKey || null);
      });
    });
  }

  private createFloatingButton() {
    this.floatingButton = document.createElement("div");
    this.floatingButton.id = "claude-translator-button";
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

    this.floatingButton.addEventListener("mouseenter", () => {
      this.floatingButton!.style.transform = "scale(1.1)";
    });

    this.floatingButton.addEventListener("mouseleave", () => {
      this.floatingButton!.style.transform = "scale(1)";
    });
  }

  private createTranslationPopup() {
    this.translationPopup = document.createElement("div");
    this.translationPopup.id = "claude-translator-popup";
    this.translationPopup.innerHTML = `
      <div class="translator-header">
        <h3>Claude翻訳</h3>
        <button class="close-btn">✕</button>
      </div>
      <div class="language-selector">
        <select class="lang-select" id="source-lang-select">
          <option value="auto">自動検出</option>
          <option value="ja">日本語</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="ko">한국어</option>
        </select>
        <button class="swap-btn">⇄</button>
        <select class="lang-select" id="target-lang-select">
          <option value="ja">日本語</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="ko">한국어</option>
        </select>
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
    const header = this.translationPopup!.querySelector(".translator-header") as HTMLElement;
    let isDragging = false;
    let currentX: number;
    let currentY: number;
    let initialX: number;
    let initialY: number;

    header.addEventListener("mousedown", (e) => {
      isDragging = true;
      initialX = e.clientX - this.translationPopup!.offsetLeft;
      initialY = e.clientY - this.translationPopup!.offsetTop;
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;

      this.translationPopup!.style.left = currentX + "px";
      this.translationPopup!.style.top = currentY + "px";
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
    });
  }

  private setupEventListeners() {
    document.addEventListener("mouseup", () => {
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

    this.floatingButton!.addEventListener("click", async () => {
      this.hideFloatingButton();
      await this.translateSelection();
    });

    const closeBtn = this.translationPopup!.querySelector(".close-btn");
    closeBtn?.addEventListener("click", () => {
      this.hideTranslationPopup();
    });

    const swapBtn = this.translationPopup!.querySelector(".swap-btn");
    swapBtn?.addEventListener("click", async () => {
      this.swapLanguages();
      if (this.selectedText) {
        await this.translateSelection();
      }
    });

    const copyBtn = this.translationPopup!.querySelector(".copy-btn");
    copyBtn?.addEventListener("click", () => {
      const translatedText = this.translationPopup!.querySelector(".translated-text")?.textContent;
      if (translatedText) {
        navigator.clipboard.writeText(translatedText);
        (copyBtn as HTMLButtonElement).textContent = "コピーしました！";
        setTimeout(() => {
          (copyBtn as HTMLButtonElement).textContent = "コピー";
        }, 2000);
      }
    });

    document.addEventListener("click", (e) => {
      if (
        !this.translationPopup?.contains(e.target as Node) &&
        !this.floatingButton?.contains(e.target as Node)
      ) {
        this.hideTranslationPopup();
        this.hideFloatingButton();
      }
    });
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "translateSelection") {
        this.translateSelection();
      } else if (request.action === "translatePage") {
        this.translateFullPage();
      } else if (request.action === "updateApiKey") {
        this.translator = new ClaudeTranslator(request.apiKey);
      }
    });
  }

  private showFloatingButton(selection: Selection) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.floatingButton!.style.display = "flex";
    this.floatingButton!.style.left = `${rect.left + rect.width / 2 - 18}px`;
    this.floatingButton!.style.top = `${rect.bottom + window.scrollY + 5}px`;
  }

  private hideFloatingButton() {
    if (this.floatingButton) {
      this.floatingButton.style.display = "none";
    }
  }

  private async translateSelection() {
    if (!this.translator) {
      alert("APIキーが設定されていません。拡張機能の設定からAPIキーを入力してください。");
      return;
    }

    this.showTranslationPopup();
    const sourceText = this.translationPopup!.querySelector(".source-text") as HTMLElement;
    const translatedText = this.translationPopup!.querySelector(".translated-text") as HTMLElement;
    const loadingSpinner = this.translationPopup!.querySelector(".loading-spinner") as HTMLElement;

    // Null checks for DOM elements
    if (!sourceText || !translatedText || !loadingSpinner) {
      console.error('[ContentScript] Translation popup elements not found:', {
        sourceText: !!sourceText,
        translatedText: !!translatedText,
        loadingSpinner: !!loadingSpinner
      });
      return;
    }

    sourceText.textContent = this.selectedText;
    translatedText.textContent = "";
    loadingSpinner.style.display = "block";

    try {
      const detectedLang = this.languageDetector.detect(this.selectedText);
      const targetLang = this.languageDetector.getTargetLanguage(this.selectedText);

      this.updateLanguageLabels(detectedLang, targetLang);

      // サポートされている言語に変換（中国語・韓国語は日本語に翻訳）
      let finalTargetLang: "ja" | "en" | "zh" | "ko" = "ja";
      if (targetLang === "ja" || targetLang === "en") {
        finalTargetLang = targetLang;
      } else if (targetLang === "zh" || targetLang === "ko") {
        finalTargetLang = "ja"; // 中国語・韓国語は日本語に翻訳
      }

      const result = await this.translator.translate({
        text: this.selectedText,
        sourceLang: "auto",
        targetLang: finalTargetLang,
      });
      
      if (translatedText) {
        translatedText.textContent = result.translatedText;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "翻訳に失敗しました";
      if (translatedText) {
        translatedText.textContent = `エラー: ${errorMessage}`;
      }
      console.error("[ContentScript] Translation error:", error);
    } finally {
      if (loadingSpinner) {
        loadingSpinner.style.display = "none";
      }
    }
  }

  private showTranslationPopup() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    this.translationPopup!.style.display = "block";
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
      this.translationPopup.style.display = "none";
    }
  }

  private updateLanguageLabels(sourceLang: string, targetLang: string) {
    const sourceSelect = this.translationPopup!.querySelector("#source-lang-select") as HTMLSelectElement;
    const targetSelect = this.translationPopup!.querySelector("#target-lang-select") as HTMLSelectElement;

    if (sourceSelect && targetSelect) {
      // Set the select values to reflect detected languages
      if (sourceLang !== "auto" && sourceLang !== "unknown" && sourceLang !== "mixed") {
        sourceSelect.value = sourceLang;
      }
      targetSelect.value = targetLang;
    }
  }

  private swapLanguages() {
    const sourceSelect = this.translationPopup!.querySelector("#source-lang-select") as HTMLSelectElement;
    const targetSelect = this.translationPopup!.querySelector("#target-lang-select") as HTMLSelectElement;

    // ソースが自動検出の場合は、検出された言語を使用
    if (sourceSelect.value === "auto") {
      const detectedLang = this.languageDetector.detect(this.selectedText);
      if (detectedLang !== "unknown" && detectedLang !== "mixed") {
        sourceSelect.value = detectedLang;
      }
    }

    const temp = sourceSelect.value;
    sourceSelect.value = targetSelect.value;
    targetSelect.value = temp;
  }

  private createTranslationBar() {
    this.translationBar = document.createElement("div");
    this.translationBar.id = "translation-bar";
    this.translationBar.innerHTML = `
      <div class="translation-bar-content">
        <div class="progress-section">
          <span class="status-text">翻訳中...</span>
          <div class="progress-bar-container">
            <div class="progress-bar"></div>
          </div>
          <span class="progress-text">0%</span>
        </div>
        <div class="action-buttons">
          <button class="toggle-btn">原文/翻訳</button>
          <button class="cancel-btn">キャンセル</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.translationBar);
    this.setupTranslationBarEvents();
  }

  private setupTranslationBarEvents() {
    const toggleBtn = this.translationBar!.querySelector(".toggle-btn");
    const cancelBtn = this.translationBar!.querySelector(".cancel-btn");

    toggleBtn?.addEventListener("click", () => {
      if (this.fullPageTranslator) {
        this.fullPageTranslator.toggleTranslation();
        
        // ボタンテキストを更新（Google翻訳スタイル）
        const isShowingTranslation = (toggleBtn as HTMLElement).textContent === "原文を表示";
        (toggleBtn as HTMLElement).textContent = isShowingTranslation ? "翻訳を表示" : "原文を表示";
      }
    });

    cancelBtn?.addEventListener("click", () => {
      if (this.fullPageTranslator) {
        this.fullPageTranslator.reset();
        this.hideTranslationBar();
      }
    });
  }

  private showTranslationBar() {
    this.translationBar!.classList.add("show");
  }

  private hideTranslationBar() {
    this.translationBar!.classList.remove("show");
  }

  private updateTranslationProgress(progress: number) {
    const progressBar = this.translationBar!.querySelector(".progress-bar") as HTMLElement;
    const progressText = this.translationBar!.querySelector(".progress-text") as HTMLElement;

    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
  }

  private async translateFullPage() {
    if (!this.translator) {
      alert("APIキーが設定されていません。拡張機能の設定からAPIキーを入力してください。");
      return;
    }

    if (!this.fullPageTranslator) {
      this.fullPageTranslator = new NewFullPageTranslator();
      
      // DeepL風の遅延翻訳モード（スクロール時に翻訳）
      this.fullPageTranslator.setTranslationMode(true);
      
      // Google翻訳風（全体翻訳）モード
      // this.fullPageTranslator.setTranslationMode(false);
    }

    this.showTranslationBar();
    
    // 進捗コールバックを設定
    const progressCallback = (progress: number, status: string) => {
      this.updateTranslationProgress(progress);
      const statusText = this.translationBar!.querySelector(".status-text") as HTMLElement;
      if (statusText) {
        statusText.textContent = status;
      }
    };

    try {
      await this.fullPageTranslator.translatePage(progressCallback);
    } catch (error) {
      console.error("[ContentScript] ページ翻訳エラー:", error);
      const statusText = this.translationBar!.querySelector(".status-text") as HTMLElement;
      if (statusText) {
        statusText.textContent = "翻訳エラーが発生しました";
      }
    }
    
    // 翻訳完了後はボタンテキストを更新
    const toggleBtn = this.translationBar!.querySelector(".toggle-btn") as HTMLElement;
    if (toggleBtn) {
      toggleBtn.textContent = "原文を表示";
    }
  }
}

new ContentScript();
