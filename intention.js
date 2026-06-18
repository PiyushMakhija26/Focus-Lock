document.addEventListener('DOMContentLoaded', () => {
  // 1. Parse URL Parameters
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url') || '';
  const workspaceNameParam = params.get('workspace') || 'Workspace';
  const level = parseInt(params.get('level') || '2', 10);

  let targetHostname = '';
  try {
    const urlObj = new URL(targetUrl);
    targetHostname = urlObj.hostname.toLowerCase();
    if (targetHostname.startsWith('www.')) {
      targetHostname = targetHostname.slice(4);
    }
  } catch (e) {
    targetHostname = targetUrl.toLowerCase();
  }

  // 2. Fetch DOM elements
  const intentionHeader = document.getElementById('intentionHeader');
  const workspaceNameEl = document.getElementById('workspaceName');
  const focusIntentEl = document.getElementById('focusIntent');
  const destinationDomainEl = document.getElementById('destinationDomain');
  
  const reflectionSection = document.getElementById('reflectionSection');
  const selectReason = document.getElementById('selectReason');
  const notesInput = document.getElementById('notesInput');
  
  const btnReturn = document.getElementById('btnReturn');
  const btnOpenAnyway = document.getElementById('btnOpenAnyway');
  
  const tempAccessGroup = document.getElementById('tempAccessGroup');
  const pauseFocusGroup = document.getElementById('pauseFocusGroup');
  
  const tempButtons = document.querySelectorAll('.btn-temp');
  const pauseButtons = document.querySelectorAll('.btn-pause');

  // Populate basic text info
  destinationDomainEl.textContent = targetHostname;
  workspaceNameEl.textContent = workspaceNameParam;

  // 3. Load active focus session details from storage
  let activeWorkspaceId = '';
  let focusIntent = 'Focus Session';
  let allowedUrl = 'https://google.com';
  let lastActiveAllowedTabId = null;

  chrome.storage.local.get(['focusIntent', 'activeWorkspaceId', 'allowedUrl', 'lastActiveAllowedTabId'], (state) => {
    if (state.focusIntent) {
      focusIntent = state.focusIntent;
      focusIntentEl.textContent = focusIntent;
    }
    if (state.activeWorkspaceId) {
      activeWorkspaceId = state.activeWorkspaceId;
    }
    if (state.allowedUrl) {
      allowedUrl = state.allowedUrl;
    }
    if (state.lastActiveAllowedTabId) {
      lastActiveAllowedTabId = state.lastActiveAllowedTabId;
    }
  });

  // Helper to retrieve selected details
  const getSelectedReason = () => {
    if (level === 1) return 'Advisory';
    return selectReason.value || 'Other';
  };
  
  const getNotesText = () => {
    return notesInput.value.trim();
  };

  // Helper to send intention logs
  const logIntentionCheck = (actionTaken, callback) => {
    chrome.runtime.sendMessage({
      action: 'logIntention',
      log: {
        destinationDomain: targetHostname,
        workspaceId: activeWorkspaceId,
        focusIntent: focusIntent,
        timestamp: Date.now(),
        actionTaken: actionTaken,
        selectedReason: getSelectedReason(),
        notes: getNotesText()
      }
    }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('logIntention message error:', chrome.runtime.lastError.message);
      }
      if (callback) callback();
    });
  };

  // 4. Configure Layout based on Level
  const toggleBypassButtons = (enabled) => {
    btnOpenAnyway.disabled = !enabled;
    tempButtons.forEach(btn => btn.disabled = !enabled);
    pauseButtons.forEach(btn => btn.disabled = !enabled);
  };

  if (level === 1) {
    // Level 1 — Advisory
    intentionHeader.textContent = 'You are leaving your active workspace.';
    reflectionSection.classList.add('hidden');
    tempAccessGroup.classList.add('hidden');
    pauseFocusGroup.classList.add('hidden');
    toggleBypassButtons(true); // Always enabled
  } else if (level === 2) {
    // Level 2 — Soft Lock
    intentionHeader.textContent = 'This website is not part of your active workspace.';
    toggleBypassButtons(false); // Disabled until reason is chosen
  } else if (level === 3) {
    // Level 3 — Focus Site
    intentionHeader.textContent = 'This website is outside your focus site.';
    btnOpenAnyway.classList.add('hidden'); // Disable permanent bypass
    toggleBypassButtons(false);
  } else if (level === 4) {
    // Level 4 — Focus Workspace
    intentionHeader.textContent = 'This website is outside your active workspace.';
    btnOpenAnyway.classList.add('hidden');
    pauseFocusGroup.classList.add('hidden');
    toggleBypassButtons(false);
  }

  // Reason select handler
  selectReason.addEventListener('change', () => {
    if (selectReason.value) {
      toggleBypassButtons(true);
    }
  });

  // 5. Button Click Handlers

  // Return to Workspace
  btnReturn.addEventListener('click', () => {
    logIntentionCheck('returned', () => {
      chrome.tabs.getCurrent((currentTab) => {
        if (lastActiveAllowedTabId && currentTab && lastActiveAllowedTabId !== currentTab.id) {
          chrome.tabs.update(lastActiveAllowedTabId, { active: true }, () => {
            if (chrome.runtime.lastError) {
              window.location.href = allowedUrl;
            } else {
              chrome.tabs.remove(currentTab.id);
            }
          });
        } else {
          window.location.href = allowedUrl;
        }
      });
    });
  });

  // Open Anyway (Level 1, 2)
  btnOpenAnyway.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'whitelistDomainTemp',
      domain: targetHostname
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn('whitelistDomainTemp message error:', chrome.runtime.lastError.message);
      }
      logIntentionCheck('opened_anyway', () => {
        window.location.href = targetUrl || allowedUrl;
      });
    });
  });

  // Temporary Access (5/15/30m)
  tempButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const minutes = parseInt(e.currentTarget.dataset.time, 10);
      chrome.runtime.sendMessage({
        action: 'whitelistDomainTimed',
        domain: targetHostname,
        durationMinutes: minutes
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('whitelistDomainTimed message error:', chrome.runtime.lastError.message);
        }
        logIntentionCheck('temporary_access', () => {
          window.location.href = targetUrl || allowedUrl;
        });
      });
    });
  });

  // Pause Focus (5/15/30m)
  pauseButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const seconds = parseInt(e.currentTarget.dataset.time, 10);
      chrome.runtime.sendMessage({
        action: 'pauseFocus',
        durationSeconds: seconds
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('pauseFocus message error:', chrome.runtime.lastError.message);
        }
        logIntentionCheck('pause_focus', () => {
          window.location.href = targetUrl || allowedUrl;
        });
      });
    });
  });
});
