document.addEventListener('DOMContentLoaded', async () => {
  const bulkDownloadButton = document.getElementById('bulkDownload');
  const downloadCoverButton = document.getElementById('downloadCover');
  const downloadDetailsButton = document.getElementById('downloadDetails');
  const statusElement = document.getElementById('status');
  const progressElement = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const errorText = document.getElementById('errorText');

  // Function to update UI based on download state
  function updateUI(state) {
    if (!state) return;

    statusElement.textContent = state.status;
    statusElement.style.color = state.statusColor;

    if (state.inProgress) {
      progressElement.style.display = 'flex';
      progressFill.style.width = `${state.progress}%`;
      progressText.textContent = `${state.progress}%`;
    } else {
      progressElement.style.display = 'none';
    }

    if (state.error) {
      errorText.style.display = 'block';
      errorText.textContent = state.error;
    } else {
      errorText.style.display = 'none';
      errorText.textContent = '';
    }

    // Enable/disable buttons based on page type and download state
    const buttonsEnabled = isYotoCardPage && !state.inProgress;
    bulkDownloadButton.disabled = !buttonsEnabled;
    downloadCoverButton.disabled = !buttonsEnabled;
    downloadDetailsButton.disabled = !buttonsEnabled;
  }

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

  // Check if we're on a Yoto card page
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isYotoCardPage = tab.url.includes('play.yotoplay.com/') && tab.url.includes('/card/') ||
                        tab.url.includes('share.yoto.co/');

  if (isYotoCardPage) {
    // Ensure content script is ready
    await ensureContentScript();

    // Get current state from content script
    try {
      const state = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentState' });
      if (state) {
        updateUI(state);
      } else {
        // Default state if none exists
        updateUI({
          inProgress: false,
          progress: 0,
          status: 'Ready to backup your card content',
          statusColor: 'var(--text-secondary)',
          error: null
        });
      }
    } catch (error) {
      console.error('Error getting current state:', error);
      // Set default state on error
      updateUI({
        inProgress: false,
        progress: 0,
        status: 'Ready to backup your card content',
        statusColor: 'var(--text-secondary)',
        error: null
      });
    }
  }

  // Set up message listener for progress updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'downloadProgress') {
      const progress = message.progress;
      const state = {
        inProgress: progress < 100,
        progress: progress,
        status: progress === 0 ? 'Downloading files...' : 
                progress === 100 ? 'Backup Complete!' : statusElement.textContent,
        statusColor: progress === 100 ? 'var(--system-green)' : 'var(--text-secondary)',
        error: null
      };
      
      updateUI(state);

      if (progress === 100) {
        setTimeout(() => {
          updateUI({
            inProgress: false,
            progress: 0,
            status: 'Ready to backup your card content',
            statusColor: 'var(--text-secondary)',
            error: null
          });
        }, 1000);
      }
    } else if (message.type === 'downloadError') {
      updateUI({
        inProgress: false,
        progress: 0,
        status: `Error: ${message.error}`,
        statusColor: 'var(--system-red)',
        error: message.error
      });
    }
  });

  // Handle Bulk Download button
  bulkDownloadButton.addEventListener('click', async () => {
    try {
      updateUI({
        inProgress: true,
        progress: 0,
        status: 'Downloading files...',
        statusColor: 'var(--text-secondary)',
        error: null
      });

      // Ensure content script is ready before starting download
      await ensureContentScript();
      
      // Start the download process
      await chrome.tabs.sendMessage(tab.id, { action: 'bulkDownload' });
    } catch (error) {
      updateUI({
        inProgress: false,
        progress: 0,
        status: 'Error: Could not start bulk download',
        statusColor: 'var(--system-red)',
        error: 'Could not start bulk download'
      });
      console.error(error);
    }
  });

  // Handle Download Cover Art button
  downloadCoverButton.addEventListener('click', async () => {
    try {
      await ensureContentScript();
      await chrome.tabs.sendMessage(tab.id, { action: 'downloadCoverArt' });
    } catch (error) {
      updateUI({
        inProgress: false,
        progress: 0,
        status: 'Error: Could not download cover art',
        statusColor: 'var(--system-red)',
        error: 'Could not download cover art'
      });
      console.error(error);
    }
  });

  // Handle Download Card Details button
  downloadDetailsButton.addEventListener('click', async () => {
    try {
      await ensureContentScript();
      await chrome.tabs.sendMessage(tab.id, { action: 'downloadCardDetails' });
    } catch (error) {
      updateUI({
        inProgress: false,
        progress: 0,
        status: 'Error: Could not download card details',
        statusColor: 'var(--system-red)',
        error: 'Could not download card details'
      });
      console.error(error);
    }
  });
}); 