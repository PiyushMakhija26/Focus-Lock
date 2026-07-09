// Focus Lock - Timers and Badge Module
import { getFocusState, setStorage, clearFocusState } from './storage.js';
import { recordFocusSession } from './analytics.js';
import { logFocusSessionRecord, rebuildDerivedCaches, updateActiveDomain } from './intelligence.js';

// Update Chrome badge state in real-time
export async function updateBadge() {
  const state = await getFocusState();
  if (!state.focusModeActive) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  const now = Date.now();
  
  // 1. Check temporary pause
  if (state.tempPauseEndTime && now < state.tempPauseEndTime) {
    chrome.action.setBadgeText({ text: '⏸' });
    chrome.action.setBadgeBackgroundColor({ color: '#d59e45' }); // Amber warning/pause color
    return;
  }

  // 2. Check active timers
  if (state.timerEndTime === 0) {
    chrome.action.setBadgeText({ text: '🔒' });
    chrome.action.setBadgeBackgroundColor({ color: '#577861' }); // Calming Sage green
  } else {
    const remainingMins = Math.ceil((state.timerEndTime - now) / 60000);
    if (remainingMins <= 0) {
      await endFocusSession(true);
    } else {
      chrome.action.setBadgeText({ text: `${remainingMins}m` });
      chrome.action.setBadgeBackgroundColor({ color: '#4e808c' }); // Calming slate/cyan
    }
  }
}

// Start Focus Session
export async function startFocusSession(tab, lockMode, durationMinutes, intent, workspaceId = '', enforcementLevel = 4) {
  let allowedDestination = '';
  let allowedUrl = '';

  if (lockMode === 'workspace') {
    // For workspace mode, allowedDestination is the workspace name, and we get the workspace's allowed url later
    // Let's resolve the workspace info from workspaces list
    const storage = await chrome.storage.local.get(['workspaces']);
    const workspaces = storage.workspaces || [];
    let activeWs = workspaces.find(w => w.id === workspaceId);
    
    if (activeWs) {
      allowedDestination = activeWs.name;
      // Use the first domain as the redirect url fallback
      allowedUrl = activeWs.domains[0] ? `https://${activeWs.domains[0]}` : 'https://google.com';
    } else {
      throw new Error('Workspace not found');
    }
  } else if (tab) {
    allowedUrl = tab.url;
    try {
      const urlObj = new URL(tab.url);
      allowedDestination = lockMode === 'site' ? urlObj.hostname : tab.url;
    } catch (e) {
      allowedDestination = tab.url;
    }
  } else {
    throw new Error('Invalid tab metadata for lock mode');
  }

  const now = Date.now();
  const timerEndTime = durationMinutes > 0 ? now + durationMinutes * 60000 : 0;

  // Clear previous session metrics and initialize new ones
  await setStorage({
    focusModeActive: true,
    lockMode,
    allowedDestination,
    allowedUrl,
    originalTabId: tab ? tab.id : null,
    originalWindowId: tab ? tab.windowId : null,
    lastActiveAllowedTabId: tab ? tab.id : null,
    timerEndTime,
    tempPauseEndTime: 0,
    focusIntent: intent || '',
    activeWorkspaceId: workspaceId,
    tempWhitelistedDomains: [],
    tempWhitelistedUntil: {},
    sessionStartTime: now, // Track start time for analytics logging
    activeTimeMs: 0,
    idleTimeMs: 0,
    lockedTimeMs: 0,
    pauseReason: null,
    pauseStartTime: null,
    lastActiveTimestamp: now,
    enforcementLevel,
    warningsShown: 0,
    warningsIgnored: 0,
    blockedAttempts: 0,
    tempBypassesUsed: 0
  });



  // Update active tracking with focusSession details
  await updateActiveDomain(tab ? tab.url : allowedUrl, true);

  // Schedule background alarms
  await chrome.alarms.clearAll();
  if (durationMinutes > 0) {
    chrome.alarms.create('focusTimer', { delayInMinutes: durationMinutes });
  }
  chrome.alarms.create('badgeUpdater', { periodInMinutes: 1 });
  await updateBadge();
}

// End Focus Session
export async function endFocusSession(isTimerExpiration = false, prematureReflection = '', outcome = null, productivityRating = null) {
  const state = await getFocusState();
  const storage = await chrome.storage.local.get(['sessionStartTime']);
  const sessionStartTime = storage.sessionStartTime || Date.now();
  const now = Date.now();
  
  // Calculate remaining timer for recovery session
  let remainingTime = 0;
  const endedEarly = !isTimerExpiration && state.timerEndTime > 0 && now < state.timerEndTime;
  if (endedEarly) {
    remainingTime = state.timerEndTime - now;
  }

  // Calculate final cumulative active/idle/locked durations
  let finalActiveTimeMs = state.activeTimeMs || 0;
  let finalIdleTimeMs = state.idleTimeMs || 0;
  let finalLockedTimeMs = state.lockedTimeMs || 0;

  if (state.pauseReason) {
    const pausedDuration = now - (state.pauseStartTime || now);
    if (state.pauseReason === 'idle') {
      finalIdleTimeMs += pausedDuration;
    } else if (state.pauseReason === 'locked') {
      finalLockedTimeMs += pausedDuration;
    }
  } else {
    const activeSegment = now - (state.lastActiveTimestamp || state.sessionStartTime || now);
    finalActiveTimeMs += activeSegment;
  }

  // 1. Record session log & stats
  await recordFocusSession(
    sessionStartTime,
    now,
    state.focusIntent,
    prematureReflection,
    endedEarly,
    finalActiveTimeMs,
    finalIdleTimeMs,
    finalLockedTimeMs
  );

  // 1b. Record focus session in IndexedDB with metrics
  const extraStorage = await chrome.storage.local.get(['focusSessionDomainSequence', 'focusSessionDistractions']);
  const sessionDomains = extraStorage.focusSessionDomainSequence || [];
  const sessionDistractions = extraStorage.focusSessionDistractions || 0;
  
  await logFocusSessionRecord({
    id: `fs-${sessionStartTime}`,
    startTime: sessionStartTime,
    endTime: now,
    duration: finalActiveTimeMs, // Store actual focusTime
    idleTimeMs: finalIdleTimeMs,
    lockedTimeMs: finalLockedTimeMs,
    intent: state.focusIntent || 'Unnamed Focus Session',
    workspaceId: state.activeWorkspaceId || '',
    domains: sessionDomains,
    distractions: sessionDistractions,
    endedEarly,
    outcome,
    productivityRating,
    reflection: prematureReflection,
    enforcementLevel: state.enforcementLevel !== undefined ? state.enforcementLevel : 4,
    warningsShown: state.warningsShown || 0,
    warningsIgnored: state.warningsIgnored || 0,
    blockedAttempts: state.blockedAttempts || 0,
    tempBypassesUsed: state.tempBypassesUsed || 0
  });

  // 2. Manage recovery state
  let recoverySession = null;
  if (endedEarly) {
    recoverySession = {
      lockMode: state.lockMode,
      allowedDestination: state.allowedDestination,
      allowedUrl: state.allowedUrl,
      remainingTime,
      intent: state.focusIntent,
      activeWorkspaceId: state.activeWorkspaceId,
      enforcementLevel: state.enforcementLevel !== undefined ? state.enforcementLevel : 4
    };
  }

  const lastSessionMetadata = {
    id: `fs-${sessionStartTime}`,
    intent: state.focusIntent,
    startTime: sessionStartTime,
    endTime: now,
    duration: finalActiveTimeMs, // Store actual focusTime
    idleTimeMs: finalIdleTimeMs,
    lockedTimeMs: finalLockedTimeMs,
    domains: sessionDomains,
    distractions: sessionDistractions,
    endedEarly,
    workspaceId: state.activeWorkspaceId,
    pendingReflection: isTimerExpiration,
    enforcementLevel: state.enforcementLevel !== undefined ? state.enforcementLevel : 4,
    warningsShown: state.warningsShown || 0,
    warningsIgnored: state.warningsIgnored || 0,
    blockedAttempts: state.blockedAttempts || 0,
    tempBypassesUsed: state.tempBypassesUsed || 0
  };

  // 3. Clear timers & alarms
  await clearFocusState();
  await chrome.alarms.clearAll();
  await setStorage({ 
    recoverySession,
    lastSessionMetadata,
    focusSessionDomainSequence: [],
    focusSessionDistractions: 0
  });

  // Resume normal domain tracking
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    if (tabs && tabs[0]) {
      await updateActiveDomain(tabs[0].url, true);
    } else {
      await updateActiveDomain('', false);
    }
  });

  // Rebuild derived data caches
  await rebuildDerivedCaches();
  await updateBadge();

  // 4. Send Completion Notification
  if (isTimerExpiration) {
    chrome.notifications.create('focusTimerEnded', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Focus Session Complete',
      message: `Your focus lock has ended. You focused on: ${state.focusIntent || 'your task'}.`,
      priority: 2
    });
  }
}

// Resume Previous Session
export async function resumeFocusSession(recoveryData, tab) {
  const now = Date.now();
  const durationMinutes = recoveryData.remainingTime / 60000;
  const timerEndTime = now + recoveryData.remainingTime;

  await setStorage({
    focusModeActive: true,
    lockMode: recoveryData.lockMode,
    allowedDestination: recoveryData.allowedDestination,
    allowedUrl: recoveryData.allowedUrl,
    originalTabId: tab ? tab.id : null,
    originalWindowId: tab ? tab.windowId : null,
    lastActiveAllowedTabId: tab ? tab.id : null,
    timerEndTime,
    tempPauseEndTime: 0,
    focusIntent: recoveryData.intent || '',
    activeWorkspaceId: recoveryData.activeWorkspaceId || '',
    tempWhitelistedDomains: [],
    tempWhitelistedUntil: {},
    sessionStartTime: now,
    activeTimeMs: 0,
    idleTimeMs: 0,
    lockedTimeMs: 0,
    pauseReason: null,
    pauseStartTime: null,
    lastActiveTimestamp: now,
    recoverySession: null, // Clear recovery slot once resumed
    enforcementLevel: recoveryData.enforcementLevel !== undefined ? recoveryData.enforcementLevel : 4
  });

  // Apply YouTube filter overrides based on active workspace on session resume
  await updateActiveYoutubeFiltersForSession(recoveryData.activeWorkspaceId);

  await chrome.alarms.clearAll();
  chrome.alarms.create('focusTimer', { delayInMinutes: durationMinutes });
  chrome.alarms.create('badgeUpdater', { periodInMinutes: 1 });
  await updateBadge();
}

// Set temporary browser-wide pause
export async function pauseEnforcement(durationSeconds) {
  const tempPauseEndTime = Date.now() + durationSeconds * 1000;
  await setStorage({ tempPauseEndTime });
  
  chrome.alarms.create('tempPauseTimer', { delayInMinutes: durationSeconds / 60 });
  await updateBadge();
  return tempPauseEndTime;
}

// Handle system idle/lock state transitions
export async function handleSystemStateChange(newState) {
  const state = await getFocusState();
  if (!state.focusModeActive) return;

  const now = Date.now();

  if (newState === 'locked') {
    if (!state.pauseReason) {
      // Calculate active segment elapsed up to lock
      const lastActive = state.lastActiveTimestamp || state.sessionStartTime || now;
      const activeSegment = now - lastActive;
      const newActiveTimeMs = (state.activeTimeMs || 0) + activeSegment;

      await setStorage({
        pauseReason: 'locked',
        pauseStartTime: now,
        activeTimeMs: newActiveTimeMs,
        lastActiveTimestamp: null
      });

      // Clear alarms during system pause
      await chrome.alarms.clear('focusTimer');
      await updateBadge();
    }
  } else if (newState === 'idle') {
    // Show idle state only — do not pause session tracking or alarms
    await setStorage({ systemIdle: true });
  } else if (newState === 'active') {
    // Remove idle indicator
    await setStorage({ systemIdle: false });
    
    // Automatically resume if configured
    if (state.pauseReason === 'locked' && state.autoResumeOnUnlock) {
      await resumeSystemPausedSession();
    }
  }
}

// Resume system paused session (e.g. after lock return)
export async function resumeSystemPausedSession() {
  const state = await getFocusState();
  if (!state.focusModeActive || !state.pauseReason) return;

  const now = Date.now();
  const pausedDuration = now - (state.pauseStartTime || now);

  let newIdleTimeMs = state.idleTimeMs || 0;
  let newLockedTimeMs = state.lockedTimeMs || 0;

  if (state.pauseReason === 'idle') {
    newIdleTimeMs += pausedDuration;
  } else if (state.pauseReason === 'locked') {
    newLockedTimeMs += pausedDuration;
  }

  // Extend timerEndTime by pausedDuration
  let newTimerEndTime = state.timerEndTime;
  if (state.timerEndTime > 0) {
    newTimerEndTime = state.timerEndTime + pausedDuration;
  }

  await setStorage({
    pauseReason: null,
    pauseStartTime: null,
    idleTimeMs: newIdleTimeMs,
    lockedTimeMs: newLockedTimeMs,
    timerEndTime: newTimerEndTime,
    lastActiveTimestamp: now
  });

  // Re-schedule the focusTimer alarm with remaining time
  if (newTimerEndTime > 0) {
    const remainingMinutes = (newTimerEndTime - now) / 60000;
    await chrome.alarms.clear('focusTimer');
    if (remainingMinutes > 0) {
      chrome.alarms.create('focusTimer', { delayInMinutes: remainingMinutes });
    } else {
      await endFocusSession(true);
      return;
    }
  }

  await updateBadge();
}
