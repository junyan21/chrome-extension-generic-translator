import { LanguageDetector } from './language-detector';

export interface TranslatableNode {
  element: HTMLElement;
  originalText: string;
  translatedText?: string;
  isTranslated: boolean;
  language: 'ja' | 'en' | 'mixed' | 'unknown';
  priority: number;
}

export class DOMParser {
  private languageDetector: LanguageDetector;
  private readonly excludedTags = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'CODE', 'PRE'
  ]);
  private readonly translatableTags = new Set([
    'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'DIV', 'SPAN',
    'A', 'BUTTON', 'LABEL', 'OPTION', 'BLOCKQUOTE', 'CAPTION', 'DT', 'DD'
  ]);

  constructor() {
    this.languageDetector = new LanguageDetector();
  }

  extractTranslatableNodes(rootElement: HTMLElement = document.body): TranslatableNode[] {
    const nodes: TranslatableNode[] = [];
    const processedElements = new Set<HTMLElement>();

    const traverse = (element: HTMLElement) => {
      if (this.excludedTags.has(element.tagName) || processedElements.has(element)) {
        return;
      }

      processedElements.add(element);

      if (!this.isElementVisible(element)) {
        return;
      }

      const text = this.extractTextContent(element);
      if (text && text.trim().length > 0 && this.shouldTranslateElement(element)) {
        const language = this.languageDetector.detect(text);
        
        if (language !== 'unknown') {
          nodes.push({
            element,
            originalText: text,
            isTranslated: false,
            language,
            priority: this.calculatePriority(element)
          });
        }
      }

      for (const child of element.children) {
        if (child instanceof HTMLElement) {
          traverse(child);
        }
      }
    };

    traverse(rootElement);
    
    return nodes.sort((a, b) => b.priority - a.priority);
  }

  private extractTextContent(element: HTMLElement): string {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent || this.excludedTags.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent && node.textContent.trim() 
            ? NodeFilter.FILTER_ACCEPT 
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const textParts: string[] = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent) {
        textParts.push(node.textContent);
      }
    }

    return textParts.join(' ').trim();
  }

  private shouldTranslateElement(element: HTMLElement): boolean {
    if (element.hasAttribute('data-no-translate') || 
        element.classList.contains('notranslate')) {
      return false;
    }

    const hasDirectText = Array.from(element.childNodes).some(
      node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
    );

    return hasDirectText || this.translatableTags.has(element.tagName);
  }

  isElementVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        parseFloat(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  private calculatePriority(element: HTMLElement): number {
    let priority = 0;

    const tagPriorities: Record<string, number> = {
      'H1': 100,
      'H2': 90,
      'H3': 80,
      'H4': 70,
      'H5': 60,
      'H6': 50,
      'P': 40,
      'LI': 30,
      'TD': 20,
      'TH': 25,
      'SPAN': 10,
      'DIV': 5
    };

    priority += tagPriorities[element.tagName] || 0;

    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight) {
      priority += 200;
    }

    const fontSize = parseFloat(window.getComputedStyle(element).fontSize);
    priority += fontSize;

    return priority;
  }

  replaceTextContent(element: HTMLElement, newText: string) {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent || this.excludedTags.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes: Text[] = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === Node.TEXT_NODE) {
        textNodes.push(node as Text);
      }
    }

    if (textNodes.length === 1) {
      textNodes[0].textContent = newText;
    } else if (textNodes.length > 1) {
      const lines = newText.split('\n');
      textNodes.forEach((node, index) => {
        if (index < lines.length) {
          node.textContent = lines[index];
        }
      });
    }
  }

  markAsTranslated(element: HTMLElement, originalText: string) {
    element.setAttribute('data-original-text', originalText);
    element.setAttribute('data-translated', 'true');
  }

  restoreOriginalText(element: HTMLElement) {
    const originalText = element.getAttribute('data-original-text');
    if (originalText) {
      this.replaceTextContent(element, originalText);
      element.removeAttribute('data-translated');
    }
  }

  isTranslated(element: HTMLElement): boolean {
    return element.hasAttribute('data-translated');
  }
}