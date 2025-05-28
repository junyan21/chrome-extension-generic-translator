export type Language = 'ja' | 'en' | 'zh' | 'ko' | 'mixed' | 'unknown';
export type SupportedLanguage = 'ja' | 'en' | 'zh' | 'ko';

export class LanguageDetector {
  private readonly japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  private readonly englishRegex = /[a-zA-Z]/;
  private readonly chineseRegex = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
  private readonly koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

  detect(text: string): Language {
    if (!text || text.trim().length === 0) {
      return 'unknown';
    }

    const cleanText = text.replace(/\s+/g, '');
    
    // 各言語の文字数をカウント
    const japaneseKanaCount = (cleanText.match(/[\u3040-\u309F\u30A0-\u30FF]/) || []).length;
    const cjkCount = (cleanText.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/) || []).length;
    const englishCount = (cleanText.match(this.englishRegex) || []).length;
    const koreanCount = (cleanText.match(this.koreanRegex) || []).length;
    const totalChars = cleanText.length;

    if (totalChars === 0) {
      return 'unknown';
    }

    // 各言語の割合を計算
    const japaneseKanaRatio = japaneseKanaCount / totalChars;
    const cjkRatio = cjkCount / totalChars;
    const englishRatio = englishCount / totalChars;
    const koreanRatio = koreanCount / totalChars;

    // 韓国語の判定（ハングルが含まれている場合）
    if (koreanRatio > 0.1) {
      return 'ko';
    }
    
    // 日本語の判定（ひらがな・カタカナが含まれている場合）
    if (japaneseKanaRatio > 0.05) {
      return 'ja';
    }
    
    // 中国語の判定（漢字のみで、日本語特有の文字がない場合）
    if (cjkRatio > 0.3 && japaneseKanaRatio === 0 && koreanRatio === 0) {
      return 'zh';
    }
    
    // 英語の判定
    if (englishRatio > 0.5) {
      return 'en';
    }
    
    // 混在言語の判定
    if ((japaneseKanaRatio > 0 || cjkRatio > 0.1) && englishRatio > 0.3) {
      return 'mixed';
    }

    return 'unknown';
  }

  detectSentences(text: string): Array<{ text: string; language: Language }> {
    const sentences = this.splitIntoSentences(text);
    return sentences.map(sentence => ({
      text: sentence,
      language: this.detect(sentence)
    }));
  }

  private splitIntoSentences(text: string): string[] {
    const sentenceEndings = /[。．.!?！？\n]+/g;
    const sentences = text.split(sentenceEndings)
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    return sentences;
  }

  isJapanese(text: string): boolean {
    return this.detect(text) === 'ja';
  }

  isEnglish(text: string): boolean {
    return this.detect(text) === 'en';
  }
  
  isChinese(text: string): boolean {
    return this.detect(text) === 'zh';
  }
  
  isKorean(text: string): boolean {
    return this.detect(text) === 'ko';
  }

  getTargetLanguage(sourceText: string, preferredTarget?: SupportedLanguage): SupportedLanguage {
    const detected = this.detect(sourceText);
    
    // 優先ターゲット言語が指定されている場合
    if (preferredTarget && detected !== preferredTarget) {
      return preferredTarget;
    }
    
    // デフォルトの翻誓ペア
    switch (detected) {
      case 'ja':
        return 'en';
      case 'en':
        return 'ja';
      case 'zh':
        return 'ja'; // 中国語→日本語
      case 'ko':
        return 'ja'; // 韓国語→日本語
      default:
        return 'ja'; // 不明な場合は日本語へ
    }
  }
  
  /**
   * 言語コードを表示名に変換
   */
  getLanguageDisplayName(lang: Language | SupportedLanguage): string {
    const displayNames: Record<string, string> = {
      'ja': '日本語',
      'en': 'English',
      'zh': '中文',
      'ko': '한국어',
      'mixed': '混在',
      'unknown': '不明'
    };
    
    return displayNames[lang] || lang;
  }
}