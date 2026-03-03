/**
 * ContextBlur Blog Assistant (v3)
 * Smart trigger: show after 12s OR 50% scroll.
 * Auto-hide after CTA click or manual dismiss.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'contextblur_blog_assistant_hidden_until';
  const SHOW_AFTER_MS = 12000;
  const SHOW_AT_SCROLL_RATIO = 0.5;
  const HIDE_FOR_DAYS = 14;
  const INSTALL_URL = 'https://chromewebstore.google.com/detail/contextblur/epnjbbgfnlpkaggfpjebakbnnhpogmfh';
  const HELPER_TIPS = [
    'Want to avoid accidental leaks in your next demo?',
    'Quick win: blur names, revenue, and emails before sharing your screen.',
    'Use Auto-Blur to hide common PII in one click.',
    'Pin ContextBlur so it is always ready before your call starts.'
  ];

  let hasShown = false;
  let timerId = null;
  let assistantEl = null;
  let tipTextEl = null;
  let currentTipIndex = 0;

  function shouldSkipAssistant() {
    try {
      const hiddenUntil = Number(localStorage.getItem(STORAGE_KEY) || '0');
      return Number.isFinite(hiddenUntil) && Date.now() < hiddenUntil;
    } catch (_error) {
      return false;
    }
  }

  function hideForCooldown() {
    const hiddenUntil = Date.now() + HIDE_FOR_DAYS * 24 * 60 * 60 * 1000;
    try {
      localStorage.setItem(STORAGE_KEY, String(hiddenUntil));
    } catch (_error) {
      // Ignore storage errors (private mode, blocked storage, etc.)
    }
  }

  function getScrollRatio() {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const scrollable = Math.max(1, doc.scrollHeight - window.innerHeight);
    return scrollTop / scrollable;
  }

  function buildAssistant() {
    const root = document.createElement('aside');
    root.className = 'install-assistant';
    root.setAttribute('aria-label', 'ContextBlur helper');
    root.setAttribute('data-visible', 'false');
    root.innerHTML = ''
      + '<button type="button" class="install-assistant__close" aria-label="Dismiss">×</button>'
      + '<div class="install-assistant__header">'
      + '  <div class="install-assistant__orb" aria-hidden="true">'
      + '    <span class="install-assistant__orb-dot"></span>'
      + '  </div>'
      + '  <div class="install-assistant__copy">'
      + '    <p class="install-assistant__eyebrow">CONTEXTBLUR HELPER</p>'
      + '    <p class="install-assistant__text" role="status" aria-live="polite"></p>'
      + '  </div>'
      + '</div>'
      + '<div class="install-assistant__actions">'
      + `  <a class="install-assistant__cta" href="${INSTALL_URL}" target="_blank" rel="noopener">Get Pro</a>`
      + '  <button type="button" class="install-assistant__next">Next tip</button>'
      + '</div>';

    const closeBtn = root.querySelector('.install-assistant__close');
    const ctaLink = root.querySelector('.install-assistant__cta');
    const nextTipBtn = root.querySelector('.install-assistant__next');
    tipTextEl = root.querySelector('.install-assistant__text');

    closeBtn.addEventListener('click', function () {
      hideAssistant(true);
    });

    ctaLink.addEventListener('click', function () {
      hideAssistant(true);
    });

    nextTipBtn.addEventListener('click', function () {
      currentTipIndex = (currentTipIndex + 1) % HELPER_TIPS.length;
      renderTip();
    });

    document.body.appendChild(root);
    assistantEl = root;
    renderTip();
  }

  function renderTip() {
    if (!tipTextEl) return;
    tipTextEl.textContent = HELPER_TIPS[currentTipIndex];
  }

  function showAssistant() {
    if (hasShown || shouldSkipAssistant()) return;
    hasShown = true;
    if (!assistantEl) buildAssistant();
    assistantEl.setAttribute('data-visible', 'true');
    window.removeEventListener('scroll', handleScroll, { passive: true });
    if (timerId) window.clearTimeout(timerId);
  }

  function hideAssistant(persist) {
    if (!assistantEl) return;
    assistantEl.setAttribute('data-visible', 'false');
    if (persist) hideForCooldown();
  }

  function handleScroll() {
    if (getScrollRatio() >= SHOW_AT_SCROLL_RATIO) {
      showAssistant();
    }
  }

  function init() {
    if (!document.body || shouldSkipAssistant()) return;
    timerId = window.setTimeout(showAssistant, SHOW_AFTER_MS);
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
