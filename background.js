// Initialize state in storage
chrome.storage.local.get('downloadState', (result) => {
  if (!result.downloadState) {
    chrome.storage.local.set({
      downloadState: {
        inProgress: false,
        progress: 0,
        status: 'Ready to backup your card content',
        statusColor: 'var(--text-secondary)',
        error: null
      }
    });
  }
});

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
    // Update state in storage
    const newState = {
      inProgress: message.progress < 100,
      progress: message.progress,
      error: null
    };

    if (message.progress === 0) {
      newState.status = 'Downloading files...';
      newState.statusColor = 'var(--text-secondary)';
    } else if (message.progress === 100) {
      newState.status = 'Backup Complete!';
      newState.statusColor = 'var(--system-green)';
    }

    chrome.storage.local.set({ downloadState: newState });

    // If complete, reset state after delay
    if (message.progress === 100) {
      setTimeout(() => {
        chrome.storage.local.set({
          downloadState: {
            inProgress: false,
            progress: 0,
            status: 'Ready to backup your card content',
            statusColor: 'var(--text-secondary)',
            error: null
          }
        });
      }, 1000);
    }

    // Forward progress message
    chrome.runtime.sendMessage(message).catch(error => {
      if (!error.message.includes("Could not establish connection")) {
        console.error('Error forwarding message:', error);
      }
    });
  } else if (message.type === 'downloadError') {
    // Update state in storage
    const errorState = {
      inProgress: false,
      progress: 0,
      status: `Error: ${message.error}`,
      statusColor: 'var(--system-red)',
      error: message.error
    };
    
    chrome.storage.local.set({ downloadState: errorState });

    // Forward error message
    chrome.runtime.sendMessage(message).catch(error => {
      if (!error.message.includes("Could not establish connection")) {
        console.error('Error forwarding message:', error);
      }
    });
  } else if (message.type === 'getDownloadState') {
    // Get current state from storage
    chrome.storage.local.get('downloadState', (result) => {
      sendResponse(result.downloadState);
    });
    return true;
  } else if (message.type === 'downloadFile') {
    // Handle file downloads
    chrome.downloads.download({
      url: message.url,
      filename: message.filename,
      conflictAction: 'uniquify'
    }).catch(error => {
      console.error('Download error:', error);
      const errorMessage = {
        type: 'downloadError',
        error: 'Failed to download file'
      };
      
      // Update state in storage
      chrome.storage.local.set({
        downloadState: {
          inProgress: false,
          progress: 0,
          status: `Error: ${errorMessage.error}`,
          statusColor: 'var(--system-red)',
          error: errorMessage.error
        }
      });
      
      chrome.runtime.sendMessage(errorMessage);
    });
  }
}); 