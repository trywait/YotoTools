document.addEventListener('DOMContentLoaded', async () => {
  const viewMediaButton = document.getElementById('viewMedia');
  const bulkDownloadButton = document.getElementById('bulkDownload');
  const downloadCoverButton = document.getElementById('downloadCover');
  const downloadDetailsButton = document.getElementById('downloadDetails');
  const statusElement = document.getElementById('status');
  const progressElement = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');

  let messageListener = null;

  // Check if we're on a Yoto card page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isYotoCardPage = tab.url.includes('play.yotoplay.com/') && tab.url.includes('/card/') ||
                        tab.url.includes('share.yoto.co/');

  // Function to ensure content script is injected
  async function ensureContentScript() {
    try {
      // Try to send a test message
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
    } catch (error) {
      // If content script isn't ready, inject it
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      // Wait a moment for the script to initialize
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  if (isYotoCardPage) {
    statusElement.textContent = 'Ready to download media';
    viewMediaButton.disabled = false;
    bulkDownloadButton.disabled = false;
    downloadCoverButton.disabled = false;
    downloadDetailsButton.disabled = false;

    // Ensure content script is ready when page loads
    await ensureContentScript();
  }

  // Handle View Media Links button
  viewMediaButton.addEventListener('click', async () => {
    try {
      await ensureContentScript();
      await chrome.tabs.sendMessage(tab.id, { action: 'viewMediaLinks' });
    } catch (error) {
      statusElement.textContent = 'Error: Could not view media links';
      console.error(error);
    }
  });

  // Handle Download Cover Art button
  downloadCoverButton.addEventListener('click', async () => {
    try {
      await ensureContentScript();
      await chrome.tabs.sendMessage(tab.id, { action: 'downloadCoverArt' });
    } catch (error) {
      statusElement.textContent = 'Error: Could not download cover art';
      console.error(error);
    }
  });

  // Handle Bulk Download button
  bulkDownloadButton.addEventListener('click', async () => {
    try {
      // Remove any existing message listener
      if (messageListener) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }

      // Reset progress display
      progressElement.style.display = 'flex';
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      
      // Set up new message listener before sending message
      messageListener = (message, sender, sendResponse) => {
        if (message.type === 'downloadProgress') {
          const progress = message.progress;
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `${progress}%`;
          
          if (progress === 100) {
            setTimeout(() => {
              progressElement.style.display = 'none';
              chrome.runtime.onMessage.removeListener(messageListener);
              messageListener = null;
            }, 1000);
          }
        } else if (message.type === 'downloadError') {
          statusElement.textContent = `Error: ${message.error}`;
        }
      };
      
      chrome.runtime.onMessage.addListener(messageListener);

      // Ensure content script is ready before starting download
      await ensureContentScript();
      
      // Start the download process
      await chrome.tabs.sendMessage(tab.id, { action: 'bulkDownload' });
    } catch (error) {
      statusElement.textContent = 'Error: Could not start bulk download';
      console.error(error);
    }
  });

  // Handle Download Card Details button
  downloadDetailsButton.addEventListener('click', async () => {
    try {
      await ensureContentScript();
      await chrome.tabs.sendMessage(tab.id, { action: 'downloadCardDetails' });
    } catch (error) {
      statusElement.textContent = 'Error: Could not download card details';
      console.error(error);
    }
  });
}); 