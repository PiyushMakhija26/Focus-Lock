// Focus Lock - YouTube Intentional Filtering System (ES Module style / Self-executing)

let filterObserver = null;
let currentSettings = null;

const YouTubeFilter = {
  initialize() {
    chrome.storage.local.get(null, (settings) => {
      currentSettings = settings;
      this.applySettings(settings);
      this.observeChanges();
    });

    // Listen for storage changes across popup operations
    chrome.storage.onChanged.addListener((changes) => {
      chrome.storage.local.get(null, (settings) => {
        currentSettings = settings;
        this.applySettings(settings);
      });
    });

    // Listen for runtime messages indicating active YouTube settings update
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'youtubeSettingsUpdated') {
        chrome.storage.local.get(null, (settings) => {
          currentSettings = settings;
          this.applySettings(settings);
          sendResponse({ success: true });
        });
        return true; // Keep message channel open for async response
      }
    });
  },

  applySettings(settings) {
    if (!settings) return;

    const path = window.location.pathname;
    const html = document.documentElement;

    // Synchronize global CSS classes dynamically
    html.classList.toggle('hide-home-feed', !!settings.hideHomeFeed);
    html.classList.toggle('hide-shorts', !!settings.hideShorts);
    html.classList.toggle('hide-recommendations', !!settings.hideRecommendations);
    html.classList.toggle('hide-comments', !!settings.hideComments);

    // Apply or restore Shorts visibility
    if (settings.hideShorts) {
      scanAndRemoveShorts();
    } else {
      restoreShorts();
    }

    // Apply or restore Home Feed layout placeholder
    if (path === '/' || path === '') {
      if (settings.hideHomeFeed) {
        injectHomepagePlaceholder();
      } else {
        const placeholder = document.getElementById('focus-lock-yt-placeholder');
        if (placeholder) placeholder.remove();
      }
    } else {
      const placeholder = document.getElementById('focus-lock-yt-placeholder');
      if (placeholder) placeholder.remove();
    }
  },

  observeChanges() {
    // Reuse MutationObserver if it is already active
    if (filterObserver) {
      return;
    }

    // Set up MutationObserver to handle dynamic rendering & SPA updates
    filterObserver = new MutationObserver(() => {
      if (currentSettings) {
        const path = window.location.pathname;
        if ((path === '/' || path === '') && currentSettings.hideHomeFeed) {
          injectHomepagePlaceholder();
        } else if (path !== '/' && path !== '') {
          const placeholder = document.getElementById('focus-lock-yt-placeholder');
          if (placeholder) placeholder.remove();
        }
        
        if (currentSettings.hideShorts) {
          scanAndRemoveShorts();
        }
      }
    });

    filterObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  },

  cleanup() {
    if (filterObserver) {
      filterObserver.disconnect();
      filterObserver = null;
    }
    
    const html = document.documentElement;
    html.classList.remove(
      'hide-home-feed',
      'hide-shorts',
      'hide-recommendations',
      'hide-comments'
    );

    const placeholder = document.getElementById('focus-lock-yt-placeholder');
    if (placeholder) placeholder.remove();

    restoreShorts();
  }
};

// Injection logic for homepage placeholder (Idempotent check)
function injectHomepagePlaceholder() {
  const homeEl = document.querySelector('ytd-browse[page-subtype="home"]') || 
                 document.querySelector('ytd-browse') || 
                 document.getElementById('primary');
                 
  if (!homeEl) return;

  // Prevent duplicate placeholder card injection
  if (document.getElementById('focus-lock-yt-placeholder')) return;

  const placeholder = document.createElement('div');
  placeholder.id = 'focus-lock-yt-placeholder';
  placeholder.innerHTML = `
    <div class="fl-yt-card">
      <span class="fl-yt-icon">🧘</span>
      <h2 class="fl-yt-title">Intentional Mode Active</h2>
      <p class="fl-yt-desc">Use Search or Subscriptions to navigate intentionally.</p>
    </div>
  `;
  homeEl.appendChild(placeholder);
}

// Automatically start when loaded as content script
if (typeof window !== 'undefined') {
  window.YouTubeFilter = YouTubeFilter;
  YouTubeFilter.initialize();
}

// Scan and hide Shorts elements
function scanAndRemoveShorts() {
  if (!currentSettings || !currentSettings.hideShorts) return;

  const selectors = [
    'a[href*="/shorts"]',
    '[title*="Shorts" i]',
    '[aria-label*="Shorts" i]',
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-item-renderer'
  ];

  selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const parent = el.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytd-rich-grid-video-renderer, yt-chip-cloud-chip-renderer, ytd-rich-item-renderer');
        if (parent) {
          parent.style.setProperty('display', 'none', 'important');
        } else {
          el.style.setProperty('display', 'none', 'important');
        }
      });
    } catch (e) {
      // ignore
    }
  });

  const chips = document.querySelectorAll('yt-chip-cloud-chip-renderer');
  chips.forEach(chip => {
    try {
      const text = chip.textContent.trim().toLowerCase();
      if (text === 'shorts') {
        chip.style.setProperty('display', 'none', 'important');
      }
    } catch (e) {
      // ignore
    }
  });

  const videos = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
  videos.forEach(video => {
    try {
      const anchor = video.querySelector('a[href*="/shorts"]');
      if (anchor) {
        video.style.setProperty('display', 'none', 'important');
      }
    } catch (e) {
      // ignore
    }
  });
}

// Restore previously hidden Shorts elements immediately
function restoreShorts() {
  const selectors = [
    'a[href*="/shorts"]',
    '[title*="Shorts" i]',
    '[aria-label*="Shorts" i]',
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer[is-shorts]',
    'ytd-reel-item-renderer'
  ];

  selectors.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const parent = el.closest('ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-reel-item-renderer, ytd-rich-grid-video-renderer, yt-chip-cloud-chip-renderer, ytd-rich-item-renderer');
        if (parent) {
          parent.style.removeProperty('display');
        } else {
          el.style.removeProperty('display');
        }
      });
    } catch (e) {
      // ignore
    }
  });

  const chips = document.querySelectorAll('yt-chip-cloud-chip-renderer');
  chips.forEach(chip => {
    try {
      const text = chip.textContent.trim().toLowerCase();
      if (text === 'shorts') {
        chip.style.removeProperty('display');
      }
    } catch (e) {
      // ignore
    }
  });

  const videos = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-rich-item-renderer');
  videos.forEach(video => {
    try {
      const anchor = video.querySelector('a[href*="/shorts"]');
      if (anchor) {
        video.style.removeProperty('display');
      }
    } catch (e) {
      // ignore
    }
  });
}
