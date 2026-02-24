/**
 * ContextBlur - Popup Controller
 * Quick access to blur mode toggle, side panel, and Pro upgrade
 */

(() => {
  'use strict';

  const blurToggleBtn = document.getElementById('blurToggleBtn');
  const toggleText = document.getElementById('toggleText');
  const iconOn = document.getElementById('iconOn');
  const iconOff = document.getElementById('iconOff');
  const activeIndicator = document.getElementById('activeIndicator');
  const openSidePanelBtn = document.getElementById('openSidePanelBtn');
  const blurCountSection = document.getElementById('blurCountSection');
  const blurCountEl = document.getElementById('blurCount');
  const popupProBadge = document.getElementById('popupProBadge');
  const popupUpgradeCard = document.getElementById('popupUpgradeCard');
  const popupUpgradeBtn = document.getElementById('popupUpgradeBtn');
  const proFeatureList = document.getElementById('proFeatureList');

  let currentTabId = null;
  let currentUrl = null;
  let blurModeEnabled = false;

  init();

  async function init() {
    await getCurrentTab();
    await loadState();
    await initPopupProStatus();
    setupEventListeners();
  }

  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTabId = tab.id;
      currentUrl = tab.url;
    }
  }

  async function loadState() {
    if (!currentTabId) return;

    try {
      const state = await chrome.runtime.sendMessage({
        type: 'GET_STATE',
        tabId: currentTabId
      });

      if (state) {
        blurModeEnabled = state.blurModeEnabled;
        updateUI();
      }

      const countResponse = await chrome.runtime.sendMessage({
        type: 'GET_BLUR_COUNT',
        url: currentUrl
      });

      if (countResponse && typeof countResponse.count === 'number') {
        updateBlurCount(countResponse.count);
      }
    } catch (e) {
      console.error('ContextBlur: Failed to load state', e);
    }
  }

  // ── Pro Status ──

  async function initPopupProStatus() {
    const status = await ContextBlurPro.checkStatus();
    updatePopupProUI(status);

    ContextBlurPro.onStatusChange((newStatus) => {
      updatePopupProUI(newStatus);
    });
  }

  function updatePopupProUI(status) {
    popupProBadge.textContent = ContextBlurPro.getTrialBadgeText();
    popupProBadge.className = `popup-tier-badge ${ContextBlurPro.getBadgeClass()}`;

    if (status.isPro) {
      popupUpgradeCard.classList.add('hidden');
      proFeatureList.classList.add('hidden');
    } else {
      popupUpgradeCard.classList.remove('hidden');
      proFeatureList.classList.remove('hidden');
    }
  }

  // ── Events ──

  function setupEventListeners() {
    blurToggleBtn.addEventListener('click', handleToggle);
    openSidePanelBtn.addEventListener('click', handleOpenSidePanel);

    popupUpgradeBtn.addEventListener('click', () => {
      ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.TRIAL_START_CLICK);
      ContextBlurPro.startTrial();
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'BLUR_MODE_TOGGLED') {
        blurModeEnabled = message.enabled;
        updateUI();
      }
      if (message.type === 'UPDATE_BLUR_COUNT') {
        updateBlurCount(message.count);
      }
    });
  }

  async function handleToggle() {
    if (!currentTabId) await getCurrentTab();

    blurModeEnabled = !blurModeEnabled;

    try {
      await chrome.runtime.sendMessage({
        type: 'SET_BLUR_MODE',
        tabId: currentTabId,
        enabled: blurModeEnabled
      });

      updateUI();

      if (blurModeEnabled) {
        ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.BLUR_MODE_ON);
      }
    } catch (e) {
      console.error('ContextBlur: Failed to toggle blur mode', e);
      blurModeEnabled = !blurModeEnabled;
      updateUI();
    }
  }

  async function handleOpenSidePanel() {
    ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.SIDE_PANEL_OPENED);

    try {
      // Firefox: use sidebarAction if available
      if (typeof browser !== 'undefined' && browser.sidebarAction) {
        await browser.sidebarAction.open();
        globalThis.close();
        return;
      }

      // Chrome/Edge: use sidePanel API
      const win = await chrome.windows.getCurrent();
      await chrome.sidePanel.open({ windowId: win.id });
      globalThis.close();
    } catch (e) {
      console.error('ContextBlur: Failed to open side panel', e);
      try {
        const win = await chrome.windows.getCurrent();
        await chrome.runtime.sendMessage({
          type: 'OPEN_SIDE_PANEL',
          windowId: win.id
        });
        globalThis.close();
      } catch (e2) {
        console.error('ContextBlur: Fallback also failed', e2);
      }
    }
  }

  function updateUI() {
    if (blurModeEnabled) {
      blurToggleBtn.classList.add('active');
      toggleText.textContent = 'Disable Blur Mode';
      iconOn.classList.remove('hidden');
      iconOff.classList.add('hidden');
      activeIndicator.classList.remove('hidden');
    } else {
      blurToggleBtn.classList.remove('active');
      toggleText.textContent = 'Enable Blur Mode';
      iconOn.classList.add('hidden');
      iconOff.classList.remove('hidden');
      activeIndicator.classList.add('hidden');
    }
  }

  function updateBlurCount(count) {
    blurCountEl.textContent = count;
    if (count > 0) {
      blurCountSection.classList.remove('hidden');
    } else {
      blurCountSection.classList.add('hidden');
    }
  }
})();
