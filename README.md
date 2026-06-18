# Focus Lock — Local Attention Intelligence & Voluntary Enforcement Platform

Focus Lock is a **local-first, privacy-first attention intelligence platform** and voluntary browser-enforcement tool. All data collection, subsequence mining, recommendation generation, scorecards, directed graphs, and backup compilation occur entirely on your local machine.

No accounts. No telemetry. No servers. No cloud infrastructure. All data remains 100% on-device.

---

## Core Features

### 1. Focus Session & Smart Enforcement
* **Lock-Only Auto-Pause**: Active focus sessions, alarms, and domain tracking automatically pause *only* when the system screen locks (`locked` state), preventing time inflation.
* **Passive Idle Exemption**: Configures idle detection to a `60` second interval. Keeps tracking active in system `idle` state (flagged `systemIdle: true`) to avoid false pause triggers during reading, watching lectures, or analytical tasks.
* **Auto-Resume Preferences**: Choose whether tracking should automatically resume upon unlocking, or display a glassmorphic system-pause overlay showing total away time.
* **Six Enforcement Levels**:
  * **Level 0 (Focus Session)**: Passive tracking without blocks or warnings.
  * **Level 1 (Advisory)**: Gentle warnings when leaving workspace. Immediate bypass.
  * **Level 2 (Soft Lock)**: Intention check page requiring a mindful reason selection to return, temporary bypass (5/15/30m), or pause.
  * **Level 3 (Focus Site)**: Intention check page. Restricts navigation to workspace/allowed domain with temporary bypasses. Permanent "Open Anyway" is hidden.
  * **Level 4 (Focus Workspace)**: Intention check page. "Open Anyway" and pauses are hidden.
  * **Level 5 (Strict Tab Lock)**: Enforces single-tab usage. Snaps focus back and closes unauthorized tabs immediately.
* **Intention Check Flow (`intention.html`)**: Calming, conscious-choice landing page for Levels 1–4, prompting users for their current focus intention and log reasons.
* **Emergency Unlock**: Strict Tab Lock sessions require typing `"UNLOCK"` into a confirmation field in the reflection modal before unlocking.

### 2. Attention Analytics & SVG Visualizations
* **Accurate Focus Duration**: Computes session statistics and daily reports based on true accumulated active duration (`activeTimeMs`) instead of simple clock differences (`endTime - startTime`), excluding idle and locked segments.
* **Personal Attention Graph**: A circular directed node-link SVG graph displaying transition vectors (stroke thickness indicating count) between Workspace and Domain nodes with marker arrowheads.
* **Qualitative Attention Scorecards**: Transparent weekly ratings (Focus Quality, Context Switching, Deep Work, Workflow Stability) with clickable, inspectable mathematical calculation rules.
* **Narrative-First Reports**: Top-level deterministic story card outlining key trends, successfully completed workflows, and emerging distraction patterns.

### 3. Workflow & Sequence Automation
* **Domain Sequence Mining**: Runs Apriori-based subsequence mining across historical focus sessions to identify recurring sequences (e.g., `chatgpt.com → leetcode.com → github.com`).
* **Workflow Library**: Full CRUD (Create, Read, Update, Delete) management interface for saved domain sequences and workflows.
* **Workflow Lock Execution**: Start a session restricted to workflow sequences with workspace locking.

### 4. Content Moderation & YouTube Filters
* **YouTube Focus Filters**: Custom presets (*Search-Only Mode*, *Study Mode*, *Learning Mode*, *Minimal Mode*, *Custom*, and *Off*).
* **Trusted Channel Whitelisting**: Restricts YouTube watch pages to whitelisted educational channels (handles `@` names and subpages) and hides recommendations from other creators.
* **Shorts Removal**: Hides Shorts shelf, sidebar links, explore page categories, watch recommendation cards, and search results.
* **Workspace Preset Mappings**: Maps focus workspaces to automated presets on session start, and restores original configuration on session stop.

### 5. Data Security, Backup & Portability
* **Database Cleanup Migration**: Run on start/install, this migration scrubs invalid hostnames from IndexedDB logs and stores lightweight checkpoints (`preMigrationCounts` and `postMigrationCounts`) in local storage to track migration integrity.
* **Strict Domain Validation**: Uses standard URL hostname parsing to block local/internal hostnames (`localhost`, `chrome://`, `about:blank`, devtools, etc.) and non-TLD entries from polluting logs.
* **ZIP Backup & Restoration**: Export settings, workspaces, IndexedDB focus sessions, and activity logs into an uncompressed `.zip` file using raw binary byte building, and import them seamlessly.

---

## Directory Structure

```
Extension project/
├── manifest.json            # MV3 configuration, static content scripts & styles
├── background.js           # Event orchestrator, messages, active tracking state machine
├── warning.html            # Soft warning page (Deprecated in favor of intention.html)
├── warning.css             # Warning page layout styling
├── warning.js              # Reason logs & timed whitelists
├── intention.html          # Calming conscious choice landing page for distraction checks
├── intention.css           # Layout and grid details for the Intention page
├── intention.js            # Reflection logs, timed whitelists, pauses, and DB log messaging
├── content.js              # In-page Focus Ring overlay script
├── content.css             # Glassmorphic overlay styles
├── youtube-content.css     # Targeted CSS filters for YouTube distraction elements
├── popup.html              # Interface with Workflow Library, Scorecards, Backup drops & YouTube filters
├── popup.css               # Popup styling variables, grid layout & YouTube tab styles
├── popup.js                # UI manager, workflow CRUD, outcome modal & YouTube hooks
├── report.html             # Full-screen report page dashboard template
├── report.js               # Report data loading & directed graph SVG rendering
├── siteFilters/            # Site-specific content scripts and placeholders
│   ├── youtube.js          # YouTube MutationObserver filter interceptor (non-module content script)
│   ├── linkedin.js         # LinkedIn placeholder
│   ├── reddit.js           # Reddit placeholder
│   └── twitter.js          # Twitter placeholder
├── modules/                # Core ES Modules
    ├── storage.js          # Default state cache, V4/V4.5 variables & schema version
    ├── enforcement.js      # URL matches, snaps, workflow validations, and domain filters
    ├── workspaces.js       # Workspace whitelist CRUD & temp whitelisting
    ├── analytics.js        # Distraction prevented metrics & daily statistics
    ├── timers.js           # Alarm managers, badges, focus session lifecycles, and idle/lock routers
    ├── youtubeFilters.js   # Preset resolution, session backups, and workspace triggers
    └── intelligence.js     # IndexedDB migrations, subsequence mining & scorecards
```

---

## Installation Instructions

1. Open **Google Chrome** browser.
2. Navigate to **`chrome://extensions/`** in the URL bar.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click on **Load unpacked** in the top-left corner.
5. Select the project directory: `c:\Users\piyu4\OneDrive\Desktop\Extension project`.
6. Pin **Focus Lock** to your Chrome toolbar.

---

## Developer Architecture & Implementation Highlights

### 1. Active Focus Time State Machine & System Event Routing
To prevent timing inflation, the background scripts monitor `chrome.idle.onStateChanged`.
- System locks clear active alarms and pause tracking:
```javascript
// Inside timers.js -> handleSystemStateChange(newState)
if (newState === 'locked') {
  const activeSegment = now - state.lastActiveTimestamp;
  await setStorage({
    activeTimeMs: (state.activeTimeMs || 0) + activeSegment,
    pauseReason: 'locked',
    pauseStartTime: now
  });
  await chrome.alarms.clearAll();
}
```
- On unlock, if `autoResumeOnUnlock` is true, the timer resumes and shifts the end-time boundary by the duration of the lock:
```javascript
// Inside timers.js -> resumeSystemPausedSession()
const lockedDuration = now - state.pauseStartTime;
const newEndTime = state.timerEndTime > 0 ? state.timerEndTime + lockedDuration : 0;
await setStorage({
  timerEndTime: newEndTime,
  pauseReason: null,
  lastActiveTimestamp: now
});
```

### 2. Lightweight Database Migration Checkpoint Pattern
Due to `chrome.storage.local` memory budgets, backing up entire databases during schema cleanup is unsafe. Focus Lock implements a lightweight checkpoint log tracking record counts before and after cleanup:
```javascript
// Inside intelligence.js -> runDataCleanupMigration()
const counts = {
  activityLogs: await tx.objectStore('activityLogs').count(),
  transitions: await tx.objectStore('transitions').count(),
  focusSessions: await tx.objectStore('focusSessions').count()
};
await chrome.storage.local.set({
  migrationStarted: true,
  preMigrationCounts: counts
});
// ... perform selective deletes ...
await chrome.storage.local.set({
  migrationCompleted: true,
  postMigrationCounts: postCounts,
  dataCleanupMigrationComplete: true
});
```

### 3. Strict Domain Validation Layer
Filters out internal files, developer tools, loopbacks, and untrackable entries using standard URL construction:
```javascript
// Inside enforcement.js -> isTrackableDomain(hostname)
if (domain.startsWith('about:') || domain.startsWith('chrome://')) return false;
const rejectedHostnames = ['localhost', '127.0.0.1', 'devtools', 'newtab', 'unknown'];
if (rejectedHostnames.some(kw => domain.includes(kw))) return false;

const tldRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
return tldRegex.test(domain);
```

### 4. Relative Subsequence Matching (Apriori Mining)
To see if a user's sequence matches a workflow, the app checks if the workflow list exists as a subsequence (order-preserving but non-consecutive) within the session history:
```javascript
function isSubsequence(sub, main) {
  let i = 0, j = 0;
  while (i < sub.length && j < main.length) {
    if (sub[i] === main[j]) i++;
    j++;
  }
  return i === sub.length;
}
```

### 5. Dynamic SVG Directed Graph Render Coordinates
Directed graph edges must start and end at node boundaries rather than node centers. The app computes trigonometric offset points to draw arrows cleanly:
```javascript
const dx = p2.x - p1.x;
const dy = p2.y - p1.y;
const dist = Math.sqrt(dx * dx + dy * dy);
const ux = dx / dist;
const uy = dy / dist;

const x1 = p1.x + p1.radius * ux;
const y1 = p1.y + p1.radius * uy;
const x2 = p2.x - p2.radius * ux;
const y2 = p2.y - p2.radius * uy;
```

### 6. Safe Message Response Channel Pattern
Background listeners catch async exceptions to avoid port closures before a response is received, keeping channels stable:
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startFocus') {
    startFocusSession(sender.tab, request.lockMode, request.duration, request.intent)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open
  }
});
```
