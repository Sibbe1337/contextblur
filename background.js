/**
 * ContextBlur - Background Service Worker
 * Handles extension state, messaging, and side panel management
 */

(() => {
  'use strict';

  // State management per tab
  const tabStates = new Map();

  // Initialize side panel behavior
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  // Handle extension icon click
  chrome.action.onClicked.addListener(async (tab) => {
    await chrome.sidePanel.open({ tabId: tab.id });
  });

  // Handle messages from content scripts and side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
  });

  async function handleMessage(message, sender, sendResponse) {
    const tabId = sender.tab?.id || message.tabId;

    switch (message.type) {
      case 'GET_STATE':
        sendResponse(await getTabState(message.tabId));
        break;

      case 'SET_BLUR_MODE':
        await setBlurMode(message.tabId, message.enabled);
        sendResponse({ success: true });
        break;

      case 'UPDATE_BLUR_COUNT':
        await updateBlurCount(tabId, message.count, message.url);
        sendResponse({ success: true });
        break;

      case 'GET_STORED_BLURS':
        const blurs = await getStoredBlurs(message.url);
        sendResponse({ selectors: blurs });
        break;

      case 'SAVE_BLUR':
        await saveBlur(message.url, message.selector);
        sendResponse({ success: true });
        break;

      case 'CLEAR_ALL_BLURS':
        await clearAllBlurs(message.url, message.tabId);
        sendResponse({ success: true });
        break;

      case 'GET_BLUR_COUNT':
        const count = await getBlurCount(message.url);
        sendResponse({ count });
        break;

      case 'SET_AUTO_BLUR':
        await setAutoBlur(message.tabId, message.enabled, message.types);
        sendResponse({ success: true });
        break;

      case 'BLUR_MODE_TOGGLED':
        // Forward to side panel (broadcast)
        forwardToSidePanel(message);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  async function getTabState(tabId) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0, autoBlurEnabled: false };
    return state;
  }

  async function setAutoBlur(tabId, enabled, types) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0, autoBlurEnabled: false };
    state.autoBlurEnabled = enabled;
    state.autoBlurTypes = types;
    tabStates.set(tabId, state);
  }

  function forwardToSidePanel(message) {
    // Broadcast to all extension views (sidepanel will receive it)
    chrome.runtime.sendMessage(message).catch(() => {
      // No listeners, ignore
    });
  }

  async function setBlurMode(tabId, enabled) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurModeEnabled = enabled;
    tabStates.set(tabId, state);

    // Notify content script
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'BLUR_MODE_CHANGED',
        enabled
      });
    } catch (e) {
      // Tab might not have content script loaded yet
      console.log('Could not send message to tab:', e);
    }
  }

  async function updateBlurCount(tabId, count, url) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurCount = count;
    tabStates.set(tabId, state);
  }

  async function getStoredBlurs(url) {
    const key = `blurs_${normalizeUrl(url)}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || [];
  }

  async function saveBlur(url, selector) {
    const key = `blurs_${normalizeUrl(url)}`;
    const existing = await getStoredBlurs(url);
    if (!existing.includes(selector)) {
      existing.push(selector);
      await chrome.storage.local.set({ [key]: existing });
    }
  }

  async function clearAllBlurs(url, tabId) {
    const key = `blurs_${normalizeUrl(url)}`;
    await chrome.storage.local.remove(key);

    // Notify content script
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_ALL_BLURS' });
    } catch (e) {
      console.log('Could not send clear message to tab:', e);
    }

    // Update state
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurCount = 0;
    tabStates.set(tabId, state);
  }

  async function getBlurCount(url) {
    const selectors = await getStoredBlurs(url);
    return selectors.length;
  }

  function normalizeUrl(url) {
    try {
      const parsed = new URL(url);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return url;
    }
  }

  // Clean up state when tabs are closed
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
  });

  // Handle tab updates (navigation)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      // Reset blur mode on navigation
      const state = tabStates.get(tabId);
      if (state) {
        state.blurModeEnabled = false;
        tabStates.set(tabId, state);
      }
    }
  });
})();

