// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('Yoto Tools extension installed');
});

// Listen for download events
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log('Download completed:', delta.id);
  }
});

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'downloadProgress') {
    // Forward progress updates to the popup
    chrome.runtime.sendMessage(message);
  } else if (message.type === 'downloadFile') {
    // Handle file downloads
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      conflictAction: 'uniquify'
    }).catch(error => {
      console.error('Download error:', error);
      chrome.runtime.sendMessage({
        type: 'downloadError',
        error: 'Failed to download file'
      });
    });
  }
}); 