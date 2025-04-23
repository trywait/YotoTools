// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    // Respond to ping to confirm content script is loaded
    sendResponse({ status: 'ok' });
    return true;
  } else if (message.action === 'viewMediaLinks') {
    viewMediaLinks();
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

    // Function to safely send messages
    const safeSendMessage = async (message) => {
      try {
        await chrome.runtime.sendMessage(message);
      } catch (error) {
        // Ignore "Extension context invalidated" errors
        if (!error.message.includes('Extension context invalidated') &&
            !error.message.includes('could not establish connection')) {
          console.error('Message error:', error);
        }
      }
    };

    for (const item of mediaItems) {
      try {
        // Update progress
        await safeSendMessage({
          type: 'downloadProgress',
          progress: Math.round((completed / total) * 100)
        });

        // Request download through background script
        await safeSendMessage({
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
        // Only log errors that aren't related to extension context
        if (!error.message.includes('Extension context invalidated') &&
            !error.message.includes('could not establish connection')) {
          console.error(`Error requesting download for ${item.filename}:`, error);
          await safeSendMessage({
            type: 'downloadError',
            error: `Failed to download ${item.filename}`
          });
        }
      }
    }

    // Send final progress update
    await safeSendMessage({
      type: 'downloadProgress',
      progress: 100
    });

  } catch (error) {
    // Only log critical errors
    if (!error.message.includes('Extension context invalidated') &&
        !error.message.includes('could not establish connection')) {
      console.error('Error in bulk download:', error);
      await chrome.runtime.sendMessage({
        type: 'downloadError',
        error: 'Bulk download failed'
      }).catch(() => {});
    }
  }
} 