# Yoto Tools Extension Architecture

This document outlines the architecture of the Yoto Tools Chrome Extension, detailing the roles of its components and their interactions.

## Overview

The extension is built using standard Chrome Extension APIs (Manifest V3) and follows a common architectural pattern involving a popup, content script, and background service worker. Its primary goal is to interact with Yoto card pages (including public share pages and user-specific edit pages) to extract media links and metadata, and facilitate the download of this content for personal backup.

Supported URL patterns include:
- `https://play.yotoplay.com/*/card/*`
- `https://share.yoto.co/*`
- `https://my.yotoplay.com/card/*/edit`

The extension employs domain-specific logic within the content script to handle the different data structures and UI requirements of the share/play pages versus the MYO edit pages.

## Components

### 1. `manifest.json`

- **Role**: The core configuration file for the extension.
- **Defines**:
    - Extension metadata (name, version, description).
    - Required permissions (`downloads`, `storage`).
        - `downloads`: Needed to save files using the `chrome.downloads` API.
        - `storage`: Needed to persist download state (`chrome.storage.local`).
    - Host permissions (`https://*.yotoplay.com/*`, `https://*.yoto.co/*`).
        - These allow the extension to inject content scripts and make API calls (from the background script) to the necessary Yoto domains.
    - The popup UI file (`popup.html`).
    - Icons for the extension.
    - The background service worker script (`background.js`).
    - The content script (`content.js`) and the URL patterns it should be injected into (`play.yotoplay.com/*/card/*`, `share.yoto.co/*`, `my.yotoplay.com/*`).

### 2. `popup.html`

- **Role**: Defines the HTML structure and styling for the extension's popup window.
- **Contains**: Buttons for user actions, status display area, progress bar, and basic styling.

### 3. `popup.js`

- **Role**: Handles the logic and user interactions within the popup window.
- **Responsibilities**:
    - Adds event listeners to buttons.
    - Checks if the current tab is a valid Yoto card page.
    - Sends messages (`chrome.tabs.sendMessage`) to `content.js` to trigger actions (e.g., `bulkDownload`, `downloadCoverArt`).
    - Queries the current state (`getCurrentState` message) from `content.js` when opened to reflect download progress/status.
    - Listens for state update messages (`buttonStateChange`, `downloadProgress`, `downloadError`) from `background.js` (relayed through `content.js`) to update UI dynamically.
- **Key Functions**:
    - `DOMContentLoaded` listener: Initializes the popup, checks the page, and fetches current state.
    - `updateUI()`: Central function for updating all UI elements based on state.
    - Event listeners for buttons that trigger download actions via messages to `content.js`.
    - Message listener for state updates.

### 4. `content.js`

- **Role**: Interacts directly with the web page content of supported Yoto card pages. Injected automatically based on `manifest.json`. Handles domain-specific logic.
- **Responsibilities**:
    - **Domain Detection**: Detects the current domain (`window.location.hostname`) using `IS_MY_YOTO_DOMAIN` and `IS_SHARE_DOMAIN` constants to route logic.
    - **Waits for dynamic content**: On `my.yotoplay.com`, polls the page (`isMyYotoEditPage`) to ensure key elements are loaded before attempting data extraction or UI injection, also handles SPA navigation.
    - **Listens for messages**: Handles `chrome.runtime.onMessage` from `popup.js` (e.g., `bulkDownload`, `downloadCoverArt`, `downloadCardDetails`, `downloadIcons`, `downloadAudio`) and `background.js` (`updateState` for status propagation).
    - **Data Extraction**: 
        - For `play.yotoplay.com` / `share.yoto.co` (`findAndParseData()`): Parses the `__NEXT_DATA__` script tag (JSON) and scrapes some DOM elements (title, cover art).
        - For `my.yotoplay.com` (`findAndParseMyYotoData()`):
            - Scrapes editable data (title, description, icon URLs) directly from DOM elements.
            - Retrieves the user's `access_token` from `localStorage`.
            - Sends `fetchApiData` message to `background.js` (including the token) to get metadata and **resolved signed audio URLs**.
            - Combines DOM-scraped data with the API response data.
    - **UI Injection**: 
        - Uses `initializeUI()` to route to domain-specific injection functions (`injectDownloadButtons`, `injectMyYotoDownloadButtons`).
        - Checks `areButtonsInjected()` to prevent duplicate injection.
        - Injects main controls container, progress bar, status text, and various download buttons using the `createMyYotoButton` helper for consistent styling.
        - Injects individual track Audio/Icon buttons using the helper, placing them appropriately within the track list UI for each domain.
        - **ZIP Data Preparation**: Runs domain-specific `gather*ForZip` functions to collect all necessary URLs, filenames (pre-sanitized, potentially with `[ext]` placeholders), and text content for the ZIP archive.
        - Sends `createAndDownloadZip` message to `background.js` with the prepared data.
    - **Download Actions**: 
        - Routes action messages (`bulkDownload`, `downloadCoverArt`, etc.) to domain-specific functions (e.g., `bulkDownload` vs `bulkDownloadMyYoto`).
        - `bulkDownload` / `bulkDownloadMyYoto`: Gather all relevant file info (cover, details, icons, audio URLs). Initiate downloads by sending `downloadFile` messages to `background.js`. Update UI state using shared helper functions (`updateStatus`, `showProgress`, `setButtonWorking/Success/Error`).
        - Individual download handlers (`downloadCoverArt`, `downloadCardDetails`, etc.) handle specific file downloads and update relevant button states.
        - Handles individual button clicks for tracks.
    - **Helper Functions**: 
        - `createMyYotoButton()`: Creates styled buttons consistently.
        - `sanitizeFileName()`: Cleans filenames.
        - State update functions (`updateStatus`, `showProgress`, `hideProgress`, `setButtonWorking`, `setButtonSuccess`, `setButtonError`): Manage UI feedback and send `updateState` to background.
        - SVG icon functions.
- **Key Functions**:
    - `chrome.runtime.onMessage.addListener`: Handles incoming messages.
    - `findAndParseData()`, `findAndParseMyYotoData()`: Domain-specific data extraction.
    - `gatherSharePageDataForZip()`, `gatherMyYotoDataForZip()`: Domain-specific data preparation for ZIP.
    - `initiateBulkZipDownload()`: Triggers the ZIP process.
    - `initializeUI()`, `injectDownloadButtons()`, `injectMyYotoDownloadButtons()`: Domain-specific UI setup.
    - `bulkDownload()`, `bulkDownloadMyYoto()`: Domain-specific bulk download orchestration.
    - Individual download functions (`downloadCoverArt`, `downloadCardDetails`, etc.).

### 5. `background.js` (Service Worker)

- **Role**: Handles background tasks, primarily API communication and download management.
- **Responsibilities**: 
    - Listens for messages (`chrome.runtime.onMessage`) from `content.js`.
    - Handles `downloadFile` messages: 
        - Initiates downloads using `chrome.downloads.download`.
        - Specifies `url` and `filename` (including subdirectory).
        - Uses `conflictAction: 'uniquify'`.
    - Handles `fetchApiData` messages (for `my.yotoplay.com`):
        - Receives `cardId` and `authToken` from `content.js`.
        - Makes a `GET` request to `https://api.yotoplay.com/content/{cardId}` using the provided `Authorization: Bearer {token}`.
        - If successful, makes a second `GET` request to `https://api.yotoplay.com/card/resolve/{cardId}` using the same token.
        - Sends the response from the `/card/resolve/` endpoint (containing signed URLs) back to `content.js`.
        - Handles API errors and sends failure status back to `content.js`.
    - Handles `createAndDownloadZip` messages from `content.js`:
        - Retrieves the data payload (title, cover art URL, details content, icon URLs, audio URLs, pre-sanitized filenames with placeholders).
        - Fetches all assets (cover, icons, audio) as Blobs using the built-in `fetch` API.
        - Uses the imported `JSZip` library to create a ZIP archive in memory.
        - Adds text details directly.
        - Determines asset file extensions:
            - Forces cover art extension to `.png`.
            - Uses `getExtensionFromMimeType` helper to determine audio/icon extensions based on the `Content-Type` header from the `fetch` response, defaulting to `.mp3` for unknown audio types.
        - Adds fetched asset Blobs to the zip using filenames provided by `content.js` (replacing `[ext]` placeholder with the determined extension).
        - Sends progress updates back to the initiating tab using `sendUpdateState` (via `chrome.tabs.sendMessage`).
        - Generates the final ZIP Blob asynchronously (`zip.generateAsync`).
        - Converts the ZIP Blob to a Data URL using `FileReader`.
        - Initiates the final download of the ZIP file using `chrome.downloads.download` with the Data URL and a sanitized filename based on the card title.
        - Sends final success/error state back to the initiating tab via `sendUpdateState`.
    - Handles `updateState` messages from `content.js`: 
        - Updates the download state stored in `chrome.storage.local`.
        - Forwards the state update message using `chrome.runtime.sendMessage` to update any open popup instance.
    - Handles `getDownloadState` messages from `popup.js`:
        - Retrieves the current state from `chrome.storage.local` and sends it back.
- **Key Functions**:
    - `chrome.runtime.onMessage.addListener`: Handles `downloadFile`, `fetchApiData`, `updateState`, `getDownloadState`, `createAndDownloadZip` messages.
    - Async function within `fetchApiData` handler to perform the two-step API calls.
    - `handleCreateAndDownloadZip`: Orchestrates the entire ZIP creation and download process.
    - `fetchAsset`: Helper to fetch remote URLs as Blobs.
    - `sendUpdateState`: Helper to send status/progress updates (now uses `tabId` for targeted messages).

## Communication Flow

1.  **Page Load**: `content.js` injected into matching Yoto page. `initializeUI` runs, potentially waits for dynamic elements (`my.yotoplay.com`) or handles SPA navigation.
2.  **UI Injection**: Domain-specific `inject*Buttons` function runs.
    - If `my.yotoplay.com`, `findAndParseMyYotoData` is called:
        - Reads `access_token` from `localStorage`.
        - Sends `fetchApiData` message (with token) to `background.js`.
        - `background.js` makes `/content/` and `/card/resolve/` calls, returns resolved data.
        - `content.js` receives resolved data, scrapes DOM, builds data structure.
    - If `share.yoto.co`, `findAndParseData` is called (parses `__NEXT_DATA__`).
    - UI elements are created and injected.
3.  **User opens popup**: `popup.html`/`popup.js` load.
4.  **State Synchronization**: `popup.js` sends `getDownloadState` message to `background.js`, which returns the current state from `chrome.storage.local`. Popup UI is updated.
5.  **User clicks injected button (e.g., "Save Audio" on MYO page)**:
    - `content.js`'s button click handler runs.
    - It uses the previously fetched signed URL.
    - Sends `downloadFile` message to `background.js`.
    - Calls UI state helpers (`setButtonWorking`, etc.), which also send `updateState` to `background.js`.
6.  **User clicks popup button (e.g., "Complete Backup")**: 
    - `popup.js` sends `bulkDownload` message to `content.js`.
    - `content.js` runs `bulkDownload`, gathers file info.
    - For each file, sends `downloadFile` message to `background.js`.
    - `content.js` calls `updateStatus`, `showProgress`, etc., which update its own UI and send `updateState` to `background.js`.
7.  **Background Download**: `background.js` receives `downloadFile`, calls `chrome.downloads.download`.
8.  **Progress/Status Updates**: `content.js` helpers (`showProgress`, `updateStatus`, `setButtonSuccess/Error`) send `updateState` messages to `background.js`. `background.js` updates `chrome.storage.local` and forwards the `updateState` message to the popup (if open).
9.  **User clicks "Save All (Zip)"**: 
    - `content.js` runs `initiateBulkZipDownload`.
    - Calls domain-specific `gather*ForZip` function (which prepares data including filenames with `[ext]` placeholders).
    - Sends `createAndDownloadZip` message (with data payload and `sender.tab.id`) to `background.js`.
    - `content.js` UI enters "working" state based on initial call.
10. **Background ZIP Process**: 
    - `background.js` receives `createAndDownloadZip`, calls `handleCreateAndDownloadZip`.
    - Fetches assets one by one using `fetch`, sending progress `updateState` messages to the initiating tab via `chrome.tabs.sendMessage`.
    - Determines file extensions (forced PNG for cover, Content-Type check + `.mp3` fallback for audio).
    - Adds assets to JSZip instance with corrected filenames.
    - Generates the ZIP file (can take time), sending further progress updates via `zip.generateAsync` callback.
    - Converts ZIP Blob to Data URL.
    - Initiates final `chrome.downloads.download` for the `.zip` file.
    - Sends final success/error `updateState` message to the initiating tab.
11. **UI Update (ZIP)**: `content.js` receives `updateState` messages from `background.js` via its `onMessage` listener, updating the progress bar, status text, and final button state accordingly.

## State Management

- **UI State**: Primarily managed within `content.js` using helper functions (`updateStatus`, `showProgress`, etc.) that directly manipulate the injected DOM elements.
- **Canonical Download State**: Managed by `background.js` using `chrome.storage.local` (`downloadState` object containing `inProgress`, `progress`, `status`, `statusColor`, `error`). This state is the single source of truth for the popup.
- **Synchronization**: `content.js` pushes state changes to `background.js` via `updateState`. `background.js` updates storage and pushes changes to the popup. The popup queries the state from storage on load.
- **For ZIP progress, `background.js` pushes `updateState` messages directly to the originating `content.js` tab via `chrome.tabs.sendMessage`. `background.js` still updates storage and broadcasts to the popup via `chrome.runtime.sendMessage` for consistency.

## Data Flow

- **Primary Data Source**: 
    - `share.yoto.co`/`play.yotoplay.com`: `__NEXT_DATA__` JSON object and DOM scraping.
    - `my.yotoplay.com`: DOM scraping (for editable fields) + **Yoto API via Background Script** (for metadata and signed audio URLs, requires authentication token).
- **Token Retrieval (`my.yotoplay.com`)**: `content.js` reads `access_token` from `localStorage`.
- **API Calls (`my.yotoplay.com`)**: Performed by `background.js` (`/content/` and `/card/resolve/`) using token provided by `content.js`.
- **Data Extraction**: Handled by domain-specific functions in `content.js` (`findAndParseData`, `findAndParseMyYotoData`).
- **Data Usage**: Used by `content.js` to determine download URLs/content and passed to `background.js` via `downloadFile` messages.
- **ZIP Data Preparation**: Domain-specific `gather*ForZip` functions in `content.js` assemble all needed URLs, filenames (with `[ext]` placeholders), and content into a single payload for the `createAndDownloadZip` message.
- **ZIP Asset Fetching**: `background.js` uses the URLs from the ZIP data payload to fetch assets using `fetch`.

## Future Considerations

- **Error Handling**: Can be enhanced with more granular feedback and potentially retry mechanisms, especially for API calls.
- **Token Refresh**: The current method relies on a valid token in `localStorage`. Handling expired tokens might require intercepting API calls or finding a refresh mechanism.
- **API Changes**: Reliance on Yoto page structure and private API endpoints means the extension is susceptible to breakage if Yoto updates its site/API.
- **Code Refactoring**: Further opportunities might exist to consolidate shared logic between domain-specific functions.
- **Client-Side File Conversion**: Implement browser-based file conversion using WebAssembly-compiled FFmpeg to allow users to convert downloaded files to .mp3 format directly within the extension.

## ZIP Creation Process

1.  **Trigger**: User clicks "Save All (Zip)" button in the injected UI (`content.js`).
2.  **Data Gathering (`content.js`)**: 
    - `initiateBulkZipDownload` calls the appropriate domain-specific `gather*ForZip` function (`gatherSharePageDataForZip` or `gatherMyYotoDataForZip`).
    - These functions perform necessary data extraction (using `findAndParseData` or `findAndParseMyYotoData`) and assemble a data payload containing:
        - `cardTitle`
        - `baseFilename` (sanitized)
        - `coverArt` { url, filename (sanitized, with `[ext]` placeholder) }
        - `details` { content, filename (sanitized) }
        - `icons` [ { url, filename (sanitized, with `[ext]` placeholder) }, ... ]
        - `audio` [ { url, filename (sanitized, with `[ext]` placeholder) }, ... ]
3.  **Message Passing (`content.js` -> `background.js`)**: 
    - `content.js` sends an `action: "createAndDownloadZip"` message to `background.js` containing the data payload and the `sender.tab.id`.
4.  **Background Handling (`background.js`)**: 
    - The `onMessage` listener receives the action and calls `handleCreateAndDownloadZip`, passing the data payload and `tabId`.
    - `JSZip` library is initialized.
5.  **Asset Fetching (`background.js`)**: 
    - `handleCreateAndDownloadZip` iterates through the cover art, icons, and audio arrays.
    - For each item with a URL, it uses `fetch` to get the content as a `Blob`.
    - Progress updates (`sendProgress` -> `sendUpdateState` -> `chrome.tabs.sendMessage`) are sent to the initiating tab after each successful or failed fetch.
6.  **ZIP Assembly (`background.js`)**: 
    - As each asset Blob is fetched, its extension is determined (forced `.png` for cover art, Content-Type check + `.mp3` fallback for audio/icons via `getExtensionFromMimeType`).
    - The asset is added to the `JSZip` instance using `zip.file(filename, blob)`, where `filename` is constructed using the name from the payload and the determined extension (replacing `[ext]`).
    - The `details.txt` content is added directly using `zip.file(details.filename, details.content)`.
7.  **ZIP Generation (`background.js`)**: 
    - `zip.generateAsync({ type: "blob", ... }, metadataCallback)` is called.
    - The `metadataCallback` receives percentage updates during compression, which are relayed to the content script via `sendProgress`.
8.  **Data URL Conversion (`background.js`)**: 
    - The generated ZIP `Blob` is read using a `FileReader`'s `readAsDataURL` method.
9.  **Download Trigger (`background.js`)**: 
    - Once the `FileReader` completes (`onloadend`), the resulting Data URL is passed to `chrome.downloads.download`.
    - The suggested filename for the download is `{baseFilename}.zip`.
10. **Final State Update (`background.js`)**: 
    - After the `chrome.downloads.download` call successfully initiates, a final `updateState` message (status: "ZIP Download Complete!", `inProgress: false`) is sent to the initiating tab.
    - Error states are also sent via `sendUpdateState` if any step fails.
11. **UI Update (ZIP)**: `content.js` receives `updateState` messages from `background.js` via its `onMessage` listener, updating the progress bar, status text, and final button state accordingly. 