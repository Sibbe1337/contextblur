/**
 * ContextBlur - Side Panel Controller
 * Manages UI state, Pro features, and communication with content scripts
 */

(() => {
  'use strict';

  // DOM Elements
  const elements = {
    blurModeToggle: document.getElementById('blurModeToggle'),
    modeStatus: document.getElementById('modeStatus'),
    activeIndicator: document.getElementById('activeIndicator'),
    blurCount: document.getElementById('blurCount'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    confirmClearBtn: document.getElementById('confirmClearBtn'),
    emptyState: document.getElementById('emptyState'),
    hasBlursState: document.getElementById('hasBlursState'),
    // Auto-blur
    runAutoBlurBtn: document.getElementById('runAutoBlurBtn'),
    autoBlurResult: document.getElementById('autoBlurResult'),
    blurEmails: document.getElementById('blurEmails'),
    blurPhones: document.getElementById('blurPhones'),
    blurCards: document.getElementById('blurCards'),
    blurSSN: document.getElementById('blurSSN'),
    // Modal
    disclosureModal: document.getElementById('disclosureModal'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalAcceptBtn: document.getElementById('modalAcceptBtn'),
    // Pro
    proBadge: document.getElementById('proBadge'),
    upgradeCard: document.getElementById('upgradeCard'),
    startTrialBtn: document.getElementById('startTrialBtn'),
    upgradeBtn: document.getElementById('upgradeBtn'),
    loginBtn: document.getElementById('loginBtn'),
    autoBlurProBadge: document.getElementById('autoBlurProBadge'),
    intensityControls: document.getElementById('intensityControls'),
    intensityLocked: document.getElementById('intensityLocked'),
    blurIntensity: document.getElementById('blurIntensity'),
    intensityValue: document.getElementById('intensityValue'),
    styleControls: document.getElementById('styleControls')
  };

  // State
  let currentTabId = null;
  let currentUrl = null;
  let confirmTimeout = null;
  let disclosureAccepted = false;
  let pendingAutoBlurRun = false;

  init();

  async function init() {
    await getCurrentTab();
    await loadState();
    await checkDisclosureStatus();
    await initProStatus();
    setupEventListeners();
    ContextBlurAnalytics.trackSession();
  }

  // ── Pro Status ──

  async function initProStatus() {
    const status = await ContextBlurPro.checkStatus();
    updateProUI(status);

    ContextBlurPro.onStatusChange((newStatus) => {
      updateProUI(newStatus);
    });
  }

  function updateProUI(status) {
    // Badge
    elements.proBadge.textContent = ContextBlurPro.getTrialBadgeText();
    elements.proBadge.className = `tier-badge ${ContextBlurPro.getBadgeClass()}`;

    // Upgrade card
    if (status.isPro) {
      elements.upgradeCard.classList.add('hidden');
    } else {
      elements.upgradeCard.classList.remove('hidden');
    }

    // Auto-blur gating
    if (status.isPro) {
      elements.runAutoBlurBtn.disabled = false;
      elements.runAutoBlurBtn.textContent = 'Run auto-blur now';
      elements.autoBlurProBadge.classList.add('hidden');
    } else {
      elements.runAutoBlurBtn.disabled = true;
      elements.runAutoBlurBtn.textContent = 'Upgrade to Pro';
      elements.autoBlurProBadge.classList.remove('hidden');
    }

    // Intensity slider gating
    if (status.isPro) {
      elements.intensityControls.classList.remove('hidden');
      elements.intensityLocked.classList.add('hidden');
    } else {
      elements.intensityControls.classList.add('hidden');
      elements.intensityLocked.classList.remove('hidden');
    }

    // Style buttons gating
    document.querySelectorAll('.style-option').forEach(btn => {
      if (btn.dataset.style !== 'blur') {
        if (status.isPro) {
          btn.disabled = false;
          btn.classList.remove('locked');
        } else {
          btn.disabled = true;
          btn.classList.add('locked');
        }
      }
    });
  }

  // ── Tab & State ──

  async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      currentTabId = tab.id;
      currentUrl = tab.url;
    }
  }

  async function checkDisclosureStatus() {
    try {
      const result = await chrome.storage.local.get('autoBlurDisclosureAccepted');
      disclosureAccepted = result.autoBlurDisclosureAccepted === true;
    } catch (e) {
      disclosureAccepted = false;
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
        elements.blurModeToggle.checked = state.blurModeEnabled;
        updateToggleUI(state.blurModeEnabled);
      }

      await updateBlurCount();
    } catch (e) {
      console.error('Failed to load state:', e);
    }
  }

  // ── Event Listeners ──

  function setupEventListeners() {
    elements.blurModeToggle.addEventListener('change', handleToggleChange);
    elements.clearAllBtn.addEventListener('click', handleClearClick);
    elements.confirmClearBtn.addEventListener('click', handleConfirmClear);
    elements.runAutoBlurBtn.addEventListener('click', handleRunAutoBlur);
    elements.modalCancelBtn.addEventListener('click', handleModalCancel);
    elements.modalAcceptBtn.addEventListener('click', handleModalAccept);

    elements.disclosureModal.addEventListener('click', (e) => {
      if (e.target === elements.disclosureModal) handleModalCancel();
    });

    // Pro buttons
    elements.startTrialBtn.addEventListener('click', () => {
      ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.TRIAL_START_CLICK);
      ContextBlurPro.startTrial();
    });

    elements.upgradeBtn.addEventListener('click', () => {
      ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.PRO_UPGRADE_CLICK);
      ContextBlurPro.openUpgrade();
    });

    elements.loginBtn.addEventListener('click', () => {
      ContextBlurPro.openLogin();
    });

    // Blur intensity slider
    elements.blurIntensity.addEventListener('input', handleIntensityChange);

    // Blur style buttons
    document.querySelectorAll('.style-option').forEach(btn => {
      btn.addEventListener('click', () => handleStyleChange(btn));
    });

    // Tab changes
    chrome.tabs.onActivated.addListener(handleTabChange);
    chrome.tabs.onUpdated.addListener(handleTabUpdate);

    // Messages
    chrome.runtime.onMessage.addListener(handleMessage);
  }

  // ── Pro Feature Handlers ──

  async function handleIntensityChange(e) {
    if (!ContextBlurPro.isPro()) return;
    const intensity = parseInt(e.target.value);
    elements.intensityValue.textContent = `${intensity}px`;

    ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.INTENSITY_CHANGED, { intensity });

    if (currentTabId) {
      await chrome.runtime.sendMessage({
        type: 'SET_BLUR_INTENSITY',
        tabId: currentTabId,
        intensity
      });
    }
  }

  async function handleStyleChange(btn) {
    if (!ContextBlurPro.isPro() && btn.dataset.style !== 'blur') {
      ContextBlurPro.openUpgrade();
      return;
    }

    document.querySelectorAll('.style-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.STYLE_CHANGED, { style: btn.dataset.style });

    if (currentTabId) {
      await chrome.runtime.sendMessage({
        type: 'SET_BLUR_STYLE',
        tabId: currentTabId,
        style: btn.dataset.style
      });
    }
  }

  // ── Blur Mode ──

  async function handleToggleChange(event) {
    const enabled = event.target.checked;

    if (!currentTabId) await getCurrentTab();

    try {
      await chrome.runtime.sendMessage({
        type: 'SET_BLUR_MODE',
        tabId: currentTabId,
        enabled
      });
      updateToggleUI(enabled);

      if (enabled) {
        ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.BLUR_MODE_ON);
      }
    } catch (e) {
      console.error('Failed to toggle blur mode:', e);
      elements.blurModeToggle.checked = !enabled;
    }
  }

  function updateToggleUI(enabled) {
    if (enabled) {
      elements.modeStatus.textContent = 'Active — click to blur';
      elements.modeStatus.classList.add('active');
      elements.activeIndicator.classList.remove('hidden');
      elements.activeIndicator.classList.add('fade-in');
    } else {
      elements.modeStatus.textContent = 'Click elements to blur';
      elements.modeStatus.classList.remove('active');
      elements.activeIndicator.classList.add('hidden');
      elements.activeIndicator.classList.remove('fade-in');
    }
  }

  // ── Auto-blur ──

  async function handleRunAutoBlur() {
    if (!ContextBlurPro.isPro()) {
      ContextBlurPro.openUpgrade();
      return;
    }

    if (!disclosureAccepted) {
      pendingAutoBlurRun = true;
      showDisclosureModal();
      return;
    }

    await executeAutoBlur();
  }

  async function executeAutoBlur() {
    if (!currentTabId) await getCurrentTab();

    const types = getSelectedAutoBlurTypes();

    if (types.length === 0) {
      showAutoBlurResult('Please select at least one type to detect.', 'error');
      return;
    }

    elements.runAutoBlurBtn.disabled = true;
    elements.runAutoBlurBtn.textContent = 'Scanning';
    elements.runAutoBlurBtn.classList.add('btn-scanning');
    hideAutoBlurResult();

    ContextBlurAnalytics.track(ContextBlurAnalytics.EVENTS.AUTO_BLUR_RUN, { types });

    try {
      const response = await chrome.tabs.sendMessage(currentTabId, {
        type: 'AUTO_BLUR_RUN',
        types
      });

      if (response && typeof response.blurredCount === 'number') {
        if (response.blurredCount > 0) {
          showAutoBlurResult(`Auto-blurred ${response.blurredCount} item${response.blurredCount !== 1 ? 's' : ''}.`, 'success');
        } else {
          showAutoBlurResult('No sensitive patterns found on this page.', 'info');
        }
        await updateBlurCount();
      } else {
        showAutoBlurResult('Could not scan this page.', 'error');
      }
    } catch (e) {
      console.error('Failed to run auto-blur:', e);
      showAutoBlurResult('Could not scan this page. Try refreshing.', 'error');
    } finally {
      elements.runAutoBlurBtn.disabled = false;
      elements.runAutoBlurBtn.textContent = 'Run auto-blur now';
      elements.runAutoBlurBtn.classList.remove('btn-scanning');
    }
  }

  function getSelectedAutoBlurTypes() {
    const types = [];
    if (elements.blurEmails.checked) types.push('email');
    if (elements.blurPhones.checked) types.push('phone');
    if (elements.blurCards.checked) types.push('creditCard');
    if (elements.blurSSN.checked) {
      types.push('ssn');
      types.push('personnummer');
    }
    return types;
  }

  let resultDismissTimeout = null;

  function showAutoBlurResult(message, type) {
    const icons = { success: '✓', error: '✗', info: '○' };
    elements.autoBlurResult.textContent = `${icons[type] || ''} ${message}`;
    elements.autoBlurResult.className = `autoblur-result ${type}`;
    elements.autoBlurResult.classList.remove('hidden');

    clearTimeout(resultDismissTimeout);
    resultDismissTimeout = setTimeout(() => hideAutoBlurResult(), 6000);
  }

  function hideAutoBlurResult() {
    clearTimeout(resultDismissTimeout);
    elements.autoBlurResult.classList.add('hidden');
  }

  // ── Modal ──

  function showDisclosureModal() {
    elements.disclosureModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function hideDisclosureModal() {
    elements.disclosureModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  function handleModalCancel() {
    hideDisclosureModal();
    pendingAutoBlurRun = false;
  }

  async function handleModalAccept() {
    try {
      await chrome.storage.local.set({ autoBlurDisclosureAccepted: true });
      disclosureAccepted = true;
    } catch (e) {
      console.error('Failed to save disclosure acceptance:', e);
    }

    hideDisclosureModal();

    if (pendingAutoBlurRun) {
      pendingAutoBlurRun = false;
      await executeAutoBlur();
    }
  }

  // ── Clear All ──

  function handleClearClick() {
    elements.clearAllBtn.classList.add('hidden');
    elements.confirmClearBtn.classList.remove('hidden');
    elements.confirmClearBtn.classList.add('confirm-pulse');

    if (confirmTimeout) clearTimeout(confirmTimeout);
    confirmTimeout = setTimeout(() => {
      elements.confirmClearBtn.classList.add('hidden');
      elements.confirmClearBtn.classList.remove('confirm-pulse');
      elements.clearAllBtn.classList.remove('hidden');
    }, 3000);
  }

  async function handleConfirmClear() {
    if (confirmTimeout) clearTimeout(confirmTimeout);

    try {
      await chrome.runtime.sendMessage({
        type: 'CLEAR_ALL_BLURS',
        url: currentUrl,
        tabId: currentTabId
      });

      updateBlurCountUI(0);
      elements.confirmClearBtn.classList.add('hidden');
      elements.clearAllBtn.classList.remove('hidden');
      hideAutoBlurResult();
    } catch (e) {
      console.error('Failed to clear blurs:', e);
    }
  }

  // ── Tab Navigation ──

  async function handleTabChange(activeInfo) {
    currentTabId = activeInfo.tabId;
    const tab = await chrome.tabs.get(currentTabId);
    currentUrl = tab.url;

    elements.blurModeToggle.checked = false;
    updateToggleUI(false);
    hideAutoBlurResult();
    await updateBlurCount();
  }

  async function handleTabUpdate(tabId, changeInfo, tab) {
    if (tabId === currentTabId && changeInfo.status === 'complete') {
      currentUrl = tab.url;
      elements.blurModeToggle.checked = false;
      updateToggleUI(false);
      hideAutoBlurResult();
      await updateBlurCount();
    }
  }

  // ── Messages ──

  function handleMessage(message, sender, sendResponse) {
    if (message.type === 'UPDATE_BLUR_COUNT') {
      updateBlurCountUI(message.count);
    }
    if (message.type === 'BLUR_MODE_TOGGLED') {
      elements.blurModeToggle.checked = message.enabled;
      updateToggleUI(message.enabled);
    }
    return true;
  }

  // ── Blur Count ──

  async function updateBlurCount() {
    if (!currentUrl) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_BLUR_COUNT',
        url: currentUrl
      });

      if (response && typeof response.count === 'number') {
        updateBlurCountUI(response.count);
      }
    } catch (e) {
      console.error('Failed to get blur count:', e);
    }
  }

  function updateBlurCountUI(count) {
    elements.blurCount.textContent = count;

    if (count > 0) {
      elements.emptyState.classList.add('hidden');
      elements.hasBlursState.classList.remove('hidden');
      elements.clearAllBtn.disabled = false;
    } else {
      elements.emptyState.classList.remove('hidden');
      elements.hasBlursState.classList.add('hidden');
      elements.clearAllBtn.disabled = true;
    }

    elements.blurCount.style.transform = 'scale(1.2)';
    setTimeout(() => {
      elements.blurCount.style.transform = 'scale(1)';
    }, 150);
  }
})();
