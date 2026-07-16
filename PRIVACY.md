# Focus Lock — Privacy Policy

Focus Lock is designed from the ground up with a **privacy-first, local-first philosophy**. We believe your attention patterns and browsing data should remain entirely yours. 

Below is a plain-English, jargon-free explanation of how Focus Lock handles your data.

---

## 1. What Data Focus Lock Collects & Stores
Focus Lock stores only the minimum data required to run your focus sessions and generate insights:
* **Preferences & Settings**: Your active theme (light/dark), data retention period, auto-resume settings, and YouTube Focus Filters.
* **Workspaces**: Customized whitelist domains and configurations you define.
* **Focus Sessions**: Timestamps, custom durations, reflection notes, and outcomes (e.g. "Succeeded", "Bypassed").
* **Attention Insights**: Domain names visited during focus sessions and transition tallies (e.g., navigating from `github.com` to `chatgpt.com`).

---

## 2. Where Your Data is Stored
* **100% Local**: All stored data is saved directly on your local device.
* **Storage Engines**: We use `chrome.storage.local` for settings and preferences, and browser-secured `IndexedDB` for focus session logs and transition graphs.
* **No Cloud / No Servers**: We do not run any cloud servers, databases, or analytics engines. Your data never leaves your device.

---

## 3. Data Deletion & Portability
* **Reset Data**: You can clear all logs, analytics, and settings instantly via the "Reset" button inside the Focus Lock Settings panel.
* **Uninstall**: Uninstalling the extension completely deletes all local storage and IndexedDB data associated with Focus Lock.
* **Data Portability**: You can export a zip file backup of your settings and history at any time. This backup remains local unless you choose to restore it elsewhere.

---

## 4. Why We Request Specific Permissions
To enforce voluntary limits and track focus accurately, Focus Lock requires specific Chrome APIs:
* **`storage`**: Needed to save your local configurations, whitelists, and daily statistics.
* **`tabs`**: Used to identify the active tab's URL to check if it matches your workspace rules.
* **`webNavigation`**: Used to intercept blocked pages before they load, redirecting you to your intentional reflection page.
* **`alarms`**: Powers your focus timer and measures whitelisted bypass durations.
* **`notifications`**: Displays a system alert when a focus session completes.
* **`scripting`**: Injects a calming green focus ring overlay on allowed tabs to remind you of your target task.
* **`idle`**: Detects if your computer screen is locked so focus tracking pauses automatically.

---

## 5. Third-Party Services & Telemetry
* **0 Trackers**: Focus Lock contains no analytical trackers, Google Analytics, or external logging tools.
* **0 Network Requests**: Focus Lock makes zero outbound network requests to any server. All calculations (directed graphs, scorecards, narrative summaries) are computed locally.
