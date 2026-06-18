// Focus Lock - Focus Ring Content Script

let ringElement = null;
let ringInterval = null;

// Initialize on page load
initFocusRing();

// Listen to storage changes to dynamically add/remove/update the ring
chrome.storage.onChanged.addListener((changes) => {
  if (
    changes.focusModeActive ||
    changes.focusRingMode ||
    changes.focusRingPosition ||
    changes.timerEndTime ||
    changes.focusIntent ||
    changes.tempPauseEndTime
  ) {
    initFocusRing();
  }
});

async function initFocusRing() {
  // Clear any existing overlays & timers
  removeFocusRing();

  chrome.storage.local.get([
    'focusModeActive',
    'focusRingMode',
    'focusRingPosition',
    'timerEndTime',
    'focusIntent',
    'tempPauseEndTime'
  ], (state) => {
    if (!state.focusModeActive) return;
    if (state.focusRingMode === 'off' || !state.focusRingMode) return;

    // Check if currently in a temporary pause
    const now = Date.now();
    if (state.tempPauseEndTime && now < state.tempPauseEndTime) return;

    createFocusRing(state);
  });
}

function createFocusRing(state) {
  ringElement = document.createElement('div');
  ringElement.id = 'focus-lock-ring';
  ringElement.className = `focus-ring-pill ${state.focusRingPosition || 'top-right'}`;

  // Restore minimized state from session storage so it doesn't expand on every page navigation
  const isMinimized = sessionStorage.getItem('focusRingMinimized') === 'true';
  if (isMinimized) {
    ringElement.classList.add('minimized');
  }

  // Create inner container
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'focus-ring-content';
  
  // Icon
  const icon = document.createElement('span');
  icon.className = 'focus-ring-icon';
  icon.textContent = '🌿';
  
  // Main Text Label
  const textLabel = document.createElement('span');
  textLabel.className = 'focus-ring-text';

  // Append elements
  contentWrapper.appendChild(icon);
  contentWrapper.appendChild(textLabel);
  ringElement.appendChild(contentWrapper);
  document.body.appendChild(ringElement);

  // Click to toggle minimize / maximize
  ringElement.addEventListener('click', (e) => {
    // Prevent toggling if clicked on specific inner action buttons if added later
    const currentlyMin = ringElement.classList.toggle('minimized');
    sessionStorage.setItem('focusRingMinimized', currentlyMin ? 'true' : 'false');
    updateRingText(state.focusRingMode, state.focusIntent, state.timerEndTime, textLabel);
  });

  // Start countdown updater
  const updateTick = () => {
    updateRingText(state.focusRingMode, state.focusIntent, state.timerEndTime, textLabel);
  };
  
  updateTick();
  ringInterval = setInterval(updateTick, 1000);
}

function updateRingText(mode, intent, timerEndTime, textLabelEl) {
  if (!ringElement || ringElement.classList.contains('minimized')) {
    textLabelEl.textContent = '';
    return;
  }

  if (mode === 'minimal') {
    textLabelEl.textContent = 'Focus Active';
    return;
  }

  // Full Mode:
  const now = Date.now();
  const intentStr = intent ? `Focus: ${intent}` : 'Focusing';

  if (timerEndTime === 0) {
    textLabelEl.textContent = `${intentStr} • Indefinite`;
  } else {
    const remainingMs = timerEndTime - now;
    if (remainingMs <= 0) {
      textLabelEl.textContent = `${intentStr} • Ending`;
      return;
    }

    const totalSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    
    textLabelEl.textContent = `${intentStr} • ${timeStr}`;
  }
}

function removeFocusRing() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (ringElement) {
    ringElement.remove();
    ringElement = null;
  }
}
