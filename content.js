const IS_MY_YOTO_DOMAIN = window.location.hostname === 'my.yotoplay.com';
const IS_SHARE_DOMAIN = ['play.yotoplay.com', 'share.yoto.co'].includes(window.location.hostname);

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    // Respond to ping to confirm content script is loaded
    sendResponse({ status: 'ok' });
    return true;
  } else if (message.action === 'viewMediaLinks') {
    if (IS_SHARE_DOMAIN) {
      injectDownloadButtons();
    } else {
      console.warn('viewMediaLinks not implemented for this domain');
      sendResponse({ status: 'error', message: 'Not implemented for this domain'});
    }
  } else if (message.action === 'bulkDownload') {
    if (IS_MY_YOTO_DOMAIN) {
      bulkDownloadMyYoto();
    } else if (IS_SHARE_DOMAIN) {
    bulkDownload();
    }
  } else if (message.action === 'downloadCoverArt') {
    if (IS_MY_YOTO_DOMAIN) {
      downloadCoverArtMyYoto();
    } else if (IS_SHARE_DOMAIN) {
      (async () => {
        const button = document.querySelector('.yoto-tools-cover-button');
        const originalText = 'Save Cover';
        if (button) setButtonWorking(button, 'Saving...');
        try {
          const result = await downloadCoverArt();
          if (button) {
            if (result.success) {
              setButtonSuccess(button, originalText);
            } else {
              setButtonError(button, originalText);
            }
          }
          sendResponse(result);
        } catch (error) {
          console.error("Error in downloadCoverArt message handler:", error);
          if (button) setButtonError(button, originalText);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }
  } else if (message.action === 'getMediaLinks') {
    if (IS_SHARE_DOMAIN) {
    getMediaLinks().then(sendResponse);
    } else {
      console.warn('getMediaLinks not implemented for this domain');
      sendResponse({ links: [], error: 'Not implemented for this domain'});
    }
    return true;
  } else if (message.action === 'downloadCardDetails') {
    if (IS_MY_YOTO_DOMAIN) {
      downloadCardDetailsMyYoto().then(sendResponse);
    } else if (IS_SHARE_DOMAIN) {
       (async () => {
        const button = document.querySelector('.yoto-tools-details-button');
        const originalText = 'Save Details';
        if (button) setButtonWorking(button, 'Saving...');
        try {
          const result = await downloadCardDetails();
          if (button) {
            if (result.success) {
              setButtonSuccess(button, originalText);
            } else {
              setButtonError(button, originalText);
            }
          }
          sendResponse(result);
        } catch (error) {
          console.error("Error in downloadCardDetails message handler:", error);
          if (button) setButtonError(button, 'Save Details');
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
    }
  } else if (message.action === 'downloadIcons') {
    if (IS_SHARE_DOMAIN) {
      (async () => {
        const cardData = findAndParseData();
        if (!cardData) {
          sendResponse({ success: false, error: 'Could not find or parse card data' });
          return;
        }
        try {
          const folderName = sanitizeFileName(cardData.title);
          let imageNumber = 1;
          let downloadCount = 0;
          let errorCount = 0;
          const downloadPromises = [];
          
          cardData.content.chapters.forEach(chapter => {
            // Icon URL is per chapter, use track title for naming
            if (chapter.display?.icon16x16) {
              const iconUrl = chapter.display.icon16x16;
              chapter.tracks.forEach(track => {
                let fileExtension = iconUrl.split('.').pop()?.split('?')[0] || 'jpg';
                if (!['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension.toLowerCase())) {
                  fileExtension = 'jpg';
                }
                const iconFileName = sanitizeFileName(`${imageNumber} - ${track.title}.${fileExtension}`);
                downloadPromises.push(
                  chrome.runtime.sendMessage({
                    type: 'downloadFile',
                    url: iconUrl,
                    filename: `${folderName}/${iconFileName}`
                  }).then(() => {
                    downloadCount++;
                    // Find the corresponding button on the page and update it
                    const iconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${imageNumber - 1}"]`); 
                    if (iconButton) setButtonSuccess(iconButton, 'Save Icon');
                  }).catch(err => {
                    console.error(`Error downloading icon ${imageNumber}:`, err);
                    errorCount++;
                    const iconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${imageNumber - 1}"]`);
                    if (iconButton) setButtonError(iconButton, 'Save Icon');
                  })
                );
                imageNumber++;
              });
            }
          });

          await Promise.allSettled(downloadPromises);

          if (errorCount === 0) {
            updateStatus('Icons downloaded successfully!', 'green');
            // --- Ensure all page icon buttons are set to success --- 
            const allTrackIconButtons = document.querySelectorAll('.yoto-tools-icon-button');
            allTrackIconButtons.forEach(btn => setButtonSuccess(btn, 'Save Icon'));
            // --- Also update the main page Icons button --- 
            const pageIconsButton = document.getElementById('yoto-tools-page-icons-button');
            if (pageIconsButton) setButtonSuccess(pageIconsButton, 'Save Icons');
            // --- ADD explicit update for main page Audio button --- 
            const pageAudioButton = document.getElementById('yoto-tools-page-audio-button');
            if (pageAudioButton) setButtonSuccess(pageAudioButton, 'Save Audio');
            // ----------------------------------------------
            sendResponse({ success: true, count: downloadCount });
          } else {
            updateStatus(`Downloaded ${downloadCount} icons with ${errorCount} error(s).`, 'orange');
            sendResponse({ success: false, error: `${errorCount} download(s) failed`, count: downloadCount });
          }

        } catch (error) {
          console.error('Error downloading icons:', error);
          updateStatus(`Error downloading icons: ${error.message}`, 'red');
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Indicate async response
    }
  } else if (message.action === 'downloadAudio') {
    if (IS_SHARE_DOMAIN) {
      (async () => {
        const cardData = findAndParseData();
        if (!cardData) {
          sendResponse({ success: false, error: 'Could not find or parse card data' });
          return;
        }
        try {
          const folderName = sanitizeFileName(cardData.title);
          let trackNumber = 1;
          let downloadCount = 0;
          let errorCount = 0;
          const downloadPromises = [];

          cardData.content.chapters.forEach(chapter => {
            chapter.tracks.forEach(track => {
              if (track.trackUrl) {
                // const audioFileName = sanitizeFileName(`Track ${String(trackNumber).padStart(2, '0')} - ${track.title}.${track.format || 'aac'}`);
                const audioFileName = sanitizeFileName(`${String(trackNumber).padStart(2, '0')} - ${track.title}.${track.format || 'aac'}`); // Removed 'Track ' prefix
                downloadPromises.push(
                  chrome.runtime.sendMessage({
                    type: 'downloadFile',
                    url: track.trackUrl,
                    filename: `${folderName}/${audioFileName}`
                  }).then(() => {
                    downloadCount++;
                    // Find the corresponding button on the page and update it
                    const audioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${trackNumber - 1}"]`); 
                    if (audioButton) setButtonSuccess(audioButton, 'Save Audio');
                  }).catch(err => {
                    console.error(`Error downloading audio ${trackNumber}:`, err);
                    errorCount++;
                    const audioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${trackNumber - 1}"]`);
                    if (audioButton) setButtonError(audioButton, 'Save Audio');
                  })
                );
                trackNumber++;
              } else {
                 // Increment track number even if URL is missing to keep index consistent
                 trackNumber++; 
              }
            });
          });

          await Promise.allSettled(downloadPromises);

          if (errorCount === 0) {
            updateStatus('Audio tracks downloaded successfully!', 'green');
            // --- Ensure all page audio buttons are set to success --- 
            const allAudioButtons = document.querySelectorAll('.yoto-tools-audio-button');
            allAudioButtons.forEach(btn => setButtonSuccess(btn, 'Save Audio'));
            // ------------------------------------------------------
            sendResponse({ success: true, count: downloadCount });
          } else {
            updateStatus(`Downloaded ${downloadCount} audio tracks with ${errorCount} error(s).`, 'orange');
            sendResponse({ success: false, error: `${errorCount} download(s) failed`, count: downloadCount });
          }

        } catch (error) {
          console.error('Error downloading audio tracks:', error);
          updateStatus(`Error downloading audio: ${error.message}`, 'red');
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Indicate async response
    }
  } else if (message.action === 'updateState') { // Message from background
    // Update UI based on state received from background (e.g., progress, status)
    const state = message.state;
    if (state.status) {
        updateStatus(state.status, state.statusColor || (state.error ? 'red' : 'var(--text-secondary, #555)'));
    }
    if (state.inProgress && typeof state.progress !== 'undefined') {
        // Determine current and total based on status string? Or pass explicitly?
        // For now, just show percentage if provided.
        showProgress(state.progress);
    } else {
        hideProgress();
    }

    // Determine which main button to update based on status message content
    // This is a bit fragile, might need a better way (e.g., source ID in state)
    const zipButton = document.getElementById('yoto-tools-download-zip-btn');
    const backupButton = document.getElementById('yoto-tools-page-backup-button'); // Assuming this ID exists or similar for the original button

    if (state.status && state.status.toLowerCase().includes('zip')) {
         // Update ZIP button specifically
         if (zipButton) {
            if (!state.inProgress) {
                 if (state.error) {
                    setButtonError(zipButton, 'Save All (Zip)');
                 } else {
                    setButtonSuccess(zipButton, 'Save All (Zip)');
                 }
            } else {
                 setButtonWorking(zipButton, 'Zipping...'); // Use generic text while in progress
            }
         }
    } else if (backupButton) {
         // Update original backup button (or other relevant buttons if not zip-related)
          if (!state.inProgress) {
            if (state.error) {
                setButtonError(backupButton, 'Save All'); // Adjust original text if needed
            }
        }
    }


  } else if (message.action === 'createAndDownloadZip') {
      // This message is primarily handled by background.js
      // content.js only *sends* this message via initiateBulkZipDownload
      console.warn("content.js received createAndDownloadZip, should be handled by background.");
  }
});

// ==============================================
// == Domain-Specific Data Extraction & Parsing ==
// ==============================================

// --- SHARE DOMAIN (play.yotoplay.com, share.yoto.co) --- 

function findAndParseData() {
  // First, find the script element by its ID
  const scriptElement = document.getElementById('__NEXT_DATA__');

  // Check if the element exists
  if (!scriptElement || !scriptElement.textContent) {
    console.error('Script element not found or empty');
    return null;
  }

  try {
    // Parse the JSON content of the script element
    const jsonData = JSON.parse(scriptElement.textContent);

    // Get the card title from the page
    const titleElement = document.querySelector('h1.card-title');
    const title = titleElement ? titleElement.textContent : null;

    // Get the cover art from the page
    const coverArtImg = document.querySelector('.card img');
    const coverArtUrl = coverArtImg ? coverArtImg.src : null;

    // Navigate to the specific path where trackUrl, title, and icon16x16 are located
    if (jsonData?.props?.pageProps?.card?.content?.chapters) {
      const cardData = jsonData.props.pageProps.card;
      return {
        ...cardData,
        title: title || cardData.title, // Use page title if available, fall back to JSON title
        coverArtUrl
      };
    }
  } catch (error) {
    console.error('Error parsing JSON data:', error);
  }

  return null;
}

// --- MY YOTO DOMAIN (my.yotoplay.com) --- 

async function findAndParseMyYotoData() {
  let domTitle = 'Unknown My Yoto Title';
  let domDescription = 'No description available';
  let domCoverArtUrl = null;
  let resolvedApiData = null; // Contains resolved data

  // Retrieve the access token from Local Storage
  const accessToken = localStorage.getItem('access_token');

  // --- 1. Request API data via Background Script --- 
  try {
      const pathParts = window.location.pathname.split('/');
      const cardId = pathParts[pathParts.indexOf('card') + 1];
      if (!accessToken) {
        console.error("Access token not found in Local Storage. Cannot fetch API data.");
        updateStatus("Error: Authentication token not found. Please log in.", "red");
        throw new Error("Access token not found");
      }

      if (cardId) {
          const response = await chrome.runtime.sendMessage({ 
              type: 'fetchApiData', 
              cardId: cardId,
              authToken: `Bearer ${accessToken}` // Send the token to the background script
          });
          
          // IMPORTANT: Background script now returns the data from /card/resolve/
          if (response && response.success && response.data) {
              resolvedApiData = response.data.card; // Access the nested 'card' object from the resolved data
              if (response.resolveError) {
                  console.warn("Background script reported an error during the resolve step:", response.resolveError);
              }
          } else {
              console.error("Failed to get resolved API data from background script:", response?.error || 'Unknown error');
          }
      } else {
          console.error("Could not extract Card ID from URL.");
      }
  } catch (e) {
      console.error("Error requesting resolved API data via background script:", e);
      if (e.message.includes("Could not establish connection")) {
          console.error("Ensure the background script has a listener for 'fetchApiData'.");
      }
  }
  
  // --- 2. Scrape essential data from DOM (potentially edited state) ---
  try {
      domTitle = document.querySelector('div.playlist-name-block input.MuiInputBase-input')?.value || resolvedApiData?.title || domTitle;
  } catch (e) { console.error("Error finding DOM title:", e); }
  
  try {
       const descriptionTextarea = document.querySelector('textarea[placeholder*="Optional, maximum 500 characters."]');
       domDescription = descriptionTextarea?.value?.trim() || resolvedApiData?.metadata?.description || domDescription;
  } catch (e) { console.error("Error finding DOM description:", e); }
  
  try {
      domCoverArtUrl = document.querySelector('img.card-cover-editable')?.src || resolvedApiData?.metadata?.cover?.imageL || null;
  } catch (e) { console.error("Error finding DOM cover art:", e); }

  // --- 3. Process Tracks (Combine DOM and API data) ---
  const tracks = [];
  try {
      const trackElements = document.querySelectorAll('div[style*="border-bottom-style"] > table > tbody > tr'); 
      
      // Flatten API tracks from the RESOLVED data for easier lookup
      const resolvedApiTracks = resolvedApiData?.content?.chapters?.flatMap(ch => ch.tracks) || [];
      
      trackElements.forEach((el, index) => {
          let trackTitle = `Track ${index + 1}`;
          let domIconUrl = null;
          let resolvedTrackUrl = null; // Will store the FINAL signed URL
          let resolvedApiIconUrl = null;
          let fileSize = null;
          let duration = null;
          let format = null;

          try {
              // Get title and icon URL from DOM (as they might be edited)
              trackTitle = el.querySelector('textarea.MuiInputBase-input')?.value || trackTitle;
              domIconUrl = el.querySelector('img.trackIcon')?.src || null;
              
              // Find corresponding track in RESOLVED API data (using index)
              if (resolvedApiTracks[index]) {
                   resolvedTrackUrl = resolvedApiTracks[index].trackUrl; // Signed URL
                   resolvedApiIconUrl = resolvedApiTracks[index].display?.icon16x16; 
                   fileSize = resolvedApiTracks[index].fileSize;
                   duration = resolvedApiTracks[index].duration;
                   format = resolvedApiTracks[index].format;
                   
                   // Validate the resolved URL looks like a signed URL
                   if (resolvedTrackUrl && !resolvedTrackUrl.startsWith('https://secure-media.yotoplay.com')) {
                       console.warn(`Track ${index + 1} resolved URL doesn't look like a signed URL:`, resolvedTrackUrl);
                   }
              } else {
                  console.warn(`No corresponding track found in resolved API data for DOM track index ${index}`);
              }
          } catch (e) {
              console.error(`Error processing data for track ${index}:`, e);
          }
          
          tracks.push({
              title: trackTitle, // Primarily from DOM
              trackUrl: resolvedTrackUrl, // FINAL signed URL from resolved API data
              iconUrl: domIconUrl || resolvedApiIconUrl, // Prefer DOM icon, fallback to resolved API icon
              fileSize: fileSize,
              duration: duration,
              format: format
          });
      });
  } catch (e) {
      console.error("Error processing track elements:", e);
  }
  
  // Return combined data
  return {
    title: domTitle,
    coverArtUrl: domCoverArtUrl,
    description: domDescription,
    tracks: tracks
  };
}

// =====================================
// == Domain-Specific Download Actions ==
// =====================================

// --- SHARE DOMAIN --- 

// Note: This function is likely deprecated as direct link viewing isn't the primary goal.
function viewMediaLinks() {
  const cardData = findAndParseData();
  if (!cardData) {
    console.error('Could not find or parse card data');
    return;
  }

  const container = document.createElement('div');
  container.style.margin = '20px';
  container.style.backgroundColor = '#deefff';
  container.style.padding = '20px';
  container.style.borderRadius = '8px';

  const containerTitle = document.createElement('h2');
  containerTitle.textContent = cardData.title || 'Yoto Card';
  container.appendChild(containerTitle);

  const containerP = document.createElement('p');
  containerP.textContent = `${cardData.description || 'Download links for audio files and images.'} Right click and select "Save Link As" to save an individual file.`;
  container.appendChild(containerP);

  if (cardData.coverArtUrl) {
    const coverArtLink = document.createElement('a');
    coverArtLink.href = cardData.coverArtUrl;
    coverArtLink.textContent = `Cover Art: ${cardData.title}`;
    coverArtLink.target = '_blank';
    coverArtLink.style.display = 'block';
    coverArtLink.style.marginBottom = '16px';
    coverArtLink.style.color = '#1a73e8';
    coverArtLink.style.textDecoration = 'none';
    coverArtLink.style.fontWeight = 'bold';
    container.appendChild(coverArtLink);
  }
  
  let trackNumber = 1;
  let imageNumber = 1;

  cardData.content.chapters.forEach(chapter => {
    chapter.tracks.forEach(track => {
      if (track.trackUrl) {
        const trackLink = document.createElement('a');
        trackLink.href = track.trackUrl;
        trackLink.textContent = `Track ${trackNumber}: ${track.title}`;
        trackLink.target = '_blank';
        trackLink.style.display = 'block';
        trackLink.style.marginBottom = '8px';
        trackLink.style.color = '#1a73e8';
        trackLink.style.textDecoration = 'none';
        container.appendChild(trackLink);
        trackNumber++;
      }
      if (chapter.display?.icon16x16) {
        const imageLink = document.createElement('a');
        imageLink.href = chapter.display.icon16x16;
        imageLink.textContent = `Image ${imageNumber}: ${track.title}`;
        imageLink.target = '_blank';
        imageLink.style.display = 'block';
        imageLink.style.marginBottom = '8px';
        imageLink.style.color = '#1a73e8';
        imageLink.style.textDecoration = 'none';
        container.appendChild(imageLink);
        imageNumber++;
      }
    });
  });

  document.body.insertBefore(container, document.body.firstChild);
}

async function downloadCardDetails() {
  try {
    const cardTitle = document.querySelector('h1.card-title')?.textContent?.trim() || 'Unknown Title';
    const cardAuthor = document.querySelector('div.card-author b')?.textContent?.trim() || 'Unknown Author';
    const cardDescription = document.querySelector('div.card-description')?.textContent?.trim() || 'No description available';
    
    const cardData = findAndParseData();
    let trackList = 'No tracks available';
    if (cardData?.content?.chapters) {
      const tracks = cardData.content.chapters.flatMap(chapter => 
        chapter.tracks.map(track => track.title)
      );
      if (tracks.length > 0) {
        trackList = formatTrackList(tracks);
      }
    }

    const content = `Card Title: ${cardTitle}
Author: ${cardAuthor}

Description:
${cardDescription}

Track List:
${trackList}`;

    const folderName = sanitizeFileName(cardTitle);
    const fileName = sanitizeFileName(`${cardTitle} - Details.txt`);

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    await chrome.runtime.sendMessage({
      type: 'downloadFile',
      url: url,
      filename: `${folderName}/${fileName}`
    });

    // Clean up the blob URL
    URL.revokeObjectURL(url);

    return { success: true };
  } catch (error) {
    console.error('Error downloading card details:', error);
    return { success: false, error: error.message };
  }
}

async function downloadCoverArt() {
  const cardData = findAndParseData();
  if (!cardData || !cardData.coverArtUrl) {
    console.error('Could not find cover art');
    return { success: false, error: 'Cover art URL not found' };
  }

  try {
    const folderName = sanitizeFileName(cardData.title);
    const fileName = sanitizeFileName(`Cover Art - ${cardData.title}.jpg`);
    
    await chrome.runtime.sendMessage({
      type: 'downloadFile',
      url: cardData.coverArtUrl,
      filename: `${folderName}/${fileName}`
    });
    return { success: true };
  } catch (error) {
    console.error('Error downloading cover art:', error);
    return { success: false, error: error.message };
  }
}

async function bulkDownload() {
  const cardData = findAndParseData();
  if (!cardData) {
    console.error('Could not find or parse card data');
    return;
  }

  try {
    const mediaItems = [];
    let trackNumber = 1;
    let imageNumber = 1;
    
    if (cardData.coverArtUrl) {
      mediaItems.push({
        url: cardData.coverArtUrl,
        filename: sanitizeFileName(`Cover Art - ${cardData.title}.jpg`)
      });
    }
    
    cardData.content.chapters.forEach(chapter => {
      chapter.tracks.forEach(track => {
        if (track.trackUrl) {
          mediaItems.push({
            url: track.trackUrl,
            filename: sanitizeFileName(`${String(trackNumber).padStart(2, '0')} - ${track.title}.mp3`) // Removed 'Track ' prefix and added padding
          });
          trackNumber++;
        }
        if (chapter.display?.icon16x16) {
          mediaItems.push({
            url: chapter.display.icon16x16,
            filename: sanitizeFileName(`${imageNumber} - ${track.title}.jpg`) // Removed 'Image ' prefix
          });
          imageNumber++;
        }
      });
    });

    const folderName = sanitizeFileName(cardData.title);

    const cardTitle = document.querySelector('h1.card-title')?.textContent?.trim() || 'Unknown Title';
    const cardAuthor = document.querySelector('div.card-author b')?.textContent?.trim() || 'Unknown Author';
    const cardDescription = document.querySelector('div.card-description')?.textContent?.trim() || 'No description available';
    
    let trackList = 'No tracks available';
    if (cardData.content.chapters) {
      const tracks = cardData.content.chapters.flatMap(chapter => 
        chapter.tracks.map(track => track.title)
      );
      if (tracks.length > 0) {
        trackList = formatTrackList(tracks);
      }
    }

    const cardDetailsContent = `Card Title: ${cardTitle}\nAuthor: ${cardAuthor}\n\nDescription:\n${cardDescription}\n\nTrack List:\n${trackList}`;
    const cardDetailsBlob = new Blob([cardDetailsContent], { type: 'text/plain' });
    const cardDetailsUrl = URL.createObjectURL(cardDetailsBlob);

    mediaItems.push({
      url: cardDetailsUrl,
      filename: sanitizeFileName(`${cardTitle} - Details.txt`)
    });

    let completed = 0;
    const total = mediaItems.length;

    updateStatus('Downloading files...');
    showProgress(0, total, 0);
    setButtonWorking(document.querySelector('.yoto-tools-bulk-button'), 'Downloading...');

    let errorCount = 0;
    for (const item of mediaItems) {
      try {
        const progressPercentage = Math.round((completed / total) * 100);
        showProgress(progressPercentage, total, completed);

        await chrome.runtime.sendMessage({
          type: 'downloadFile',
          url: item.url,
          filename: `${folderName}/${item.filename}`
        });

        completed++;
        showProgress(Math.round((completed / total) * 100), total, completed);

        // Update individual button state if it corresponds to this item
        if (item.filename.includes('Details.txt')) {
          const detailsButton = document.querySelector('.yoto-tools-details-button');
          if (detailsButton) setButtonSuccess(detailsButton, 'Save Details');
        } else if (item.filename.includes('Cover Art')) {
          const coverButton = document.querySelector('.yoto-tools-cover-button');
          if (coverButton) setButtonSuccess(coverButton, 'Save Cover');
        }

      } catch (error) {
        console.error(`Error downloading ${item.filename}:`, error);
        errorCount++;
      }
    }

    hideProgress();
    const bulkButton = document.querySelector('.yoto-tools-bulk-button');
    if (errorCount === 0) {
      updateStatus('Backup Complete!', 'green');
      if (bulkButton) setButtonSuccess(bulkButton, 'Save All');

      const audioButtons = document.querySelectorAll('.yoto-tools-audio-button');
      audioButtons.forEach(btn => setButtonSuccess(btn, 'Save Audio'));
      const iconButtons = document.querySelectorAll('.yoto-tools-icon-button');
      iconButtons.forEach(btn => setButtonSuccess(btn, 'Save Icon'));
      const pageIconsButton = document.getElementById('yoto-tools-page-icons-button');
      if (pageIconsButton) setButtonSuccess(pageIconsButton, 'Save Icons');
      const pageAudioButton = document.getElementById('yoto-tools-page-audio-button');
      if (pageAudioButton) setButtonSuccess(pageAudioButton, 'Save Audio');

    } else {
      updateStatus(`Backup completed with ${errorCount} error(s). Check console.`, 'orange');
      if (bulkButton) setButtonError(bulkButton, 'Save All');
    }

  } catch (error) {
      console.error('Error in bulk download:', error);
    hideProgress();
    updateStatus(`Bulk download failed: ${error.message}`, 'red');
    const bulkButton = document.querySelector('.yoto-tools-bulk-button');
      if (bulkButton) setButtonError(bulkButton, 'Save All');
  }
}

// --- MY YOTO DOMAIN --- 

async function downloadCardDetailsMyYoto() {
  try {
    const cardData = await findAndParseMyYotoData();
    if (!cardData) throw new Error("Could not parse My Yoto card data");

    const cardTitle = cardData.title;
    const cardAuthor = "MYO Card"; // Specific to MYO
    const cardDescription = cardData.description || 'No description available';

    // --- Correct logic for MYO track list --- 
    let trackList = 'No tracks available';
    if (cardData.tracks && cardData.tracks.length > 0) {
      // MYO data has a flat tracks array, so map titles directly
      trackList = formatTrackList(cardData.tracks.map(t => t.title)); 
    }
    // ------------------------------------------

    const content = `Card Title: ${cardTitle}\nAuthor: ${cardAuthor}\n\nDescription:\n${cardDescription}\n\nTrack List:\n${trackList}`;
    const folderName = sanitizeFileName(cardTitle);
    const fileName = sanitizeFileName(`${cardTitle} - Details.txt`);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    await chrome.runtime.sendMessage({
      type: 'downloadFile',
      url: url,
      filename: `${folderName}/${fileName}`
    });
    URL.revokeObjectURL(url);
    updateStatus('Card details downloaded successfully!', 'green');
    return { success: true };
  } catch (error) {
    console.error('Error downloading My Yoto card details:', error);
    updateStatus(`Error downloading details: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function downloadCoverArtMyYoto() {
  try {
    const cardData = await findAndParseMyYotoData();
    if (!cardData || !cardData.coverArtUrl) {
      updateStatus('Could not find cover art URL.', 'red');
      throw new Error('Could not find cover art URL');
    }

    const folderName = sanitizeFileName(cardData.title);
    const fileExtension = cardData.coverArtUrl.split('.').pop()?.split('?')[0] || 'jpg'; 
    const fileName = sanitizeFileName(`Cover Art - ${cardData.title}.${fileExtension}`);
    
    await chrome.runtime.sendMessage({
      type: 'downloadFile',
      url: cardData.coverArtUrl,
      filename: `${folderName}/${fileName}`
    });
    updateStatus('Cover art downloaded successfully!', 'green');
    return { success: true };
  } catch (error) {
    console.error('Error downloading My Yoto cover art:', error);
    updateStatus(`Error downloading cover art: ${error.message}`, 'red');
    return { success: false, error: error.message };
  }
}

async function bulkDownloadMyYoto() {
  console.log("Starting bulk download for My Yoto...");
  const cardData = await findAndParseMyYotoData();
  if (!cardData) {
    updateStatus('Could not parse card data for bulk download.', 'red');
    return;
  }
  
  const folderName = sanitizeFileName(cardData.title);
  updateStatus('Starting bulk download...', 'blue');

  // Calculate total downloads: Cover Art (1) + Details (1) + Icons (tracks.length) + Audio Tracks (tracks.length)
  const totalDownloads = (cardData.coverArtUrl ? 1 : 0) + 1 + (cardData.tracks?.length || 0) * 2; // Each track has icon + audio
  showProgress(0, totalDownloads);

  let downloadedCount = 0;
  let errorCount = 0;
  
  const updateProgress = (progress) => {
    const percentage = Math.round((progress / totalDownloads) * 100);
    showProgress(percentage, totalDownloads, progress);
  };

  try {
    // --- Download Cover Art (if available) --- 
    if (cardData.coverArtUrl) {
      try {
        const fileExtension = cardData.coverArtUrl.split('.').pop()?.split('?')[0] || 'jpg';
        const coverFileName = sanitizeFileName(`Cover Art - ${cardData.title}.${fileExtension}`);
        await chrome.runtime.sendMessage({
          type: 'downloadFile',
          url: cardData.coverArtUrl,
          filename: `${folderName}/${coverFileName}`
        });
        downloadedCount++;
        updateProgress(downloadedCount);
      } catch (err) {
        console.error('Error downloading cover art during bulk download:', err);
        errorCount++;
      }
    }
    
    // --- Download Card Details --- 
    try {
        const cardTitle = cardData.title;
        const cardAuthor = "MYO Card";
        const cardDescription = cardData.description || 'No description available';
        // const detailsTrackList = formatTrackList(cardData.content?.chapters || []); // Handles empty/missing chapters
        
        // --- Extract flat list of track titles, similar to downloadCardDetails ---
        let flatTrackTitles = [];
        if (cardData?.content?.chapters) {
            flatTrackTitles = cardData.content.chapters.flatMap(chapter => 
                chapter.tracks.map(track => track.title || 'Untitled Track') // Handle potentially missing titles
            );
        }
        const detailsTrackList = formatTrackList(flatTrackTitles); // Use the flat list
        // -------------------------------------------------------------------

        const cardDetailsContent = `Card Title: ${cardTitle}\nAuthor: ${cardAuthor}\n\nDescription:\n${cardDescription}\n\nTrack List:\n${detailsTrackList}`;
        const detailsFileName = sanitizeFileName(`${cardTitle} - Details.txt`);
        const blob = new Blob([cardDetailsContent], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        await chrome.runtime.sendMessage({
            type: 'downloadFile',
            url: url,
            filename: `${folderName}/${detailsFileName}`
        });
        URL.revokeObjectURL(url);
        downloadedCount++;
        updateProgress(downloadedCount);
        const detailsButton = document.querySelector('.yoto-tools-details-button');
        if (detailsButton) setButtonSuccess(detailsButton, 'Save Details');
    } catch(err) {
        console.error("Error downloading card details during bulk download:", err);
        errorCount++;
        const detailsButton = document.querySelector('.yoto-tools-details-button');
        if (detailsButton) setButtonError(detailsButton, 'Save Details');
    }

    // --- Download Track Icons --- 
    const audioDownloadPromises = [];
    if (cardData.tracks) {
        console.log("[Content-BULK] Looping through tracks for icons/audio:"); // Added log
        for (let i = 0; i < cardData.tracks.length; i++) {
          const track = cardData.tracks[i];
          console.log(`[Content-BULK] Track ${i + 1} ('${track.title}') format received:`, track.format); // Added log
          if (!track.iconUrl) continue;
          
          try {
            let fileExtension = track.iconUrl.split('.').pop()?.split('?')[0] || 'jpg';
             if (!['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension.toLowerCase())) {
                fileExtension = 'jpg';
             }
            const iconFileName = sanitizeFileName(`${i + 1} - ${track.title}.${fileExtension}`); // Removed 'Image ' prefix
    
            await chrome.runtime.sendMessage({
              type: 'downloadFile',
              url: track.iconUrl,
              filename: `${folderName}/${iconFileName}`
            });
            downloadedCount++;
            updateProgress(downloadedCount);
            const iconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${i}"]`);
            if (iconButton) setButtonSuccess(iconButton, 'Save Icon');
          } catch (err) {
            console.error(`Error downloading icon ${i + 1}:`, err);
            errorCount++;
            const iconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${i}"]`);
            if (iconButton) setButtonError(iconButton, 'Save Icon');
          }
          
          // --- Queue Audio Track Download --- 
          if (track.trackUrl && track.trackUrl.startsWith('https://secure-media.yotoplay.com')) {
              // ***** Non-ZIP Filename (My Yoto page) *****
              const audioFileName = sanitizeFileName(`${String(i + 1).padStart(2, '0')} - ${track.title}.${track.format || 'mp3'}`);
              audioDownloadPromises.push(
                  chrome.runtime.sendMessage({
                      type: 'downloadFile',
                      url: track.trackUrl,
                      filename: `${folderName}/${audioFileName}`
                  })
                  .then(() => {
                      downloadedCount++;
                      updateProgress(downloadedCount);
                      const audioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${i}"]`);
                      if (audioButton) {
                        setButtonSuccess(audioButton, 'Save Audio');
                      }
                  })
                  .catch(err => {
                      console.error(`Error downloading audio track ${i + 1}:`, err);
                      errorCount++;
                      const audioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${i}"]`);
                      if (audioButton) {
                        setButtonError(audioButton, 'Save Audio');
                      }
                  })
              );
          } else {
              console.warn(`Skipping audio download for track ${i+1} - No valid signed URL found.`);
          }
        }
    }

    // --- Wait for all queued audio downloads to attempt --- 
    await Promise.allSettled(audioDownloadPromises); 

    // --- Final status update --- 
    hideProgress();
    if (errorCount === 0) {
      updateStatus('Bulk download completed successfully!', 'green');
      console.log("Bulk download completed successfully for My Yoto.");
      const bulkButton = document.querySelector('.yoto-tools-bulk-button');
      if (bulkButton) setButtonSuccess(bulkButton, 'Save All');
      if (cardData.coverArtUrl) {
          const coverButton = document.querySelector('.yoto-tools-cover-button');
          if (coverButton) setButtonSuccess(coverButton, 'Save Cover');
      }
      const pageIconsButtonMyo = document.querySelector('.yoto-tools-icons-button-main');
      if (pageIconsButtonMyo) setButtonSuccess(pageIconsButtonMyo, 'Save Icons');
      const pageAudioButtonMyo = document.querySelector('.yoto-tools-audio-button-main');
      if (pageAudioButtonMyo) setButtonSuccess(pageAudioButtonMyo, 'Audio Saved');
    } else {
      updateStatus(`Bulk download completed with ${errorCount} error(s). Check console.`, 'orange');
      console.warn(`Bulk download completed with ${errorCount} error(s) for My Yoto.`);
      const bulkButton = document.querySelector('.yoto-tools-bulk-button');
      if (bulkButton) setButtonError(bulkButton, 'Save All');
    }

  } catch (error) {
    console.error('Error during bulk download:', error);
    hideProgress();
    updateStatus(`Bulk download failed: ${error.message}`, 'red');
    console.error("Bulk download failed for My Yoto:");
    const bulkButton = document.querySelector('.yoto-tools-bulk-button');
      if (bulkButton) setButtonError(bulkButton, 'Save All');
  }
}

// --- NEW HELPER: Gather Share Page Data for ZIP ---
async function gatherSharePageDataForZip() {
    const cardData = findAndParseData();
    if (!cardData || !cardData.title) {
        console.error('ZIP Prep: Could not find or parse card data for share page.');
        return null;
    }

    const cardTitle = cardData.title;
    const baseFilename = sanitizeFileName(cardTitle);

    // --- Gather URLs and content ---
    const coverArtUrl = cardData.coverArtUrl || null;

    // Reuse details generation logic (or parts of downloadCardDetails)
    const detailsTitle = document.querySelector('h1.card-title')?.textContent?.trim() || cardTitle;
    const detailsAuthor = document.querySelector('div.card-author b')?.textContent?.trim() || 'Unknown Author';
    const detailsDescription = document.querySelector('div.card-description')?.textContent?.trim() || 'No description available';
    
    // --- START: Replicate track list logic from downloadCardDetails --- 
    let detailsTrackList = 'No tracks available'; // Default value
    if (cardData?.content?.chapters) {
        // 1. Flatten the list of titles
        const flatTrackTitles = cardData.content.chapters.flatMap(chapter => 
            chapter.tracks.map(track => track.title || 'Untitled Track') // Handle potentially missing titles
        );
        // 2. Format the flat list
        if (flatTrackTitles.length > 0) {
             detailsTrackList = formatTrackList(flatTrackTitles);
        }
    }
    // --- END: Replicated logic ---

    const cardDetailsContent = `Card Title: ${detailsTitle}\nAuthor: ${detailsAuthor}\n\nDescription:\n${detailsDescription}\n\nTrack List:\n${detailsTrackList}`;

    const iconUrls = [];
    const audioUrls = [];
    let trackNumber = 1;
    let imageNumber = 1;

    cardData.content?.chapters?.forEach(chapter => {
        const chapterIconUrl = chapter.display?.icon16x16;
        chapter.tracks.forEach(track => {
            // Icon (Use chapter icon for every track within it)
            if (chapterIconUrl) {
                const iconExtMatch = chapterIconUrl.match(/\.(\w+)(\?|$)/);
                const iconExt = iconExtMatch ? iconExtMatch[1] : 'png';
                iconUrls.push({
                    url: chapterIconUrl,
                    filename: sanitizeFileName(`${imageNumber} - ${track.title || `Track ${imageNumber}`}.${iconExt}`) // Removed 'Image ' prefix
                });
                imageNumber++; // Increment per track if using chapter icon
            }
            // Audio
            if (track.trackUrl) {
                // *** Align with bulkDownload: Use .mp3 extension directly ***
                // const audioExt = track.format || 'aac'; 
                audioUrls.push({
                    url: track.trackUrl,
                    filename: sanitizeFileName(`${String(trackNumber).padStart(2, '0')} - ${track.title || `Track ${trackNumber}`}.mp3`) // REMOVED 'Track ' prefix INSIDE sanitize
                });
            }
            trackNumber++; // Increment for each track
        });
    });

    // --- Package Data --- 
    return {
        cardTitle: cardTitle,
        baseFilename: baseFilename,
        coverArt: coverArtUrl ? { url: coverArtUrl, filename: `Cover Art - ${baseFilename}.[ext]` } : null, // Placeholder for ext
        details: { content: cardDetailsContent, filename: `${baseFilename} - Details.txt` },
        icons: iconUrls,
        audio: audioUrls
    };
}

// --- NEW HELPER: Gather My Yoto Data for ZIP ---
async function gatherMyYotoDataForZip() {
    const cardData = await findAndParseMyYotoData(); // This fetches and parses, including resolved URLs
    if (!cardData || !cardData.title) {
        console.error('ZIP Prep: Could not find or parse card data for MYO page.');
        return null;
    }

    const cardTitle = cardData.title;
    const baseFilename = sanitizeFileName(cardTitle);

    // --- Gather URLs and content ---
    const coverArtUrl = cardData.coverArtUrl || null;
    // *** Align with bulkDownloadMyYoto: Use map for track list titles ***
    const trackTitles = (cardData.tracks || []).map((t, index) => t.title || `Track ${index + 1}`);
    // const cardDetailsContent = `Card Title: ${cardTitle}\n` +
    //                           `Author: MYO Card\n` +
    //                           `Description: ${cardData.description || 'N/A'}\n\n` +
    //                           `Tracks:\n${formatTrackList(trackTitles)}`; // Pass only titles

    // --- Use exact formatting from downloadCardDetailsMyYoto --- 
    const cardAuthor = "MYO Card"; // MYO specific
    const cardDescription = cardData.description || 'No description available';
    let trackList = 'No tracks available';
    if (trackTitles.length > 0) {
        trackList = formatTrackList(trackTitles);
    }
    const cardDetailsContent = `Card Title: ${cardTitle}\nAuthor: ${cardAuthor}\n\nDescription:\n${cardDescription}\n\nTrack List:\n${trackList}`;
    // --------------------------------------------------------

    const iconUrls = [];
    const audioUrls = [];
    let trackNumber = 1;
    let imageNumber = 1;

    console.log("[Content-ZIP] Processing tracks for ZIP. Logging track.format values:"); // Added log
    (cardData.tracks || []).forEach((track, index) => {
        console.log(`[Content-ZIP] Track ${index + 1} ('${track.title}') format received:`, track.format); // Added log
        // Icon URL
        if (track.iconUrl) {
             const iconExtMatch = track.iconUrl.match(/\.(\w+)(\?|$)/);
             const iconExt = iconExtMatch ? iconExtMatch[1] : 'png';
             iconUrls.push({
                url: track.iconUrl,
                filename: sanitizeFileName(`${imageNumber} - ${track.title || `Track ${imageNumber}`}.${iconExt}`) // Removed 'Image ' prefix
            });
            imageNumber++;
        }
        // Audio URL (Should be the signed URL from findAndParseMyYotoData)
        if (track.trackUrl && track.trackUrl.startsWith('https://secure-media.yotoplay.com')) { 
             // *** Align with bulkDownloadMyYoto: Use track.format or default to aac ***
             const audioExt = track.format || 'mp3'; // Changed fallback to mp3
             audioUrls.push({
                url: track.trackUrl,
                filename: sanitizeFileName(`${String(trackNumber).padStart(2, '0')} - ${track.title || `${trackNumber}`}.${audioExt}`) // Restore direct call
            });
        } else {
            console.warn(`ZIP Prep: Skipping audio for track ${trackNumber} - No valid signed URL found.`);
        }
        trackNumber++;
    });

    // --- Package Data --- 
    return {
        cardTitle: cardTitle,
        baseFilename: baseFilename,
        coverArt: coverArtUrl ? { 
            url: coverArtUrl, 
            filename: `Cover Art - ${baseFilename}.[ext]` // Placeholder
        } : null,
        details: { content: cardDetailsContent, filename: `${baseFilename} - Details.txt` },
        icons: iconUrls,
        audio: audioUrls
    };
}

// --- MODIFIED: Initiate ZIP Download (calls new helpers) ---
async function initiateBulkZipDownload() {
    const zipButton = document.getElementById('yoto-tools-download-zip-btn');
    if (!zipButton) return; 

    const originalText = 'Save All (Zip)';
    setButtonWorking(zipButton, 'Gathering...'); // Change initial text
    updateStatus('Gathering data for ZIP...');
    hideProgress(); 

    let zipRequestData = null;
    try {
        if (IS_MY_YOTO_DOMAIN) {
            zipRequestData = await gatherMyYotoDataForZip(); 
        } else if (IS_SHARE_DOMAIN) {
            zipRequestData = await gatherSharePageDataForZip(); 
        }

        if (!zipRequestData) {
            throw new Error('Failed to gather data for ZIP preparation.');
        }

        // --- Send gathered data to background ---
        updateStatus('Sending data to background for zipping...', 'blue');
        setButtonWorking(zipButton, 'Sending...'); // Update button text
        chrome.runtime.sendMessage({
            action: "createAndDownloadZip",
            data: zipRequestData
        });
        console.log("[Content] createAndDownloadZip message sent to background. Awaiting updateState messages.");

    } catch (error) {
        console.error("Error preparing ZIP download:", error);
        updateStatus(`Error preparing ZIP: ${error.message}`, 'red');
        setButtonError(zipButton, originalText);
        hideProgress();
    }
}


// =====================================
// ==      UI Injection & State        ==
// =====================================

// Function to check if buttons are already injected
function areButtonsInjected() {
  return document.querySelector('.yoto-tools-button') !== null;
}

// --- Inject Buttons (Logic Router) ---
function initializeUI() {
  if (areButtonsInjected()) {
    return;
  }
  
  if (IS_MY_YOTO_DOMAIN) {
    // For my.yotoplay.com, wait for dynamic elements to load
    const maxWaitTime = 10000;
    const checkInterval = 500;
    let elapsedTime = 0;

    const intervalId = setInterval(() => {
        // Check for a key element, e.g., the description textarea
        const descriptionTextarea = document.querySelector('textarea[placeholder*="Optional, maximum 500 characters."]');
        
        if (descriptionTextarea) {
            clearInterval(intervalId);
            injectMyYotoDownloadButtons();
        } else {
            elapsedTime += checkInterval;
            if (elapsedTime >= maxWaitTime) {
                clearInterval(intervalId);
                console.error("Timed out waiting for dynamic elements on my.yotoplay.com. UI might not inject correctly.");
                updateStatus('Error: Page elements did not load as expected.', 'red');
            }
        }
    }, checkInterval);

  } else if (IS_SHARE_DOMAIN) {
    // For share domains, assume elements load normally
    injectDownloadButtons();
  } else {
    console.warn("Yoto Tools: Unsupported domain for UI injection.");
  }
}

// --- SHARE DOMAIN UI --- 
function injectDownloadButtons() {
  if (areButtonsInjected()) {
    return;
  }

  const cardData = findAndParseData();
  if (!cardData) {
    console.error('Could not find or parse card data for share domain');
    return;
  }

  // --- Create Main Controls Container ---
  const controlsContainer = document.createElement('div');
  controlsContainer.className = 'yoto-tools-controls share-controls yoto-tools-button';
  controlsContainer.style.cssText = `
    background-color: #f0f4f8; 
    padding: 15px;
    margin: 20px 0;
    border-radius: 8px;
    border: 1px solid #d1dce5;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    position: relative;
    z-index: 9999;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
    font-family: Castledown-Regular, Roboto, sans-serif;
  `;

  // --- Title ---
  const titleElement = document.createElement('h3');
  titleElement.textContent = 'Yoto Tools: Backup';
  titleElement.style.cssText = 'margin-top: 0; margin-bottom: 10px; color: #333; font-size: 1.1em; text-align: center; font-family: Castledown-Regular, Roboto, sans-serif;';
  controlsContainer.appendChild(titleElement);

  // --- Status Display ---
  const statusElement = document.createElement('p');
  statusElement.className = 'yoto-tools-status';
  statusElement.textContent = 'Ready to backup your card content';
  statusElement.style.cssText = 'margin: 0 0 10px 0; color: var(--text-secondary, #555); font-size: 0.9em; text-align: center; font-family: Castledown-Regular, Roboto, sans-serif;';
  controlsContainer.appendChild(statusElement);

  // --- Progress Bar ---
  const progressContainer = document.createElement('div');
  progressContainer.className = 'yoto-tools-progress';
  progressContainer.style.cssText = `
    display: none;
    align-items: center;
    margin-bottom: 10px;
    background-color: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    height: 20px;
  `;
  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    background-color: #4CAF50;
    height: 100%;
    width: 0%;
    transition: width 0.3s ease;
    text-align: center;
    color: white;
    line-height: 20px;
    font-size: 0.8em;
  `;
  progressContainer.appendChild(progressFill);
  controlsContainer.appendChild(progressContainer);

  // --- Button Container ---
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '10px';
  controlsContainer.appendChild(buttonContainer);

  // --- Primary Button Group ---
  const buttonGroupPrimary = document.createElement('div');
  buttonGroupPrimary.style.display = 'flex';
  buttonGroupPrimary.style.justifyContent = 'center';
  buttonGroupPrimary.style.gap = '10px'; // Added gap between buttons
  buttonContainer.appendChild(buttonGroupPrimary);

  // --- Secondary Button Group ---
  const buttonGroupSecondary = document.createElement('div');
  buttonGroupSecondary.style.display = 'flex';
  buttonGroupSecondary.style.gap = '10px';
  buttonGroupSecondary.style.flexWrap = 'wrap';
  buttonGroupSecondary.style.justifyContent = 'center';
  buttonContainer.appendChild(buttonGroupSecondary);

  // --- Create Buttons using Helper ---
  const bulkButton = createMyYotoButton('Save All', getDownloadIcon('#fff'), () => bulkDownload());
  bulkButton.classList.add('yoto-tools-bulk-button');
  buttonGroupPrimary.appendChild(bulkButton);

  // --- NEW: Add ZIP Button ---
  const zipButton = createMyYotoButton('Save All (Zip)', getDownloadIcon('#fff'), initiateBulkZipDownload);
  zipButton.id = 'yoto-tools-download-zip-btn'; // Assign unique ID
  buttonGroupPrimary.appendChild(zipButton); // Add to the primary group as well
  // --------------------------

  const detailsButton = createMyYotoButton('Save Details', getFileTextIcon('#fff', 'M8 4h8v2H8z M8 8h8v2H8z M8 12h5v2H8z'), async () => {
    setButtonWorking(detailsButton, 'Saving...');
    try {
      const result = await downloadCardDetails();
      if (result.success) {
        setButtonSuccess(detailsButton, 'Save Details');
      } else {
        setButtonError(detailsButton, 'Save Details');
      }
    } catch (error) {
      console.error('Error downloading card details:', error);
      setButtonError(detailsButton, 'Save Details');
    }
  });
  detailsButton.classList.add('yoto-tools-details-button');
  buttonGroupSecondary.appendChild(detailsButton);

  const artworkButton = createMyYotoButton('Save Cover', getPhotoIcon('#fff'), async () => {
    setButtonWorking(artworkButton, 'Saving...');
    try {
      const result = await downloadCoverArt();
      if (result?.success) {
        setButtonSuccess(artworkButton, 'Save Cover');
      } else {
        setButtonError(artworkButton, 'Save Cover');
      }
    } catch (error) {
      console.error('Error downloading cover art:', error);
      setButtonError(artworkButton, 'Save Cover');
    }
  });
  artworkButton.classList.add('yoto-tools-cover-button');
  buttonGroupSecondary.appendChild(artworkButton);

  const iconsButton = createMyYotoButton('Save Icons', getEyeIcon('#fff'), async () => {
    setButtonWorking(iconsButton, 'Saving...');
    const cardData = findAndParseData();
    if (!cardData) {
      setButtonError(iconsButton, 'Save Icons');
      updateStatus('Error: Could not find card data for icons', 'red');
      return;
    }
    try {
      const folderName = sanitizeFileName(cardData.title);
      let imageNumber = 1;
      let downloadCount = 0;
      let errorCount = 0;
      const downloadPromises = [];

      cardData.content.chapters.forEach(chapter => {
        if (chapter.display?.icon16x16) {
          const iconUrl = chapter.display.icon16x16;
          chapter.tracks.forEach(track => {
            let fileExtension = iconUrl.split('.').pop()?.split('?')[0] || 'jpg';
            if (!['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension.toLowerCase())) {
              fileExtension = 'jpg';
            }
            const iconFileName = sanitizeFileName(`${imageNumber} - ${track.title}.${fileExtension}`);
            downloadPromises.push(
              chrome.runtime.sendMessage({
                type: 'downloadFile',
                url: iconUrl,
                filename: `${folderName}/${iconFileName}`
              }).then(() => {
                downloadCount++;
                const pageIconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${imageNumber - 1}"]`);
                if (pageIconButton) setButtonSuccess(pageIconButton, 'Save Icon');
              }).catch(err => {
                console.error(`Error downloading icon ${imageNumber}:`, err);
                errorCount++;
                const pageIconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${imageNumber - 1}"]`);
                if (pageIconButton) setButtonError(pageIconButton, 'Save Icon');
              })
            );
            imageNumber++;
          });
        }
      });

      await Promise.allSettled(downloadPromises);

      if (errorCount === 0) {
        setButtonSuccess(iconsButton, 'Save Icons');
        updateStatus('Icons downloaded successfully!', 'green');
        const allTrackIconButtons = document.querySelectorAll('.yoto-tools-icon-button');
        allTrackIconButtons.forEach(btn => setButtonSuccess(btn, 'Save Icon'));
      } else {
        setButtonError(iconsButton, 'Save Icons');
        updateStatus(`Downloaded ${downloadCount} icons with ${errorCount} error(s).`, 'orange');
      }
    } catch (error) {
      console.error('Error downloading icons from page button:', error);
      setButtonError(iconsButton, 'Save Icons');
      updateStatus(`Error downloading icons: ${error.message}`, 'red');
    }
  });
  iconsButton.id = 'yoto-tools-page-icons-button';
  iconsButton.classList.add('yoto-tools-icons-button');
  buttonGroupSecondary.appendChild(iconsButton);

  const audioButtonPage = createMyYotoButton('Save Audio', getAudioIcon('#fff'), async () => {
    setButtonWorking(audioButtonPage, 'Saving...');
    const cardData = findAndParseData();
    if (!cardData) {
      setButtonError(audioButtonPage, 'Save Audio');
      updateStatus('Error: Could not find card data for audio', 'red');
      return;
    }
    try {
      const folderName = sanitizeFileName(cardData.title);
      let trackNumber = 1;
      let downloadCount = 0;
      let errorCount = 0;
      const downloadPromises = [];

      cardData.content.chapters.forEach(chapter => {
        chapter.tracks.forEach(track => {
          if (track.trackUrl) {
            const audioFileName = sanitizeFileName(`${String(trackNumber).padStart(2, '0')} - ${track.title}.${track.format || 'aac'}`);
            downloadPromises.push(
              chrome.runtime.sendMessage({
                type: 'downloadFile',
                url: track.trackUrl,
                filename: `${folderName}/${audioFileName}`
              }).then(() => {
                downloadCount++;
                const pageAudioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${trackNumber - 1}"]`);
                if (pageAudioButton) setButtonSuccess(pageAudioButton, 'Save Audio');
              }).catch(err => {
                console.error(`Error downloading audio ${trackNumber}:`, err);
                errorCount++;
                const pageAudioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${trackNumber - 1}"]`);
                if (pageAudioButton) setButtonError(pageAudioButton, 'Save Audio');
              })
            );
            trackNumber++;
          } else {
             trackNumber++;
          }
        });
      });

      await Promise.allSettled(downloadPromises);

      if (errorCount === 0) {
        setButtonSuccess(audioButtonPage, 'Save Audio');
        updateStatus('Audio tracks downloaded successfully!', 'green');
        const allAudioButtons = document.querySelectorAll('.yoto-tools-audio-button');
        allAudioButtons.forEach(btn => setButtonSuccess(btn, 'Save Audio'));
      } else {
        setButtonError(audioButtonPage, 'Save Audio');
        updateStatus(`Downloaded ${downloadCount} audio tracks with ${errorCount} error(s).`, 'orange');
      }
    } catch (error) {
      console.error('Error downloading audio from page button:', error);
      setButtonError(audioButtonPage, 'Save Audio');
      updateStatus(`Error downloading audio: ${error.message}`, 'red');
    }
  });
  audioButtonPage.id = 'yoto-tools-page-audio-button';
  audioButtonPage.classList.add('yoto-tools-audio-button');
  buttonGroupSecondary.appendChild(audioButtonPage);

  // Insert the main controls container at the top of the body
  document.body.insertBefore(controlsContainer, document.body.firstChild);

  // Inject individual track buttons
  const trackTable = document.querySelector('table.MuiTable-root');
  if (trackTable) {
    const rows = trackTable.querySelectorAll('tr');
    let injectedButtonCount = 0;
    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) return;

      const trackData = cardData.content.chapters.flatMap(c => c.tracks)[index];
      if (!trackData) {
        console.warn(`Could not find track data for row index ${index}`);
        return;
      }

      // Create container for track buttons
      const trackButtonContainer = document.createElement('div');
      trackButtonContainer.style.marginTop = '0px';
      trackButtonContainer.style.display = 'flex';
      trackButtonContainer.style.flexDirection = 'row';
      trackButtonContainer.style.flexWrap = 'wrap';
      trackButtonContainer.style.gap = '5px';
      trackButtonContainer.style.paddingTop = '5px';
      trackButtonContainer.style.paddingBottom = '5px';

      // --- Save Audio Button --- 
      if (trackData.trackUrl) {
        const audioButton = createMyYotoButton('Save Audio', getAudioIcon('#fff'), async () => { 
          setButtonWorking(audioButton, 'Saving...');
          try {
            const audioFileName = sanitizeFileName(`${String(index + 1).padStart(2, '0')} - ${trackData.title}.${trackData.format || 'aac'}`);
            const folderName = sanitizeFileName(cardData.title);
            await chrome.runtime.sendMessage({
              type: 'downloadFile',
              url: trackData.trackUrl,
              filename: `${folderName}/${audioFileName}`
            });
            setButtonSuccess(audioButton, 'Save Audio');
          } catch (error) {
            console.error('Error downloading audio track:', error);
            setButtonError(audioButton, 'Save Audio');
          }
        }, 'small');
        audioButton.classList.add('yoto-tools-audio-button');
        audioButton.dataset.trackIndex = index;
        trackButtonContainer.appendChild(audioButton);
        injectedButtonCount++;
      }

      // --- Save Icon Button ---
      let chapterIconUrl = null;
      let trackCount = 0;
      for (const chapter of cardData.content.chapters) {
         if (index >= trackCount && index < trackCount + chapter.tracks.length) {
             chapterIconUrl = chapter.display?.icon16x16;
             break;
         }
         trackCount += chapter.tracks.length;
      }

      if (chapterIconUrl) {
        const iconButton = createMyYotoButton('Save Icon', getEyeIcon('#fff'), async () => {
          setButtonWorking(iconButton, 'Saving...');
          try {
            let fileExtension = chapterIconUrl.split('.').pop()?.split('?')[0] || 'jpg';
            if (!['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension.toLowerCase())) {
              fileExtension = 'jpg';
            }
            const iconFileName = sanitizeFileName(`${index + 1} - ${trackData.title}.${fileExtension}`);
            const folderName = sanitizeFileName(cardData.title);
            await chrome.runtime.sendMessage({
                type: 'downloadFile',
                url: chapterIconUrl,
                filename: `${folderName}/${iconFileName}`
            });
            setButtonSuccess(iconButton, 'Save Icon');
    } catch (error) {
            console.error('Error downloading icon:', error);
            setButtonError(iconButton, 'Save Icon');
          }
        }, 'small');
        iconButton.classList.add('yoto-tools-icon-button');
        iconButton.dataset.trackIndex = index;
        trackButtonContainer.appendChild(iconButton);
        injectedButtonCount++;
      }

      // --- Append Buttons ---
      const targetCell = cells[cells.length - 1];
      if (targetCell && trackButtonContainer.hasChildNodes()) {
         const existingContentWrapper = targetCell.querySelector('div:first-child');
         
         if (existingContentWrapper && existingContentWrapper.parentNode === targetCell) {
             const wrapperDiv = document.createElement('div');
             wrapperDiv.style.display = 'flex';
             wrapperDiv.style.alignItems = 'center';
             wrapperDiv.style.justifyContent = 'flex-start';
             wrapperDiv.style.gap = '8px'; 

             targetCell.insertBefore(wrapperDiv, existingContentWrapper);
             wrapperDiv.appendChild(existingContentWrapper);
             wrapperDiv.appendChild(trackButtonContainer);
    } else {
             targetCell.appendChild(trackButtonContainer);
         }
      }
    });
    } else {
    console.warn("Could not find track table (table.MuiTable-root) to inject track buttons for share domain.");
  }
}

// --- MY YOTO DOMAIN UI --- 
function injectMyYotoDownloadButtons() {
  findAndParseMyYotoData().then(cardData => {
    if (!cardData) {
      updateStatus('Could not parse card data to inject buttons.', 'red');
      return;
    }
    
    // --- Create Main Controls Container ---
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'yoto-tools-controls my-yoto-controls yoto-tools-button';
    controlsContainer.style.cssText = `
      background-color: #f0f4f8; 
      padding: 15px;
      margin: 20px 0;
      border-radius: 8px;
      border: 1px solid #d1dce5;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      position: relative;
      z-index: 9999;
    `;

    // --- Title ---
    const titleElement = document.createElement('h3');
    titleElement.textContent = 'Yoto Tools: Backup';
    titleElement.style.cssText = 'margin-top: 0; margin-bottom: 10px; color: #333; font-size: 1.1em; font-family: Castledown-Regular, Roboto, sans-serif;';
    controlsContainer.appendChild(titleElement);

    // --- Status Display ---
    const statusElement = document.createElement('p');
    statusElement.className = 'yoto-tools-status';
    statusElement.textContent = 'Ready to backup your card content';
    statusElement.style.cssText = 'margin: 0 0 10px 0; color: var(--text-secondary, #555); font-size: 0.9em; font-family: Castledown-Regular, Roboto, sans-serif;';
    controlsContainer.appendChild(statusElement);
    
    // --- Progress Bar ---
    const progressContainer = document.createElement('div');
    progressContainer.className = 'yoto-tools-progress';
    progressContainer.style.cssText = `
      display: none;
          align-items: center;
      margin-bottom: 10px;
      background-color: #e0e0e0;
      border-radius: 4px;
      overflow: hidden;
      height: 20px;
    `;
    const progressFill = document.createElement('div');
    progressFill.style.cssText = `
      background-color: #4CAF50;
      height: 100%;
      width: 0%;
      transition: width 0.3s ease;
      text-align: center;
      color: white;
      line-height: 20px;
      font-size: 0.8em;
    `;
    progressContainer.appendChild(progressFill);
    controlsContainer.appendChild(progressContainer);

    // --- Button Container ---
    const buttonGroup = document.createElement('div');
    buttonGroup.style.display = 'flex';
    buttonGroup.style.gap = '10px';
    buttonGroup.style.flexWrap = 'wrap';
    controlsContainer.appendChild(buttonGroup);

    // --- Add Main Action Buttons ---
    const backupButton = createMyYotoButton('Save All', getDownloadIcon('#fff'), bulkDownloadMyYoto);
    backupButton.classList.add('yoto-tools-bulk-button'); // Add class if needed for styling/selection
    buttonGroup.appendChild(backupButton);

    // --- NEW: Add ZIP Button ---
    const zipButton = createMyYotoButton('Save All (Zip)', getDownloadIcon('#fff'), initiateBulkZipDownload);
    zipButton.id = 'yoto-tools-download-zip-btn'; // Assign unique ID
    buttonGroup.appendChild(zipButton);
    // --------------------------

    // --- Cover Art Button ---
    if (cardData.coverArtUrl) {
      const coverButton = createMyYotoButton('Save Cover', getPhotoIcon('#fff'), async () => {
        setButtonWorking(coverButton, 'Saving...');
        try {
          const result = await downloadCoverArtMyYoto();
          if (result.success) {
            setButtonSuccess(coverButton, 'Save Cover');
          } else {
            setButtonError(coverButton, 'Save Cover');
          }
        } catch (error) {
          console.error("Error in cover button click handler:", error);
          setButtonError(coverButton, 'Save Cover');
        }
      });
      coverButton.classList.add('yoto-tools-cover-button'); 
      buttonGroup.appendChild(coverButton);
    }

    // --- Card Details Button ---
    const detailsButton = createMyYotoButton('Save Details', getFileTextIcon('#fff', 'M8 4h8v2H8z M8 8h8v2H8z M8 12h5v2H8z'), async () => {
      setButtonWorking(detailsButton, 'Saving...');
      try {
        const result = await downloadCardDetailsMyYoto();
        if (result.success) {
          setButtonSuccess(detailsButton, 'Save Details');
        } else {
          setButtonError(detailsButton, 'Save Details');
        }
            } catch (error) {
         console.error("Error in details button click handler:", error);
        setButtonError(detailsButton, 'Save Details');
      }
    });
    detailsButton.classList.add('yoto-tools-details-button'); 
    buttonGroup.appendChild(detailsButton);

    // --- Save Icons Button --- 
    const iconsButtonMyo = createMyYotoButton('Save Icons', getEyeIcon('#fff'), async () => {
      setButtonWorking(iconsButtonMyo, 'Saving...');
      const currentCardData = await findAndParseMyYotoData();
      if (!currentCardData || !currentCardData.tracks) {
        setButtonError(iconsButtonMyo, 'Save Icons');
        updateStatus('Error: Could not parse data to save icons', 'red');
        return;
      }
      try {
        const folderName = sanitizeFileName(currentCardData.title);
        let downloadCount = 0;
        let errorCount = 0;
        const downloadPromises = [];

        currentCardData.tracks.forEach((track, index) => {
          if (track.iconUrl) {
            let fileExtension = track.iconUrl.split('.').pop()?.split('?')[0] || 'jpg';
            if (!['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension.toLowerCase())) {
              fileExtension = 'jpg';
            }
            // const iconFileName = sanitizeFileName(`Image ${index + 1} - ${track.title}.${fileExtension}`);
            const iconFileName = sanitizeFileName(`${index + 1} - ${track.title}.${fileExtension}`); // Removed 'Image ' prefix
            downloadPromises.push(
              chrome.runtime.sendMessage({
                type: 'downloadFile',
                url: track.iconUrl,
                filename: `${folderName}/${iconFileName}`
              }).then(() => {
                downloadCount++;
                const pageIconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${index}"]`);
                if (pageIconButton) setButtonSuccess(pageIconButton, 'Save Icon');
              }).catch(err => {
                console.error(`Error downloading icon ${index + 1}:`, err);
                errorCount++;
                const pageIconButton = document.querySelector(`.yoto-tools-icon-button[data-track-index="${index}"]`);
                if (pageIconButton) setButtonError(pageIconButton, 'Save Icon');
              })
            );
          }
        });

        await Promise.allSettled(downloadPromises);

        if (errorCount === 0) {
          setButtonSuccess(iconsButtonMyo, 'Save Icons');
          updateStatus('Icons downloaded successfully!', 'green');
          const allTrackIconButtons = document.querySelectorAll('.yoto-tools-icon-button');
          allTrackIconButtons.forEach(btn => setButtonSuccess(btn, 'Save Icon'));
        } else {
          setButtonError(iconsButtonMyo, 'Save Icons');
          updateStatus(`Downloaded ${downloadCount} icons with ${errorCount} error(s).`, 'orange');
        }
      } catch (error) {
        console.error('Error in Save Icons button handler:', error);
        setButtonError(iconsButtonMyo, 'Save Icons');
        updateStatus(`Error downloading icons: ${error.message}`, 'red');
      }
    });
    iconsButtonMyo.classList.add('yoto-tools-icons-button-main');
    buttonGroup.appendChild(iconsButtonMyo);

    // --- Save Audio Button --- 
    const audioButtonMyo = createMyYotoButton('Save Audio', getAudioIcon('#fff'), async () => {
      setButtonWorking(audioButtonMyo, 'Saving...');
      const currentCardData = await findAndParseMyYotoData();
      if (!currentCardData || !currentCardData.tracks) {
        setButtonError(audioButtonMyo, 'Save Audio');
        updateStatus('Error: Could not parse data to save audio', 'red');
        return;
      }
      try {
        const folderName = sanitizeFileName(currentCardData.title);
        let downloadCount = 0;
        let errorCount = 0;
        const downloadPromises = [];

        currentCardData.tracks.forEach((track, index) => {
          if (track.trackUrl && track.trackUrl.startsWith('https://secure-media.yotoplay.com')) {
            // const audioFileName = sanitizeFileName(`Track ${String(index + 1).padStart(2, '0')} - ${track.title}.${track.format || 'aac'}`);
            const audioFileName = sanitizeFileName(`${String(index + 1).padStart(2, '0')} - ${track.title}.${track.format || 'mp3'}`); // Removed 'Track ' prefix, ensure mp3 fallback
            downloadPromises.push(
              chrome.runtime.sendMessage({
                type: 'downloadFile',
                url: track.trackUrl,
                filename: `${folderName}/${audioFileName}`
              }).then(() => {
                downloadCount++;
                const pageAudioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${index}"]`);
                if (pageAudioButton) setButtonSuccess(pageAudioButton, 'Save Audio');
              }).catch(err => {
                console.error(`Error downloading audio track ${index + 1}:`, err);
                errorCount++;
                const pageAudioButton = document.querySelector(`.yoto-tools-audio-button[data-track-index="${index}"]`);
                if (pageAudioButton) setButtonError(pageAudioButton, 'Save Audio');
              })
            );
          } else {
             console.warn(`Skipping audio download for track ${index+1} in Save Audio action - No valid signed URL found.`);
          }
        });

        await Promise.allSettled(downloadPromises);

        if (errorCount === 0) {
          setButtonSuccess(audioButtonMyo, 'Save Audio');
          updateStatus('Audio tracks downloaded successfully!', 'green');
          const allAudioButtons = document.querySelectorAll('.yoto-tools-audio-button');
          allAudioButtons.forEach(btn => setButtonSuccess(btn, 'Save Audio'));
        } else {
          setButtonError(audioButtonMyo, 'Save Audio');
          updateStatus(`Downloaded ${downloadCount} audio tracks with ${errorCount} error(s).`, 'orange');
        }
      } catch (error) {
        console.error('Error in Save Audio button handler:', error);
        setButtonError(audioButtonMyo, 'Save Audio');
        updateStatus(`Error downloading audio: ${error.message}`, 'red');
      }
    });
    audioButtonMyo.classList.add('yoto-tools-audio-button-main');
    buttonGroup.appendChild(audioButtonMyo);

    // --- Find Injection Point for Main Controls ---
    let injected = false;
    try {
      const addAudioButtonLabel = document.querySelector('label:has(> input#upload)');
      const addAudioRow = addAudioButtonLabel?.closest('div.row');

      if (addAudioRow && addAudioRow.parentNode) {
        addAudioRow.insertAdjacentElement('afterend', controlsContainer);
        injected = true;
      } else {
        console.warn("Could not find Add Audio row, trying artwork container fallback...");
        const artworkContainer = document.querySelector('div.artwork-upload-container');
        if (artworkContainer && artworkContainer.parentNode) {
          artworkContainer.parentNode.insertBefore(controlsContainer, artworkContainer);
          console.log("Using fallback: Injected main controls for My Yoto before artwork container.")
          injected = true;
        }
      }
    } catch (e) {
      console.error("Error finding injection point (Add Audio row / Artwork Container):", e);
    }

    // --- Inject Individual Track Buttons ---
    const trackElements = document.querySelectorAll('div[style*="border-bottom-style"] > table > tbody > tr'); 
    let injectedButtonCount = 0;
    trackElements.forEach((el, index) => {
      const track = cardData.tracks[index];
      if (!track) return;
      
      const trackButtonContainer = document.createElement('div');
      trackButtonContainer.style.marginTop = '0px';
      trackButtonContainer.style.display = 'flex';
      trackButtonContainer.style.flexDirection = 'row';
      trackButtonContainer.style.flexWrap = 'wrap';
      trackButtonContainer.style.gap = '5px';
      trackButtonContainer.style.paddingTop = '5px';
      trackButtonContainer.style.paddingBottom = '5px';

      // --- Audio Button --- 
      if (track.trackUrl) {
        const audioButton = createMyYotoButton('Save Audio', getAudioIcon('#fff'), async () => {
            setButtonWorking(audioButton, 'Saving...');
            // It uses 'track' which comes from cardData.tracks[index]
            // cardData was fetched at the start of injectMyYotoDownloadButtons
            // Does it re-fetch? No. It uses the initially fetched cardData.
            if (!track.trackUrl || !track.trackUrl.startsWith('https://secure-media.yotoplay.com')) {
                console.error("No valid signed URL found for this track.");
                setButtonError(audioButton, 'Save Audio');
                return;
            }
            try {
                const audioFileName = sanitizeFileName(`${String(index + 1).padStart(2, '0')} - ${track.title}.${track.format || 'mp3'}`); // Restore direct call
                const folderName = sanitizeFileName(cardData.title);
                await chrome.runtime.sendMessage({
                    type: 'downloadFile',
                    url: track.trackUrl,
                    filename: `${folderName}/${audioFileName}`
                });
                setButtonSuccess(audioButton, 'Save Audio');
            } catch (error) {
                console.error('Error downloading audio track:', error);
                setButtonError(audioButton, 'Save Audio');
            }
        }, 'small');
        audioButton.classList.add('yoto-tools-audio-button');
        audioButton.dataset.trackIndex = index;
        trackButtonContainer.appendChild(audioButton);
      }
      
      // --- Icon Button --- 
      if (track.iconUrl) {
        const iconButton = createMyYotoButton('Save Icon', getEyeIcon('#fff'), async () => {
          setButtonWorking(iconButton, 'Saving...');
          try {
            let fileExtension = track.iconUrl.split('.').pop()?.split('?')[0] || 'jpg';
            if (!['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(fileExtension.toLowerCase())) {
              fileExtension = 'jpg';
            }
            // const iconFileName = sanitizeFileName(`Image ${index + 1} - ${track.title}.${fileExtension}`);
            const iconFileName = sanitizeFileName(`${index + 1} - ${track.title}.${fileExtension}`); // Removed 'Image ' prefix
            const folderName = sanitizeFileName(cardData.title);
              await chrome.runtime.sendMessage({
                  type: 'downloadFile',
                  url: track.iconUrl,
                  filename: `${folderName}/${iconFileName}`
              });
            setButtonSuccess(iconButton, 'Save Icon');
            } catch (error) {
              console.error('Error downloading icon:', error);
              setButtonError(iconButton, 'Save Icon');
          }
        }, 'small');
        iconButton.classList.add('yoto-tools-icon-button');
        iconButton.dataset.trackIndex = index;
        trackButtonContainer.appendChild(iconButton);
        injectedButtonCount++;
      }

      // --- Append Track Buttons --- 
      const targetCell = el.querySelector('td:last-child'); 
      if (targetCell && trackButtonContainer.hasChildNodes()) {
        const menuButtonDiv = targetCell.querySelector('div:has(> button.MuiIconButton-root)') || targetCell.querySelector('div');

        if (menuButtonDiv && menuButtonDiv.parentNode === targetCell) {
          trackButtonContainer.style.flexDirection = 'row';
          trackButtonContainer.style.marginTop = '0px';

          const wrapperDiv = document.createElement('div');
          wrapperDiv.style.display = 'flex';
          wrapperDiv.style.alignItems = 'center';
          wrapperDiv.style.justifyContent = 'flex-start';
          wrapperDiv.style.gap = '8px';

          targetCell.insertBefore(wrapperDiv, menuButtonDiv);
          wrapperDiv.appendChild(menuButtonDiv);
          wrapperDiv.appendChild(trackButtonContainer);

        } else {
          console.warn(`Could not reliably find Mui menu button div in track ${index}. Appending buttons horizontally.`);
          trackButtonContainer.style.flexDirection = 'row';
          trackButtonContainer.style.marginTop = '0px';
          targetCell.appendChild(trackButtonContainer);
        }
      } else if (trackButtonContainer.hasChildNodes()) {
        console.warn(`Could not find td:last-child to inject buttons for track ${index}. Appending to row.`);
        el.appendChild(trackButtonContainer);
      }
    });

    updateStatus('Ready to backup card content', 'var(--text-secondary, #555)');
  }).catch(error => {
    console.error("Error during findAndParseMyYotoData or injection:", error);
    updateStatus('Error parsing card data or injecting buttons.', 'red');
  });
}

// Helper to create buttons for My Yoto page
function createMyYotoButton(text, svgIcon, onClick, size = 'normal') {
  const button = document.createElement('button');
  button.innerHTML = svgIcon + `<span>${text}</span>`;
  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: ${size === 'small' ? '3px' : '6px'};
    padding: ${size === 'small' ? '3px 6px' : '6px 10px'};
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: ${size === 'small' ? '0.7em' : '0.8em'};
    font-weight: 500;
    font-family: Castledown-Regular, Roboto, sans-serif;
    transition: background-color 0.2s ease, opacity 0.2s ease;
    white-space: nowrap;
  `;
  button.querySelector('svg').style.width = size === 'small' ? '12px' : '14px';
  button.querySelector('svg').style.height = size === 'small' ? '12px' : '14px';
  button.addEventListener('click', onClick);

  // Add hover effect
  button.addEventListener('mouseenter', () => button.style.backgroundColor = '#0056b3');
  button.addEventListener('mouseleave', () => button.style.backgroundColor = '#007bff');
  
  return button;
}


// =====================================
// ==      Common Helper Functions     ==
// =====================================

// Function to sanitize file and folder names
function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '-').trim();
}

// Function to format track list with numbers
function formatTrackList(tracks) {
  // Added check if tracks is an array of strings (titles) or objects
  if (tracks.length === 0) return 'No tracks available';
  
  if (typeof tracks[0] === 'string') {
      // Assume array of titles
      return tracks.map((title, index) => `${index + 1}. ${title || 'Untitled Track'}`).join('\n');
  } else if (typeof tracks[0] === 'object' && tracks[0] !== null && tracks[0].tracks) {
       // Share page structure (array of chapters with tracks)
      let trackListText = '';
      let trackNumGlobal = 1;
      tracks.forEach((chapter, chapterIndex) => {
          trackListText += `\nChapter ${chapterIndex + 1}: ${chapter.title || 'Untitled Chapter'}\n`;
          chapter.tracks.forEach(track => {
              trackListText += `  ${String(trackNumGlobal).padStart(2, '0')}: ${track.title || 'Untitled Track'}\n`;
              trackNumGlobal++;
          });
      });
      return trackListText.trim();
  } else if (typeof tracks[0] === 'object' && tracks[0] !== null) {
       // Assume MYO structure (flat array of track objects) - used by original formatTrackList call, now map is used before calling
       // This branch might be less used now but kept for safety
       return tracks.map((track, index) => `${String(index + 1).padStart(2, '0')}: ${track.title || 'Untitled Track'}`).join('\n');
  } else {
       // Fallback for unexpected data
       console.warn("formatTrackList received unexpected data type:", tracks);
       return 'Could not format track list.';
  }
}

// --- Global State Update Functions ---
function updateStatus(message, color = 'var(--text-secondary, #555)') {
  const statusElement = document.querySelector('.yoto-tools-status');
  if (statusElement) {
    statusElement.textContent = message;
    statusElement.style.color = color;
  }
  chrome.runtime.sendMessage({ action: 'updateState', status: message, statusColor: color }).catch(err => {});
}

function showProgress(percentage, total, current = null) {
  const progressContainer = document.querySelector('.yoto-tools-progress');
  const progressFill = progressContainer?.querySelector('div');
  if (progressContainer && progressFill) {
    progressContainer.style.display = 'flex';
    progressFill.style.width = `${percentage}%`;
    let progressText = `${percentage}%`;
    if (current !== null && total !== null) {
      progressText += ` (${current}/${total})`;
    }
    progressFill.textContent = progressText;
  }
  chrome.runtime.sendMessage({ action: 'updateState', inProgress: true, progress: percentage }).catch(err => {});
}

function hideProgress() {
  const progressContainer = document.querySelector('.yoto-tools-progress');
  if (progressContainer) {
    progressContainer.style.display = 'none';
  }
  chrome.runtime.sendMessage({ action: 'updateState', inProgress: false, progress: 0 }).catch(err => {});
}

// --- Button State Updates ---
function setButtonWorking(button, workingText = 'Working...') {
  button.disabled = true;
  button.style.opacity = '0.7';
  const span = button.querySelector('span');
  if (span) span.textContent = workingText;
}

function setButtonSuccess(button, originalText) {
  const originalBgColor = button.style.backgroundColor;
  const originalBorderColor = button.style.borderColor;
  const originalColor = button.style.color;
  const originalInnerHtml = button.innerHTML;
  
  button.disabled = true;
  button.style.opacity = '1';
  button.style.pointerEvents = 'none';
  button.style.cursor = 'default';

  let successText = originalText.replace('Save', 'Saved');
  let successIconColor = '#fff';
  let successTextColor = '#fff';
  let successBgColor = '#28a745';
  let successBorderColor = '#28a745';

  // Style based on button type for Share/Play domains
  if (button.classList.contains('primary-button')) {
    successText = 'Backup Complete'; 
    successBgColor = '#28a745';
    successBorderColor = '#28a745';
    successIconColor = '#fff';
    successTextColor = '#fff';
  } else if (button.classList.contains('secondary-button')) {
    successBgColor = '#e8f5e9';
    successBorderColor = '#2e7d32';
    successIconColor = '#2e7d32';
    successTextColor = '#2e7d32';
    if (originalText.includes('Details')) successText = 'Details Saved';
    if (originalText.includes('Artwork')) successText = 'Artwork Saved';
  } else if (button.classList.contains('track-button') && !IS_MY_YOTO_DOMAIN) {
    successBgColor = '#e8f5e9';
    successBorderColor = '#2e7d32';
    successIconColor = '#2e7d32';
    successTextColor = '#2e7d32';
    if (originalText.includes('Audio')) successText = 'Audio Saved';
    if (originalText.includes('Icon')) successText = 'Icon Saved';
  } else {
    // Default/My Yoto style
    successBgColor = '#28a745';
    successBorderColor = '#28a745';
    successIconColor = '#fff';
    successTextColor = '#fff';
    if (originalText.includes('Audio')) successText = 'Audio Saved';
    if (originalText === 'Save Icons') successText = 'Icons Saved';
    else if (originalText.includes('Icon')) successText = 'Icon Saved';
    if (originalText.includes('Details')) successText = 'Details Saved';
    if (originalText.includes('Artwork')) successText = 'Artwork Saved';
    if (originalText.includes('Cover')) successText = 'Cover Saved';
    if (originalText.includes('Backup')) successText = 'Backup Saved';
  }

  button.style.backgroundColor = successBgColor;
  button.style.borderColor = successBorderColor;
  button.style.color = successTextColor;
  button.innerHTML = getCheckIcon(successIconColor) + `<span>${successText}</span>`;
}

function setButtonError(button, originalText) {
  const originalBgColor = button.style.backgroundColor;
  const originalBorderColor = button.style.borderColor;
  const originalColor = button.style.color;
  const originalInnerHtml = button.innerHTML;

  button.disabled = false;
  button.style.opacity = '1';
  
  button.style.backgroundColor = '#dc3545'; 
  button.style.borderColor = '#dc3545';
  button.style.color = '#fff';
  
  const iconSvg = button.querySelector('svg')?.outerHTML || ''; 
  const span = button.querySelector('span');
  if (span) {
    button.innerHTML = iconSvg + `<span>Error</span>`;
  }
  
  setTimeout(() => {
    button.style.backgroundColor = originalBgColor;
    button.style.borderColor = originalBorderColor;
    button.style.color = originalColor;
    button.innerHTML = originalInnerHtml;
  }, 3000);
}

// Note: This function seems unused
function getCurrentButtonStates() {
  return {
    bulkDownload: completeBackupButton?.disabled || false,
    cardDetails: detailsButton?.disabled || false,
    cardArtwork: artworkButton?.disabled || false
  };
}

// =====================================
// ==           SVG Icons            ==
// =====================================

function getAudioIcon(color = 'currentColor') {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
    </svg>
  `;
}

function getPhotoIcon(color = 'currentColor') {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="M20.4 14.5L16 10 4 20"/>
    </svg>
  `;
}

function getCheckIcon(color = 'currentColor') {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
}

function getFileTextIcon(color = 'currentColor', pathData = 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z') {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
    </svg>
  `;
}

function getDownloadIcon(color = 'currentColor') {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3V15M12 15L16 11M12 15L8 11"/>
      <path d="M21 15V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V15"/>
    </svg>
  `;
}

function getEyeIcon(color = 'currentColor') {
  return `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    </svg>
  `;
}

// =====================================
// ==        Initialization          ==
// =====================================

// Function to check if the current URL is the MYO edit page
function isMyYotoEditPage() {
  return window.location.pathname.match(/^\/card\/.*\/edit$/);
}

// --- Initial UI Setup ---
if ((IS_MY_YOTO_DOMAIN && isMyYotoEditPage()) || IS_SHARE_DOMAIN) {
  const initialDelay = IS_MY_YOTO_DOMAIN ? 500 : 0;
  setTimeout(initializeUI, initialDelay);
}

// --- SPA Navigation Handling (Only for my.yotoplay.com) ---
if (IS_MY_YOTO_DOMAIN) {
  let lastPath = window.location.pathname;

  const observer = new MutationObserver((mutationsList, observer) => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;

      if (isMyYotoEditPage()) {
        // Wait a brief moment for the SPA to potentially settle, then initialize UI
        setTimeout(initializeUI, 500);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}