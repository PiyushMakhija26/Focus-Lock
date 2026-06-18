// Focus Lock - Enforcement Module
import { getFocusState } from './storage.js';
import { getWorkspaces, isDomainAllowedInWorkspace, isTempWhitelisted, matchDomain } from './workspaces.js';
import { recordDistraction } from './analytics.js';
import { getSavedWorkflow } from './intelligence.js';

// Memory-based lookup cache for allowed/blocked domain validation
class RuleCache {
  constructor(limit = 50) {
    this.limit = limit;
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
    this.isDevMode = null;
  }

  async checkDevMode() {
    if (this.isDevMode !== null) return this.isDevMode;
    try {
      const self = await chrome.runtime.getSelf();
      this.isDevMode = self.installType === 'development';
    } catch (e) {
      this.isDevMode = false;
    }
    return this.isDevMode;
  }

  async get(key) {
    if (this.cache.has(key)) {
      this.hits++;
      if (await this.checkDevMode()) {
        console.log(`[RuleCache] HIT: key="${key}" (Hits: ${this.hits}, Misses: ${this.misses})`);
      }
      const val = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, val); // Move to end
      return val;
    }
    this.misses++;
    if (await this.checkDevMode()) {
      console.log(`[RuleCache] MISS: key="${key}" (Hits: ${this.hits}, Misses: ${this.misses})`);
    }
    return undefined;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      // Evict oldest (first key in map)
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
    if (this.isDevMode) {
      console.log('[RuleCache] CACHE CLEARED / INVALIDATED');
    }
  }
}

export const ruleCache = new RuleCache(50);

// Monitor storage modifications to invalidate ruleCache when relevant states transition
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    const keysToInvalidate = [
      'focusModeActive',
      'lockMode',
      'allowedDestination',
      'enforcementLevel',
      'tempPauseEndTime',
      'tempWhitelistedDomains',
      'tempWhitelistedUntil',
      'activeWorkspaceId',
      'continueOnce'
    ];
    const shouldInvalidate = keysToInvalidate.some(key => key in changes);
    if (shouldInvalidate) {
      ruleCache.clear();
    }
  }
});

// Check if a URL is allowed under the current state
export async function isUrlAllowed(url, state) {
  if (!url) return true;

  // Always allow the extension's own pages
  if (url.startsWith('chrome-extension://')) return true;

  // Exclude all internal Chrome/system URLs (chrome://, chrome-extension://, chrome-search://, edge://, about:) from warning-page enforcement
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:')
  ) {
    return true; // Always allowed
  }

  const level = state.enforcementLevel !== undefined ? state.enforcementLevel : 4;
  if (level === 0) return true; // Level 0 (Focus Session) allows everything

  // Level 5 (Strict Tab Lock) has hard restrictions on navigating away
  if (level === 5) {
    const cleanUrl = url.split('#')[0].toLowerCase();
    const cleanAllowed = state.allowedDestination.split('#')[0].toLowerCase();
    return cleanUrl === cleanAllowed;
  }

  // Handle other non-http system protocols
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false; // Block other non-http protocols (e.g. ftp, file, etc.)
  }

  const { lockMode, allowedDestination } = state;

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    // Construct focus state hash to avoid using stale cache across configuration changes
    const focusStateHash = [
      state.focusModeActive ? '1' : '0',
      lockMode || '',
      allowedDestination || '',
      level,
      state.tempPauseEndTime || '0',
      JSON.stringify(state.tempWhitelistedDomains || []),
      JSON.stringify(state.tempWhitelistedUntil || {})
    ].join('|');

    const cacheKey = hostname + '|' + focusStateHash;
    const cachedResult = await ruleCache.get(cacheKey);
    if (cachedResult !== undefined) {
      return cachedResult;
    }

    let allowed = false;
    if (lockMode === 'site' || level === 3) {
      const target = allowedDestination.toLowerCase();
      allowed = matchDomain(hostname, target);
    } else if (lockMode === 'workspace' || level === 4 || level === 1 || level === 2) {
      // 1. Check temporary Whitelist (Open anyway or 5 min pass)
      const tempAllowed = await isTempWhitelisted(hostname);
      if (tempAllowed) {
        allowed = true;
      } else {
        // 2. Check workspace whitelist
        const workspaces = await getWorkspaces();
        let activeWs = workspaces.find(w => w.name === allowedDestination || w.id === state.activeWorkspaceId);
        if (!activeWs && state.activeWorkspaceId) {
          const wf = await getSavedWorkflow(state.activeWorkspaceId);
          if (wf) {
            activeWs = {
              name: wf.name,
              domains: wf.sequence
            };
          }
        }
        if (activeWs) {
          allowed = isDomainAllowedInWorkspace(hostname, activeWs.domains);
        } else if (lockMode === 'site') {
          // Fallback: if lockMode was site target launched under workspace/advisory levels
          allowed = matchDomain(hostname, allowedDestination);
        } else {
          allowed = true; // Safe fallback if workspace not found
        }
      }
    }

    ruleCache.set(cacheKey, allowed);
    return allowed;
  } catch (e) {
    console.error('Error checking URL approval:', e);
    return true; // Safe fallback
  }
}

// Check if temporary pause is active
export function isSessionPaused(tempPauseEndTime) {
  return tempPauseEndTime && Date.now() < tempPauseEndTime;
}

// Redirect or snap back tabs depending on locking mode
export async function enforceRedirect(tabId, url, triggerEvent) {
  const state = await getFocusState();
  if (!state.focusModeActive) return;
  if (isSessionPaused(state.tempPauseEndTime)) return;
  if (state.pauseReason) return; // System lock/pause active, do not redirect

  const level = state.enforcementLevel !== undefined ? state.enforcementLevel : 4;
  const lockMode = state.lockMode;

  // Advisory "Continue Once" check
  if (level === 1) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const storage = await chrome.storage.local.get(['continueOnce']);
      const continueOnce = storage.continueOnce || {};
      if (continueOnce[tabId] && continueOnce[tabId].domain === hostname) {
        // Advisory bypass is active for this tab and domain
        return;
      }
    } catch (e) {
      // ignore
    }
  }

  const allowed = await isUrlAllowed(url, state);
  if (allowed) {
    // If URL is allowed, clear any Advisory "continue once" for this tab so it warns again on next exit
    try {
      const storage = await chrome.storage.local.get(['continueOnce']);
      if (storage.continueOnce && storage.continueOnce[tabId]) {
        delete storage.continueOnce[tabId];
        await chrome.storage.local.set({ continueOnce: storage.continueOnce });
      }
    } catch (e) {
      // ignore
    }

    if (lockMode === 'workspace' || level === 4) {
      chrome.storage.local.set({ lastActiveAllowedTabId: tabId });
    }
    return;
  }

  // Not allowed! Trigger distraction analytics increment
  await recordDistraction();

  if (level === 0) {
    // Level 0 — Focus Session: track deviation, do not block or redirect
    const count = state.blockedAttempts || 0;
    await chrome.storage.local.set({ blockedAttempts: count + 1 });
    return;
  }

  if (level === 1 || level === 2 || level === 3 || level === 4) {
    const isWarning = level === 1 || level === 2;
    const count = isWarning ? (state.warningsShown || 0) : (state.blockedAttempts || 0);
    const key = isWarning ? 'warningsShown' : 'blockedAttempts';
    await chrome.storage.local.set({ [key]: count + 1 });
    
    // Redirect to intention check page
    const intentionUrl = chrome.runtime.getURL(`intention.html?level=${level}&url=${encodeURIComponent(url)}&workspace=${encodeURIComponent(state.allowedDestination)}`);
    chrome.tabs.update(tabId, { url: intentionUrl });
    return;
  }

  if (level === 5) {
    // Level 5 — Strict Tab Lock: Hard block on original tab, redirect back to allowed url
    const count = state.blockedAttempts || 0;
    await chrome.storage.local.set({ blockedAttempts: count + 1 });
    
    if (tabId === state.originalTabId) {
      chrome.tabs.update(tabId, { url: state.allowedUrl });
    } else {
      chrome.tabs.update(tabId, { url: 'about:blank' });
      if (state.originalTabId) {
        chrome.tabs.update(state.originalTabId, { active: true });
      }
    }
    return;
  }
}

// Enforce tab creations (Ctrl+T)
export async function enforceTabCreated(tab) {
  // No-op: do not trigger intention checks or close tabs on creation.
  // Navigation to unallowed domains is handled by enforceRedirect.
}

// Verify if a domain/hostname is trackable for analytics
export function isTrackableDomain(hostname) {
  if (!hostname) return false;
  
  let domain = hostname.toLowerCase().trim();
  
  // Extract hostname if a URL is passed
  if (domain.includes('://') || domain.startsWith('about:') || domain.startsWith('data:') || domain.startsWith('file:')) {
    try {
      if (domain.startsWith('about:') || domain.startsWith('data:') || domain.startsWith('file:')) {
        return false;
      }
      domain = new URL(domain).hostname.toLowerCase();
    } catch (e) {
      domain = domain.split('://')[1] || domain;
    }
  }
  
  if (domain.startsWith('www.')) {
    domain = domain.slice(4);
  }
  domain = domain.split(':')[0]; // remove port
  domain = domain.split('/')[0]; // remove path/query
  
  // Explicitly reject local/internal hostnames
  const rejectedHostnames = [
    'localhost', '127.0.0.1', 'chrome-extension', 'devtools',
    'newtab', 'unknown', 'blank', 'asdfghjk', 'test'
  ];
  if (rejectedHostnames.includes(domain) || rejectedHostnames.some(kw => domain.includes(kw))) {
    return false;
  }
  
  // Explicitly reject system protocols and keywords
  const rejectedKeywords = [
    'chrome://', 'chrome-extension://', 'edge://', 'about:', 'data:', 'file:', 'devtools://'
  ];
  if (rejectedKeywords.some(kw => domain.includes(kw))) {
    return false;
  }
  
  if (domain.length < 4) return false;
  
  // Require a dot and valid TLD format
  const tldRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
  if (!tldRegex.test(domain)) {
    return false;
  }
  
  return true;
}
