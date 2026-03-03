/**
 * ContextBlur - Background Service Worker
 * Handles extension state, messaging, side panel management, and Pro licensing
 */

importScripts('ExtPay.js');

(() => {
  'use strict';

  // ExtPay initialization
  const extpay = ExtPay('contextblur');
  extpay.startBackground();

  // Pro status cache
  let cachedProStatus = null;
  let proStatusLastChecked = 0;
  const PRO_STATUS_CACHE_MS = 60000;

  // Listen for payment events
  extpay.onPaid.addListener((user) => {
    cachedProStatus = buildProStatus(user);
    broadcastProStatus(cachedProStatus);
  });

  extpay.onTrialStarted.addListener((user) => {
    cachedProStatus = buildProStatus(user);
    broadcastProStatus(cachedProStatus);
  });

  // State management per tab
  const tabStates = new Map();

  // Popup handles icon click; side panel is opened on demand
  // Guard for Firefox where sidePanel API doesn't exist (uses sidebarAction instead)
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
  }

  // Handle messages from content scripts, side panel, and popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true;
  });

  async function handleMessage(message, sender, sendResponse) {
    const tabId = sender.tab?.id || message.tabId;

    switch (message.type) {
      // ── Pro/Payment ──
      case 'GET_PRO_STATUS':
        const proStatus = await getProStatus(message.forceRefresh);
        sendResponse(proStatus);
        break;

      case 'OPEN_PAYMENT_PAGE':
        try {
          await extpay.openPaymentPage();
          sendResponse({ success: true });
        } catch (e) {
          console.error('ContextBlur: Failed to open payment page', e);
          sendResponse({ success: false, error: e.message || String(e) });
        }
        break;

      case 'START_TRIAL':
        try {
          await extpay.openTrialPage('7-day');
          sendResponse({ success: true });
        } catch (e) {
          console.error('ContextBlur: Failed to open trial page', e);
          sendResponse({ success: false, error: e.message || String(e) });
        }
        break;

      case 'OPEN_LOGIN_PAGE':
        try {
          await extpay.openLoginPage();
          sendResponse({ success: true });
        } catch (e) {
          console.error('ContextBlur: Failed to open login page', e);
          sendResponse({ success: false, error: e.message || String(e) });
        }
        break;

      // ── Blur State ──
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

      // ── Pro Features ──
      case 'SET_BLUR_INTENSITY':
        await setBlurIntensity(message.tabId, message.intensity);
        sendResponse({ success: true });
        break;

      case 'SET_BLUR_STYLE':
        await setBlurStyle(message.tabId, message.style);
        sendResponse({ success: true });
        break;

      case 'SAVE_DOMAIN_SETTINGS':
        await saveDomainSettings(message.domain, message.settings);
        sendResponse({ success: true });
        break;

      case 'GET_DOMAIN_SETTINGS':
        const settings = await getDomainSettings(message.domain);
        sendResponse({ settings });
        break;

      case 'SET_DOMAIN_LIST':
        await setDomainList(message.listType, message.domains);
        sendResponse({ success: true });
        break;

      case 'GET_DOMAIN_LIST':
        const list = await getDomainList(message.listType);
        sendResponse({ list });
        break;

      // ── UI ──
      case 'BLUR_MODE_TOGGLED':
        forwardToExtensionViews(message);
        sendResponse({ success: true });
        break;

      case 'OPEN_SIDE_PANEL':
        try {
          if (chrome.sidePanel && chrome.sidePanel.open) {
            await chrome.sidePanel.open({ windowId: message.windowId });
          } else if (typeof browser !== 'undefined' && browser.sidebarAction) {
            await browser.sidebarAction.open();
          }
          sendResponse({ success: true });
        } catch (e) {
          console.log('Could not open side panel:', e);
          sendResponse({ success: false, error: e.message });
        }
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
    }
  }

  // ── Pro Status ──

  function buildProStatus(user) {
    const now = Date.now();
    const trialStarted = user.trialStartedAt ? new Date(user.trialStartedAt).getTime() : 0;
    const trialActive = trialStarted > 0 && (now - trialStarted < 7 * 24 * 60 * 60 * 1000);

    return {
      isPro: user.paid || trialActive,
      paid: user.paid,
      trial: trialActive,
      trialStartedAt: user.trialStartedAt,
      trialDaysLeft: trialActive
        ? Math.ceil((7 * 24 * 60 * 60 * 1000 - (now - trialStarted)) / (1000 * 60 * 60 * 24))
        : 0,
      subscriptionStatus: user.subscriptionStatus,
      email: user.email
    };
  }

  async function getProStatus(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedProStatus && (now - proStatusLastChecked < PRO_STATUS_CACHE_MS)) {
      return cachedProStatus;
    }

    try {
      const user = await extpay.getUser();
      cachedProStatus = buildProStatus(user);
      proStatusLastChecked = now;
      return cachedProStatus;
    } catch (e) {
      console.error('ContextBlur: Failed to get pro status', e);
      return { isPro: false, paid: false, trial: false, trialDaysLeft: 0, subscriptionStatus: null, email: null };
    }
  }

  function broadcastProStatus(status) {
    chrome.runtime.sendMessage({ type: 'PRO_STATUS_UPDATED', status }).catch(() => {});
  }

  // ── Tab State ──

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

  function forwardToExtensionViews(message) {
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  async function setBlurMode(tabId, enabled) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurModeEnabled = enabled;
    tabStates.set(tabId, state);

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'BLUR_MODE_CHANGED', enabled });
    } catch (e) {
      console.log('Could not send message to tab:', e);
    }
  }

  async function updateBlurCount(tabId, count, url) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurCount = count;
    tabStates.set(tabId, state);
  }

  // ── Storage ──

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

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_ALL_BLURS' });
    } catch (e) {
      console.log('Could not send clear message to tab:', e);
    }

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

  // ── Pro Feature Storage ──

  async function setBlurIntensity(tabId, intensity) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurIntensity = intensity;
    tabStates.set(tabId, state);

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'SET_BLUR_INTENSITY', intensity });
    } catch (e) {
      console.log('Could not send intensity to tab:', e);
    }
  }

  async function setBlurStyle(tabId, style) {
    const state = tabStates.get(tabId) || { blurModeEnabled: false, blurCount: 0 };
    state.blurStyle = style;
    tabStates.set(tabId, state);

    try {
      await chrome.tabs.sendMessage(tabId, { type: 'SET_BLUR_STYLE', style });
    } catch (e) {
      console.log('Could not send style to tab:', e);
    }
  }

  async function saveDomainSettings(domain, settings) {
    const key = `domain_${domain}`;
    await chrome.storage.local.set({ [key]: settings });
  }

  async function getDomainSettings(domain) {
    const key = `domain_${domain}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  }

  async function setDomainList(listType, domains) {
    const key = `domainList_${listType}`;
    await chrome.storage.local.set({ [key]: domains });
  }

  async function getDomainList(listType) {
    const key = `domainList_${listType}`;
    const result = await chrome.storage.local.get(key);
    return result[key] || [];
  }

  // ── Lifecycle ──

  chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      const state = tabStates.get(tabId);
      if (state) {
        state.blurModeEnabled = false;
        tabStates.set(tabId, state);
      }
    }
  });
})();
