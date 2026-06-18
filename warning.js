// Focus Lock - Warning Page Script

document.addEventListener('DOMContentLoaded', () => {
  // 1. Parse URL Parameters
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url') || '';
  const workspaceName = params.get('workspace') || 'Workspace';
  const level = params.get('level') || '2'; // Default to 2 (Soft Lock)

  // 2. Populate UI
  const workspaceNameEl = document.getElementById('workspaceName');
  const targetUrlEl = document.getElementById('targetUrl');
  const subtitleEl = document.querySelector('.card-subtitle');
  const reasonSectionEl = document.getElementById('reasonSection');
  const softLockActionsEl = document.getElementById('softLockActions');
  const btnContinueOnceEl = document.getElementById('btnContinueOnce');
  const btnReturnTextEl = document.getElementById('btnReturnText');
  
  workspaceNameEl.textContent = workspaceName;
  
  let targetHostname = '';
  try {
    const urlObj = new URL(targetUrl);
    targetHostname = urlObj.hostname.toLowerCase();
    targetUrlEl.textContent = targetHostname;
    targetUrlEl.title = targetUrl;
  } catch (e) {
    targetHostname = targetUrl;
    targetUrlEl.textContent = targetUrl;
  }

  // 3. Setup Layout based on Enforcement Level
  if (level === '1') {
    // Level 1 — Advisory Mode
    subtitleEl.textContent = 'You are leaving your active workspace.';
    if (reasonSectionEl) reasonSectionEl.style.display = 'none';
    if (softLockActionsEl) softLockActionsEl.style.display = 'none';
    if (btnContinueOnceEl) btnContinueOnceEl.classList.remove('hidden');
    if (btnReturnTextEl) btnReturnTextEl.textContent = 'Return';
  } else {
    // Level 2 — Soft Lock Mode
    subtitleEl.textContent = 'This website is not part of your active workspace.';
    if (reasonSectionEl) reasonSectionEl.style.display = 'block';
    if (softLockActionsEl) softLockActionsEl.style.display = 'grid';
    if (btnContinueOnceEl) btnContinueOnceEl.classList.add('hidden');
    if (btnReturnTextEl) btnReturnTextEl.textContent = 'Return to Workspace';
  }

  // 4. Reason Selector & Actions Activation (Soft Lock only)
  const radioButtons = document.querySelectorAll('input[name="reason"]');
  const btnContinue5 = document.getElementById('btnContinue5');
  const btnOpenAnyway = document.getElementById('btnOpenAnyway');
  const btnPause2 = document.getElementById('btnPause2');
  const btnReturn = document.getElementById('btnReturn');

  radioButtons.forEach(radio => {
    radio.addEventListener('change', () => {
      // Enable buttons when any reason is selected
      if (btnContinue5) btnContinue5.disabled = false;
      if (btnOpenAnyway) btnOpenAnyway.disabled = false;
      if (btnPause2) btnPause2.disabled = false;
    });
  });

  // 5. Button Handlers
  
  // Return back to the workspace
  btnReturn.addEventListener('click', () => {
    chrome.storage.local.get(['lastActiveAllowedTabId', 'allowedUrl'], (result) => {
      if (result.lastActiveAllowedTabId) {
        // Switch back to the last active allowed tab
        chrome.tabs.update(result.lastActiveAllowedTabId, { active: true }, () => {
          if (chrome.runtime.lastError) {
            // If the tab was closed, fallback to redirecting current tab
            window.location.href = result.allowedUrl || 'https://google.com';
          } else {
            // Close this warning tab
            chrome.tabs.getCurrent((tab) => {
              chrome.tabs.remove(tab.id);
            });
          }
        });
      } else {
        // Redirect current tab to the allowedUrl
        window.location.href = result.allowedUrl || 'https://google.com';
      }
    });
  });

  // Continue Once (Advisory Level 1 Only)
  if (btnContinueOnceEl) {
    btnContinueOnceEl.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'continueAdvisoryOnce',
        domain: targetHostname
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('warning.js message error:', chrome.runtime.lastError.message);
        }
        if (response && response.success) {
          // Redirect current tab to original destination
          window.location.href = targetUrl;
        }
      });
    });
  }

  // Continue for 5 Minutes (Soft Lock Level 2)
  if (btnContinue5) {
    btnContinue5.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'whitelistDomainTimed',
        domain: targetHostname
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('warning.js message error:', chrome.runtime.lastError.message);
        }
        if (response && response.success) {
          window.location.href = targetUrl;
        }
      });
    });
  }

  // Open Anyway (Soft Lock Level 2, session-long whitelist)
  if (btnOpenAnyway) {
    btnOpenAnyway.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'whitelistDomainTemp',
        domain: targetHostname
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('warning.js message error:', chrome.runtime.lastError.message);
        }
        if (response && response.success) {
          window.location.href = targetUrl;
        }
      });
    });
  }

  // Pause focus mode for 5 minutes (300 seconds) for increased respite
  if (btnPause2) {
    btnPause2.addEventListener('click', () => {
      chrome.runtime.sendMessage({
        action: 'pauseFocus',
        durationSeconds: 300
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn('warning.js message error:', chrome.runtime.lastError.message);
        }
        if (response && response.success) {
          window.location.href = targetUrl;
        }
      });
    });
  }
});
