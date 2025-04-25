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
    - **Download Actions**: 
        - Routes action messages (`bulkDownload`, `downloadCoverArt`, etc.) to domain-specific functions (e.g., `bulkDownload` vs `bulkDownloadMyYoto`).
        - `bulkDownload` / `bulkDownloadMyYoto`: Gather all relevant file info (cover, details, icons, audio URLs). Initiate downloads by sending `downloadFile` messages to `background.js`. Update UI state using shared helper functions (`updateStatus`, `showProgress`, `setButtonWorking/Success/Error`).
        - Individual download handlers (`downloadCoverArt`, `downloadCardDetails`, etc.) handle specific file downloads and update relevant button states.
        - Handles individual button clicks for tracks.
    - **Helper Functions**: 
        - `createMyYotoButton()`: Creates styled buttons consistently.
        - `sanitizeFileName()`: Cleans filenames.
        - State update functions (`updateStatus`, `showProgress`, `hideProgress`, `setButtonWorking`, `setButtonSuccess`, `setButtonError`): Manage UI feedback and send `updateState` message to background.
        - SVG icon functions.
- **Key Functions**:
    - `chrome.runtime.onMessage.addListener`: Handles incoming messages.
    - `findAndParseData()`, `findAndParseMyYotoData()`: Domain-specific data extraction.
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
    - Handles `updateState` messages from `content.js`: 
        - Updates the download state stored in `chrome.storage.local`.
        - Forwards the state update message using `chrome.runtime.sendMessage` to update any open popup instance.
    - Handles `getDownloadState` messages from `popup.js`:
        - Retrieves the current state from `chrome.storage.local` and sends it back.
- **Key Functions**:
    - `chrome.runtime.onMessage.addListener`: Handles `downloadFile`, `fetchApiData`, `updateState`, `getDownloadState` messages.
    - Async function within `fetchApiData` handler to perform the two-step API calls.

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

## State Management

- **UI State**: Primarily managed within `content.js` using helper functions (`updateStatus`, `showProgress`, etc.) that directly manipulate the injected DOM elements.
- **Canonical Download State**: Managed by `background.js` using `chrome.storage.local` (`downloadState` object containing `inProgress`, `progress`, `status`, `statusColor`, `error`). This state is the single source of truth for the popup.
- **Synchronization**: `content.js` pushes state changes to `background.js` via `updateState`. `background.js` updates storage and pushes changes to the popup. The popup queries the state from storage on load.

## Data Flow

- **Primary Data Source**: 
    - `share.yoto.co`/`play.yotoplay.com`: `__NEXT_DATA__` JSON object and DOM scraping.
    - `my.yotoplay.com`: DOM scraping (for editable fields) + **Yoto API via Background Script** (for metadata and signed audio URLs, requires authentication token).
- **Token Retrieval (`my.yotoplay.com`)**: `content.js` reads `access_token` from `localStorage`.
- **API Calls (`my.yotoplay.com`)**: Performed by `background.js` (`/content/` and `/card/resolve/`) using token provided by `content.js`.
- **Data Extraction**: Handled by domain-specific functions in `content.js`.
- **Data Usage**: Used by `content.js` to determine download URLs/content and passed to `background.js` via `downloadFile` messages.

## Future Considerations

- **Error Handling**: Can be enhanced with more granular feedback and potentially retry mechanisms, especially for API calls.
- **Token Refresh**: The current method relies on a valid token in `localStorage`. Handling expired tokens might require intercepting API calls or finding a refresh mechanism.
- **API Changes**: Reliance on Yoto page structure and private API endpoints means the extension is susceptible to breakage if Yoto updates its site/API.
- **Code Refactoring**: Further opportunities might exist to consolidate shared logic between domain-specific functions.
- **Client-Side File Conversion**: Implement browser-based file conversion using WebAssembly-compiled FFmpeg to allow users to convert downloaded files to .mp3 format directly within the extension. 