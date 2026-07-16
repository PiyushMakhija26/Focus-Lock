// Focus Lock v2 - Popup Script (ES Module)
import { getStorage, setStorage, getFocusState } from './modules/storage.js';
import { getWorkspaces, addWorkspace, editWorkspace, deleteWorkspace } from './modules/workspaces.js';
import { getAnalyticsSummary } from './modules/analytics.js';
import { startFocusSession, endFocusSession, resumeFocusSession, pauseEnforcement } from './modules/timers.js';
import { exportBackupZip, importBackupZip, openDB } from './modules/intelligence.js';

const SHOW_DEV_TOOLS = false;

// DOM Cache
const bodyElement = document.body;
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const activeModeIndicator = document.getElementById('activeModeIndicator');

// Nav tabs
const navItems = document.querySelectorAll('.nav-item');
const tabViews = document.querySelectorAll('.tab-view');

// Recovery Banner
const recoveryBanner = document.getElementById('recoveryBanner');
const recoveryIntentText = document.getElementById('recoveryIntentText');
const btnResume = document.getElementById('btnResume');

// Home View (Focus)
const statusCard = document.getElementById('statusCard');
const statusTitle = document.getElementById('statusTitle');
const statusSubtitle = document.getElementById('statusSubtitle');
const setupScreen = document.getElementById('setupScreen');
const activeScreen = document.getElementById('activeScreen');
const focusIntentInput = document.getElementById('focusIntentInput');
const customTimerPanel = document.getElementById('customTimerPanel');
const customMinutes = document.getElementById('customMinutes');
const customTimerBtn = document.getElementById('customTimerBtn');

// Setup Action Triggers
const btnLaunchSite = document.getElementById('btnLaunchSite');
const btnLaunchTab = document.getElementById('btnLaunchTab');
const launchSiteDomain = document.getElementById('launchSiteDomain');
const launchTabUrl = document.getElementById('launchTabUrl');
const unsupportedWarning = document.getElementById('unsupportedWarning');
const quickWorkspacesList = document.getElementById('quickWorkspacesList');

// Active Focus elements
const activeLockBadge = document.getElementById('activeLockBadge');
const activeLockTarget = document.getElementById('activeLockTarget');
const activeLockIntent = document.getElementById('activeLockIntent');
const activeCountdown = document.getElementById('activeCountdown');
const activeCountdownLabel = document.getElementById('activeCountdownLabel');
const activeProgressRing = document.getElementById('activeProgressRing');
const btnPauseToggle = document.getElementById('btnPauseToggle');
const pauseOptions = document.getElementById('pauseOptions');
const btnUnlock = document.getElementById('btnUnlock');

// System Pause elements
const systemPausePanel = document.getElementById('systemPausePanel');
const systemPauseTitle = document.getElementById('systemPauseTitle');
const pausePromptText = document.getElementById('pausePromptText');
const chkAutoResume = document.getElementById('chkAutoResume');
const btnSystemResume = document.getElementById('btnSystemResume');
const btnSystemEnd = document.getElementById('btnSystemEnd');

// Reflection Modal
const reflectionModal = document.getElementById('reflectionModal');
const reflectionIntentDisplay = document.getElementById('reflectionIntentDisplay');
const reflectionNotes = document.getElementById('reflectionNotes');
const reflectedDuration = document.getElementById('reflectedDuration');
const reflectedDistractions = document.getElementById('reflectedDistractions');
const btnConfirmUnlock = document.getElementById('btnConfirmUnlock');
const btnCancelUnlock = document.getElementById('btnCancelUnlock');

// Workspaces View
const btnNewWorkspace = document.getElementById('btnNewWorkspace');
const workspaceFormPanel = document.getElementById('workspaceFormPanel');
const formPanelTitle = document.getElementById('formPanelTitle');
const wsNameInput = document.getElementById('wsNameInput');
const wsDomainsInput = document.getElementById('wsDomainsInput');
const btnSaveWorkspace = document.getElementById('btnSaveWorkspace');
const btnCancelWorkspace = document.getElementById('btnCancelWorkspace');
const workspacesList = document.getElementById('workspacesList');

// Analytics View
const statFocusToday = document.getElementById('statFocusToday');
const statFocusWeekly = document.getElementById('statFocusWeekly');
const statDistractions = document.getElementById('statDistractions');
const historyLogsList = document.getElementById('historyLogsList');

// Settings View
const selectFocusRingMode = document.getElementById('selectFocusRingMode');
const selectFocusRingPosition = document.getElementById('selectFocusRingPosition');
const ringPositionRow = document.getElementById('ringPositionRow');

// State Cache
let activeTabInfo = null;
let selectedDuration = 0; // minutes, 0 = indefinite
let activeWorkspaceEditId = null;

let countdownInterval = null;
let selectedOutcome = null;
let selectedRating = null;
let currentReflectionSessionId = null; // null represents active session, otherwise pending session ID

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  await syncTheme();
  initNav();
  initTimerSelector();
  initFocusActions();
  initSpaceCRUD();

  initSettingsListeners();
  initInsightsAndBackupListeners();
  initYoutubeListeners();
  initWhatsNew();
  
  // Initialize Enforcement Level Selector
  await syncEnforcementLevelSelector();
  
  // Add change listeners to radios
  const levelRadios = document.querySelectorAll('input[name="enforcementLevel"]');
  levelRadios.forEach(r => {
    r.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      updateLaunchRecommendations(val);
    });
  });
  
  // Set up click handlers for V4 Outcome and Star Rating in reflection modal
  const outcomeBtns = document.querySelectorAll('.outcome-btn');
  outcomeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      outcomeBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      selectedOutcome = e.currentTarget.dataset.outcome;
    });
  });

  const starBtns = document.querySelectorAll('.star-btn');
  starBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const rating = parseInt(e.currentTarget.dataset.rating, 10);
      selectedRating = rating;
      starBtns.forEach(b => {
        const starRating = parseInt(b.dataset.rating, 10);
        b.classList.toggle('active', starRating <= rating);
      });
    });
  });

  // Check if there is a session pending reflection
  const storage = await chrome.storage.local.get(['lastSessionMetadata']);
  if (storage.lastSessionMetadata && storage.lastSessionMetadata.pendingReflection) {
    openReflectionModal(storage.lastSessionMetadata);
  } else {
    // Start in Home (Focus) View
    switchTab('focus');
  }
});

// Listen to storage sync updates
chrome.storage.onChanged.addListener((changes) => {
  if (
    changes.focusModeActive ||
    changes.timerEndTime ||
    changes.tempPauseEndTime ||
    changes.recoverySession
  ) {
    syncActiveHomeState();
  }
});

// Theme Management
async function syncTheme() {
  const result = await getStorage(['darkMode']);
  let isDark = result.darkMode;
  
  if (isDark === null || isDark === undefined) {
    // Detect system preference
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    await setStorage({ darkMode: isDark });
  }

  if (isDark) {
    bodyElement.classList.add('dark');
    bodyElement.classList.remove('light');
    updateThemeIcon(true);
  } else {
    bodyElement.classList.add('light');
    bodyElement.classList.remove('dark');
    updateThemeIcon(false);
  }
}

function updateThemeIcon(isDark) {
  if (isDark) {
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
  } else {
    themeIcon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    `;
  }
}

// Navigation Tabs
function initNav() {
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const tabId = e.currentTarget.dataset.tab;
      if (tabId === 'insights') {
        chrome.tabs.create({ url: 'report.html' });
      } else {
        switchTab(tabId);
      }
    });
  });
}

function switchTab(tabId) {
  navItems.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  
  tabViews.forEach(view => {
    view.classList.toggle('hidden', view.id !== `tabView-${tabId}`);
  });

  // Load view-specific data
  if (tabId === 'focus') {
    syncActiveHomeState();
  } else if (tabId === 'spaces') {
    renderSpacesList();

  } else if (tabId === 'settings') {
    syncSettingsView();
  } else if (tabId === 'youtube') {
    renderYoutubeView();
  }
}

// Timer Preset Selectors
function initTimerSelector() {
  const presetBtns = document.querySelectorAll('.timer-presets .preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      presetBtns.forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      
      const duration = e.currentTarget.dataset.duration;
      if (duration === 'custom') {
        selectedDuration = 'custom';
        customTimerPanel.classList.remove('hidden');
        customMinutes.focus();
      } else {
        selectedDuration = parseInt(duration, 10);
        customTimerPanel.classList.add('hidden');
      }
    });
  });
}

// Home screen state updates
async function syncActiveHomeState() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  const state = await getFocusState();
  const isFocusActive = !!state.focusModeActive;

  // Sync Header Indicator
  activeModeIndicator.classList.toggle('hidden', !isFocusActive);

  // Sync Recovery Banner
  if (state.recoverySession && !isFocusActive) {
    recoveryBanner.classList.remove('hidden');
    recoveryIntentText.textContent = state.recoverySession.intent 
      ? `"${state.recoverySession.intent}"` 
      : 'Previous session';
  } else {
    recoveryBanner.classList.add('hidden');
  }

  if (isFocusActive) {
    // Show active screen
    setupScreen.classList.add('hidden');
    activeScreen.classList.remove('hidden');

    const now = Date.now();
    const isPaused = state.tempPauseEndTime && now < state.tempPauseEndTime;
    const isSystemPaused = !!state.pauseReason;

    if (isSystemPaused) {
      if (systemPausePanel) systemPausePanel.classList.remove('hidden');
      if (systemPauseTitle) systemPauseTitle.textContent = state.pauseReason === 'locked' ? 'Screen Locked' : 'System Idle';
      
      const awayMs = now - (state.pauseStartTime || now);
      const awayMins = Math.floor(awayMs / 60000);
      const awaySecs = Math.floor((awayMs % 60000) / 1000);
      if (pausePromptText) {
        if (awayMins > 0) {
          pausePromptText.textContent = `You were away for ${awayMins}m ${awaySecs}s.`;
        } else {
          pausePromptText.textContent = `You were away for ${awaySecs}s.`;
        }
      }

      if (chkAutoResume) {
        chkAutoResume.checked = !!state.autoResumeOnUnlock;
        chkAutoResume.onclick = async () => {
          await setStorage({ autoResumeOnUnlock: chkAutoResume.checked });
        };
      }

      // Hide normal countdown, target details, and default controls
      const details = document.querySelector('#activeScreen .active-lock-details');
      const container = document.querySelector('#activeScreen .countdown-container');
      const actions = document.querySelector('#activeScreen .active-actions');
      if (details) details.classList.add('hidden');
      if (container) container.classList.add('hidden');
      if (actions) actions.classList.add('hidden');

      if (btnSystemResume) {
        btnSystemResume.onclick = async () => {
          btnSystemResume.disabled = true;
          chrome.runtime.sendMessage({ action: 'resumeSystemPause' }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('resumeSystemPause message error:', chrome.runtime.lastError.message);
            }
            btnSystemResume.disabled = false;
            if (response && response.success) {
              syncActiveHomeState();
            }
          });
        };
      }

      if (btnSystemEnd) {
        btnSystemEnd.onclick = async () => {
          openReflectionModal();
        };
      }
      return;
    }

    // Normal focus operation
    if (systemPausePanel) systemPausePanel.classList.add('hidden');
    const details = document.querySelector('#activeScreen .active-lock-details');
    const container = document.querySelector('#activeScreen .countdown-container');
    const actions = document.querySelector('#activeScreen .active-actions');
    if (details) details.classList.remove('hidden');
    if (container) container.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');

    // Status card state
    if (isPaused) {
      statusCard.className = 'status-card paused';
      statusTitle.textContent = 'Focus Paused';
      statusSubtitle.textContent = 'Temporary workspace override active.';
    } else {
      statusCard.className = 'status-card active';
      statusTitle.textContent = 'Focus Locked';
      statusSubtitle.textContent = 'Your browser is currently dedicated to your intent.';
    }

    // Active details
    const levelNames = {
      0: 'Focus Session',
      1: 'Advisory Mode',
      2: 'Soft Lock',
      3: 'Focus Site',
      4: 'Focus Workspace',
      5: 'Strict Tab Lock'
    };
    const activeLevel = state.enforcementLevel !== undefined ? state.enforcementLevel : 4;
    activeLockBadge.textContent = (levelNames[activeLevel] || 'Focus Lock').toUpperCase();
    activeLockTarget.textContent = state.allowedDestination;
    activeLockIntent.textContent = state.focusIntent ? `"${state.focusIntent}"` : 'Protecting Intention';

    // Start timer interval
    runLocalCountdown(state.timerEndTime, state.tempPauseEndTime, state.sessionStartTime);

  } else {
    // Show setup screen
    setupScreen.classList.remove('hidden');
    activeScreen.classList.add('hidden');

    statusCard.className = 'status-card inactive';
    statusTitle.textContent = 'Ready to Focus';
    statusSubtitle.textContent = 'Set your intent and launch a session.';

    // Query active tab URL
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        activeTabInfo = tabs[0];
        const isWeb = activeTabInfo.url && (activeTabInfo.url.startsWith('http://') || activeTabInfo.url.startsWith('https://'));
        
        if (isWeb) {
          unsupportedWarning.classList.add('hidden');
          btnLaunchSite.disabled = false;
          btnLaunchTab.disabled = false;
          
          try {
            const urlObj = new URL(activeTabInfo.url);
            launchSiteDomain.textContent = urlObj.hostname;
          } catch(e) {
            launchSiteDomain.textContent = activeTabInfo.url;
          }
          launchTabUrl.textContent = activeTabInfo.url;
        } else {
          unsupportedWarning.classList.remove('hidden');
          btnLaunchSite.disabled = true;
          btnLaunchTab.disabled = true;
          launchSiteDomain.textContent = 'Cannot lock domain';
          launchTabUrl.textContent = activeTabInfo.url || 'Blank page';
        }
      }
    });

    // Load spaces launch buttons
    renderQuickSpacesList();
  }
}

// Local Timer Countdown Loop
function runLocalCountdown(timerEndTime, tempPauseEndTime, sessionStartTime) {
  const circumference = 552.92;

  const setProgress = (percent) => {
    if (activeProgressRing) {
      const offset = circumference - (percent / 100) * circumference;
      activeProgressRing.style.strokeDashoffset = offset;
    }
  };

  const setRingState = (stateClass) => {
    if (activeProgressRing) {
      activeProgressRing.classList.remove('ring-active', 'ring-paused', 'ring-indefinite', 'ring-urgency');
      activeProgressRing.classList.add(stateClass);
    }
  };

  const update = () => {
    const now = Date.now();
    
    // Check pause first
    if (tempPauseEndTime && now < tempPauseEndTime) {
      const remainingSecs = Math.ceil((tempPauseEndTime - now) / 1000);
      activeCountdown.textContent = `00:${remainingSecs.toString().padStart(2, '0')}`;
      activeCountdownLabel.textContent = 'Temporary Pause';
      setProgress(100);
      setRingState('ring-paused');
      return;
    }

    // Normal countdown
    if (timerEndTime === 0) {
      activeCountdown.textContent = '∞';
      activeCountdownLabel.textContent = 'Focusing Indefinitely';
      setProgress(100);
      setRingState('ring-indefinite');
    } else {
      const remainingMs = timerEndTime - now;
      if (remainingMs <= 0) {
        activeCountdown.textContent = '00:00';
        activeCountdownLabel.textContent = 'Completed';
        setProgress(0);
        setRingState('ring-active');
        clearInterval(countdownInterval);
        return;
      }
      
      const totalSeconds = Math.floor(remainingMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      
      const formattedSecs = seconds.toString().padStart(2, '0');
      const formattedMins = minutes.toString().padStart(2, '0');
      
      if (hours > 0) {
        activeCountdown.textContent = `${hours}:${formattedMins}:${formattedSecs}`;
      } else {
        activeCountdown.textContent = `${formattedMins}:${formattedSecs}`;
      }
      activeCountdownLabel.textContent = 'Time Remaining';

      // Calculate elapsed percentage
      let totalMs = timerEndTime - (sessionStartTime || (now - 1000));
      if (totalMs <= 0) {
        totalMs = 1;
      }
      let percent = (remainingMs / totalMs) * 100;
      percent = Math.max(0, Math.min(100, percent));
      setProgress(percent);

      if (percent <= 5) {
        setRingState('ring-urgency');
      } else {
        setRingState('ring-active');
      }
    }
  };
  
  update();
  countdownInterval = setInterval(update, 1000);
}

// Populate Quick Workspaces List in Home Setup
async function renderQuickSpacesList() {
  const workspaces = await getWorkspaces();
  quickWorkspacesList.innerHTML = '';
  
  if (workspaces.length === 0) {
    quickWorkspacesList.innerHTML = '<p class="empty-history">No spaces configured.</p>';
    return;
  }
  
  workspaces.forEach((ws, idx) => {
    const btn = document.createElement('button');
    btn.className = 'launch-card-btn';
    btn.innerHTML = `
      <span class="card-icon">
        <svg class="card-icon-svg" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/></svg>
      </span>
      <div class="card-info">
        <span class="card-title">Launch ${ws.name}</span>
        <span class="card-subtitle">${ws.domains.length} allowed domains</span>
      </div>
    `;
    btn.addEventListener('click', () => {
      triggerLaunchSession('workspace', ws.id);
    });
    quickWorkspacesList.appendChild(btn);
  });

  // Re-run recommendations to highlight the first space if relevant
  const selectedLevelRadio = document.querySelector('input[name="enforcementLevel"]:checked');
  if (selectedLevelRadio) {
    updateLaunchRecommendations(parseInt(selectedLevelRadio.value, 10));
  }
}

// Launch Trigger Handler
function initFocusActions() {
  btnLaunchSite.addEventListener('click', () => triggerLaunchSession('site'));
  btnLaunchTab.addEventListener('click', () => triggerLaunchSession('tab'));
  
  // Pause drop buttons
  btnPauseToggle.addEventListener('click', () => {
    pauseOptions.classList.toggle('hidden');
  });
  
  document.addEventListener('click', (e) => {
    if (!btnPauseToggle.contains(e.target) && !pauseOptions.contains(e.target)) {
      pauseOptions.classList.add('hidden');
    }
  });

  const pauseOptBtns = document.querySelectorAll('.pause-opt-btn');
  pauseOptBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const seconds = parseInt(e.currentTarget.dataset.pause, 10);
      pauseOptions.classList.add('hidden');
      chrome.runtime.sendMessage({ action: 'pauseFocus', durationSeconds: seconds }, () => {
        if (chrome.runtime.lastError) {
          console.warn('pauseFocus message error:', chrome.runtime.lastError.message);
        }
      });
    });
  });

  // Resume button from banner
  btnResume.addEventListener('click', async () => {
    const state = await getStorage(['recoverySession']);
    if (state.recoverySession) {
      chrome.runtime.sendMessage({
        action: 'resumeFocus',
        recoveryData: state.recoverySession
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('resumeFocus message error:', chrome.runtime.lastError.message);
        }
        if (response && response.success) {
          syncActiveHomeState();
        }
      });
    }
  });

  // Unlock click (opens reflection modal)
  btnUnlock.addEventListener('click', openReflectionModal);
  
  // Reflection modal buttons
  btnCancelUnlock.addEventListener('click', closeReflectionModal);
  btnConfirmUnlock.addEventListener('click', confirmUnlockSession);
}

function triggerLaunchSession(lockMode, workspaceId = '') {
  let duration = selectedDuration;
  if (selectedDuration === 'custom') {
    const minutes = parseInt(customMinutes.value, 10);
    if (isNaN(minutes) || minutes <= 0) {
      customMinutes.focus();
      return;
    }
    duration = minutes;
  }
  
  const intent = focusIntentInput.value.trim();
  
  const selectedLevelRadio = document.querySelector('input[name="enforcementLevel"]:checked');
  const enforcementLevel = selectedLevelRadio ? parseInt(selectedLevelRadio.value, 10) : 4;
  
  const chkRemember = document.getElementById('chkRememberEnforcement');
  if (chkRemember && chkRemember.checked) {
    chrome.storage.local.set({
      rememberEnforcementChoice: true,
      lastEnforcementChoice: enforcementLevel
    });
  } else {
    chrome.storage.local.set({
      rememberEnforcementChoice: false
    });
  }

  chrome.runtime.sendMessage({
    action: 'startFocus',
    lockMode,
    duration,
    intent,
    workspaceId,
    enforcementLevel
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.warn('startFocus message error:', chrome.runtime.lastError.message);
    }
    if (response && response.success) {
      focusIntentInput.value = ''; // Reset input
      syncActiveHomeState();
    } else {
      alert(response ? response.error : 'Failed to launch focus session');
    }
  });
}

// Early Exit Intent Reflection modal logic
async function openReflectionModal(pendingSession = null) {
  let intent = '';
  let focusedMins = 0;
  let distractions = 0;
  let warningsShown = 0;
  let warningsIgnored = 0;
  let blockedAttempts = 0;
  let tempBypassesUsed = 0;
  let level = 4;
  
  if (pendingSession && pendingSession.id) {
    currentReflectionSessionId = pendingSession.id;
    intent = pendingSession.intent;
    focusedMins = Math.round(pendingSession.duration / 60000);
    distractions = pendingSession.distractions;
    level = pendingSession.enforcementLevel !== undefined ? pendingSession.enforcementLevel : 4;
    warningsShown = pendingSession.warningsShown || 0;
    warningsIgnored = pendingSession.warningsIgnored || 0;
    blockedAttempts = pendingSession.blockedAttempts || 0;
    tempBypassesUsed = pendingSession.tempBypassesUsed || 0;
  } else {
    currentReflectionSessionId = null;
    const state = await getFocusState();
    const storage = await chrome.storage.local.get(['sessionStartTime', 'analytics']);
    const dailyStats = storage.analytics || { daily: {} };
    const todayStr = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD
    const todayData = dailyStats.daily[todayStr] || { distractions: 0 };
    
    intent = state.focusIntent;
    const startTime = storage.sessionStartTime || Date.now();
    let focusedMs = state.activeTimeMs || 0;
    if (!state.pauseReason && state.focusModeActive) {
      const activeSegment = Date.now() - (state.lastActiveTimestamp || startTime || Date.now());
      focusedMs += activeSegment;
    }
    focusedMins = Math.round(focusedMs / 60000);
    distractions = todayData.distractions || 0;
    level = state.enforcementLevel !== undefined ? state.enforcementLevel : 4;
    warningsShown = state.warningsShown || 0;
    warningsIgnored = state.warningsIgnored || 0;
    blockedAttempts = state.blockedAttempts || 0;
    tempBypassesUsed = state.tempBypassesUsed || 0;
  }
  
  reflectionIntentDisplay.textContent = intent || 'Untitled Intention';
  reflectedDuration.textContent = `${focusedMins}m`;
  reflectedDistractions.textContent = distractions || 0;

  // Display new tracking metrics
  const reflectedWarningsShown = document.getElementById('reflectedWarningsShown');
  const reflectedWarningsIgnored = document.getElementById('reflectedWarningsIgnored');
  const reflectedBlockedAttempts = document.getElementById('reflectedBlockedAttempts');
  const reflectedBypasses = document.getElementById('reflectedBypasses');
  
  if (reflectedWarningsShown) reflectedWarningsShown.textContent = warningsShown;
  if (reflectedWarningsIgnored) reflectedWarningsIgnored.textContent = warningsIgnored;
  if (reflectedBlockedAttempts) reflectedBlockedAttempts.textContent = blockedAttempts;
  if (reflectedBypasses) reflectedBypasses.textContent = tempBypassesUsed;

  // Toggle rows visibility
  const reflectedWarningsShownRow = document.getElementById('reflectedWarningsShownRow');
  const reflectedWarningsIgnoredRow = document.getElementById('reflectedWarningsIgnoredRow');
  const reflectedBlockedAttemptsRow = document.getElementById('reflectedBlockedAttemptsRow');
  const reflectedBypassesRow = document.getElementById('reflectedBypassesRow');

  if (reflectedWarningsShownRow) reflectedWarningsShownRow.classList.toggle('hidden', !(level === 1 || level === 2));
  if (reflectedWarningsIgnoredRow) reflectedWarningsIgnoredRow.classList.toggle('hidden', !(level === 1 || level === 2));
  if (reflectedBlockedAttemptsRow) reflectedBlockedAttemptsRow.classList.toggle('hidden', !(level >= 3 || level === 0));
  if (reflectedBypassesRow) reflectedBypassesRow.classList.toggle('hidden', !(level === 2));
  
  // Reset fields
  reflectionNotes.value = '';
  selectedOutcome = null;
  selectedRating = null;
  
  document.querySelectorAll('.outcome-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.star-btn').forEach(btn => btn.classList.remove('active'));
  
  // Hide Cancel/Resume button if reflecting on a completed session
  btnCancelUnlock.classList.toggle('hidden', !!pendingSession);

  // Emergency unlock logic for Level 5
  const emergencyUnlockContainer = document.getElementById('emergencyUnlockContainer');
  const emergencyUnlockInput = document.getElementById('emergencyUnlockInput');
  
  if (emergencyUnlockContainer) {
    if (level === 5 && !pendingSession) {
      emergencyUnlockContainer.classList.remove('hidden');
      if (emergencyUnlockInput) {
        emergencyUnlockInput.value = '';
        btnConfirmUnlock.disabled = true;
        
        const unlockInputListener = (e) => {
          if (e.target.value.trim() === 'UNLOCK') {
            btnConfirmUnlock.disabled = false;
          } else {
            btnConfirmUnlock.disabled = true;
          }
        };
        emergencyUnlockInput.removeEventListener('input', emergencyUnlockInput._listener);
        emergencyUnlockInput.addEventListener('input', unlockInputListener);
        emergencyUnlockInput._listener = unlockInputListener;
      }
    } else {
      emergencyUnlockContainer.classList.add('hidden');
      btnConfirmUnlock.disabled = false;
    }
  }
  
  reflectionModal.classList.remove('hidden');
}

function closeReflectionModal() {
  reflectionModal.classList.add('hidden');
}

function confirmUnlockSession() {
  const notes = reflectionNotes.value.trim();
  btnConfirmUnlock.disabled = true;
  
  if (currentReflectionSessionId) {
    // Session ended via timer, submitting reflection
    chrome.runtime.sendMessage({
      action: 'submitReflection',
      sessionId: currentReflectionSessionId,
      outcome: selectedOutcome,
      productivityRating: selectedRating,
      reflection: notes
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('submitReflection message error:', chrome.runtime.lastError.message);
      }
      btnConfirmUnlock.disabled = false;
      closeReflectionModal();
      if (response && response.success) {
        switchTab('focus');
      }
    });
  } else {
    // Active session, early exit
    chrome.runtime.sendMessage({
      action: 'stopFocus',
      reflection: notes,
      outcome: selectedOutcome,
      productivityRating: selectedRating
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('stopFocus message error:', chrome.runtime.lastError.message);
      }
      btnConfirmUnlock.disabled = false;
      closeReflectionModal();
      if (response && response.success) {
        switchTab('focus');
      }
    });
  }
}

// Spaces tab render and CRUD operations
function initSpaceCRUD() {
  btnNewWorkspace.addEventListener('click', () => {
    activeWorkspaceEditId = null;
    formPanelTitle.textContent = 'New Space';
    wsNameInput.value = '';
    wsDomainsInput.value = '';
    workspaceFormPanel.classList.remove('hidden');
  });
  
  btnCancelWorkspace.addEventListener('click', () => {
    workspaceFormPanel.classList.add('hidden');
  });
  
  btnSaveWorkspace.addEventListener('click', async () => {
    const name = wsNameInput.value.trim();
    const domainsText = wsDomainsInput.value.trim();
    
    if (!name) {
      wsNameInput.focus();
      return;
    }
    
    const domains = domainsText.split('\n').map(d => d.trim()).filter(Boolean);
    
    if (activeWorkspaceEditId) {
      await editWorkspace(activeWorkspaceEditId, name, domains);
    } else {
      await addWorkspace(name, domains);
    }
    
    workspaceFormPanel.classList.add('hidden');
    renderSpacesList();
  });
}

async function renderSpacesList() {
  const workspaces = await getWorkspaces();
  workspacesList.innerHTML = '';
  
  workspaces.forEach(ws => {
    const item = document.createElement('div');
    item.className = 'workspace-item';
    
    // Header row
    const mainRow = document.createElement('div');
    mainRow.className = 'workspace-main-row';
    
    const titleGroup = document.createElement('div');
    titleGroup.className = 'workspace-title-group';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'workspace-name';
    nameSpan.textContent = ws.name;
    
    const countSpan = document.createElement('span');
    countSpan.className = 'workspace-domains-count';
    countSpan.textContent = `${ws.domains.length} domains whitelisted`;
    
    titleGroup.appendChild(nameSpan);
    titleGroup.appendChild(countSpan);
    
    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'workspace-actions-group';
    
    const btnExpand = document.createElement('button');
    btnExpand.className = 'btn-action-small';
    btnExpand.textContent = 'View';
    
    actionsGroup.appendChild(btnExpand);
    
    const btnEdit = document.createElement('button');
    btnEdit.className = 'btn-action-small';
    btnEdit.textContent = 'Edit';
    btnEdit.addEventListener('click', () => {
      activeWorkspaceEditId = ws.id;
      formPanelTitle.textContent = 'Edit Space';
      wsNameInput.value = ws.name;
      wsDomainsInput.value = ws.domains.join('\n');
      workspaceFormPanel.classList.remove('hidden');
    });
    
    const btnDelete = document.createElement('button');
    btnDelete.className = 'btn-action-small danger';
    btnDelete.textContent = 'Delete';
    btnDelete.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to delete space "${ws.name}"?`)) {
        await deleteWorkspace(ws.id);
        renderSpacesList();
      }
    });
    
    actionsGroup.appendChild(btnEdit);
    actionsGroup.appendChild(btnDelete);
    
    mainRow.appendChild(titleGroup);
    mainRow.appendChild(actionsGroup);
    item.appendChild(mainRow);
    
    // Hidden domains expand panel
    const expandPanel = document.createElement('div');
    expandPanel.className = 'workspace-expand-domains hidden';
    expandPanel.textContent = ws.domains.length > 0 ? ws.domains.join('\n') : '(No domains whitelisted)';
    item.appendChild(expandPanel);
    
    btnExpand.addEventListener('click', () => {
      const isHidden = expandPanel.classList.toggle('hidden');
      btnExpand.textContent = isHidden ? 'View' : 'Hide';
    });
    
    workspacesList.appendChild(item);
  });
}

// Analytics View render (Redesigned in V3 for Insights & Reports)
function initInsightsAndBackupListeners() {
  const btnExportBackup = document.getElementById('btnExportBackup');
  const btnImportBackup = document.getElementById('btnImportBackup');
  const backupFileInput = document.getElementById('backupFileInput');
  const btnGenMockData = document.getElementById('btnGenMockData');
  const devToolsGroup = document.getElementById('devToolsGroup');

  if (devToolsGroup) {
    devToolsGroup.style.display = SHOW_DEV_TOOLS ? 'block' : 'none';
  }

  if (btnExportBackup) {
    btnExportBackup.addEventListener('click', async () => {
      try {
        btnExportBackup.disabled = true;
        const blob = await exportBackupZip();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `focus-lock-backup-${Date.now()}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        alert(`Export failed: ${err.message}`);
      } finally {
        btnExportBackup.disabled = false;
      }
    });
  }

  if (btnImportBackup) {
    btnImportBackup.addEventListener('click', () => {
      backupFileInput.click();
    });
  }

  if (backupFileInput) {
    backupFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          await importBackupZip(event.target.result);
          alert('Backup restored successfully!');
          window.location.reload();
        } catch (err) {
          alert(`Restore failed: ${err.message}`);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  if (btnGenMockData) {
    if (!SHOW_DEV_TOOLS) {
      btnGenMockData.style.display = 'none';
    }
    btnGenMockData.addEventListener('click', () => {
      if (!SHOW_DEV_TOOLS) return;
      btnGenMockData.disabled = true;
      btnGenMockData.textContent = 'Generating...';
      chrome.runtime.sendMessage({ action: 'generateMockData' }, (res) => {
        if (chrome.runtime.lastError) {
          console.warn('generateMockData message error:', chrome.runtime.lastError.message);
        }
        if (res && res.success) {
          alert('Demo focus data generated successfully!');
          window.location.reload();
        } else {
          alert(res ? res.error : 'Failed to generate demo data');
          btnGenMockData.disabled = false;
          btnGenMockData.innerHTML = `
            <svg class="btn-icon-svg" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="3" rx="2" ry="2"/><rect width="20" height="8" x="2" y="13" rx="2" ry="2"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></svg>
            <span>Generate Sample Focus Data</span>
          `;
        }
      });
    });
  }
}

// Settings listeners and Focus Ring permissions handling
function initSettingsListeners() {
  selectFocusRingMode.addEventListener('change', async (e) => {
    const selectedMode = e.currentTarget.value;
    
    if (selectedMode === 'minimal' || selectedMode === 'full') {
      const origins = ['http://*/*', 'https://*/*'];
      chrome.permissions.contains({ origins }, async (hasPerms) => {
        if (hasPerms) {
          await setStorage({ focusRingMode: selectedMode });
          await registerDynamicContentScript();
          ringPositionRow.classList.remove('hidden');
        } else {
          chrome.permissions.request({ origins }, async (granted) => {
            if (granted) {
              await setStorage({ focusRingMode: selectedMode });
              await registerDynamicContentScript();
              ringPositionRow.classList.remove('hidden');
            } else {
              selectFocusRingMode.value = 'off';
              await setStorage({ focusRingMode: 'off' });
              ringPositionRow.classList.add('hidden');
            }
          });
        }
      });
    } else {
      await setStorage({ focusRingMode: 'off' });
      await unregisterDynamicContentScript();
      ringPositionRow.classList.add('hidden');
    }
  });
  
  selectFocusRingPosition.addEventListener('change', async (e) => {
    await setStorage({ focusRingPosition: e.currentTarget.value });
  });

  const selectDataRetention = document.getElementById('selectDataRetention');
  if (selectDataRetention) {
    selectDataRetention.addEventListener('change', async (e) => {
      const val = e.currentTarget.value;
      const parsed = val === 'forever' ? 'forever' : parseInt(val, 10);
      await setStorage({ dataRetentionPeriod: parsed });
    });
  }

  themeToggle.addEventListener('click', () => {
    const isDark = bodyElement.classList.toggle('dark');
    bodyElement.classList.toggle('light', !isDark);
    setStorage({ darkMode: isDark });
    updateThemeIcon(isDark);
  });
}

async function syncSettingsView() {
  const result = await getStorage(['focusRingMode', 'focusRingPosition', 'darkMode', 'dataRetentionPeriod']);
  
  selectFocusRingMode.value = result.focusRingMode || 'off';
  selectFocusRingPosition.value = result.focusRingPosition || 'top-right';
  
  const hasRingActive = result.focusRingMode === 'minimal' || result.focusRingMode === 'full';
  ringPositionRow.classList.toggle('hidden', !hasRingActive);

  const selectDataRetention = document.getElementById('selectDataRetention');
  if (selectDataRetention) {
    selectDataRetention.value = result.dataRetentionPeriod !== undefined ? result.dataRetentionPeriod.toString() : '365';
  }
  
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = result.darkMode !== undefined && result.darkMode !== null ? result.darkMode : systemDark;
  updateThemeIcon(isDark);
}

// Dynamic Content Script registrations (Manifest V3)
async function registerDynamicContentScript() {
  try {
    chrome.scripting.getRegisteredContentScripts({ ids: ['focus-ring-script'] }, (scripts) => {
      if (!scripts || scripts.length === 0) {
        chrome.scripting.registerContentScripts([{
          id: 'focus-ring-script',
          js: ['content.js'],
          css: ['content.css'],
          matches: ['http://*/*', 'https://*/*'],
          runAt: 'document_idle'
        }], () => {
          if (chrome.runtime.lastError) {
            console.error('Registration failed:', chrome.runtime.lastError.message);
          } else {
            console.log('Focus Ring content script registered successfully.');
          }
        });
      }
    });
  } catch(e) {
    console.error('Dynamic script registration error:', e);
  }
}

async function unregisterDynamicContentScript() {
  try {
    chrome.scripting.getRegisteredContentScripts({ ids: ['focus-ring-script'] }, (scripts) => {
      if (scripts && scripts.length > 0) {
        chrome.scripting.unregisterContentScripts({ ids: ['focus-ring-script'] }, () => {
          console.log('Focus Ring content script unregistered.');
        });
      }
    });
  } catch(e) {
    console.error('Dynamic script unregistration error:', e);
  }
}


function initYoutubeListeners() {
  const filterToggles = [
    { id: 'chkHideHomeFeed', key: 'hideHomeFeed' },
    { id: 'chkHideShorts', key: 'hideShorts' },
    { id: 'chkHideRecommendations', key: 'hideRecommendations' },
    { id: 'chkHideComments', key: 'hideComments' }
  ];

  filterToggles.forEach(toggle => {
    const el = document.getElementById(toggle.id);
    if (el) {
      el.addEventListener('change', async (e) => {
        const update = {};
        update[toggle.key] = e.target.checked;
        await setStorage(update);

        // Send runtime message to open YouTube tabs to synchronize settings live
        chrome.tabs.query({}, (tabs) => {
          if (chrome.runtime.lastError) return;
          if (tabs) {
            tabs.forEach(tab => {
              if (tab.url && tab.url.includes('youtube.com')) {
                chrome.tabs.sendMessage(tab.id, { action: 'youtubeSettingsUpdated' }, (response) => {
                  const err = chrome.runtime.lastError; // Consume and ignore if tab is not listening yet
                });
              }
            });
          }
        });
      });
    }
  });
}

async function renderYoutubeView() {
  const chkHideHomeFeed = document.getElementById('chkHideHomeFeed');
  const chkHideShorts = document.getElementById('chkHideShorts');
  const chkHideRecommendations = document.getElementById('chkHideRecommendations');
  const chkHideComments = document.getElementById('chkHideComments');

  const keys = [
    'hideHomeFeed',
    'hideShorts',
    'hideRecommendations',
    'hideComments'
  ];
  
  const settings = await getStorage(keys);
  
  if (chkHideHomeFeed) chkHideHomeFeed.checked = !!settings.hideHomeFeed;
  if (chkHideShorts) chkHideShorts.checked = !!settings.hideShorts;
  if (chkHideRecommendations) chkHideRecommendations.checked = !!settings.hideRecommendations;
  if (chkHideComments) chkHideComments.checked = !!settings.hideComments;
}

// Initialize and restore choice for Enforcement Level Selector
async function syncEnforcementLevelSelector() {
  const result = await chrome.storage.local.get(['rememberEnforcementChoice', 'lastEnforcementChoice']);
  const chkRemember = document.getElementById('chkRememberEnforcement');
  
  let targetLevel = 4; // Default to Level 4 Focus Workspace
  if (result.rememberEnforcementChoice) {
    if (chkRemember) chkRemember.checked = true;
    targetLevel = result.lastEnforcementChoice !== undefined ? result.lastEnforcementChoice : 4;
  } else {
    if (chkRemember) chkRemember.checked = false;
  }
  
  // Select the radio button
  const radio = document.querySelector(`input[name="enforcementLevel"][value="${targetLevel}"]`);
  if (radio) {
    radio.checked = true;
  }
  
  updateLaunchRecommendations(targetLevel);
}

// Update recommended highlights for launch modes
function updateLaunchRecommendations(level) {
  // Clear previous recommendations
  const allBtns = document.querySelectorAll('.launch-card-btn');
  allBtns.forEach(btn => {
    btn.classList.remove('recommended');
    const badge = btn.querySelector('.recommendation-badge');
    if (badge) badge.remove();
  });

  // Helper to add recommendation badge
  const addBadge = (btn) => {
    if (!btn) return;
    btn.classList.add('recommended');
    const badge = document.createElement('span');
    badge.className = 'recommendation-badge';
    badge.innerHTML = `
      <svg class="badge-icon-svg" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
      <span>Recommended</span>
    `;
    btn.appendChild(badge);
  };

  if (level === 3) {
    // Level 3 — Focus Site: recommend Site Lock
    addBadge(document.getElementById('btnLaunchSite'));
  } else if (level === 4) {
    // Level 4 — Focus Workspace: recommend first Space
    const container = document.getElementById('quickWorkspacesList');
    if (container) {
      const firstBtn = container.querySelector('.launch-card-btn');
      if (firstBtn) {
        addBadge(firstBtn);
      }
    }
  } else if (level === 5) {
    // Level 5 — Strict Tab Lock: recommend Tab Lock
    addBadge(document.getElementById('btnLaunchTab'));
  }
}

// Check and initialize the What's New version highlights modal
function initWhatsNew() {
  const modal = document.getElementById('whatsNewModal');
  const dismissBtn = document.getElementById('btnDismissWhatsNew');
  if (!modal || !dismissBtn) return;

  const currentVersion = chrome.runtime.getManifest().version;

  chrome.storage.local.get(['lastSeenVersion'], (result) => {
    const lastSeenVersion = result.lastSeenVersion;
    if (!lastSeenVersion) {
      // First install / initial version: save version silently without showing popup
      chrome.storage.local.set({ lastSeenVersion: currentVersion });
    } else if (lastSeenVersion !== currentVersion) {
      // It's an update from a previous version: show popup
      modal.classList.remove('hidden');
    }
  });

  dismissBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
    chrome.storage.local.set({ lastSeenVersion: currentVersion });
  });
}
