export interface TranslationRequest {
  text: string;
  sourceLang: 'ja' | 'en' | 'zh' | 'ko' | 'auto';
  targetLang: 'ja' | 'en' | 'zh' | 'ko';
  context?: string;
}

export interface TranslationResponse {
  translatedText: string;
  detectedLanguage?: 'ja' | 'en' | 'zh' | 'ko';
}

export class ClaudeTranslator {
  private cache: Map<string, string> = new Map();
  private readonly maxCacheSize = 1000;

  constructor(apiKey: string) {
    // API key is now handled in background script
  }

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const cacheKey = this.getCacheKey(request);
    if (this.cache.has(cacheKey)) {
      return { translatedText: this.cache.get(cacheKey)! };
    }

    try {
      const prompt = this.buildOptimizedPrompt(request);
      const translatedText = await this.callClaudeAPI(prompt);
      
      this.addToCache(cacheKey, translatedText);
      
      return { translatedText };
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error('翻訳に失敗しました');
    }
  }

  async batchTranslate(texts: string[], sourceLang: 'ja' | 'en' | 'zh' | 'ko' | 'auto', targetLang: 'ja' | 'en' | 'zh' | 'ko'): Promise<string[]> {
    const maxTokensPerBatch = 3000;
    const batches: string[][] = [];
    let currentBatch: string[] = [];
    let currentTokenCount = 0;

    for (const text of texts) {
      const estimatedTokens = this.estimateTokens(text);
      if (currentTokenCount + estimatedTokens > maxTokensPerBatch && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [text];
        currentTokenCount = estimatedTokens;
      } else {
        currentBatch.push(text);
        currentTokenCount += estimatedTokens;
      }
    }
    
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    const results: string[] = [];
    for (const batch of batches) {
      const batchResult = await this.translateBatch(batch, sourceLang, targetLang);
      results.push(...batchResult);
    }

    return results;
  }

  private async translateBatch(texts: string[], sourceLang: 'ja' | 'en' | 'zh' | 'ko' | 'auto', targetLang: 'ja' | 'en' | 'zh' | 'ko'): Promise<string[]> {
    const numberedTexts = texts.map((text, i) => `[${i + 1}] ${text}`).join('\n\n');
    const prompt = `You are a professional Japanese-English translator. Translate the following numbered texts while preserving their meaning, tone, and formatting.

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

    const response = await this.callClaudeAPI(prompt);
    
    const translations = response.split('\n')
      .filter(line => line.trim().match(/^\[\d+\]/))
      .map(line => line.replace(/^\[\d+\]\s*/, ''));

    if (translations.length !== texts.length) {
      throw new Error('Batch translation count mismatch');
    }

    return translations;
  }

  private buildOptimizedPrompt(request: TranslationRequest): string {
    return `You are a professional Japanese-English translator. Translate the following text while preserving its meaning, tone, and formatting.

Source language: ${request.sourceLang === 'auto' ? 'Detect automatically' : request.sourceLang}
Target language: ${request.targetLang}
${request.context ? `Context: ${request.context}` : ''}

Rules:
- Maintain natural fluency in the target language
- Preserve formatting (line breaks, spacing)
- For technical terms, keep original if commonly used as-is
- Return ONLY the translation without explanations

Text to translate:
${request.text}`;
  }

  private async callClaudeAPI(prompt: string): Promise<string> {
    // Send message to background script to make API call
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({
          action: 'translate',
          prompt: prompt
        }, (response) => {
          if (chrome.runtime.lastError) {
            // Check for extension context invalidated error
            if (chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
              reject(new Error('拡張機能が更新されました。ページを再読み込みしてください。'));
            } else {
              reject(new Error(chrome.runtime.lastError.message));
            }
          } else if (!response) {
            reject(new Error('拡張機能との通信に失敗しました。ページを再読み込みしてください。'));
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.translatedText);
          }
        });
      } catch (error) {
        reject(new Error('拡張機能との通信に失敗しました。ページを再読み込みしてください。'));
      }
    });
  }

  private getCacheKey(request: TranslationRequest): string {
    return `${request.sourceLang}-${request.targetLang}-${request.text}`;
  }

  private addToCache(key: string, value: string) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  updateApiKey(apiKey: string) {
    // API key is now handled in background script
  }

  clearCache() {
    this.cache.clear();
  }
}