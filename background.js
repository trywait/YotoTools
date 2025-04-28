importScripts('jszip.min.js');

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
  } else if (message.action === 'createAndDownloadZip') {
    console.log("Background received createAndDownloadZip action.");
    const tabId = sender.tab?.id;
    if (!tabId) {
        console.error("Could not get tab ID from sender for createAndDownloadZip");
        // Send an error state back if possible, though we lack the tabId
        sendUpdateState({ 
            status: "ZIP Error: Internal error (missing tab ID)",
            inProgress: false, 
            error: true, 
            statusColor: 'red' 
        }, tabId); 
        return; // Stop processing
    }
    // Call the handler function, passing the data payload AND the tabId
    handleCreateAndDownloadZip(message.data, tabId)
        .then(() => {
            // NO sendResponse here - communication handled by sendUpdateState
            console.log("handleCreateAndDownloadZip promise resolved (process likely ongoing).");
        })
        .catch(error => {
            console.error("Error caught after calling handleCreateAndDownloadZip:", error);
            // NO sendResponse here - sendUpdateState handles UI feedback
            // Ensure sendUpdateState is called within the catch block, passing tabId
            sendUpdateState({ 
                status: `ZIP Error: ${error.message}`.substring(0, 100),
                inProgress: false, 
                error: true, 
                statusColor: 'red' 
            }, tabId); // Pass tabId here too
        });
  }
  // Add other message handlers if needed
});

// Helper function to send state updates consistently
function sendUpdateState(state, tabId = null) {
    // Store the latest state
    chrome.storage.local.set({ downloadState: state });

    // Send message to the specific content script tab if tabId is provided,
    // otherwise broadcast (e.g., for popup updates)
    const messagePayload = { action: "updateState", state: state };
    if (tabId) {
        chrome.tabs.sendMessage(tabId, messagePayload)
            .catch(error => {
                 // Errors expected if the tab was closed or navigated away
                 if (!error.message.includes("Could not establish connection") && !error.message.includes("No tab with id")) {
                     console.warn(`Error sending specific state update to tab ${tabId}:`, error);
                 }
            });
    } else {
        // Fallback to runtime.sendMessage (e.g., for popup)
        chrome.runtime.sendMessage(messagePayload)
            .catch(error => {
                 // Ignore "Could not establish connection" errors if popup isn't open or content script isn't ready
                 if (!error.message.includes("Could not establish connection")) {
                     console.warn('Error broadcasting state update (runtime):', error);
                 }
            });
    }
}

// Helper function to fetch assets as blobs
async function fetchAsset(url) {
    // Use CORS proxy if necessary, or handle potential CORS errors
    // For now, assume direct fetch works for the provided URLs (may need adjustment)
    const response = await fetch(url); 
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return await response.blob();
}

// Main handler for creating and downloading the ZIP
async function handleCreateAndDownloadZip(data, tabId) {
    const { cardTitle, baseFilename, coverArt, details, icons, audio } = data;
    
    // Check if JSZip is loaded
    if (typeof JSZip === 'undefined') {
        console.error("JSZip library is not loaded!");
        sendUpdateState({ status: 'Error: JSZip library failed to load.', inProgress: false, error: true, statusColor: 'red' }, tabId);
        throw new Error("JSZip library not loaded."); // Throw error to be caught by the caller
    }

    const zip = new JSZip();
    let filesProcessed = 0;
    // Calculate total files more accurately (check if items exist)
    const totalFiles = (details ? 1 : 0) +
                       (coverArt?.url ? 1 : 0) +
                       (icons?.filter(icon => icon.url).length || 0) +
                       (audio?.filter(track => track.url).length || 0);

    // Use the consistent state update helper, passing tabId
    const sendProgress = (status, progressPercentage) => {
        // Ensure progress doesn't exceed 100 or go below 0
        const clampedProgress = Math.max(0, Math.min(100, Math.round(progressPercentage)));
        sendUpdateState({ 
            status: `ZIP: ${status}`,
            progress: clampedProgress, 
            inProgress: true 
        }, tabId); // Pass tabId here
    };

    try {
        // Initial state is implicitly 0%
        // sendProgress("Initializing...", 0); // Not strictly needed if UI starts at 0

        // --- Stage 1: Fetching/Adding Files (0% -> 70%) ---
        const fileFetchingProgressScale = 70; // Allocate 70% of the bar to this stage

        // 1. Add Details Txt
        if (details) {
            zip.file(details.filename, details.content);
            filesProcessed++;
            // Calculate progress within the 0-70 range
            const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
            sendProgress(`Added ${details.filename}`, currentProgress);
        }

        // 2. Fetch and Add Cover Art
        if (coverArt?.url) {
            // sendProgress(`Fetching Cover Art...`, (filesProcessed / totalFiles) * fileFetchingProgressScale); // Show progress *before* fetch
            try {
                const coverBlob = await fetchAsset(coverArt.url);
                const coverExtMatch = coverArt.url.match(/\.(\w+)(\?|$)/);
                const coverExt = coverExtMatch ? coverExtMatch[1] : 'jpg'; 
                const finalCoverFilename = coverArt.filename.replace('[ext]', coverExt);
                zip.file(finalCoverFilename, coverBlob);
                filesProcessed++;
                const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
                sendProgress(`Added Cover Art`, currentProgress);
            } catch (fetchError) {
                console.error(`Failed to fetch/add Cover Art (${coverArt.url}):`, fetchError);
                // Update progress even on error, but don't increment filesProcessed
                const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
                sendProgress(`Error fetching Cover Art`, currentProgress);
            }
        }

        // 3. Fetch and Add Icons
        if (icons) {
            for (let i = 0; i < icons.length; i++) {
                const icon = icons[i];
                if (icon?.url) {
                     const iconFilenameForLog = icon.filename || 'unknown_icon_filename';
                    //  sendProgress(`Fetching Icon ${i + 1}...`, (filesProcessed / totalFiles) * fileFetchingProgressScale);
                     try {
                         const iconBlob = await fetchAsset(icon.url);
                         zip.file(icon.filename, iconBlob);
                         filesProcessed++;
                         const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
                         sendProgress(`Added Icon ${i + 1}`, currentProgress);
                    } catch (fetchError) {
                         console.error(`ZIP: Failed to fetch/add Icon ${i + 1} (${icon.url}, Filename: ${iconFilenameForLog}):`, fetchError);
                         const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
                         sendProgress(`Error fetching Icon ${i + 1}`, currentProgress);
                    }
                }
            }
        }

        // 4. Fetch and Add Audio
        if (audio) {
            for (let i = 0; i < audio.length; i++) {
                const track = audio[i];
                 if (track?.url) {
                    const audioFilenameForLog = track.filename || 'unknown_audio_filename';
                    // sendProgress(`Fetching Audio ${i + 1}...`, (filesProcessed / totalFiles) * fileFetchingProgressScale);
                    try {
                        const audioBlob = await fetchAsset(track.url);
                        zip.file(track.filename, audioBlob);
                        filesProcessed++;
                        const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
                        sendProgress(`Added Audio ${i + 1}`, currentProgress);
                    } catch (fetchError) {
                         console.error(`ZIP: Failed to fetch/add Audio ${i + 1} (${track.url}, Filename: ${audioFilenameForLog}):`, fetchError);
                         const currentProgress = (filesProcessed / totalFiles) * fileFetchingProgressScale;
                         sendProgress(`Error fetching Audio ${i + 1}`, currentProgress);
                    }
                 }
            }
        }

        // --- Stage 2: Generating ZIP (70% -> 95%) ---
        const zipGenerationStartProgress = 70;
        const zipGenerationProgressScale = 25; // Allocate 25% of the bar (70 to 95)
        sendProgress("Compressing ZIP...", zipGenerationStartProgress);
        const zipBlob = await zip.generateAsync(
            { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
            (metadata) => {
                // Update progress during zipping using metadata.percent
                if (metadata.percent) {
                     const zipProgress = metadata.percent;
                     // Calculate progress within the 70-95 range
                     const overallProgress = zipGenerationStartProgress + (zipProgress / 100) * zipGenerationProgressScale;
                     sendProgress(`Compressing... ${zipProgress.toFixed(0)}%`, overallProgress); 
                }
            }
        );

        // --- Stage 3: Triggering Download (95% -> 100%) ---
        const downloadStartProgress = 95;
        sendProgress("Preparing download...", downloadStartProgress);

        // Use FileReader to convert Blob to Data URL
        const reader = new FileReader();
        reader.readAsDataURL(zipBlob);
        reader.onloadend = async () => {
            // ... (FileReader success/error handling remains the same, uses sendUpdateState directly)
            // Final success state sets progress to 100 implicitly
            const base64data = reader.result;
            if (!base64data) {
                 console.error("FileReader failed to read Blob as Data URL.");
                 sendUpdateState({ 
                     status: "ZIP Error: Failed to generate download link.",
                     progress: 0, // Reset progress on failure
                     inProgress: false, 
                     error: true, 
                     statusColor: 'red' 
                 }, tabId);
                 return;
            }

            try {
                // Indicate download is starting (closer to 100%)
                sendProgress("Initiating download...", 99);
                const downloadId = await chrome.downloads.download({
                    url: base64data,
                    filename: `${cardTitle}.zip`, // Use the original card title
                    saveAs: false // Or true if you want user to confirm location
                });
                console.log("[Background] Download initiated via chrome.downloads.download. Download ID:", downloadId);

                // Send final success state AFTER download initiated (sets progress 100)
                console.log("[Background] Attempting to send FINAL success updateState:", { status: "ZIP Download Complete!", progress: 100, inProgress: false, statusColor: 'green' });
                sendUpdateState({ 
                    status: "ZIP Download Complete!", 
                    progress: 100, 
                    inProgress: false, 
                    statusColor: 'green' 
                }, tabId); // Pass tabId
                console.log("[Background] FINAL success updateState sent.");

            } catch (downloadError) {
                 console.error("chrome.downloads.download failed with Data URL:", downloadError);
                 throw new Error(`Failed to start download: ${downloadError.message}`); 
            }
        };
        reader.onerror = (error) => {
             console.error("FileReader error reading Blob:", error);
             sendUpdateState({ 
                 status: "ZIP Error: Failed read generated file data.",
                 progress: 0, // Reset progress on failure
                 inProgress: false, 
                 error: true, 
                 statusColor: 'red' 
             }, tabId); // Pass tabId
        };
        
    } catch (error) {
        // ... (existing catch block is fine, already passes tabId and sets progress 0)
        console.error("ZIP creation/download failed:", error);
        sendUpdateState({ 
            status: `ZIP Error: ${error.message}`.substring(0, 100),
            progress: 0, 
            inProgress: false, 
            error: true, 
            statusColor: 'red' 
        }, tabId); // Pass tabId
    }
}

// Optional: Listener for download changes (logging, etc.)
chrome.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === 'complete') {
    console.log(`Download ${delta.id} completed.`);
  } else if (delta.error) {
      console.error(`Download ${delta.id} failed:`, delta.error.current);
  }
}); 