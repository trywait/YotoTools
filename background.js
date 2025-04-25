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
    // Ensure the filename includes a subdirectory based on card title
    chrome.downloads.download({
      url: message.url,
      filename: message.filename, // filename should already include the directory
      conflictAction: 'uniquify' // Avoid overwriting files
    }).then(downloadId => {
      console.log(`Download started for ${message.filename} with ID: ${downloadId}`);
      // Optional: Handle success/failure feedback via sendResponse if needed
      // sendResponse({success: true}); 
    }).catch(error => {
      console.error(`Download failed for ${message.filename}:`, error);
      // sendResponse({success: false, error: error.message});
    });
    // Return true here if you need sendResponse to work asynchronously after the listener returns
    // return true; // Uncomment if download completion feedback is needed
    
  } else if (message.type === 'fetchApiData' && message.cardId) {
    console.log(`Background script received request to fetch API data for card: ${message.cardId}`);
    const contentUrl = `https://api.yotoplay.com/content/${message.cardId}`;
    const resolveUrl = `https://api.yotoplay.com/card/resolve/${message.cardId}`; // New resolve endpoint
    
    // Use async function to handle fetch and response
    (async () => {
      try {
        // Get the token passed from the content script
        const authToken = message.authToken;
        if (!authToken) {
          console.error("Authentication token not received from content script.");
          sendResponse({ success: false, error: "Authentication token missing." });
          return;
        }
        
        // Define common headers
        const headers = {
          'Accept': 'application/json',
          'Authorization': authToken // Use the received token
        };

        // 1. Fetch content details
        console.log(`Fetching content details from: ${contentUrl}`);
        const contentResponse = await fetch(contentUrl, {
          method: 'GET',
          headers: headers
          // credentials: 'include', // Consider if needed; usually token is sufficient
        });

        console.log(`Content fetch status for ${message.cardId}: ${contentResponse.status}`);

        if (!contentResponse.ok) {
          const errorText = await contentResponse.text();
          console.error(`Content fetch failed for ${message.cardId}: ${contentResponse.status} ${contentResponse.statusText}`, errorText);
          sendResponse({ success: false, error: `API Error (Content): ${contentResponse.status} ${contentResponse.statusText}` });
          return; // Stop if content fetch fails
        }
          
        const contentData = await contentResponse.json();
        console.log(`Successfully fetched content data for ${message.cardId}`); // Log success, maybe not the whole data object initially

        // 2. Fetch resolved URLs
        console.log(`Fetching resolved URLs from: ${resolveUrl}`);
        const resolveResponse = await fetch(resolveUrl, {
            method: 'GET',
            headers: headers
            // credentials: 'include', // Consider if needed
        });

        console.log(`Resolve fetch status for ${message.cardId}: ${resolveResponse.status}`);

        if (resolveResponse.ok) {
            const resolveData = await resolveResponse.json();
            console.log(`Successfully fetched resolved data for ${message.cardId}.`); // Removed verbose data logging
            
            // Send the RESOLVED data back, as it contains the signed URLs needed by content.js
            sendResponse({ success: true, data: resolveData }); 

        } else {
            const errorText = await resolveResponse.text();
            console.error(`Resolve fetch failed for ${message.cardId}: ${resolveResponse.status} ${resolveResponse.statusText}`, errorText);
            // Still send back the content data we got, but maybe indicate resolve failure?
            sendResponse({ success: true, data: contentData, resolveError: `API Error (Resolve): ${resolveResponse.status} ${resolveResponse.statusText}` }); 
        }

      } catch (error) {
        console.error(`Network error during API fetch sequence for ${message.cardId}:`, error);
        sendResponse({ success: false, error: `Network Error: ${error.message}` });
      }
    })(); // Immediately invoke the async function
    
    return true; // Required to indicate sendResponse will be called asynchronously
  }
  // Add other message handlers if needed
});

// Optional: Listener for download changes (logging, etc.)
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log(`Download ${delta.id} completed.`);
  } else if (delta.error) {
      console.error(`Download ${delta.id} failed:`, delta.error.current);
  }
}); 