/**
 * ContextBlur - Content Script
 * Handles element selection, blur application, and persistence
 */

(() => {
  'use strict';

  // State
  let blurModeEnabled = false;
  let currentHoveredElement = null;
  let blurredElements = new Set();
  const BLUR_ATTRIBUTE = 'data-contextblur-id';
  const BLUR_CLASS = 'contextblur-blurred';
  const AUTO_BLUR_CLASS = 'contextblur-auto-blurred';
  let blurCounter = 0;

  // Sensitive data patterns
  const SENSITIVE_PATTERNS = {
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phone: /(?:\+?(\d{1,3}))?[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
    ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    creditCard: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    personnummer: /\b\d{6,8}[-.\s]?\d{4}\b/g
  };

  // Custom cursor SVG
  const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="%238B5CF6" stroke-width="2" opacity="0.8"/><circle cx="16" cy="16" r="4" fill="%238B5CF6" opacity="0.6"/><line x1="16" y1="2" x2="16" y2="8" stroke="%238B5CF6" stroke-width="2" stroke-linecap="round"/><line x1="16" y1="24" x2="16" y2="30" stroke="%238B5CF6" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="16" x2="8" y2="16" stroke="%238B5CF6" stroke-width="2" stroke-linecap="round"/><line x1="24" y1="16" x2="30" y2="16" stroke="%238B5CF6" stroke-width="2" stroke-linecap="round"/></svg>`;

  const CURSOR_DATA_URL = `data:image/svg+xml,${CURSOR_SVG}`;

  // Initialize
  init();

  function init() {
    // Set up event listeners for manual blur mode
    document.addEventListener('mouseover', handleMouseOver, { passive: true });
    document.addEventListener('mouseout', handleMouseOut, { passive: true });
    document.addEventListener('click', handleClick, { capture: true });
    document.addEventListener('keydown', handleKeyDown, { capture: true });

    // Listen for messages from background/sidepanel
    chrome.runtime.onMessage.addListener(handleMessage);

    // Restore manually-saved blurs on page load (NOT auto-blur)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restoreBlurs);
    } else {
      restoreBlurs();
    }

    // NOTE: Auto-blur is NEVER triggered automatically.
    // It only runs when user explicitly sends AUTO_BLUR_RUN message.
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && blurModeEnabled) {
      setBlurMode(false);
      notifyBlurModeChange(false);
      event.preventDefault();
      return;
    }

    if (event.ctrlKey && event.shiftKey && event.key === 'B') {
      const newState = !blurModeEnabled;
      setBlurMode(newState);
      notifyBlurModeChange(newState);
      event.preventDefault();
      return;
    }
  }

  function notifyBlurModeChange(enabled) {
    chrome.runtime.sendMessage({
      type: 'BLUR_MODE_TOGGLED',
      enabled,
      url: window.location.href
    }).catch(() => {
      // Extension context might be invalid, ignore
    });
  }

  function handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'BLUR_MODE_CHANGED':
        setBlurMode(message.enabled);
        sendResponse({ success: true });
        break;

      case 'AUTO_BLUR_RUN':
        // EXPLICIT user action required - runs exactly once per request
        const result = runAutoBlurOnce(message.types || ['email', 'phone', 'ssn', 'creditCard']);
        sendResponse({ success: true, blurredCount: result.count });
        break;

      case 'CLEAR_ALL_BLURS':
        clearAllBlurs();
        sendResponse({ success: true });
        break;

      case 'GET_BLUR_COUNT':
        sendResponse({ count: blurredElements.size });
        break;
    }
    return true;
  }

  function setBlurMode(enabled) {
    blurModeEnabled = enabled;

    if (enabled) {
      document.body.style.setProperty('cursor', `url("${CURSOR_DATA_URL}") 16 16, crosshair`, 'important');
      document.body.classList.add('contextblur-active');
    } else {
      document.body.style.removeProperty('cursor');
      document.body.classList.remove('contextblur-active');
      removeHighlight();
    }
  }

  /**
   * PRIVACY: Reads visible page text locally to detect patterns.
   * No content is stored or transmitted. Only runs after explicit user action.
   * This function executes exactly ONCE per user request (AUTO_BLUR_RUN message).
   */
  function runAutoBlurOnce(types) {
    let blurredCount = 0;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Skip script, style, noscript, template
          const skipTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'];
          if (skipTags.includes(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip already blurred elements
          if (parent.classList?.contains(BLUR_CLASS) || parent.classList?.contains(AUTO_BLUR_CLASS)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip hidden elements (basic check)
          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip empty text
          if (node.textContent.trim().length === 0) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodesToWrap = [];
    let node;

    while (node = walker.nextNode()) {
      const text = node.textContent;

      for (const type of types) {
        const pattern = SENSITIVE_PATTERNS[type];
        if (!pattern) continue;

        pattern.lastIndex = 0;

        if (pattern.test(text)) {
          pattern.lastIndex = 0;
          let match;
          while ((match = pattern.exec(text)) !== null) {
            nodesToWrap.push({
              node,
              match: match[0],
              index: match.index,
              type
            });
          }
        }
      }
    }

    // Process matches
    nodesToWrap.forEach(({ node, match, type }) => {
      if (wrapAndBlurMatch(node, match, type)) {
        blurredCount++;
      }
    });

    notifyBlurCountUpdate();

    return { count: blurredCount };
  }

  function wrapAndBlurMatch(textNode, matchText, type) {
    const parent = textNode.parentElement;
    if (!parent || parent.classList?.contains(AUTO_BLUR_CLASS)) return false;

    const text = textNode.textContent;
    const index = text.indexOf(matchText);
    if (index === -1) return false;

    const wrapper = document.createElement('span');
    wrapper.className = AUTO_BLUR_CLASS;
    wrapper.setAttribute('data-blur-type', type);
    wrapper.textContent = matchText;

    applyBlurStyles(wrapper);

    const before = text.substring(0, index);
    const after = text.substring(index + matchText.length);

    const fragment = document.createDocumentFragment();
    if (before) fragment.appendChild(document.createTextNode(before));
    fragment.appendChild(wrapper);
    if (after) fragment.appendChild(document.createTextNode(after));

    parent.replaceChild(fragment, textNode);

    const blurId = `auto-${Date.now()}-${++blurCounter}`;
    wrapper.setAttribute(BLUR_ATTRIBUTE, blurId);
    blurredElements.add(blurId);

    return true;
  }

  function handleMouseOver(event) {
    if (!blurModeEnabled) return;

    const target = getSmartTarget(event.target);
    if (target && target !== document.body && target !== document.documentElement) {
      highlightElement(target);
    }
  }

  function handleMouseOut(event) {
    if (!blurModeEnabled) return;

    const relatedTarget = event.relatedTarget;
    if (!relatedTarget || !currentHoveredElement?.contains(relatedTarget)) {
      removeHighlight();
    }
  }

  function handleClick(event) {
    if (!blurModeEnabled) return;

    const target = getSmartTarget(event.target);

    if (!target || target === document.body || target === document.documentElement) {
      return;
    }

    // Prevent default action (e.g., following links) so click blurs the element instead.
    // This only occurs when blur mode is explicitly enabled by the user.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    applyBlur(target);
    removeHighlight();
  }

  function getSmartTarget(element) {
    if (!element || element === document.body || element === document.documentElement) {
      return null;
    }

    if (element.closest('[data-contextblur-ui]')) {
      return null;
    }

    if (element.classList?.contains(BLUR_CLASS) || element.classList?.contains(AUTO_BLUR_CLASS)) {
      return null;
    }

    const priorityTags = ['INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'IFRAME', 'CANVAS'];
    if (priorityTags.includes(element.tagName)) {
      return element;
    }

    if (element.tagName === 'SPAN' || element.tagName === 'A' || element.tagName === 'STRONG' ||
        element.tagName === 'EM' || element.tagName === 'B' || element.tagName === 'I' ||
        element.tagName === 'CODE' || element.tagName === 'LABEL') {
      return element;
    }

    const directText = getDirectTextContent(element);
    if (directText.length > 0 && directText.length < 500) {
      return element;
    }

    if (/^(P|H[1-6]|LI|TD|TH|FIGCAPTION|BLOCKQUOTE)$/.test(element.tagName)) {
      return element;
    }

    if (element.tagName === 'DIV') {
      const children = element.children.length;
      const textLength = element.textContent?.trim().length || 0;

      if (children <= 3 && textLength < 500) {
        return element;
      }
    }

    return element;
  }

  function getDirectTextContent(element) {
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent;
      }
    }
    return text.trim();
  }

  function highlightElement(element) {
    removeHighlight();
    currentHoveredElement = element;
    element.classList.add('contextblur-highlight');
  }

  function removeHighlight() {
    if (currentHoveredElement) {
      currentHoveredElement.classList.remove('contextblur-highlight');
      currentHoveredElement = null;
    }
  }

  function applyBlur(element) {
    const blurId = `cb-${Date.now()}-${++blurCounter}`;
    element.setAttribute(BLUR_ATTRIBUTE, blurId);
    element.classList.add(BLUR_CLASS);

    // Apply inline styles for visual blur effect
    applyBlurStyles(element);

    blurredElements.add(blurId);

    const selector = generateSelector(element);
    if (selector) {
      saveBlurToStorage(selector);
    }

    notifyBlurCountUpdate();
  }

  function applyBlurStyles(element) {
    element.style.setProperty('filter', 'blur(8px)', 'important');
    element.style.setProperty('-webkit-filter', 'blur(8px)', 'important');
    element.style.setProperty('user-select', 'none', 'important');
    element.style.setProperty('-webkit-user-select', 'none', 'important');
    element.style.setProperty('pointer-events', 'none', 'important');
  }

  function removeBlur(element) {
    const blurId = element.getAttribute(BLUR_ATTRIBUTE);
    if (blurId) {
      blurredElements.delete(blurId);
    }

    element.removeAttribute(BLUR_ATTRIBUTE);
    element.classList.remove(BLUR_CLASS);
    element.classList.remove(AUTO_BLUR_CLASS);
    element.style.removeProperty('filter');
    element.style.removeProperty('-webkit-filter');
    element.style.removeProperty('user-select');
    element.style.removeProperty('-webkit-user-select');
    element.style.removeProperty('pointer-events');

    notifyBlurCountUpdate();
  }

  function clearAllBlurs() {
    const blurred = document.querySelectorAll(`.${BLUR_CLASS}, .${AUTO_BLUR_CLASS}`);
    blurred.forEach(el => {
      if (el.classList.contains(AUTO_BLUR_CLASS)) {
        const parent = el.parentNode;
        if (parent) {
          parent.replaceChild(document.createTextNode(el.textContent), el);
          parent.normalize();
        }
      } else {
        removeBlur(el);
      }
    });
    blurredElements.clear();
    notifyBlurCountUpdate();
  }

  function generateSelector(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const path = [];
    let current = element;
    let depth = 0;
    const maxDepth = 5;

    while (current && current !== document.body && depth < maxDepth) {
      let selector = current.tagName.toLowerCase();

      const classes = Array.from(current.classList)
        .filter(c => !c.startsWith('contextblur-'))
        .slice(0, 2);

      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);

      const fullSelector = path.join(' > ');
      try {
        const matches = document.querySelectorAll(fullSelector);
        if (matches.length === 1) {
          return fullSelector;
        }
      } catch (e) {
        // Invalid selector, continue
      }

      current = current.parentElement;
      depth++;
    }

    return path.join(' > ');
  }

  async function saveBlurToStorage(selector) {
    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_BLUR',
        url: window.location.href,
        selector
      });
    } catch (e) {
      console.error('ContextBlur: Failed to save blur', e);
    }
  }

  async function restoreBlurs() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_STORED_BLURS',
        url: window.location.href
      });

      if (response?.selectors) {
        response.selectors.forEach(selector => {
          try {
            const element = document.querySelector(selector);
            if (element && !element.classList.contains(BLUR_CLASS)) {
              applyBlur(element);
            }
          } catch (e) {
            // Invalid selector, skip
          }
        });
      }
    } catch (e) {
      console.error('ContextBlur: Failed to restore blurs', e);
    }
  }

  function notifyBlurCountUpdate() {
    chrome.runtime.sendMessage({
      type: 'UPDATE_BLUR_COUNT',
      count: blurredElements.size,
      url: window.location.href
    }).catch(() => {
      // Extension context might be invalid, ignore
    });
  }
})();
