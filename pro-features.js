/**
 * ContextBlur - Pro Features Module
 * Shared between popup and sidepanel for Pro status management
 */

const ContextBlurPro = (() => {
  'use strict';

  let _proStatus = null;
  let _listeners = [];

  const PRO_FEATURES = {
    autoBlur: { name: 'Auto-blur Detection' },
    blurIntensity: { name: 'Custom Blur Intensity' },
    blurStyles: { name: 'Multiple Blur Styles' },
    domainProfiles: { name: 'Site-specific Profiles' },
    domainLists: { name: 'Whitelist/Blacklist' },
    scheduling: { name: 'Blur Scheduling', comingSoon: true }
  };

  async function checkStatus(forceRefresh = false) {
    try {
      _proStatus = await chrome.runtime.sendMessage({
        type: 'GET_PRO_STATUS',
        forceRefresh
      });
    } catch (e) {
      _proStatus = { isPro: false, paid: false, trial: false, trialDaysLeft: 0 };
    }
    _listeners.forEach(fn => fn(_proStatus));
    return _proStatus;
  }

  function onStatusChange(callback) {
    _listeners.push(callback);
  }

  function isPro() {
    return _proStatus?.isPro || false;
  }

  function isFeatureAvailable(featureKey) {
    if (!PRO_FEATURES[featureKey]) return true; // not gated
    return isPro();
  }

  async function openUpgrade() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT_PAGE' });
      if (response && !response.success) {
        console.error('ContextBlur: Payment page error:', response.error);
      }
    } catch (e) {
      console.error('ContextBlur: Could not open payment page', e);
    }
  }

  async function startTrial() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'START_TRIAL' });
      if (response && !response.success) {
        console.error('ContextBlur: Trial page error:', response.error);
      }
    } catch (e) {
      console.error('ContextBlur: Could not start trial', e);
    }
  }

  async function openLogin() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'OPEN_LOGIN_PAGE' });
      if (response && !response.success) {
        console.error('ContextBlur: Login page error:', response.error);
      }
    } catch (e) {
      console.error('ContextBlur: Could not open login page', e);
    }
  }

  function getStatus() {
    return _proStatus;
  }

  function getTrialBadgeText() {
    if (!_proStatus) return 'FREE';
    if (_proStatus.paid) return 'PRO';
    if (_proStatus.trial) return `TRIAL · ${_proStatus.trialDaysLeft}d`;
    return 'FREE';
  }

  function getBadgeClass() {
    if (!_proStatus) return 'badge-free';
    if (_proStatus.paid) return 'badge-pro';
    if (_proStatus.trial) return 'badge-trial';
    return 'badge-free';
  }

  // Listen for broadcast updates from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PRO_STATUS_UPDATED') {
      _proStatus = message.status;
      _listeners.forEach(fn => fn(_proStatus));
    }
  });

  return Object.freeze({
    checkStatus,
    onStatusChange,
    isPro,
    isFeatureAvailable,
    openUpgrade,
    startTrial,
    openLogin,
    getStatus,
    getTrialBadgeText,
    getBadgeClass,
    PRO_FEATURES
  });
})();
