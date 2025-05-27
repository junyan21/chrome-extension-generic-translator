export type Language = 'ja' | 'en' | 'mixed' | 'unknown';

export class LanguageDetector {
  private readonly japaneseRegex = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/;
  private readonly englishRegex = /[a-zA-Z]/;

  detect(text: string): Language {
    if (!text || text.trim().length === 0) {
      return 'unknown';
    }

    const cleanText = text.replace(/\s+/g, '');
    const japaneseCount = (cleanText.match(this.japaneseRegex) || []).length;
    const englishCount = (cleanText.match(this.englishRegex) || []).length;
    const totalChars = cleanText.length;

    if (totalChars === 0) {
      return 'unknown';
    }

    const japaneseRatio = japaneseCount / totalChars;
    const englishRatio = englishCount / totalChars;

    if (japaneseRatio > 0.3 && englishRatio > 0.3) {
      return 'mixed';
    } else if (japaneseRatio > 0.1) {
      return 'ja';
    } else if (englishRatio > 0.5) {
      return 'en';
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

  getTargetLanguage(sourceText: string): 'ja' | 'en' {
    const detected = this.detect(sourceText);
    return detected === 'ja' ? 'en' : 'ja';
  }
}