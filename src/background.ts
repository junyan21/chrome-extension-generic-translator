// Background service worker for Claude Translator

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  // Create context menu items
  chrome.contextMenus.create({
    id: 'translate-selection',
    title: '選択テキストを翻訳',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'translate-page',
    title: 'ページ全体を翻訳',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'translate-selection') {
    chrome.tabs.sendMessage(tab.id, { action: 'translateSelection' });
  } else if (info.menuItemId === 'translate-page') {
    chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab?.id) return;

  if (command === 'translate-selection') {
    chrome.tabs.sendMessage(tab.id, { action: 'translateSelection' });
  } else if (command === 'translate-page') {
    chrome.tabs.sendMessage(tab.id, { action: 'translatePage' });
  }
});

// Handle API calls from content scripts
async function callClaudeAPI(prompt: string, apiKey: string) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Background: API error:', error);
      throw new Error(error.error?.message || 'API call failed');
    }

    const data = await response.json();
    return data.content[0].text;
  } catch (error) {
    console.error('Background: API call failed:', error);
    throw error;
  }
}

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'clearCache') {
    // In a real implementation, we would clear the cache here
    // For now, just send a success response
    sendResponse({ success: true });
    return true;
  }
  
  // Handle translation API calls
  if (request.action === 'translate') {
    (async () => {
      try {
        // Get API key from storage
        const result = await chrome.storage.sync.get(['apiKey']);
        
        if (!result.apiKey) {
          console.error('Background: API key not found in storage');
          sendResponse({ error: 'APIキーが設定されていません。拡張機能の設定画面でAPIキーを入力してください。' });
          return;
        }
        
        const translatedText = await callClaudeAPI(request.prompt, result.apiKey);
        sendResponse({ success: true, translatedText });
      } catch (error) {
        console.error('Background: Translation error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        sendResponse({ error: `翻訳エラー: ${errorMessage}` });
      }
    })();
    return true; // Will respond asynchronously
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});

// Optional: Handle extension icon click to toggle translation
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    // Toggle popup if no default popup is set
    // In our case, we have a default popup, so this won't be triggered
  }
});

// Handle extension updates
chrome.runtime.onUpdateAvailable.addListener(() => {
  // Optionally reload the extension when an update is available
});

// Export for TypeScript
export {};