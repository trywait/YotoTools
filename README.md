# Yoto Tools Chrome Extension

A Chrome extension designed to help Yoto card owners create personal backups of their legally purchased content. This tool assists in archiving your owned Yoto card content for personal use and backup purposes.

![Yoto Tools Screenshot](icons/128.png)

## Important Notice

This tool is intended **ONLY** for:
- Creating personal backups of Yoto cards you have legally purchased
- Archiving your owned content for personal use
- Ensuring access to your purchased content for offline educational or backup purposes

**Please Note**: This tool should only be used to backup content you have legitimately purchased. Unauthorized distribution or sharing of backed-up content may violate copyright laws.

## Features

- 🔒 **Personal Backup**: Create backups of your purchased Yoto card content
- 📚 **Content Archive**: Save and organize your owned content for offline access
- 🎨 **Simple UI**: Clean and simple design with synchronized state and progress display
- 🔐 **Privacy-Focused**: Works entirely client-side with minimal permissions

## Legal Usage

This extension is designed for:
1. **Personal Backup**: Creating archives of your purchased content
2. **Offline Access**: Ensuring access to your owned content when internet isn't available
3. **Educational Use**: Allowing teachers and parents to prepare educational materials from legally purchased content

Do NOT use this extension to:
- Share or distribute content
- Create copies for non-owners
- Make unauthorized duplicates

## Prerequisites

Before using this extension, you'll need:
- Google Chrome Browser
- This extension installed (steps below)
- NFC Tools app ([Android](https://play.google.com/store/apps/details?id=com.wakdev.wdnfc) | [iOS](https://apps.apple.com/us/app/nfc-tools/id1252962749))
  - For iOS: Requires iPhone 7 or newer with iOS 15.6+
  - Free app with optional Pro features
- Your legally purchased Yoto cards

## Installation

### Manual Installation (Developer Mode)
1. Download or clone this repository (by pasting this into your terminal):
   ```bash
   git clone https://github.com/trywait/YotoTools.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked"
5. Select the directory containing the extension files
6. Once loaded, click the puzzle piece icon (Extensions) in Chrome's toolbar
7. Find "Yoto Tools" in the dropdown list
8. Click the pin icon next to it to keep it visible in your toolbar (optional)

## Usage

### Step 1: Get Your Card's URL
1. Install NFC Tools on your mobile device:
   - [iOS App Store](https://apps.apple.com/us/app/nfc-tools/id1252962749) (requires iPhone 7 or newer, iOS 15.6+)
   - [Android Play Store](https://play.google.com/store/apps/details?id=com.wakdev.wdnfc)
2. Open NFC Tools and scan your Yoto card
3. Look for "Record 1" in the scan results
4. Find the URL that looks like: `yoto.io/ABC123?xxxxxxx=yyyyyyyy`
5. Copy or note down this URL

### Step 2: Access the Card Page
1. On your computer (not phone), open Chrome
2. Paste the `yoto.io` URL you found in Step 1
3. The URL will redirect to the official Yoto card page
4. Wait for the page to fully load

### Step 3: Use the Extension
1. Once on the card page (after it redirects), you'll see download buttons directly on the screen:
   *Note: Do not refresh this page as it will lead to a 404 error. If this happens, simply return to Step 1.4 and re-enter the original `yoto.io` URL.*
   - **Save Complete Backup**: Downloads all card content into an organized folder
   - **Save Card Details**: Saves a text file with the card's information
   - **Save Card Artwork**: Downloads the card's cover art
   - **Save Audio / Save Audio**: Downloads that specific track audio or icon
   
2. You can also click the Yoto Tools extension icon in your Chrome toolbar for quick actions.

Both methods will save your files in the same organized way, so you can use whichever is more convenient.

### Step 4: Locate Your Backups
1. By default, files are saved to your computer's Downloads folder
2. A new folder will be created named after your card (e.g., "Jack and the Beanstalk")
3. Inside the folder, you'll find:
   - Audio files named: `Track 1 - [Title].mp4`, `Track 2 - [Title].mp4`, etc.
   - Chapter/Track images named: `Image 1 - [Track Title].jpg`, `Image 2 - [Track Title].jpg`, etc. (if available)
   - Cover artwork named: `Cover Art - [Card Title].jpg`
   - Card information saved as: `[Card Title] - Details.txt`
4. All files are automatically organized and numbered in the order they appear on the card

*Note: Audio files are downloaded in .mp4 format. For better compatibility with media players and devices, you may want to convert them to .mp3 format. We recommend using [FFmpeg](https://ffmpeg.org/) ([GitHub](https://github.com/FFmpeg/FFmpeg)) or another audio conversion tool of your choice to process the files.*

### Important Notes
- Always ensure you're backing up cards you own
- Keep your backups secure and for personal use only
- The extension works on official Yoto card pages matching these patterns:
  - `https://play.yotoplay.com/*/card/*`
  - `https://share.yoto.co/*`
- Make sure to keep your NFC Tools app updated

## Privacy & Security

We prioritize your privacy:
- No data collection
- No external servers
- All processing happens locally in your browser
- No analytics or tracking
- Your content remains private and secure

## Development

For detailed information about the project's structure, components, and how they interact, please see the [ARCHITECTURE.md](ARCHITECTURE.md) document. This includes comprehensive documentation about:
- Component roles and responsibilities
- Communication flow between components
- State management
- Data flow
- Future considerations

### Project Structure
```
yoto-tools/
├── icons/              # Extension icons (16, 32, 48, 128px)
│   ├── 16.png         # Small icon for extension menu
│   ├── 32.png         # Medium icon for extension menu
│   ├── 48.png         # Large icon for extension menu
│   └── 128.png        # Extra large icon for Chrome Web Store
├── popup.html         # Extension popup interface
├── popup.js          # Popup functionality and state synchronization
├── content.js        # Content script for page interaction and state management
├── background.js     # Service worker for download handling
├── manifest.json     # Extension configuration
├── ARCHITECTURE.md   # Detailed technical documentation and component interactions
├── LICENSE          # MIT License file
└── README.md         # User documentation and setup guide
```

### Technical Details

#### State Management
- The content script (`content.js`) maintains the source of truth for download state
- The popup queries the current state when opened, ensuring accurate display
- Progress and error states are synchronized between the page and popup
- No external storage needed - state is maintained in the page DOM

#### User Interface
- Clean, modern design with intuitive controls
- Real-time progress updates in both popup and page
- Consistent state display across interface elements
- Smooth transitions and clear status indicators

### Building from Source
1. Clone the repository
2. Make any desired modifications
3. Load the extension in Chrome using Developer mode

## Contributing

We welcome contributions that respect intellectual property rights and focus on:
- Improving backup functionality
- Enhancing user privacy
- Strengthening security
- Improving documentation

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Legal Disclaimer

This extension is not affiliated with, endorsed by, or sponsored by Yoto. Yoto is a registered trademark of Yoto Limited. This tool is provided as-is without any warranty of any kind.

This tool is designed solely for creating personal backups of legally purchased content. Users are responsible for ensuring their use of this tool complies with:
- Copyright laws
- Terms of service
- Licensing agreements
- Local regulations regarding content backup

The developers do not endorse or encourage any unauthorized copying or distribution of copyrighted material.

## Support

If you encounter any issues or have questions:
1. Check the [Issues](https://github.com/trywait/YotoTools/issues) page (Please update this link!)
2. Create a new issue if needed
3. Provide detailed information about the problem

---

Made with ❤️ for the Yoto community for personal use