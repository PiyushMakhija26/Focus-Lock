// Focus Lock - Background Service Worker Hub (ES Module)
import { initializeStorage, getFocusState, setStorage } from './modules/storage.js';
import { enforceRedirect, enforceTabCreated, isUrlAllowed } from './modules/enforcement.js';
import { updateBadge, endFocusSession, startFocusSession, resumeFocusSession, pauseEnforcement, handleSystemStateChange, resumeSystemPausedSession } from './modules/timers.js';
import { addTempWhitelistDomain, addTimedWhitelistDomain, getWorkspaces, saveWorkspaces } from './modules/workspaces.js';
import { openDB, updateActiveDomain, updateFocusState, rebuildDerivedCaches, purgeOldLogs, populateMockIntelligenceData, updateSessionReflection, writeIntentionLog, runDataCleanupMigration } from './modules/intelligence.js';
import { recordDistraction } from './modules/analytics.js';

// Initialize defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  await initializeStorage();
  await openDB();
  await runDataCleanupMigration();
  await rebuildDerivedCaches();
  await checkTimerState();
});

// Restore alarms and badges on browser start
chrome.runtime.onStartup.addListener(async () => {
  await openDB();
  await runDataCleanupMigration();
  
  // Data Retention Purge routine
  const storage = await chrome.storage.local.get(['dataRetentionPeriod']);
  const retentionDays = storage.dataRetentionPeriod !== undefined ? storage.dataRetentionPeriod : 365;
  await purgeOldLogs(retentionDays);
  
  await rebuildDerivedCaches();
  await checkTimerState();
});

// Alarm Handler (Timer, Pause, Badge)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'focusTimer') {
    await endFocusSession(true);
  } else if (alarm.name === 'tempPauseTimer') {
    // Clear pause state
    await setStorage({ tempPauseEndTime: 0 });
    await updateBadge();
    
    // Snaps back immediately if on disallowed tab
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0]) {
        await enforceRedirect(tabs[0].id, tabs[0].url, 'pause_end');
      }
    });
  } else if (alarm.name === 'badgeUpdater') {
    await updateBadge();
  }
});

// Navigation & Tab Listeners
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const state = await getFocusState();
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (!tab) return;

    if (state.focusModeActive && state.enforcementLevel === 5) {
      if (activeInfo.tabId !== state.originalTabId) {
        const allowed = await isUrlAllowed(tab.url, state);
        if (!allowed) {
          // Snap focus back in Strict Tab Lock if switching to an unallowed page
          const count = state.blockedAttempts || 0;
          await chrome.storage.local.set({ blockedAttempts: count + 1 });
          await recordDistraction();
          chrome.tabs.update(state.originalTabId, { active: true });
          if (state.originalWindowId) {
            chrome.windows.update(state.originalWindowId, { focused: true });
          }
          return;
        }
      }
    }
    if (tab.url) {
      await enforceRedirect(activeInfo.tabId, tab.url, 'activated');
      await updateActiveDomain(tab.url, true);
    }
  } catch (e) {
    console.error('onActivated error:', e);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    await enforceRedirect(tabId, changeInfo.url, 'updated');
    if (tab.active) {
      await updateActiveDomain(changeInfo.url, true);
    }
  }
});

chrome.tabs.onCreated.addListener(async (tab) => {
  await enforceTabCreated(tab);
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // Top-level navigations only
  await enforceRedirect(details.tabId, details.url, 'before_navigate');
  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (tab && tab.active) {
      await updateActiveDomain(details.url, true);
    }
  } catch (e) {
    await updateActiveDomain(details.url, true);
  }
});

// Window Focus Listener for Active Time Calculation
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await updateFocusState(false);
  } else {
    chrome.tabs.query({ active: true, windowId: windowId }, async (tabs) => {
      if (tabs && tabs[0]) {
        await updateActiveDomain(tabs[0].url, true);
      } else {
        await updateFocusState(false);
      }
    });
  }
});

// Keyboard Commands Toggle Handler
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-focus-lock') {
    const state = await getFocusState();
    if (state.focusModeActive) {
      await endFocusSession(false);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs && tabs[0]) {
          const activeTab = tabs[0];
          if (activeTab.url && (activeTab.url.startsWith('http://') || activeTab.url.startsWith('https://'))) {
            // Default: Lock current domain indefinitely
            await startFocusSession(activeTab, 'site', 0, 'Quick Keyboard Focus');
          }
        }
      });
    }
  }
});

// Message Receiver
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startFocus') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0]) {
        try {
          await startFocusSession(tabs[0], request.lockMode, request.duration, request.intent, request.workspaceId, request.enforcementLevel);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    return true; // Keep channel open for async sendResponse
  } 
  
  if (request.action === 'stopFocus') {
    endFocusSession(
      false, 
      request.reflection || '', 
      request.outcome || null, 
      request.productivityRating || null
    ).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'submitReflection') {
    updateSessionReflection(
      request.sessionId,
      request.outcome,
      request.productivityRating,
      request.reflection
    ).then(async () => {
      // Set pendingReflection to false in lastSessionMetadata
      const storage = await chrome.storage.local.get(['lastSessionMetadata']);
      if (storage.lastSessionMetadata && storage.lastSessionMetadata.id === request.sessionId) {
        storage.lastSessionMetadata.pendingReflection = false;
        await chrome.storage.local.set({ lastSessionMetadata: storage.lastSessionMetadata });
      }
      await rebuildDerivedCaches();
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'pauseFocus') {
    pauseEnforcement(request.durationSeconds || 30).then(async (tempPauseEndTime) => {
      const state = await getFocusState();
      const count = state.tempBypassesUsed || 0;
      await chrome.storage.local.set({ tempBypassesUsed: count + 1 });
      sendResponse({ success: true, tempPauseEndTime });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'resumeFocus') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0]) {
        try {
          await resumeFocusSession(request.recoveryData, tabs[0]);
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }

  if (request.action === 'resumeSystemPause') {
    resumeSystemPausedSession().then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'continueAdvisoryOnce') {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      if (tabs && tabs[0]) {
        try {
          const tabId = tabs[0].id;
          const storage = await chrome.storage.local.get(['continueOnce', 'warningsIgnored']);
          const continueOnce = storage.continueOnce || {};
          continueOnce[tabId] = {
            domain: request.domain.toLowerCase(),
            timestamp: Date.now()
          };
          const warningsIgnored = (storage.warningsIgnored || 0) + 1;
          await chrome.storage.local.set({ continueOnce, warningsIgnored });
          sendResponse({ success: true });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
      } else {
        sendResponse({ success: false, error: 'No active tab' });
      }
    });
    return true;
  }

  if (request.action === 'whitelistDomainTemp') {
    addTempWhitelistDomain(request.domain).then(async () => {
      const state = await getFocusState();
      const tempBypassesUsed = (state.tempBypassesUsed || 0) + 1;
      const warningsIgnored = (state.warningsIgnored || 0) + 1;
      await chrome.storage.local.set({ tempBypassesUsed, warningsIgnored });
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'whitelistDomainTimed') {
    addTimedWhitelistDomain(request.domain, request.durationMinutes).then(async () => {
      const state = await getFocusState();
      const tempBypassesUsed = (state.tempBypassesUsed || 0) + 1;
      const warningsIgnored = (state.warningsIgnored || 0) + 1;
      await chrome.storage.local.set({ tempBypassesUsed, warningsIgnored });
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'logIntention') {
    writeIntentionLog(request.log).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'acceptRecommendation') {
    handleAcceptRecommendation(request.recommendationId).then((result) => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'dismissRecommendation') {
    handleDismissRecommendation(request.recommendationId, request.forever || false).then((result) => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'generateMockData') {
    populateMockIntelligenceData().then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'rebuildCaches') {
    rebuildDerivedCaches().then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

// Helper functions for recommendation handling
async function handleAcceptRecommendation(recId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['recommendationHistory'], 'readonly');
    const store = transaction.objectStore('recommendationHistory');
    const request = store.get(recId);
    
    request.onsuccess = async () => {
      const rec = request.result;
      if (!rec) {
        resolve({ success: false, error: 'Recommendation not found' });
        return;
      }
      
      try {
        const workspaces = await getWorkspaces();
        
        if (rec.type === 'addition') {
          const ws = workspaces.find(w => w.id === rec.workspaceId);
          if (ws && !ws.domains.includes(rec.details.domain)) {
            ws.domains.push(rec.details.domain);
            await saveWorkspaces(workspaces);
          }
        } else if (rec.type === 'removal') {
          const ws = workspaces.find(w => w.id === rec.workspaceId);
          if (ws) {
            ws.domains = ws.domains.filter(d => d !== rec.details.domain);
            await saveWorkspaces(workspaces);
          }
        } else if (rec.type === 'split') {
          const ws = workspaces.find(w => w.id === rec.workspaceId);
          if (ws) {
            // Remove original workspace
            const filtered = workspaces.filter(w => w.id !== rec.workspaceId || w.isDefault);
            
            // Add new split ones
            const splitA = {
              id: `ws-${Date.now()}-a`,
              name: rec.details.workspaceAName,
              domains: rec.details.workspaceADomains,
              isDefault: false
            };
            const splitB = {
              id: `ws-${Date.now() + 1}-b`,
              name: rec.details.workspaceBName,
              domains: rec.details.workspaceBDomains,
              isDefault: false
            };
            filtered.push(splitA, splitB);
            await saveWorkspaces(filtered);
          }
        } else if (rec.type === 'merge') {
          const filtered = workspaces.filter(w => w.id !== rec.details.workspaceAId && w.id !== rec.details.workspaceBId);
          const merged = {
            id: `ws-${Date.now()}-merged`,
            name: rec.details.mergedName,
            domains: rec.details.mergedDomains,
            isDefault: false
          };
          filtered.push(merged);
          await saveWorkspaces(filtered);
        } else if (rec.type === 'drift') {
          const ws = workspaces.find(w => w.id === rec.workspaceId);
          if (ws) {
            const adds = rec.details.addDomains || [];
            const rems = rec.details.removeDomains || [];
            
            // Perform additions
            adds.forEach(d => {
              if (!ws.domains.includes(d)) ws.domains.push(d);
            });
            // Perform removals
            ws.domains = ws.domains.filter(d => !rems.includes(d));
            await saveWorkspaces(workspaces);
          }
        }
        
        // Mark recommendation as accepted
        const writeTransaction = db.transaction(['recommendationHistory'], 'readwrite');
        const writeStore = writeTransaction.objectStore('recommendationHistory');
        rec.action = 'accepted';
        rec.actionDate = Date.now();
        writeStore.put(rec);
        
        writeTransaction.oncomplete = async () => {
          await rebuildDerivedCaches();
          resolve({ success: true });
        };
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

async function handleDismissRecommendation(recId, forever = false) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['recommendationHistory'], 'readwrite');
    const store = transaction.objectStore('recommendationHistory');
    const request = store.get(recId);
    
    request.onsuccess = async () => {
      const rec = request.result;
      if (!rec) {
        resolve({ success: false, error: 'Recommendation not found' });
        return;
      }
      
      rec.action = forever ? 'dismissed_forever' : 'dismissed';
      rec.actionDate = Date.now();
      store.put(rec);
      
      if (forever) {
        const storage = await chrome.storage.local.get(['dismissedRecommendations']);
        const dismissed = storage.dismissedRecommendations || [];
        if (!dismissed.includes(recId)) {
          dismissed.push(recId);
          await chrome.storage.local.set({ dismissedRecommendations: dismissed });
        }
      }
      
      transaction.oncomplete = async () => {
        await rebuildDerivedCaches();
        resolve({ success: true });
      };
    };
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// Restore check logic
async function checkTimerState() {
  const state = await getFocusState();
  if (!state.focusModeActive) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const now = Date.now();
  if (state.timerEndTime !== 0 && now >= state.timerEndTime && !state.pauseReason) {
    await endFocusSession(true);
  } else {
    // Restore alarms
    await chrome.alarms.clearAll();
    
    if (state.timerEndTime !== 0 && !state.pauseReason) {
      const delayInMinutes = (state.timerEndTime - now) / 60000;
      if (delayInMinutes > 0) {
        chrome.alarms.create('focusTimer', { delayInMinutes });
      }
    }

    if (state.tempPauseEndTime !== 0 && now < state.tempPauseEndTime) {
      const delayInMinutes = (state.tempPauseEndTime - now) / 60000;
      if (delayInMinutes > 0) {
        chrome.alarms.create('tempPauseTimer', { delayInMinutes });
      }
    }

    chrome.alarms.create('badgeUpdater', { periodInMinutes: 1 });
    await updateBadge();
  }
}

// Register 60-second idle detection interval (prevents auto-pauses when reading/thinking)
if (chrome.idle) {
  chrome.idle.setDetectionInterval(60);

  // Monitor idle state changes to route lock/idle events
  chrome.idle.onStateChanged.addListener(async (newState) => {
    await handleSystemStateChange(newState);
  });
} else {
  console.warn('chrome.idle API is not available. Please ensure the "idle" permission is successfully declared in manifest.json.');
}
