#!/usr/bin/env node
/**
 * ContextBlur - Multi-browser Build Script
 *
 * Usage:
 *   node build.js              # Build all browsers
 *   node build.js chrome       # Build Chrome only
 *   node build.js firefox      # Build Firefox only
 *   node build.js edge         # Build Edge only
 *
 * Output:
 *   dist/chrome/   — Chrome Web Store package
 *   dist/firefox/  — Firefox Add-ons (AMO) package
 *   dist/edge/     — Edge Add-ons package
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

// Files shared by all browsers
const SHARED_FILES = [
  'content.js',
  'content.css',
  'ExtPay.js',
  'pro-features.js',
  'analytics.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'sidepanel.html',
  'sidepanel.js',
  'sidepanel.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

// Base manifest (Chrome)
function getBaseManifest() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
}

// ─── Chrome Build ───────────────────────────────────────────────

function buildChrome() {
  const dir = path.join(DIST, 'chrome');
  cleanDir(dir);

  // Copy shared files
  SHARED_FILES.forEach(f => copyFile(f, dir));

  // Copy background.js as-is (uses importScripts + service_worker)
  copyFile('background.js', dir);

  // Chrome manifest — use as-is
  const manifest = getBaseManifest();
  writeJSON(path.join(dir, 'manifest.json'), manifest);

  console.log('  Chrome build complete → dist/chrome/');
}

// ─── Firefox Build ──────────────────────────────────────────────

function buildFirefox() {
  const dir = path.join(DIST, 'firefox');
  cleanDir(dir);

  // Copy shared files
  SHARED_FILES.forEach(f => copyFile(f, dir));

  // Copy browser-compat.js
  copyFile('browser-compat.js', dir);

  // Firefox background: use background.scripts (not service_worker)
  // Firefox MV3 supports background.scripts with persistent: false
  // We need to transform background.js to remove importScripts() since
  // Firefox loads scripts via manifest background.scripts array
  let bgCode = fs.readFileSync(path.join(ROOT, 'background.js'), 'utf8');

  // Remove the importScripts line — ExtPay.js will be loaded via manifest
  bgCode = bgCode.replace(/^importScripts\([^)]*\);\s*/m, '');

  // Remove chrome.sidePanel references that trigger AMO warnings.
  // The browser-compat.js shim and sidebarAction handle this on Firefox.
  // Replace the sidePanel.setPanelBehavior guard block
  bgCode = bgCode.replace(
    /\s*\/\/ Popup handles icon click.*\n\s*\/\/ Guard for Firefox.*\n\s*if \(chrome\.sidePanel && chrome\.sidePanel\.setPanelBehavior\) \{\n\s*chrome\.sidePanel\.setPanelBehavior\(\{ openPanelOnActionClick: false \}\);\n\s*\}/,
    '\n  // Firefox: sidebar is managed via sidebar_action in manifest'
  );

  // Replace the OPEN_SIDE_PANEL handler to only use sidebarAction on Firefox
  bgCode = bgCode.replace(
    /case 'OPEN_SIDE_PANEL':\n\s*try \{\n\s*if \(chrome\.sidePanel && chrome\.sidePanel\.open\) \{\n\s*await chrome\.sidePanel\.open\(\{ windowId: message\.windowId \}\);\n\s*\} else if \(typeof browser !== 'undefined' && browser\.sidebarAction\) \{\n\s*await browser\.sidebarAction\.open\(\);\n\s*\}\n\s*sendResponse\(\{ success: true \}\);\n\s*\} catch \(e\) \{\n\s*console\.log\('Could not open side panel:', e\);\n\s*sendResponse\(\{ success: false, error: e\.message \}\);\n\s*\}\n\s*break;/,
    `case 'OPEN_SIDE_PANEL':\n        try {\n          if (typeof browser !== 'undefined' && browser.sidebarAction) {\n            await browser.sidebarAction.open();\n          }\n          sendResponse({ success: true });\n        } catch (e) {\n          console.log('Could not open sidebar:', e);\n          sendResponse({ success: false, error: e.message });\n        }\n        break;`
  );

  fs.writeFileSync(path.join(dir, 'background.js'), bgCode, 'utf8');

  // Firefox popup.js: replace sidePanel.open with sidebarAction only
  let popupCode = fs.readFileSync(path.join(ROOT, 'popup.js'), 'utf8');

  // Replace the entire handleOpenSidePanel function to remove chrome.sidePanel refs
  popupCode = popupCode.replace(
    /async function handleOpenSidePanel\(\) \{[\s\S]*?^  \}/m,
    `async function handleOpenSidePanel() {
    ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.SIDE_PANEL_OPENED);

    try {
      if (typeof browser !== 'undefined' && browser.sidebarAction) {
        await browser.sidebarAction.open();
      }
      globalThis.close();
    } catch (e) {
      console.error('ContextBlur: Failed to open sidebar', e);
    }
  }`
  );

  fs.writeFileSync(path.join(dir, 'popup.js'), popupCode, 'utf8');

  // Firefox manifest
  const manifest = getBaseManifest();

  // Firefox browser_specific_settings
  manifest.browser_specific_settings = {
    gecko: {
      id: 'contextblur@contextblur.app',
      strict_min_version: '142.0',
      data_collection_permissions: {
        required: ['none'],
        optional: []
      }
    }
  };

  // Firefox MV3: use background.scripts instead of service_worker
  manifest.background = {
    scripts: ['ExtPay.js', 'browser-compat.js', 'background.js']
  };

  // Firefox uses sidebar_action instead of side_panel
  delete manifest.side_panel;
  manifest.sidebar_action = {
    default_title: 'ContextBlur',
    default_panel: 'sidepanel.html',
    default_icon: {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png'
    }
  };

  // Firefox: remove sidePanel from permissions (not recognized)
  manifest.permissions = manifest.permissions.filter(p => p !== 'sidePanel');

  // Firefox CSP: extension_pages key is the same for MV3
  // No changes needed

  writeJSON(path.join(dir, 'manifest.json'), manifest);

  console.log('  Firefox build complete → dist/firefox/');
}

// ─── Edge Build ─────────────────────────────────────────────────

function buildEdge() {
  const dir = path.join(DIST, 'edge');
  cleanDir(dir);

  // Copy shared files
  SHARED_FILES.forEach(f => copyFile(f, dir));

  // Copy background.js as-is (Edge is Chromium-based, same as Chrome)
  copyFile('background.js', dir);

  // Edge manifest — almost identical to Chrome
  const manifest = getBaseManifest();

  // Edge doesn't need special settings, but we add update_url for Edge Add-ons
  // (Optional — only needed for self-hosted extensions, not store-published)

  writeJSON(path.join(dir, 'manifest.json'), manifest);

  console.log('  Edge build complete → dist/edge/');
}

// ─── Utilities ──────────────────────────────────────────────────

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(relPath, destDir) {
  const src = path.join(ROOT, relPath);
  const dest = path.join(destDir, relPath);

  if (!fs.existsSync(src)) {
    console.warn(`  Warning: ${relPath} not found, skipping`);
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

// ─── Zip Packaging ──────────────────────────────────────────────

function zipBuild(browser) {
  const dir = path.join(DIST, browser);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const version = manifest.version;
  const zipName = `contextblur-${browser}-v${version}.zip`;
  const zipPath = path.join(DIST, zipName);

  // Remove old zip if exists
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  try {
    execSync(`cd "${dir}" && zip -r "${zipPath}" . -x ".*"`, { stdio: 'pipe' });
    console.log(`  Packaged → dist/${zipName}`);
  } catch (e) {
    console.warn(`  Warning: Could not create zip for ${browser} (zip command not found?)`);
  }
}

// ─── Main ───────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const target = args.find(a => !a.startsWith('--')) || 'all';
  const shouldZip = args.includes('--zip');

  console.log('ContextBlur — Building extensions...\n');

  const browsers = [];
  if (target === 'all' || target === 'chrome') { buildChrome(); browsers.push('chrome'); }
  if (target === 'all' || target === 'firefox') { buildFirefox(); browsers.push('firefox'); }
  if (target === 'all' || target === 'edge') { buildEdge(); browsers.push('edge'); }

  if (shouldZip) {
    console.log('');
    browsers.forEach(b => zipBuild(b));
  }

  console.log('\nDone.');
}

main();
