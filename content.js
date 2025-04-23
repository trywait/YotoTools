// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    // Respond to ping to confirm content script is loaded
    sendResponse({ status: 'ok' });
    return true;
  } else if (message.action === 'viewMediaLinks') {
    injectDownloadButtons();
  } else if (message.action === 'bulkDownload') {
    bulkDownload();
  } else if (message.action === 'downloadCoverArt') {
    downloadCoverArt();
  } else if (message.action === 'getMediaLinks') {
    getMediaLinks().then(sendResponse);
    return true;
  } else if (message.action === 'downloadCover') {
    downloadCover().then(sendResponse);
    return true;
  } else if (message.action === 'downloadCardDetails') {
    downloadCardDetails().then(sendResponse);
    return true;
  }
});

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

function viewMediaLinks() {
  const cardData = findAndParseData();
  if (!cardData) {
    console.error('Could not find or parse card data');
    return;
  }

  // Create a container for the links
  const container = document.createElement('div');
  container.style.margin = '20px';
  container.style.backgroundColor = '#deefff';
  container.style.padding = '20px';
  container.style.borderRadius = '8px';

  // Add a title to the container
  const containerTitle = document.createElement('h2');
  containerTitle.textContent = cardData.title || 'Yoto Card';
  container.appendChild(containerTitle);

  // Add an explanatory paragraph to the container
  const containerP = document.createElement('p');
  containerP.textContent = `${cardData.description || 'Download links for audio files and images.'} Right click and select "Save Link As" to save an individual file.`;
  container.appendChild(containerP);

  // Add cover art link if available
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
  
  // Initialize track and image numbers
  let trackNumber = 1;
  let imageNumber = 1;

  // Loop through chapters and tracks to create links
  cardData.content.chapters.forEach(chapter => {
    chapter.tracks.forEach(track => {
      if (track.trackUrl) {
        // Create a link element for each track
        const trackLink = document.createElement('a');
        trackLink.href = track.trackUrl;
        trackLink.textContent = `Track ${trackNumber}: ${track.title}`;
        trackLink.target = '_blank'; // Open in new tab
        trackLink.style.display = 'block'; // Display each link on a new line
        trackLink.style.marginBottom = '8px';
        trackLink.style.color = '#1a73e8';
        trackLink.style.textDecoration = 'none';

        // Append the track link to the container
        container.appendChild(trackLink);

        // Increment track number
        trackNumber++;
      }

      // Create a link element for each image
      if (chapter.display?.icon16x16) {
        const imageLink = document.createElement('a');
        imageLink.href = chapter.display.icon16x16;
        imageLink.textContent = `Image ${imageNumber}: ${track.title}`;
        imageLink.target = '_blank';
        imageLink.style.display = 'block';
        imageLink.style.marginBottom = '8px';
        imageLink.style.color = '#1a73e8';
        imageLink.style.textDecoration = 'none';

        // Append the image link to the container
        container.appendChild(imageLink);

        // Increment image number
        imageNumber++;
      }
    });
  });

  // Insert the container at the top of the body of the page
  document.body.insertBefore(container, document.body.firstChild);
}

// Function to sanitize file and folder names
function sanitizeFileName(name) {
  return name.replace(/[<>:"/\\|?*]/g, '-').trim();
}

// Function to format track list with numbers
function formatTrackList(tracks) {
  if (tracks.length === 0) return 'No tracks available';
  return tracks.map((track, index) => `${index + 1}. ${track}`).join('\n');
}

async function downloadCardDetails() {
  try {
    // Extract card details
    const cardTitle = document.querySelector('h1.card-title')?.textContent?.trim() || 'Unknown Title';
    const cardAuthor = document.querySelector('div.card-author b')?.textContent?.trim() || 'Unknown Author';
    const cardDescription = document.querySelector('div.card-description')?.textContent?.trim() || 'No description available';
    
    // Extract track list
    const trackTable = document.querySelector('table.MuiTable-root');
    let trackList = 'No tracks available';
    if (trackTable) {
      const tracks = Array.from(trackTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          return cells[1].textContent.trim();
        }
        return null;
      }).filter(track => track !== null);
      
      if (tracks.length > 0) {
        trackList = formatTrackList(tracks);
      }
    }

    // Create content for the text file
    const content = `Card Title: ${cardTitle}
Author: ${cardAuthor}

Description:
${cardDescription}

Track List:
${trackList}`;

    // Create a sanitized folder name and file name
    const folderName = sanitizeFileName(cardTitle);
    const fileName = sanitizeFileName(`${cardTitle} - Details.txt`);

    // Create blob and get URL
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    // Use the background script's download handler
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
    return;
  }

  try {
    // Create a sanitized folder name and file name
    const folderName = sanitizeFileName(cardData.title);
    const fileName = sanitizeFileName(`Cover Art - ${cardData.title}.jpg`);
    
    // Request download through background script
    await chrome.runtime.sendMessage({
      type: 'downloadFile',
      url: cardData.coverArtUrl,
      filename: `${folderName}/${fileName}`
    });
  } catch (error) {
    console.error('Error downloading cover art:', error);
  }
}

async function bulkDownload() {
  const cardData = findAndParseData();
  if (!cardData) {
    console.error('Could not find or parse card data');
    return;
  }

  try {
    // Create a list of all media items
    const mediaItems = [];
    let trackNumber = 1;
    let imageNumber = 1;
    
    // Add cover art if available
    if (cardData.coverArtUrl) {
      mediaItems.push({
        url: cardData.coverArtUrl,
        filename: sanitizeFileName(`Cover Art - ${cardData.title}.jpg`)
      });
    }
    
    cardData.content.chapters.forEach(chapter => {
      chapter.tracks.forEach(track => {
        // Add track URL with the same naming as displayed links
        if (track.trackUrl) {
          mediaItems.push({
            url: track.trackUrl,
            filename: sanitizeFileName(`Track ${trackNumber} - ${track.title}.mp3`)
          });
          trackNumber++;
        }
        
        // Add image URL with the same naming as displayed links
        if (chapter.display?.icon16x16) {
          mediaItems.push({
            url: chapter.display.icon16x16,
            filename: sanitizeFileName(`Image ${imageNumber} - ${track.title}.jpg`)
          });
          imageNumber++;
        }
      });
    });

    // Create a sanitized folder name from the card title
    const folderName = sanitizeFileName(cardData.title);

    // Get card details content
    const cardTitle = document.querySelector('h1.card-title')?.textContent?.trim() || 'Unknown Title';
    const cardAuthor = document.querySelector('div.card-author b')?.textContent?.trim() || 'Unknown Author';
    const cardDescription = document.querySelector('div.card-description')?.textContent?.trim() || 'No description available';
    
    // Extract track list
    const trackTable = document.querySelector('table.MuiTable-root');
    let trackList = 'No tracks available';
    if (trackTable) {
      const tracks = Array.from(trackTable.querySelectorAll('tr')).map(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          return cells[1].textContent.trim();
        }
        return null;
      }).filter(track => track !== null);
      
      if (tracks.length > 0) {
        trackList = formatTrackList(tracks);
      }
    }

    // Create card details content
    const cardDetailsContent = `Card Title: ${cardTitle}
Author: ${cardAuthor}

Description:
${cardDescription}

Track List:
${trackList}`;

    // Create blob for card details
    const cardDetailsBlob = new Blob([cardDetailsContent], { type: 'text/plain' });
    const cardDetailsUrl = URL.createObjectURL(cardDetailsBlob);

    // Add card details to media items
    mediaItems.push({
      url: cardDetailsUrl,
      filename: sanitizeFileName(`${cardTitle} - Details.txt`)
    });

    // Download each item
    let completed = 0;
    const total = mediaItems.length;

    // Function to update progress
    const updateProgress = (progress) => {
      window.postMessage({ type: 'downloadProgress', progress }, '*');
    };

    // Download files one by one
    for (const item of mediaItems) {
      try {
        // Update progress
        const progress = Math.round((completed / total) * 100);
        updateProgress(progress);

        // Request download through background script
        await chrome.runtime.sendMessage({
          type: 'downloadFile',
          url: item.url,
          filename: `${folderName}/${item.filename}`
        });

        // Clean up blob URL if it's the card details file
        if (item.url === cardDetailsUrl) {
          URL.revokeObjectURL(cardDetailsUrl);
        }

        // Wait a bit before next download
        await new Promise(resolve => setTimeout(resolve, 500));
        completed++;
      } catch (error) {
        console.error(`Error downloading ${item.filename}:`, error);
        window.postMessage({ 
          type: 'downloadError', 
          error: `Failed to download ${item.filename}` 
        }, '*');
      }
    }

    // Send final progress update
    updateProgress(100);

  } catch (error) {
    console.error('Error in bulk download:', error);
    window.postMessage({ 
      type: 'downloadError', 
      error: 'Bulk download failed' 
    }, '*');
  }
}

// Function to check if buttons are already injected
function areButtonsInjected() {
  return document.querySelector('.yoto-tools-button') !== null;
}

// Function to inject download buttons into the page
function injectDownloadButtons() {
  // Check if buttons are already injected
  if (areButtonsInjected()) {
    return;
  }

  const cardData = findAndParseData();
  if (!cardData) {
    console.error('Could not find or parse card data');
    return;
  }

  let messageListener = null; // Add shared messageListener variable

  // Create a container for the top buttons
  const topButtonsContainer = document.createElement('div');
  topButtonsContainer.className = 'yoto-tools-button-container';
  topButtonsContainer.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin: 20px auto;
    padding: 20px;
    max-width: 600px;
    text-align: center;
  `;

  // Add Complete Backup button with download icon
  const completeBackupButton = document.createElement('button');
  completeBackupButton.className = 'yoto-tools-button primary-button';
  completeBackupButton.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17"/>
    </svg>
    Save Complete Backup
  `;
  completeBackupButton.style.cssText = `
    background-color: #1a73e8;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    font-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    transition: background-color 0.2s;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  `;

  // Add status text
  const statusText = document.createElement('div');
  statusText.className = 'yoto-tools-status';
  statusText.style.cssText = `
    font-size: 13px;
    color: #86868B;
    margin: 8px 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  `;
  statusText.textContent = 'Ready to backup your card content';

  // Add progress container
  const progressContainer = document.createElement('div');
  progressContainer.className = 'yoto-tools-progress';
  progressContainer.style.cssText = `
    display: none;
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 300px;
    margin: 8px 0;
  `;

  // Add progress bar
  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    flex: 1;
    height: 4px;
    background-color: #F5F5F7;
    border-radius: 2px;
    overflow: hidden;
  `;

  // Add progress fill
  const progressFill = document.createElement('div');
  progressFill.style.cssText = `
    height: 100%;
    background-color: #0A84FF;
    width: 0%;
    transition: width 0.3s;
  `;

  // Add progress text
  const progressText = document.createElement('div');
  progressText.style.cssText = `
    font-size: 12px;
    color: #86868B;
    min-width: 40px;
    text-align: right;
  `;
  progressText.textContent = '0%';

  // Assemble progress elements
  progressBar.appendChild(progressFill);
  progressContainer.appendChild(progressBar);
  progressContainer.appendChild(progressText);

  // Create container for secondary buttons
  const secondaryButtonsContainer = document.createElement('div');
  secondaryButtonsContainer.style.cssText = `
    display: flex;
    gap: 12px;
    margin-top: 8px;
  `;

  // Add Card Details button
  const detailsButton = document.createElement('button');
  detailsButton.className = 'yoto-tools-button secondary-button';
  detailsButton.textContent = 'Save Card Details';
  detailsButton.style.cssText = `
    background-color: transparent;
    color: #1a73e8;
    border: 1px solid #1a73e8;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  `;
  detailsButton.onmouseover = () => {
    detailsButton.style.backgroundColor = '#f1f5fe';
  };
  detailsButton.onmouseout = () => {
    detailsButton.style.backgroundColor = 'transparent';
  };
  detailsButton.onclick = () => downloadCardDetails();

  // Add Card Artwork button
  const artworkButton = document.createElement('button');
  artworkButton.className = 'yoto-tools-button secondary-button';
  artworkButton.textContent = 'Save Card Artwork';
  artworkButton.style.cssText = detailsButton.style.cssText; // Use same styling
  artworkButton.onmouseover = () => {
    artworkButton.style.backgroundColor = '#f1f5fe';
  };
  artworkButton.onmouseout = () => {
    artworkButton.style.backgroundColor = 'transparent';
  };
  artworkButton.onclick = () => downloadCoverArt();

  // Modified bulk download click handler
  completeBackupButton.onclick = async () => {
    try {
      // Reset progress display
      progressContainer.style.display = 'flex';
      progressFill.style.width = '0%';
      progressText.textContent = '0%';
      statusText.textContent = 'Downloading files...';
      statusText.style.color = '#86868B';

      // Set up message listener using window.postMessage
      const messageHandler = (event) => {
        if (event.source !== window) return;
        
        const message = event.data;
        if (message.type === 'downloadProgress') {
          const progress = message.progress;
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `${progress}%`;
          
          if (progress === 100) {
            statusText.textContent = 'Backup Complete!';
            statusText.style.color = '#34C759'; // Apple's system green color
            setTimeout(() => {
              progressContainer.style.display = 'none';
              window.removeEventListener('message', messageHandler);
            }, 1000);
          }
        } else if (message.type === 'downloadError') {
          statusText.textContent = `Error: ${message.error}`;
          statusText.style.color = '#FF3B30'; // Apple's system red color
        }
      };

      // Add message listener
      window.addEventListener('message', messageHandler);
      
      // Start the download process
      await bulkDownload();
    } catch (error) {
      statusText.textContent = 'Error: Could not start bulk download';
      statusText.style.color = '#FF3B30';
      console.error(error);
    }
  };

  completeBackupButton.onmouseover = () => {
    completeBackupButton.style.backgroundColor = '#1557b0';
  };
  completeBackupButton.onmouseout = () => {
    completeBackupButton.style.backgroundColor = '#1a73e8';
  };

  // Assemble the secondary buttons
  secondaryButtonsContainer.appendChild(detailsButton);
  secondaryButtonsContainer.appendChild(artworkButton);

  // Modified assembly of elements
  topButtonsContainer.appendChild(completeBackupButton);
  topButtonsContainer.appendChild(statusText);
  topButtonsContainer.appendChild(progressContainer);
  topButtonsContainer.appendChild(secondaryButtonsContainer);

  // Insert at the top of the page
  document.body.insertBefore(topButtonsContainer, document.body.firstChild);

  // Style the track buttons (make them more subtle)
  const trackTable = document.querySelector('table.MuiTable-root');
  if (trackTable) {
    const rows = trackTable.querySelectorAll('tr');
    rows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 2) {
        // Create container for buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'yoto-tools-button-container';
        buttonContainer.style.cssText = `
          display: flex;
          gap: 8px;
          margin-left: 10px;
        `;

        // Add Save Audio button
        const audioButton = document.createElement('button');
        audioButton.className = 'yoto-tools-button track-button';
        audioButton.textContent = 'Save Audio';
        audioButton.style.cssText = `
          background-color: transparent;
          color: #5f6368;
          border: 1px solid #dadce0;
          padding: 4px 8px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        `;
        audioButton.onmouseover = () => {
          audioButton.style.backgroundColor = '#f8f9fa';
        };
        audioButton.onmouseout = () => {
          audioButton.style.backgroundColor = 'transparent';
        };
        audioButton.onclick = async () => {
          const trackData = cardData.content.chapters.flatMap(c => c.tracks)[index];
          if (trackData?.trackUrl) {
            await chrome.runtime.sendMessage({
              type: 'downloadFile',
              url: trackData.trackUrl,
              filename: `${sanitizeFileName(cardData.title)}/${sanitizeFileName(`Track ${index + 1} - ${trackData.title}.mp3`)}`
            });
          }
        };

        // Add Save Icon button
        const iconButton = document.createElement('button');
        iconButton.className = 'yoto-tools-button track-button';
        iconButton.textContent = 'Save Icon';
        iconButton.style.cssText = audioButton.style.cssText; // Use same styling
        iconButton.onmouseover = () => {
          iconButton.style.backgroundColor = '#f8f9fa';
        };
        iconButton.onmouseout = () => {
          iconButton.style.backgroundColor = 'transparent';
        };
        iconButton.onclick = async () => {
          const chapterData = cardData.content.chapters.find(c => c.tracks[index]);
          if (chapterData?.display?.icon16x16) {
            await chrome.runtime.sendMessage({
              type: 'downloadFile',
              url: chapterData.display.icon16x16,
              filename: `${sanitizeFileName(cardData.title)}/${sanitizeFileName(`Image ${index + 1} - ${chapterData.tracks[index].title}.jpg`)}`
            });
          }
        };

        buttonContainer.appendChild(audioButton);
        buttonContainer.appendChild(iconButton);
        cells[1].appendChild(buttonContainer);
      }
    });
  }
}

// Automatically inject buttons when the content script loads
injectDownloadButtons(); 