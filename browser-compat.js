/**
 * ContextBlur - Browser Compatibility Layer
 *
 * Provides a unified API surface for features that differ between browsers.
 * Loaded before background.js in Firefox (via manifest background.scripts).
 * Chrome/Edge don't load this file — they use native APIs directly.
 *
 * Key differences handled:
 *   - Side Panel: Chrome/Edge use chrome.sidePanel; Firefox uses browser.sidebarAction
 *   - Service Worker: Chrome/Edge use service_worker; Firefox uses background.scripts
 */

(() => {
  'use strict';

  // Detect browser
  const isFirefox = typeof browser !== 'undefined' && browser.runtime && browser.runtime.getBrowserInfo;
  const api = typeof browser !== 'undefined' ? browser : chrome;

  // Shim chrome.sidePanel for Firefox using browser.sidebarAction
  if (isFirefox && !api.sidePanel) {
    api.sidePanel = {
      /**
       * Firefox sidebar is always available via the sidebar button.
       * setPanelBehavior is a no-op since Firefox manages sidebar behavior differently.
       */
      setPanelBehavior: () => Promise.resolve(),

      /**
       * Open the sidebar. Firefox uses browser.sidebarAction.open()
       * Note: sidebarAction.open() requires user interaction context in Firefox.
       */
      open: (options) => {
        if (api.sidebarAction && api.sidebarAction.open) {
          return api.sidebarAction.open();
        }
        return Promise.resolve();
      },

      /**
       * Firefox equivalent: browser.sidebarAction.setPanel()
       */
      setOptions: (options) => {
        if (api.sidebarAction && api.sidebarAction.setPanel) {
          return api.sidebarAction.setPanel({
            panel: options.path || options.default_path
          });
        }
        return Promise.resolve();
      }
    };

    // Also shim on chrome namespace if it exists
    if (typeof chrome !== 'undefined' && !chrome.sidePanel) {
      chrome.sidePanel = api.sidePanel;
    }
  }
})();
