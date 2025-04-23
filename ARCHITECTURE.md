# Yoto Tools Extension Architecture

This document outlines the architecture of the Yoto Tools Chrome Extension, detailing the roles of its components and their interactions.

## Overview

The extension is built using standard Chrome Extension APIs (Manifest V3) and follows a common architectural pattern involving a popup, content script, and background service worker. Its primary goal is to interact with Yoto card pages (`play.yotoplay.com/*/card/*` and `share.yoto.co/*`) to extract media links and metadata, and facilitate the download of this content for personal backup.

## Components

### 1. `manifest.json`

- **Role**: The core configuration file for the extension.
- **Defines**:
    - Extension metadata (name, version, description).
    - Required permissions (`downloads`, `activeTab`, `scripting`, `storage`).
    - Host permissions (which websites the extension can interact with, specifically Yoto domains and CloudFront for media).
    - The popup UI file (`popup.html`).
    - Icons for the extension.
    - The background service worker script (`background.js`).
    - The content script (`content.js`) and the URL patterns it should be injected into.

### 2. `popup.html`

- **Role**: Defines the HTML structure and styling for the extension's popup window.
- **Contains**:
    - Buttons for user actions (View Media Links, Complete Backup, Save Cover Art, Save Card Information).
    - Status display area.
    - Progress bar for download feedback.
    - Basic styling inspired by Apple's design language.

### 3. `popup.js`

- **Role**: Handles the logic and user interactions within the popup window.
- **Responsibilities**:
    - Adds event listeners to the buttons defined in `popup.html`.
    - Checks if the current tab is a valid Yoto card page using `chrome.tabs.query`.
    - Enables/disables buttons based on the current page context.
    - Ensures the `content.js` script is injected into the active tab using `chrome.scripting.executeScript` if needed.
    - Sends messages (`chrome.tabs.sendMessage`) to `content.js` to trigger actions like viewing links, initiating downloads, or fetching details.
    - Queries the current state from `content.js` when opened to reflect the actual page state.
    - Updates UI based on download progress and error messages.
- **Key Functions**:
    - `DOMContentLoaded` listener: Initializes the popup, checks the page, and fetches current state.
    - `ensureContentScript()`: Checks if the content script is loaded and injects it if necessary.
    - `updateUI()`: Central function for updating all UI elements based on state.
    - Event listeners for buttons that trigger download actions.
    - Message listener for progress updates and error reporting.

### 4. `content.js`

- **Role**: Interacts directly with the web page content of Yoto card pages. Injected automatically based on `manifest.json` or programmatically by `popup.js`.
- **Responsibilities**:
    - Listens for messages (`chrome.runtime.onMessage`) from `popup.js`.
    - Maintains the source of truth for download state and progress on the page.
    - Provides current state information to the popup when requested.
    - Scrapes the DOM of the Yoto card page to find relevant data (media URLs, titles, descriptions, cover art).
    - Parses the `__NEXT_DATA__` script tag on the page, which contains structured JSON data about the card content.
    - Handles different actions requested by the popup:
        - `getCurrentState`: Returns the current download state from the page elements.
        - `viewMediaLinks`: Injects a visible list of media links into the page.
        - `bulkDownload`: Gathers all media links and metadata, then sends messages to `background.js` to download each file. Reports progress back to `popup.js`.
        - `downloadCoverArt`: Finds the cover art URL and tells `background.js` to download it.
        - `downloadCardDetails`: Extracts title, author, description, and track list, formats it as text, creates a Blob, and tells `background.js` to download it.
    - Sends progress updates (`chrome.runtime.sendMessage`) back to `popup.js` during bulk downloads.
- **Key Functions**:
    - `chrome.runtime.onMessage.addListener`: Handles incoming messages including state queries.
    - `findAndParseData()`: Locates and parses the `__NEXT_DATA__` JSON from the page.
    - `viewMediaLinks()`: Modifies the DOM to display links.
    - `bulkDownload()`: Orchestrates the download of all media files.
    - `downloadCoverArt()`: Handles cover art download request.
    - `downloadCardDetails()`: Handles card details download request.
    - `sanitizeFileName()`: Cleans up filenames for safe saving.

### 5. `background.js` (Service Worker)

- **Role**: Handles background tasks, primarily managing downloads. As a service worker, it can run even when the popup is closed.
- **Responsibilities**:
    - Listens for messages (`chrome.runtime.onMessage`) from `content.js`.
    - Handles `downloadFile` messages by initiating downloads using the `chrome.downloads.download` API.
        - Specifies the `url` and desired `filename` (including subdirectory).
        - Uses `conflictAction: 'uniquify'` to avoid overwriting files with the same name.
    - Listens for download completion events (`chrome.downloads.onChanged`) for logging (optional).
    - Can forward messages (e.g., download progress or errors) if needed, although current progress reporting seems to be handled directly from `content.js` to `popup.js`.
- **Key Functions**:
    - `chrome.runtime.onMessage.addListener`: Handles `downloadFile` messages from `content.js`.
    - `chrome.downloads.onChanged.addListener`: Optional listener for download state changes.

## Communication Flow

1.  **User opens popup**: `popup.html` is loaded, `popup.js` runs.
2.  **Page Check**: `popup.js` checks if the active tab URL matches Yoto patterns.
3.  **Content Script Check**: `popup.js` sends a `ping` message to `content.js`. If no response, it injects `content.js`.
4.  **State Synchronization**: `popup.js` queries `content.js` for current download state and updates UI accordingly.
5.  **User clicks button (e.g., "Complete Backup")**: `popup.js` sends an action message (e.g., `{ action: 'bulkDownload' }`) to `content.js`.
6.  **Content Script Action**: `content.js` receives the message, scrapes/parses the page data.
7.  **Download Initiation**: `content.js` iterates through media files. For each file, it sends a `downloadFile` message (with URL and filename) to `background.js`.
8.  **Background Download**: `background.js` receives `downloadFile` messages and calls `chrome.downloads.download`.
9.  **Progress Reporting**: `content.js` updates its own UI and sends `downloadProgress` messages to `popup.js`.
10. **Popup Update**: `popup.js` receives progress messages and updates its UI to match the page state.
11. **Popup Reopening**: If popup is closed and reopened, it queries `content.js` for current state, ensuring consistent display.

## State Management

- **Source of Truth**: The page DOM (managed by `content.js`) serves as the single source of truth for download state.
- **State Synchronization**: The popup queries the content script's state when opened, ensuring it always reflects the actual page state.
- **Progress Updates**: Both the page and popup maintain synchronized progress displays through message passing.
- **Error Handling**: Errors are displayed consistently in both interfaces, with the page state being authoritative.

## Data Flow

- **Primary Data Source**: The `__NEXT_DATA__` JSON object embedded in the Yoto card page HTML. Additional details (like primary title, cover art URL visible on the page) are scraped directly from the DOM.
- **Data Extraction**: `content.js` is responsible for finding, parsing, and structuring this data.
- **Data Usage**: The extracted data (URLs, titles, descriptions) is used to generate download requests (`background.js`) or display information (`content.js`, `popup.js`).

## Future Considerations

- **Error Handling**: Robustness could be improved with more specific error catching and user feedback.
- **State Management**: For more complex features, a more formal state management approach might be needed.
- **Large File Downloads**: Handling potential issues with very large files or numerous files might require adjustments (e.g., queuing, retries).
- **API Changes**: The extension relies on the structure of Yoto web pages (DOM and `__NEXT_DATA__`). Changes to the Yoto site could break the extension. 