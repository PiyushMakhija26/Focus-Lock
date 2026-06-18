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

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes) => {
      chrome.storage.local.get(null, (settings) => {
        currentSettings = settings;
        this.applySettings(settings);
      });
    });
  },

  applySettings(settings) {
    if (!settings) return;

    // Check homepage redirects
    const path = window.location.pathname;
    if (path === '/' || path === '') {
      if (settings.youtubeHomepageBehavior === 'subscriptions') {
        window.location.replace('/feed/subscriptions');
        return;
      } else if (settings.youtubeHomepageBehavior === 'search') {
        window.location.replace('/results?search_query=');
        return;
      }
    }

    const html = document.documentElement;

    // Toggle classes based on settings
    html.classList.toggle('hide-home-feed', !!settings.hideHomeFeed);
    html.classList.toggle('hide-shorts', !!settings.hideShorts);
    
    // If hiding recommendations, check if we prefer trusted channels
    if (settings.hideRecommendations) {
      if (settings.youtubePreferTrustedChannels) {
        html.classList.add('filter-individual-recs');
        html.classList.remove('hide-recommendations');
        // Trigger recommendation scan
        filterSidebarRecommendations(settings);
      } else {
        html.classList.add('hide-recommendations');
        html.classList.remove('filter-individual-recs');
      }
    } else {
      html.classList.remove('hide-recommendations');
      html.classList.remove('filter-individual-recs');
    }

    html.classList.toggle('hide-end-screens', !!settings.hideEndScreens);
    html.classList.toggle('hide-comments', !!settings.hideComments);
    html.classList.toggle('hide-trending', !!settings.hideTrending);
    html.classList.toggle('hide-notifications', !!settings.hideNotifications);
    html.classList.toggle('hide-counts', !!settings.hideCounts);

    // Run Shorts scan immediately
    if (settings.hideShorts) {
      scanAndRemoveShorts();
    }

    // If on home feed, check and inject homepage placeholder
    if (path === '/' || path === '') {
      if (settings.youtubeHomepageBehavior === 'placeholder' && settings.hideHomeFeed) {
        injectHomepagePlaceholder();
      }
    } else {
      // Remove placeholder if navigate away
      const placeholder = document.getElementById('focus-lock-yt-placeholder');
      if (placeholder) placeholder.remove();
    }
  },

  observeChanges() {
    if (filterObserver) {
      filterObserver.disconnect();
    }

    // Set up MutationObserver to handle dynamic rendering & SPA updates
    filterObserver = new MutationObserver(() => {
      if (currentSettings) {
        // Handle homepage placeholder injection if DOM refreshed
        const path = window.location.pathname;
        if ((path === '/' || path === '') && currentSettings.youtubeHomepageBehavior === 'placeholder' && currentSettings.hideHomeFeed) {
          injectHomepagePlaceholder();
        }
        
        // Handle whitelisted recommendations scan
        if (currentSettings.hideRecommendations && currentSettings.youtubePreferTrustedChannels) {
          filterSidebarRecommendations(currentSettings);
        }

        // Handle Shorts scan
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
      'filter-individual-recs',
      'hide-end-screens',
      'hide-comments',
      'hide-trending',
      'hide-notifications',
      'hide-counts'
    );

    const placeholder = document.getElementById('focus-lock-yt-placeholder');
    if (placeholder) placeholder.remove();
  }
};

// Injection logic for homepage placeholder
function injectHomepagePlaceholder() {
  const homeEl = document.querySelector('ytd-browse[page-subtype="home"]') || 
                 document.querySelector('ytd-browse') || 
                 document.getElementById('primary');
                 
  if (!homeEl) return;

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

// Sidebar recommendation filtering
function filterSidebarRecommendations(settings) {
  const compactRecs = document.querySelectorAll('ytd-compact-video-renderer');
  const trustedList = settings.youtubeTrustedChannels || [];

  compactRecs.forEach(el => {
    const nameEl = el.querySelector('ytd-channel-name #text') || 
                   el.querySelector('ytd-channel-name') || 
                   el.querySelector('#byline-container') || 
                   el.querySelector('.ytd-channel-name');
                   
    if (nameEl) {
      const channelName = nameEl.textContent.trim().toLowerCase();
      
      const isTrusted = trustedList.some(trusted => {
        const cleanTrusted = trusted.trim().toLowerCase();
        return channelName === cleanTrusted || 
               channelName === '@' + cleanTrusted ||
               channelName.replace('@', '') === cleanTrusted;
      });
      
      if (isTrusted) {
        el.classList.add('show-trusted-rec');
      } else {
        el.classList.remove('show-trusted-rec');
      }
    }
  });
}

// Automatically start when loaded as content script
if (typeof window !== 'undefined') {
  window.YouTubeFilter = YouTubeFilter;
  // Initialize on load
  YouTubeFilter.initialize();
}

// Complete Shorts scan and remove logic
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
