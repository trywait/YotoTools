document.addEventListener('DOMContentLoaded', async () => {
  const bulkDownloadButton = document.getElementById('bulkDownload');
  const downloadCoverButton = document.getElementById('downloadCover');
  const downloadDetailsButton = document.getElementById('downloadDetails');
  const statusText = document.getElementById('status');
  const progressContainer = document.getElementById('progress');
  const progressFill = document.getElementById('progressFill');
  const progressText = document.getElementById('progressText');
  const errorText = document.getElementById('errorText');

  function setButtonSuccess(button) {
    button.style.backgroundColor = '#e8f5e9';
    button.style.color = '#2e7d32';
    if (button.classList.contains('action-button')) {
      // No border change needed for secondary buttons
    } else {
      button.style.borderColor = ''; // Reset primary border
    }
    button.disabled = true;
  }

  function resetButtonStyles(button) {
    button.disabled = false; // Explicitly enable
    if (button.classList.contains('primary')) {
      button.style.backgroundColor = 'var(--primary-blue)';
      button.style.color = 'white';
      button.style.borderColor = '';
    } else if (button.classList.contains('action-button')) {
      button.style.backgroundColor = '';
      button.style.color = 'var(--text-primary)';
      button.style.borderColor = '';
    }
  }

  function disableAllButtons() {
    bulkDownloadButton.disabled = true;
    downloadCoverButton.disabled = true;
    downloadDetailsButton.disabled = true;
  }

  async function ensureContentScript(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  function updateUI(state, isOnValidPage) {
    if (state) {
      statusText.textContent = state.status || 'Ready to backup your card content';
      statusText.style.color = state.statusColor || 'var(--text-secondary)';

      if (state.inProgress) {
        progressContainer.style.display = 'flex';
        progressFill.style.width = `${state.progress}%`;
        progressText.textContent = `${state.progress}%`;
      } else {
        progressContainer.style.display = 'none';
      }
    } else if (!isOnValidPage) {
      statusText.textContent = 'Navigate to a Yoto card page to use these tools.';
      statusText.style.color = 'var(--text-secondary)';
      progressContainer.style.display = 'none';
    } else {
      statusText.textContent = 'Ready to backup your card content';
      statusText.style.color = 'var(--text-secondary)';
      progressContainer.style.display = 'none';
    }

    if (!isOnValidPage) {
      disableAllButtons();
      return;
    }

    if (!state || !state.buttonStates) {
      resetButtonStyles(bulkDownloadButton);
      resetButtonStyles(downloadDetailsButton);
      resetButtonStyles(downloadCoverButton);
      return;
    }

    const shouldBeDisabled = {
      bulk: state.buttonStates.bulkDownload ?? false,
      details: state.buttonStates.cardDetails ?? false,
      artwork: state.buttonStates.cardArtwork ?? false,
    };

    bulkDownloadButton.disabled = shouldBeDisabled.bulk;
    if (shouldBeDisabled.bulk) setButtonSuccess(bulkDownloadButton);
    else resetButtonStyles(bulkDownloadButton);

    downloadDetailsButton.disabled = shouldBeDisabled.details;
    if (shouldBeDisabled.details) setButtonSuccess(downloadDetailsButton);
    else resetButtonStyles(downloadDetailsButton);

    downloadCoverButton.disabled = shouldBeDisabled.artwork;
    if (shouldBeDisabled.artwork) setButtonSuccess(downloadCoverButton);
    else resetButtonStyles(downloadCoverButton);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isValidYotoPage = tab?.url?.includes('play.yotoplay.com/card/') || 
                         tab?.url?.includes('share.yoto.co/');

  if (isValidYotoPage) {
    try {
      await ensureContentScript(tab.id);
      
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCurrentState' });
      updateUI(response || { status: 'Ready to backup your card content' }, true);
    } catch (error) {
      console.error('Error initializing popup:', error);
      updateUI(null, true);
    }
  } else {
    updateUI(null, false);
  }

  bulkDownloadButton.addEventListener('click', () => {
    if (!bulkDownloadButton.disabled) {
      chrome.tabs.sendMessage(tab.id, { action: 'bulkDownload' });
    }
  });

  downloadCoverButton.addEventListener('click', () => {
    if (!downloadCoverButton.disabled) {
      chrome.tabs.sendMessage(tab.id, { action: 'downloadCoverArt' });
    }
  });

  downloadDetailsButton.addEventListener('click', () => {
    if (!downloadDetailsButton.disabled) {
      chrome.tabs.sendMessage(tab.id, { action: 'downloadCardDetails' });
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'buttonStateChange') {
      if (isValidYotoPage) {
          chrome.tabs.sendMessage(tab.id, { action: 'getCurrentState' })
            .then(response => updateUI(response, true))
            .catch(error => console.error('Error getting state after button change:', error));
      }
    } else if (message.type === 'downloadProgress') {
      const progress = message.progress;
      const state = {
        inProgress: progress < 100,
        progress: progress,
        status: progress === 0 ? 'Downloading files...' : 
                progress === 100 ? 'Backup Complete!' : statusText.textContent,
        statusColor: progress === 100 ? 'var(--system-green)' : 'var(--text-secondary)',
        error: null,
      };
      updateUI(state, isValidYotoPage);

      if (progress === 100) {
        setTimeout(() => {
           if (isValidYotoPage) {
               chrome.tabs.sendMessage(tab.id, { action: 'getCurrentState' })
                 .then(response => updateUI(response, true))
                 .catch(error => console.error('Error getting state after progress complete:', error));
           }
        }, 1000);
      }
    } else if (message.type === 'downloadError') {
      const state = {
          inProgress: false,
          progress: 0,
          status: `Error: ${message.error}`,
          statusColor: 'var(--system-red)',
          error: message.error,
      };
      updateUI(state, isValidYotoPage);
    }
  });
}); 