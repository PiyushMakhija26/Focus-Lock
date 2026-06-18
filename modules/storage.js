// Focus Lock - Storage Module

const DEFAULT_WORKSPACES = [
  {
    id: 'ws-coding',
    name: 'Coding Workspace',
    domains: ['chatgpt.com', 'github.com', 'stackoverflow.com', 'leetcode.com'],
    isDefault: true
  },
  {
    id: 'ws-writing',
    name: 'Writing Workspace',
    domains: ['notion.so', 'docs.google.com', 'grammarly.com'],
    isDefault: true
  },
  {
    id: 'ws-learning',
    name: 'Learning Workspace',
    domains: ['youtube.com', 'coursera.org', 'chatgpt.com'],
    isDefault: true
  }
];

const DEFAULT_STATE = {
  focusModeActive: false,
  lockMode: 'site', // 'site', 'tab', 'workspace'
  allowedDestination: '', // domain, url, or workspace name
  allowedUrl: '', // redirect target
  originalTabId: null,
  originalWindowId: null,
  lastActiveAllowedTabId: null,
  timerEndTime: 0,
  tempPauseEndTime: 0,
  focusIntent: '',
  activeWorkspaceId: '',
  tempWhitelistedDomains: [], // domains allowed via override "Open Anyway" or "Continue for 5 Minutes"
  tempWhitelistedUntil: {}, // domain -> timestamp mapping for 5 minute pass
  focusRingMode: 'off', // 'off', 'minimal', 'full'
  focusRingPosition: 'top-right', // 'top-right', 'bottom-right', 'top-left', 'bottom-left'
  workspaces: DEFAULT_WORKSPACES,
  recoverySession: null,
  analytics: {
    daily: {} // dateString -> { focusTime: ms, distractions: count }
  },
  sessionLogs: [], // Array of log objects
  lastSessionMetadata: null, // support future resume notifications
  darkMode: null, // null triggers system preference detection
  
  // Focus Lock Enforcement Levels State
  enforcementLevel: 4, // 0 to 5, default to 4 (Focus Workspace)
  rememberEnforcementChoice: false,
  lastEnforcementChoice: 4,
  warningsShown: 0,
  warningsIgnored: 0,
  blockedAttempts: 0,
  tempBypassesUsed: 0,
  
  // Focus Lock v3 & v4 State & Caching
  activityTrackingState: null,
  dismissedRecommendations: [],
  focusSessionDistractions: 0,
  focusSessionDomainSequence: [],
  activeWorkflowId: '',
  dataRetentionPeriod: 365,
  insightCache: null,
  recommendationCache: null,
  weeklyReportCache: null,
  workflowCache: null,
  attentionScorecard: null,
  dbSchemaVersion: 2,
  
  // YouTube Focus Filters V4.5.1 State
  youtubePreset: 'custom', // 'study' | 'learning' | 'minimal' | 'search_only' | 'custom' | 'off'
  hideHomeFeed: false,
  hideShorts: false,
  hideRecommendations: false,
  hideEndScreens: false,
  hideComments: false,
  hideTrending: false,
  hideNotifications: false,
  hideCounts: false,
  youtubeHomepageBehavior: 'placeholder', // 'placeholder' | 'subscriptions' | 'search'
  youtubeTrustedChannels: [],
  youtubePreferTrustedChannels: false,
  youtubeWorkspacePresets: {
    'ws-learning': 'learning',
    'ws-coding': 'study'
  },
  preSessionYoutubeState: null
};

// Get single or multiple keys from chrome storage
export async function getStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result);
    });
  });
}

// Set storage values
export async function setStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}

// Initialize storage defaults if not already present
export async function initializeStorage() {
  const data = await getStorage(null);
  const updates = {};
  let changed = false;

  for (const key in DEFAULT_STATE) {
    if (data[key] === undefined) {
      updates[key] = DEFAULT_STATE[key];
      changed = true;
    }
  }

  if (changed) {
    await setStorage(updates);
  }
}

// Get focus state values helper
export async function getFocusState() {
  const keys = [
    'focusModeActive',
    'lockMode',
    'allowedDestination',
    'allowedUrl',
    'originalTabId',
    'originalWindowId',
    'lastActiveAllowedTabId',
    'timerEndTime',
    'tempPauseEndTime',
    'focusIntent',
    'activeWorkspaceId',
    'tempWhitelistedDomains',
    'tempWhitelistedUntil',
    'focusRingMode',
    'focusRingPosition',
    'recoverySession',
    'enforcementLevel',
    'warningsShown',
    'warningsIgnored',
    'blockedAttempts',
    'tempBypassesUsed',
    'sessionStartTime',
    'activeTimeMs',
    'idleTimeMs',
    'lockedTimeMs',
    'pauseReason',
    'pauseStartTime',
    'lastActiveTimestamp',
    'systemIdle',
    'autoResumeOnUnlock'
  ];
  return getStorage(keys);
}

// Clear focus state (reset to inactive)
export async function clearFocusState() {
  await setStorage({
    focusModeActive: false,
    lockMode: 'site',
    allowedDestination: '',
    allowedUrl: '',
    originalTabId: null,
    originalWindowId: null,
    lastActiveAllowedTabId: null,
    timerEndTime: 0,
    tempPauseEndTime: 0,
    focusIntent: '',
    activeWorkspaceId: '',
    tempWhitelistedDomains: [],
    tempWhitelistedUntil: {},
    enforcementLevel: 4,
    warningsShown: 0,
    warningsIgnored: 0,
    blockedAttempts: 0,
    tempBypassesUsed: 0,
    sessionStartTime: 0,
    activeTimeMs: 0,
    idleTimeMs: 0,
    lockedTimeMs: 0,
    pauseReason: null,
    pauseStartTime: null,
    lastActiveTimestamp: null,
    systemIdle: false
  });
}
