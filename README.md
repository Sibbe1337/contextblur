# ContextBlur

A Chrome extension that lets you blur content on any webpage with a simple click. Perfect for screen sharing, presentations, and visual privacy during demos.

![ContextBlur](icons/icon128.png)

## Features

- **Click-to-Blur**: Select any element on a webpage to instantly blur it
- **Smart Selection**: Automatically targets the most specific element (text, images, inputs) to avoid over-blurring
- **Persistent Blurs**: Blurred elements stay hidden even after page refresh
- **Optional Auto-blur**: Scan visible page text to find and blur emails, phone numbers, SSNs, credit cards (runs only when you click "Run auto-blur now")
- **Beautiful UI**: Apple-inspired frosted glass design
- **100% Local**: All processing happens in your browser. No data transmitted.

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked**
5. Select the extension directory

### Usage

1. Click the ContextBlur icon in your browser toolbar to open the side panel
2. Toggle **Selection Mode** to activate blur selection
3. Hover over elements to see the highlight ring
4. Click any element to blur it
5. Use **Clear All** to remove all blurs from the current page

#### Auto-blur (Optional)

1. Open the side panel
2. Select which types to detect (emails, phones, cards, SSN)
3. Click **Run auto-blur now**
4. First time: accept the privacy disclosure
5. View results: "Auto-blurred X items"

## Technical Details

### Manifest V3 Compliant
Built with Chrome's latest extension architecture for optimal performance.

### Architecture

| File | Purpose |
|------|---------|
| `manifest.json` | Extension configuration |
| `background.js` | Service worker for state management |
| `content.js` | Injected script for blur functionality |
| `content.css` | Styles for highlights and blur effects |
| `sidepanel.html` | Side panel UI |
| `sidepanel.js` | Side panel logic |
| `sidepanel.css` | Side panel styles |

### Performance

- **Single Event Listener**: Uses event delegation on the document for minimal memory usage
- **Smart Targeting**: Avoids blurring large containers unnecessarily
- **Efficient Storage**: Only stores CSS selectors, not element data
- **One-shot Scanning**: Auto-blur runs once per user action, no background loops

### Permissions

| Permission | Reason |
|------------|--------|
| `storage` | Save blur state per URL |
| `sidePanel` | Display the control panel |

### Host Permissions

| Pattern | Reason |
|---------|--------|
| `http://*/*`, `https://*/*` | Apply blur effects on any website user visits |

## Privacy

ContextBlur is designed with privacy as the core principle:

- ✅ No data transmission — everything stays local
- ✅ No analytics or tracking
- ✅ No external dependencies — all code bundled locally
- ✅ Auto-blur requires explicit user action
- ✅ First-use disclosure before scanning page text
- ✅ Open source

### What auto-blur does

When you click "Run auto-blur now", the extension:
1. Reads visible text on the current page (locally)
2. Matches patterns for emails, phones, SSNs, credit cards
3. Wraps matches in blur spans
4. **Does NOT store or transmit any detected data**

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` | Toggle blur mode |
| `Escape` | Deactivate blur mode |

## Development

```bash
# Clone the repository
git clone <repo-url>
cd ContextBlur

# Load in Chrome
# 1. Go to chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked" and select this directory
```

## License

MIT License — feel free to use, modify, and distribute.

---

Made with 💜 for screen sharing
