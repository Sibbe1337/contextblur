/**
 * ContextBlur - Anonymous Usage Analytics
 * All data stored locally. No PII collected or transmitted.
 */

const ContextBlurAnalytics = (() => {
  'use strict';

  const STORAGE_KEY = 'cb_analytics';

  async function track(event, properties = {}) {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const analytics = result[STORAGE_KEY] || { events: [], installDate: null, sessionCount: 0 };

      if (!analytics.installDate) {
        analytics.installDate = new Date().toISOString();
      }

      analytics.events.push({
        event,
        timestamp: Date.now(),
        ...properties
      });

      // Keep only last 100 events
      if (analytics.events.length > 100) {
        analytics.events = analytics.events.slice(-100);
      }

      await chrome.storage.local.set({ [STORAGE_KEY]: analytics });
    } catch (e) {
      // Analytics should never break the extension
    }
  }

  async function trackSession() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const analytics = result[STORAGE_KEY] || { events: [], installDate: null, sessionCount: 0 };
      analytics.sessionCount++;
      analytics.lastSession = new Date().toISOString();
      await chrome.storage.local.set({ [STORAGE_KEY]: analytics });
    } catch (e) {}
  }

  const EVENTS = {
    BLUR_MODE_ON: 'blur_mode_on',
    BLUR_APPLIED: 'blur_applied',
    AUTO_BLUR_RUN: 'auto_blur_run',
    PRO_UPGRADE_CLICK: 'pro_upgrade_click',
    TRIAL_START_CLICK: 'trial_start_click',
    PRO_CONVERSION: 'pro_conversion',
    INTENSITY_CHANGED: 'intensity_changed',
    STYLE_CHANGED: 'style_changed',
    SIDE_PANEL_OPENED: 'side_panel_opened'
  };

  return Object.freeze({ track, trackSession, EVENTS });
})();
