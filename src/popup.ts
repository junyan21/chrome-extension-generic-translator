import { ClaudeTranslator } from './utils/translator';
import { LanguageDetector } from './utils/language-detector';

class PopupScript {
  private translator: ClaudeTranslator | null = null;
  private languageDetector: LanguageDetector;
  private currentSourceLang: 'ja' | 'en' = 'ja';
  private currentTargetLang: 'ja' | 'en' = 'en';

  constructor() {
    this.languageDetector = new LanguageDetector();
    this.init();
  }

  private async init() {
    await this.checkApiKey();
    this.setupEventListeners();
  }

  private async checkApiKey() {
    const apiKey = await this.getApiKey();
    const apiStatus = document.getElementById('api-status');
    
    if (apiKey) {
      this.translator = new ClaudeTranslator(apiKey);
      apiStatus?.classList.add('hidden');
    } else {
      apiStatus?.classList.remove('hidden');
    }
  }

  private async getApiKey(): Promise<string | null> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['apiKey'], (result) => {
        resolve(result.apiKey || null);
      });
    });
  }

  private setupEventListeners() {
    // Translation button
    const translateBtn = document.getElementById('translate-btn');
    translateBtn?.addEventListener('click', () => this.translateText());

    // Swap languages button
    const swapBtn = document.getElementById('swap-lang');
    swapBtn?.addEventListener('click', () => this.swapLanguages());

    // Copy result button
    const copyBtn = document.getElementById('copy-result');
    copyBtn?.addEventListener('click', () => this.copyResult());

    // Translate page button
    const translatePageBtn = document.getElementById('translate-page-btn');
    translatePageBtn?.addEventListener('click', () => this.translateCurrentPage());

    // Options button
    const optionsBtn = document.getElementById('open-options');
    optionsBtn?.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Enter key to translate
    const inputText = document.getElementById('input-text') as HTMLTextAreaElement;
    inputText?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.translateText();
      }
    });
  }

  private async translateText() {
    if (!this.translator) {
      alert('APIキーが設定されていません。設定画面からAPIキーを入力してください。');
      return;
    }

    const inputText = document.getElementById('input-text') as HTMLTextAreaElement;
    const text = inputText.value.trim();

    if (!text) return;

    const translateBtn = document.getElementById('translate-btn') as HTMLButtonElement;
    const resultContainer = document.getElementById('result-container');
    const translationResult = document.getElementById('translation-result');

    // Show loading state
    translateBtn.disabled = true;
    translateBtn.textContent = '翻訳中...';

    try {
      // Auto-detect language if needed
      const detectedLang = this.languageDetector.detect(text);
      if (detectedLang === 'ja' || detectedLang === 'en') {
        this.currentSourceLang = detectedLang;
        this.currentTargetLang = detectedLang === 'ja' ? 'en' : 'ja';
        this.updateLanguageDisplay();
      }

      const result = await this.translator.translate({
        text,
        sourceLang: this.currentSourceLang,
        targetLang: this.currentTargetLang
      });

      // Show result
      if (translationResult) {
        translationResult.textContent = result.translatedText;
      }
      resultContainer?.classList.remove('hidden');

    } catch (error) {
      console.error('Translation error:', error);
      if (translationResult) {
        translationResult.textContent = 'エラー: 翻訳に失敗しました';
      }
      resultContainer?.classList.remove('hidden');
    } finally {
      translateBtn.disabled = false;
      translateBtn.textContent = '翻訳する';
    }
  }

  private swapLanguages() {
    const temp = this.currentSourceLang;
    this.currentSourceLang = this.currentTargetLang;
    this.currentTargetLang = temp;
    this.updateLanguageDisplay();
  }

  private updateLanguageDisplay() {
    const sourceLangDisplay = document.getElementById('source-lang-display');
    const targetLangDisplay = document.getElementById('target-lang-display');

    if (sourceLangDisplay) {
      sourceLangDisplay.textContent = this.currentSourceLang === 'ja' ? '日本語' : 'English';
    }
    if (targetLangDisplay) {
      targetLangDisplay.textContent = this.currentTargetLang === 'ja' ? '日本語' : 'English';
    }
  }

  private copyResult() {
    const translationResult = document.getElementById('translation-result');
    const copyBtn = document.getElementById('copy-result');
    
    if (translationResult?.textContent) {
      navigator.clipboard.writeText(translationResult.textContent);
      
      if (copyBtn) {
        copyBtn.textContent = 'コピーしました！';
        setTimeout(() => {
          copyBtn.textContent = 'コピー';
        }, 2000);
      }
    }
  }

  private async translateCurrentPage() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    if (currentTab.id) {
      chrome.tabs.sendMessage(currentTab.id, { action: 'translatePage' });
      window.close();
    }
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  new PopupScript();
});