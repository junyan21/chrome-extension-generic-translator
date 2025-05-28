interface Options {
  apiKey: string;
  autoDetectLang: boolean;
  showFloatingButton: boolean;
  cacheTranslations: boolean;
  preserveFormatting: boolean;
  skipCodeBlocks: boolean;
  translateAltText: boolean;
  translationModel: string;
  maxCacheSize: number;
}

class OptionsPage {
  private defaultOptions: Options = {
    apiKey: '',
    autoDetectLang: true,
    showFloatingButton: true,
    cacheTranslations: true,
    preserveFormatting: true,
    skipCodeBlocks: true,
    translateAltText: false,
    translationModel: 'claude-3-haiku-20240307',
    maxCacheSize: 1000
  };

  constructor() {
    this.init();
  }

  private async init() {
    await this.loadOptions();
    this.setupEventListeners();
  }

  private async loadOptions() {
    const options = await this.getOptions();
    
    // API Key
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    if (apiKeyInput && options.apiKey) {
      apiKeyInput.value = options.apiKey;
    }

    // Checkboxes
    this.setCheckbox('auto-detect-lang', options.autoDetectLang);
    this.setCheckbox('show-floating-button', options.showFloatingButton);
    this.setCheckbox('cache-translations', options.cacheTranslations);
    this.setCheckbox('preserve-formatting', options.preserveFormatting);
    this.setCheckbox('skip-code-blocks', options.skipCodeBlocks);
    this.setCheckbox('translate-alt-text', options.translateAltText);

    // Select
    const modelSelect = document.getElementById('translation-model') as HTMLSelectElement;
    if (modelSelect) {
      modelSelect.value = options.translationModel;
    }

    // Number input
    const cacheSizeInput = document.getElementById('max-cache-size') as HTMLInputElement;
    if (cacheSizeInput) {
      cacheSizeInput.value = options.maxCacheSize.toString();
    }
  }

  private setCheckbox(id: string, checked: boolean) {
    const checkbox = document.getElementById(id) as HTMLInputElement;
    if (checkbox) {
      checkbox.checked = checked;
    }
  }

  private async getOptions(): Promise<Options> {
    return new Promise((resolve) => {
      chrome.storage.sync.get(this.defaultOptions, (items) => {
        resolve(items as Options);
      });
    });
  }

  private setupEventListeners() {
    // Save button
    const saveButton = document.getElementById('save-options');
    saveButton?.addEventListener('click', () => this.saveOptions());

    // Clear cache button
    const clearCacheButton = document.getElementById('clear-cache');
    clearCacheButton?.addEventListener('click', () => this.clearCache());
    
    // Test API key button
    const testApiButton = document.getElementById('test-api-key');
    testApiButton?.addEventListener('click', () => this.testApiKey());

    // API key input - show status when changed
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    apiKeyInput?.addEventListener('input', () => {
      const apiKeyStatus = document.getElementById('api-key-status');
      apiKeyStatus?.classList.add('hidden');
    });
  }

  private async saveOptions() {
    const options: Options = {
      apiKey: (document.getElementById('api-key') as HTMLInputElement).value,
      autoDetectLang: (document.getElementById('auto-detect-lang') as HTMLInputElement).checked,
      showFloatingButton: (document.getElementById('show-floating-button') as HTMLInputElement).checked,
      cacheTranslations: (document.getElementById('cache-translations') as HTMLInputElement).checked,
      preserveFormatting: (document.getElementById('preserve-formatting') as HTMLInputElement).checked,
      skipCodeBlocks: (document.getElementById('skip-code-blocks') as HTMLInputElement).checked,
      translateAltText: (document.getElementById('translate-alt-text') as HTMLInputElement).checked,
      translationModel: (document.getElementById('translation-model') as HTMLSelectElement).value,
      maxCacheSize: parseInt((document.getElementById('max-cache-size') as HTMLInputElement).value) || 1000
    };

    // Save to storage
    chrome.storage.sync.set(options, () => {
      // Show save status
      const saveStatus = document.getElementById('save-status');
      saveStatus?.classList.remove('hidden');
      
      // Show API key status if API key was saved
      if (options.apiKey) {
        const apiKeyStatus = document.getElementById('api-key-status');
        apiKeyStatus?.classList.remove('hidden');
      }

      // Notify content scripts about updated options
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'updateApiKey',
              apiKey: options.apiKey
            }).catch(() => {
              // Ignore errors for tabs that don't have content script
            });
          }
        });
      });

      // Hide status after 3 seconds
      setTimeout(() => {
        saveStatus?.classList.add('hidden');
      }, 3000);
    });
  }

  private async clearCache() {
    const confirmed = confirm('翻訳キャッシュをクリアしますか？');
    
    if (confirmed) {
      // Send message to background script to clear cache
      chrome.runtime.sendMessage({ action: 'clearCache' }, (response) => {
        alert('キャッシュがクリアされました');
      });
    }
  }
  
  private async testApiKey() {
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      alert('APIキーを入力してください');
      return;
    }
    
    const testButton = document.getElementById('test-api-key') as HTMLButtonElement;
    const originalText = testButton.textContent;
    testButton.textContent = 'テスト中...';
    testButton.disabled = true;
    
    try {
      // テスト用の簡単な翻訳を実行
      const testPrompt = `You are a professional Japanese-English translator. Translate the following text while preserving its meaning, tone, and formatting.

Source language: auto
Target language: ja

Rules:
- Maintain natural fluency in the target language
- Return ONLY the translation without explanations

Text to translate:
Hello`;

      const response = await chrome.runtime.sendMessage({
        action: 'translate',
        prompt: testPrompt
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      alert(`APIキーテスト成功！\n翻訳結果: ${response.translatedText}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`APIキーテストに失敗しました:\n${errorMessage}`);
    } finally {
      testButton.textContent = originalText;
      testButton.disabled = false;
    }
  }
}

// Initialize options page
document.addEventListener('DOMContentLoaded', () => {
  new OptionsPage();
});