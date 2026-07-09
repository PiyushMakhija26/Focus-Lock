// Focus Lock - Local Intelligence & Analytics Engine (ES Module)
import { getStorage, setStorage } from './storage.js';
import { isTrackableDomain } from './enforcement.js';

const DB_NAME = 'FocusLockIntelligence';
const DB_VERSION = 3; // Upgraded to support Workflows, Deep Work, Rating, and Intention schemas

// Category mappings for domains
const DOMAIN_CATEGORIES = {
  'github.com': 'Development',
  'stackoverflow.com': 'Development',
  'leetcode.com': 'Development',
  'gitlab.com': 'Development',
  'npmjs.com': 'Development',
  'codepen.io': 'Development',
  'coursera.org': 'Learning',
  'udemy.com': 'Learning',
  'edx.org': 'Learning',
  'khanacademy.org': 'Learning',
  'notion.so': 'Writing',
  'docs.google.com': 'Writing',
  'grammarly.com': 'Writing',
  'medium.com': 'Writing',
  'substack.com': 'Writing',
  'gmail.com': 'Communication',
  'outlook.live.com': 'Communication',
  'outlook.com': 'Communication',
  'slack.com': 'Communication',
  'discord.com': 'Communication',
  'teams.microsoft.com': 'Communication',
  'chatgpt.com': 'Research',
  'perplexity.ai': 'Research',
  'claude.ai': 'Research',
  'wikipedia.org': 'Research',
  'google.com': 'Research',
  'netflix.com': 'Entertainment',
  'twitch.tv': 'Entertainment',
  'youtube.com': 'Entertainment', // Default Entertainment
  'reddit.com': 'Entertainment',
  'amazon.com': 'Shopping',
  'ebay.com': 'Shopping',
  'flipkart.com': 'Shopping',
  'paypal.com': 'Finance',
  'coinbase.com': 'Finance',
  'binance.com': 'Finance'
};

// Open connection to IndexedDB
export function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (e) => reject(e.target.error);
    request.onsuccess = (e) => resolve(e.target.result);

    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      
      // 1. Activity Logs
      if (!db.objectStoreNames.contains('activityLogs')) {
        db.createObjectStore('activityLogs', { keyPath: 'id', autoIncrement: true });
      }
      
      // 2. Transitions
      if (!db.objectStoreNames.contains('transitions')) {
        db.createObjectStore('transitions', { keyPath: 'id' });
      }

      // 3. Focus Sessions
      if (!db.objectStoreNames.contains('focusSessions')) {
        db.createObjectStore('focusSessions', { keyPath: 'id' });
      }

      // 4. Recommendation History
      if (!db.objectStoreNames.contains('recommendationHistory')) {
        db.createObjectStore('recommendationHistory', { keyPath: 'id' });
      }

      // 5. Saved Workflows (V4)
      if (!db.objectStoreNames.contains('savedWorkflows')) {
        db.createObjectStore('savedWorkflows', { keyPath: 'workflowId' });
      }

      // 6. Deep Work Stats (V4)
      if (!db.objectStoreNames.contains('deepWorkStats')) {
        db.createObjectStore('deepWorkStats', { keyPath: 'id' });
      }

      // 7. Workflow History (V4)
      if (!db.objectStoreNames.contains('workflowHistory')) {
        db.createObjectStore('workflowHistory', { keyPath: 'id' });
      }

      // 8. Intention Logs (V3)
      if (!db.objectStoreNames.contains('intentionLogs')) {
        db.createObjectStore('intentionLogs', { keyPath: 'id' });
      }
    };
  });
}

// Helper: Run transactional database write operations
export async function writeDB(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = item.id !== undefined || item.workflowId !== undefined ? store.put(item) : store.add(item);
    
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// Helper: Run transactional database read operations (all items)
export async function readAllDB(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// Helper: Run transactional database delete operations
export async function deleteDB(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// Log a browsing activity segment
export async function logActivityRecord(record) {
  if (!record || !record.domain || !isTrackableDomain(record.domain)) return;
  await writeDB('activityLogs', record);
}

// Log a transition between domains
export async function logTransitionRecord(fromDomain, toDomain) {
  if (!fromDomain || !toDomain || fromDomain === toDomain) return;
  if (!isTrackableDomain(fromDomain) || !isTrackableDomain(toDomain)) return;
  const id = `${fromDomain}_${toDomain}`;
  const db = await openDB();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['transitions'], 'readwrite');
    const store = transaction.objectStore('transitions');
    const getRequest = store.get(id);
    
    getRequest.onsuccess = () => {
      const record = getRequest.result || { id, fromDomain, toDomain, count: 0 };
      record.count += 1;
      store.put(record);
    };
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// Save complete Focus Session log
export async function logFocusSessionRecord(session) {
  if (session && session.domains) {
    session.domains = session.domains.filter(d => isTrackableDomain(d));
  }
  await writeDB('focusSessions', session);
}

// Save Intention Check log for distraction attempts
export async function writeIntentionLog(log) {
  const logWithId = {
    ...log,
    id: `il-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: log.timestamp || Date.now()
  };
  await writeDB('intentionLogs', logWithId);
}

// Clean and extract domain from URL/hostname
export function cleanDomain(url) {
  if (!url) return '';
  try {
    let hostname = url;
    if (url.includes('://')) {
      hostname = new URL(url).hostname;
    }
    hostname = hostname.toLowerCase();
    if (hostname.startsWith('www.')) {
      hostname = hostname.slice(4);
    }
    hostname = hostname.split(':')[0];
    return hostname;
  } catch (e) {
    return '';
  }
}

// Get category for a domain
export function getDomainCategory(domain) {
  const cleanD = cleanDomain(domain);
  if (DOMAIN_CATEGORIES[cleanD]) {
    return DOMAIN_CATEGORIES[cleanD];
  }
  const parts = cleanD.split('.');
  if (parts.length > 2) {
    const base = parts.slice(-2).join('.');
    if (DOMAIN_CATEGORIES[base]) {
      return DOMAIN_CATEGORIES[base];
    }
  }
  return 'Uncategorized';
}

// Data Retention Purger
export async function purgeOldLogs(retentionDays) {
  if (retentionDays === 'forever' || !retentionDays || retentionDays <= 0) return 0;
  const db = await openDB();
  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  
  let deletedCount = 0;

  // 1. Purge activityLogs
  const purgeActivityLogs = () => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['activityLogs'], 'readwrite');
      const store = transaction.objectStore('activityLogs');
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.endTime < cutoffTime) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    });
  };

  // 2. Purge intentionLogs
  const purgeIntentionLogs = () => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['intentionLogs'], 'readwrite');
      const store = transaction.objectStore('intentionLogs');
      const request = store.openCursor();
      request.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          if (cursor.value.timestamp < cutoffTime) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = (e) => reject(e.target.error);
    });
  };

  try {
    await purgeActivityLogs();
    await purgeIntentionLogs();
  } catch (err) {
    console.error('Error purging old logs:', err);
  }

  return deletedCount;
}

export async function generateWorkspaceRecommendations(workspaces) {
  const sessions = await readAllDB('focusSessions');
  const activity = await readAllDB('activityLogs');
  
  // V4 Thresholds: 20 sessions AND 10 hours tracked
  const totalFocusSessionsCount = sessions.length;
  let totalTrackedDurationMs = 0;
  activity.forEach(log => {
    totalTrackedDurationMs += log.duration || 0;
  });
  const totalTrackedHours = totalTrackedDurationMs / (1000 * 60 * 60);

  if (totalFocusSessionsCount < 20 || totalTrackedHours < 10) {
    return []; // Insufficient data to generate recommendations
  }

  const storage = await getStorage(['dismissedRecommendations']);
  const dismissed = storage.dismissedRecommendations || [];
  const recHistory = await readAllDB('recommendationHistory');
  const existingActiveIds = new Set(recHistory.filter(r => r.action === 'pending').map(r => r.id));

  const recommendations = [];

  const addRecommendation = (rec) => {
    if (dismissed.includes(rec.id) || existingActiveIds.has(rec.id)) return;
    recommendations.push(rec);
  };

  const wsSessions = {};
  workspaces.forEach(ws => {
    wsSessions[ws.id] = sessions.filter(s => s.workspaceId === ws.id);
  });

  // 1. Workspace Additions
  for (const ws of workspaces) {
    const wsSess = wsSessions[ws.id] || [];
    if (wsSess.length >= 5) {
      const domainSessionCounts = {};
      wsSess.forEach(s => {
        const uniqueDomainsInSession = new Set(s.domains || []);
        uniqueDomainsInSession.forEach(d => {
          if (!ws.domains.includes(d)) {
            domainSessionCounts[d] = (domainSessionCounts[d] || 0) + 1;
          }
        });
      });

      for (const domain in domainSessionCounts) {
        const count = domainSessionCounts[domain];
        const pct = count / wsSess.length;
        if (pct >= 0.6) {
          let confidence = 'Medium';
          if (pct >= 0.85) confidence = 'Very High';
          else if (pct >= 0.75) confidence = 'High';

          addRecommendation({
            id: `rec-add-${domain}-${ws.id}`,
            type: 'addition',
            workspaceId: ws.id,
            workspaceName: ws.name,
            details: { domain },
            recommendation: `Add ${domain} to ${ws.name}?`,
            explanation: `Observed together with other workspace sites in ${Math.round(pct * 100)}% of your ${wsSess.length} focus sessions.`,
            confidence,
            createdAt: Date.now(),
            action: 'pending',
            actionDate: null
          });
        }
      }
    }
  }

  // 2. Workspace Removals
  for (const ws of workspaces) {
    const wsSess = wsSessions[ws.id] || [];
    if (wsSess.length >= 5 && ws.domains.length > 2) {
      const domainSessionCounts = {};
      ws.domains.forEach(d => {
        domainSessionCounts[d] = 0;
      });

      wsSess.forEach(s => {
        const uniqueDomainsInSession = new Set(s.domains || []);
        ws.domains.forEach(d => {
          if (uniqueDomainsInSession.has(d)) {
            domainSessionCounts[d] += 1;
          }
        });
      });

      for (const domain in domainSessionCounts) {
        const count = domainSessionCounts[domain];
        const pct = count / wsSess.length;
        if (pct < 0.1) {
          addRecommendation({
            id: `rec-remove-${domain}-${ws.id}`,
            type: 'removal',
            workspaceId: ws.id,
            workspaceName: ws.name,
            details: { domain },
            recommendation: `Remove ${domain} from ${ws.name}?`,
            explanation: `Used in only ${count} of your last ${wsSess.length} focus sessions for this workspace.`,
            confidence: pct < 0.05 ? 'High' : 'Medium',
            createdAt: Date.now(),
            action: 'pending',
            actionDate: null
          });
        }
      }
    }
  }



  // Save pending recommendations
  for (const rec of recommendations) {
    await writeDB('recommendationHistory', rec);
  }

  return recommendations;
}

// Generate qualitative scorecards (Focus Lock v4)
export async function getAttentionScorecard() {
  const currReport = await getWeeklyAnalytics(Date.now());
  const curr = currReport.current;
  const prev = currReport.previous;
  
  // 1. Focus Quality
  let focusQualityLabel = 'Medium';
  let focusQualityReason = 'Average focus session length and distraction counts are stable.';
  if (prev && prev.totalSessionsCount > 0) {
    const durationIncrease = curr.averageSessionLength - prev.averageSessionLength;
    const durationPct = durationIncrease / prev.averageSessionLength;
    const distractionsDecrease = prev.distractionsCount - curr.distractionsCount;
    
    if (durationPct >= 0.10 && distractionsDecrease >= 0) {
      focusQualityLabel = 'High';
      focusQualityReason = `Average focus session duration increased by ${Math.round(durationPct * 100)}% and distractions decreased by ${distractionsDecrease}.`;
    } else if (durationPct < -0.10) {
      focusQualityLabel = 'Low';
      focusQualityReason = `Average focus session duration decreased by ${Math.round(Math.abs(durationPct) * 100)}%.`;
    }
  }
  
  // 2. Context Switching
  const activity = await readAllDB('activityLogs');
  const dObj = new Date();
  const day = dObj.getDay();
  const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(dObj.setDate(diff));
  monday.setHours(0,0,0,0);
  const startTime = monday.getTime();
  
  const currLogs = activity.filter(a => a.startTime >= startTime);
  const prevLogs = activity.filter(a => a.startTime >= startTime - 7 * 24 * 60 * 60 * 1000 && a.startTime < startTime);
  
  const currSwitches = currLogs.length; 
  const prevSwitches = prevLogs.length;
  
  let contextSwitchingLabel = 'Moderate';
  let contextSwitchingReason = 'Daily context switches remain stable.';
  
  if (prevSwitches > 0) {
    const switchChange = currSwitches - prevSwitches;
    const switchPct = switchChange / prevSwitches;
    
    if (switchPct <= -0.10 || currSwitches < 30) {
      contextSwitchingLabel = 'Low';
      contextSwitchingReason = `Average daily switches decreased by ${Math.round(Math.abs(switchPct) * 100)}% to ${currSwitches} total.`;
    } else if (switchPct >= 0.15) {
      contextSwitchingLabel = 'High';
      contextSwitchingReason = `Average daily switches increased by ${Math.round(switchPct * 100)}% to ${currSwitches} total.`;
    }
  }
  
  // 3. Deep Work
  const sessions = await readAllDB('focusSessions');
  const currSessions = sessions.filter(s => s.startTime >= startTime);
  
  let medianDuration = 30 * 60 * 1000;
  let avgDistractions = 2;
  if (sessions.length > 0) {
    const sortedDurations = [...sessions].map(s => s.duration).sort((a,b) => a - b);
    medianDuration = sortedDurations[Math.floor(sortedDurations.length / 2)];
    const totalDist = sessions.reduce((acc, s) => acc + (s.distractions || 0), 0);
    avgDistractions = totalDist / sessions.length;
  }
  
  let deepWorkCount = 0;
  currSessions.forEach(s => {
    if (s.duration > medianDuration && s.distractions < avgDistractions) {
      deepWorkCount++;
    }
  });
  
  const deepWorkPct = currSessions.length > 0 ? deepWorkCount / currSessions.length : 0;
  let deepWorkLabel = 'Emerging';
  let deepWorkReason = 'Focus sessions are beginning to show segments of deep concentration.';
  
  if (deepWorkPct >= 0.35) {
    deepWorkLabel = 'Strong';
    deepWorkReason = `Deep work sessions represent ${Math.round(deepWorkPct * 100)}% of your focus sessions this week (${deepWorkCount} sessions).`;
  } else if (deepWorkPct >= 0.15) {
    deepWorkLabel = 'Moderate';
    deepWorkReason = `Deep work sessions represent ${Math.round(deepWorkPct * 100)}% of focus sessions (${deepWorkCount} sessions).`;
  }
  
  // 4. Workflow Stability
  const transitions = await readAllDB('transitions');
  let totalTrans = 0;
  let maxTransCount = 0;
  transitions.forEach(t => {
    totalTrans += t.count;
    if (t.count > maxTransCount) maxTransCount = t.count;
  });
  
  const topTransPct = totalTrans > 0 ? maxTransCount / totalTrans : 0;
  let stabilityLabel = 'Fluctuating';
  let stabilityReason = 'Workflow transitions remain varied and adaptive.';
  
  if (topTransPct >= 0.25) {
    stabilityLabel = 'Stable';
    stabilityReason = `Top transition counts represent ${Math.round(topTransPct * 100)}% of total browsing switches.`;
  } else if (topTransPct >= 0.10) {
    stabilityLabel = 'Improving';
    stabilityReason = `Top transition counts are aligning, representing ${Math.round(topTransPct * 100)}% of total switches.`;
  }
  
  return {
    focusQuality: { label: focusQualityLabel, reason: focusQualityReason },
    contextSwitching: { label: contextSwitchingLabel, reason: contextSwitchingReason },
    deepWork: { label: deepWorkLabel, reason: deepWorkReason },
    workflowStability: { label: stabilityLabel, reason: stabilityReason }
  };
}

export function generateNarrativeSummary(currData, prevData) {
  if (!currData) return "Not enough data to compile a report.";

  const textParts = [];

  // Session completion metrics
  if (currData.totalSessionsCount > 0) {
    textParts.push(`You completed ${currData.totalSessionsCount} focus sessions.`);
  }

  // Session length narrative
  if (currData.averageSessionLength > 0) {
    const mins = Math.round(currData.averageSessionLength / 60000);
    if (prevData && prevData.averageSessionLength > 0) {
      const diffMins = Math.round((currData.averageSessionLength - prevData.averageSessionLength) / 60000);
      if (diffMins > 0) {
        textParts.push(`Your average focus session length increased by ${diffMins} minutes.`);
      } else if (diffMins < 0) {
        textParts.push(`Your average focus session length decreased by ${Math.abs(diffMins)} minutes.`);
      } else {
        textParts.push(`Your average focus session length remained stable at ${mins} minutes.`);
      }
    } else {
      textParts.push(`Your average focus session lasted ${mins} minutes.`);
    }
  }

  // Context switches narrative
  if (currData.totalSwitchesCount !== undefined) {
    if (prevData && prevData.totalSwitchesCount > 0) {
      const diffSw = currData.totalSwitchesCount - prevData.totalSwitchesCount;
      const pct = Math.round((Math.abs(diffSw) / prevData.totalSwitchesCount) * 100);
      if (diffSw < 0) {
        textParts.push(`Context switching decreased by ${pct}%.`);
      } else if (diffSw > 0) {
        textParts.push(`Context switching increased by ${pct}%.`);
      }
    }
  }

  return textParts.join(' ');
}

// Generate all report metrics for a week
export async function getWeeklyAnalytics(mondayTimestamp) {
  const sessions = await readAllDB('focusSessions');
  const activity = await readAllDB('activityLogs');
  const recHistory = await readAllDB('recommendationHistory');
  
  const weekStart = new Date(mondayTimestamp);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const getWeekStats = (start, end) => {
    const wSessions = sessions.filter(s => s.startTime >= start.getTime() && s.startTime < end.getTime());
    const wActivity = activity.filter(a => a.startTime >= start.getTime() && a.startTime < end.getTime());
    
    let totalFocusTime = 0;
    let longestSession = 0;
    let distractionsCount = 0;

    wSessions.forEach(s => {
      totalFocusTime += s.duration || 0;
      if (s.duration > longestSession) longestSession = s.duration;
      distractionsCount += s.distractions || 0;
    });

    const averageSessionLength = wSessions.length > 0 ? totalFocusTime / wSessions.length : 0;

    // Top Domains
    const domainActiveDurations = {};
    wActivity.forEach(a => {
      domainActiveDurations[a.domain] = (domainActiveDurations[a.domain] || 0) + (a.activeTime || 0);
    });

    const topDomainsList = Object.keys(domainActiveDurations)
      .map(dom => ({ domain: dom, activeTime: domainActiveDurations[dom] }))
      .sort((a, b) => b.activeTime - a.activeTime)
      .slice(0, 5);

    // Categories Breakdown
    const categoryDurations = {};
    for (const dom in domainActiveDurations) {
      const cat = getDomainCategory(dom);
      categoryDurations[cat] = (categoryDurations[cat] || 0) + domainActiveDurations[dom];
    }

    const categoriesBreakdown = Object.keys(categoryDurations).map(cat => ({
      category: cat,
      activeTime: categoryDurations[cat]
    })).sort((a,b) => b.activeTime - a.activeTime);

    const totalSwitchesCount = wActivity.length;

    return {
      totalFocusTime,
      totalSessionsCount: wSessions.length,
      longestSession,
      averageSessionLength,
      distractionsCount,
      topDomainsList,
      categoriesBreakdown,
      totalSwitchesCount
    };
  };

  const currentStats = getWeekStats(weekStart, weekEnd);
  
  // Previous week comparison
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  const prevWeekEnd = new Date(weekStart);
  const prevStats = getWeekStats(prevWeekStart, prevWeekEnd);

  // Recommendations Count
  const pendingRecs = recHistory.filter(r => r.action === 'pending');

  // Load Workspace names mapping
  const storage = await chrome.storage.local.get(['workspaces']);
  const workspaces = storage.workspaces || [];
  const getWorkspaceName = (id) => {
    const found = workspaces.find(w => w.id === id);
    return found ? found.name : 'Custom Lock';
  };

  const finalStats = {
    ...currentStats,
    topWorkspaceName: currentStats.topWorkspaceId ? getWorkspaceName(currentStats.topWorkspaceId) : null,
    recommendationsCount: pendingRecs.length,
    weekString: `Week of ${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
  };

  const narrative = generateNarrativeSummary(finalStats, prevStats);

  return {
    current: finalStats,
    previous: prevStats,
    narrative
  };
}

// Generate Insights Metrics (Personal Workflow Discovery)
export async function getPersonalInsights() {
  const sessions = await readAllDB('focusSessions');
  const transitions = await readAllDB('transitions');

  if (sessions.length === 0) {
    return null;
  }

  // 1. Most Common Workspace
  const wsCounts = {};
  sessions.forEach(s => {
    if (s.workspaceId) {
      wsCounts[s.workspaceId] = (wsCounts[s.workspaceId] || 0) + 1;
    }
  });

  let mostCommonWorkspaceId = '';
  let mostCommonWorkspaceCount = 0;
  for (const id in wsCounts) {
    if (wsCounts[id] > mostCommonWorkspaceCount) {
      mostCommonWorkspaceCount = wsCounts[id];
      mostCommonWorkspaceId = id;
    }
  }

  const storage = await chrome.storage.local.get(['workspaces']);
  const workspaces = storage.workspaces || [];
  const workspaceName = mostCommonWorkspaceId 
    ? (workspaces.find(w => w.id === mostCommonWorkspaceId)?.name || 'Custom Lock')
    : 'None';

  // 2. Most Frequent Site Combination
  const combinationCounts = {};
  sessions.forEach(s => {
    if (s.domains && s.domains.length >= 2) {
      const sorted = [...s.domains].sort();
      const key = sorted.join(',');
      combinationCounts[key] = (combinationCounts[key] || 0) + 1;
    }
  });

  let topCombinationKey = '';
  let topCombinationCount = 0;
  for (const key in combinationCounts) {
    if (combinationCounts[key] > topCombinationCount) {
      topCombinationCount = combinationCounts[key];
      topCombinationKey = key;
    }
  }
  const topCombination = topCombinationKey ? topCombinationKey.split(',') : [];

  // 3. Most Common Transition
  let topTransition = null;
  transitions.forEach(t => {
    if (!topTransition || t.count > topTransition.count) {
      topTransition = t;
    }
  });

  // 4. Most Productive Focus Window (hour blocks)
  const hourlyFocusTime = Array(24).fill(0);
  const hourlySessionsCount = Array(24).fill(0);

  sessions.forEach(s => {
    const startHour = new Date(s.startTime).getHours();
    hourlyFocusTime[startHour] += s.duration;
    hourlySessionsCount[startHour] += 1;
  });

  let bestHour = 9; // Default 9 AM
  let maxTime = 0;
  for (let i = 0; i < 24; i++) {
    if (hourlyFocusTime[i] > maxTime) {
      maxTime = hourlyFocusTime[i];
      bestHour = i;
    }
  }

  const formatHourString = (hr) => {
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const displayHr = hr % 12 || 12;
    const endHr = (hr + 1) % 12 || 12;
    const endampm = (hr + 1) >= 12 && (hr + 1) < 24 ? 'PM' : 'AM';
    return `${displayHr}:00 ${ampm} – ${endHr}:00 ${endampm}`;
  };

  const avgUninterruptedSession = hourlySessionsCount[bestHour] > 0
    ? hourlyFocusTime[bestHour] / hourlySessionsCount[bestHour]
    : 0;

  // 5. Average Focus Session Length
  let totalSessionTime = 0;
  sessions.forEach(s => {
    totalSessionTime += s.duration;
  });
  const averageSessionLength = sessions.length > 0 ? totalSessionTime / sessions.length : 0;

  return {
    mostCommonWorkspace: workspaceName,
    mostCommonWorkspaceCount,
    mostFrequentSites: topCombination,
    mostFrequentSitesCount: topCombinationCount,
    mostCommonTransition: topTransition ? `${topTransition.fromDomain} → ${topTransition.toDomain}` : 'None',
    mostCommonTransitionCount: topTransition ? topTransition.count : 0,
    productiveFocusWindow: formatHourString(bestHour),
    productiveFocusWindowAvgMinutes: Math.round(avgUninterruptedSession / 60000),
    averageSessionLengthMinutes: Math.round(averageSessionLength / 60000)
  };
}

// Generate Attention Graph Node-Link Model (Focus Lock v4)
export async function getAttentionGraph() {
  const sessions = await readAllDB('focusSessions');
  const transitions = await readAllDB('transitions');
  const workspaces = (await chrome.storage.local.get(['workspaces'])).workspaces || [];

  const nodesMap = {};
  const edges = [];

  const addNode = (id, label, type) => {
    if (!nodesMap[id]) {
      nodesMap[id] = { id, label, type };
    }
  };

  // Add workspaces as nodes
  workspaces.forEach(w => {
    addNode(w.id, w.name, 'workspace');
  });

  // Filter transitions count >= 2 for clean graphs
  const topTransitions = transitions.filter(t => t.count >= 2).slice(0, 8);

  topTransitions.forEach(t => {
    addNode(t.fromDomain, t.fromDomain, 'domain');
    addNode(t.toDomain, t.toDomain, 'domain');
    
    // Add transition edges
    edges.push({
      source: t.fromDomain,
      target: t.toDomain,
      type: 'transition',
      weight: t.count
    });
  });

  // Calculate co-occurrences of top domains inside sessions
  const cooccurrences = {};
  sessions.forEach(s => {
    const sequence = s.domains || [];
    if (sequence.length >= 2) {
      for (let i = 0; i < sequence.length; i++) {
        for (let j = i + 1; j < sequence.length; j++) {
          const d1 = sequence[i];
          const d2 = sequence[j];
          if (nodesMap[d1] && nodesMap[d2]) {
            const key = [d1, d2].sort().join(',');
            cooccurrences[key] = (cooccurrences[key] || 0) + 1;
          }
        }
      }
    }
  });

  for (const key in cooccurrences) {
    const [d1, d2] = key.split(',');
    edges.push({
      source: d1,
      target: d2,
      type: 'cooccurrence',
      weight: cooccurrences[key]
    });
  }

  const nodes = Object.values(nodesMap);
  return { nodes, edges };
}

// Generate Mock/Demo Data to populate the intelligence engine
export async function populateMockIntelligenceData() {
  const db = await openDB();
  
  await new Promise((resolve) => {
    const transaction = db.transaction(['activityLogs', 'transitions', 'focusSessions', 'recommendationHistory', 'savedWorkflows', 'deepWorkStats'], 'readwrite');
    transaction.objectStore('activityLogs').clear();
    transaction.objectStore('transitions').clear();
    transaction.objectStore('focusSessions').clear();
    transaction.objectStore('recommendationHistory').clear();
    transaction.objectStore('savedWorkflows').clear();
    transaction.objectStore('deepWorkStats').clear();
    transaction.oncomplete = () => resolve();
  });

  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  // Generate 25 Focus Sessions over the last 14 days (satisfies >= 20 sessions AND >= 10 hours)
  const mockSessions = [];
  
  // 15 successful Coding Workspace sessions
  for (let i = 0; i < 15; i++) {
    mockSessions.push({
      id: `fs-coding-${i}`,
      startTime: now - (14 - i * 0.8) * oneDay,
      endTime: now - (14 - i * 0.8) * oneDay + 75 * 60 * 1000,
      duration: 75 * 60 * 1000,
      intent: 'Coding Arrays',
      workspaceId: 'ws-coding',
      domains: ['github.com', 'chatgpt.com', 'leetcode.com'],
      distractions: i % 3,
      endedEarly: false,
      outcome: 'yes',
      productivityRating: 4 + (i % 2),
      reflection: 'Progressed coding solution.'
    });
  }

  // 6 Learning Sessions
  for (let i = 0; i < 6; i++) {
    mockSessions.push({
      id: `fs-learning-${i}`,
      startTime: now - (12 - i * 1.5) * oneDay,
      endTime: now - (12 - i * 1.5) * oneDay + 45 * 60 * 1000,
      duration: 45 * 60 * 1000,
      intent: 'React Hooks Course',
      workspaceId: 'ws-learning',
      domains: ['youtube.com', 'coursera.org', 'chatgpt.com'],
      distractions: 2 + (i % 2),
      endedEarly: false,
      outcome: i % 2 === 0 ? 'yes' : 'partial',
      productivityRating: 3,
      reflection: 'Studied react hooks video.'
    });
  }

  // 4 Distracted sessions (Twitter/Reddit)
  for (let i = 0; i < 4; i++) {
    mockSessions.push({
      id: `fs-distracted-${i}`,
      startTime: now - (10 - i * 2) * oneDay,
      endTime: now - (10 - i * 2) * oneDay + 20 * 60 * 1000,
      duration: 20 * 60 * 1000,
      intent: 'Writing article draft',
      workspaceId: 'ws-writing',
      domains: ['chatgpt.com', 'twitter.com', 'reddit.com'],
      distractions: 8,
      endedEarly: true,
      outcome: 'no',
      productivityRating: 1,
      reflection: 'Felt very distracted today.'
    });
  }

  for (const s of mockSessions) {
    await writeDB('focusSessions', s);
  }

  // Generate Activity Logs (totaling 25+ hours)
  const mockActivity = [];
  mockSessions.forEach(s => {
    const slice = s.duration / s.domains.length;
    s.domains.forEach((dom, index) => {
      mockActivity.push({
        domain: dom,
        startTime: s.startTime + index * slice,
        endTime: s.startTime + (index + 1) * slice,
        duration: slice,
        activeTime: slice * 0.9,
        workspaceId: s.workspaceId,
        focusSessionId: s.id
      });
    });
  });

  for (const a of mockActivity) {
    await writeDB('activityLogs', a);
  }

  // Pre-seed some direct switches
  for (let i = 0; i < 18; i++) {
    await logTransitionRecord('chatgpt.com', 'github.com');
    await logTransitionRecord('github.com', 'leetcode.com');
  }

  // Generate recommendations and caches
  const storage = await chrome.storage.local.get(['workspaces']);
  const workspaces = storage.workspaces || [];
  await generateWorkspaceRecommendations(workspaces);
  await rebuildDerivedCaches();
}

// CRC-32 Checksum table
const CRC_TABLE = [];
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    if (c & 1) {
      c = 0xEDB88320 ^ (c >>> 1);
    } else {
      c = c >>> 1;
    }
  }
  CRC_TABLE[i] = c;
}

function calculateCRC32(uint8arr) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < uint8arr.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ uint8arr[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

// Pure JS uncompressed ZIP generator
export function generateStoreZip(files) {
  const encoder = new TextEncoder();
  const fileEntries = [];
  let totalLength = 0;

  for (const name in files) {
    const contentBytes = typeof files[name] === 'string' ? encoder.encode(files[name]) : files[name];
    const nameBytes = encoder.encode(name);
    const crc = calculateCRC32(contentBytes);

    fileEntries.push({
      name,
      nameBytes,
      contentBytes,
      crc,
      size: contentBytes.length,
      offset: 0
    });
  }

  fileEntries.forEach(entry => {
    entry.offset = totalLength;
    totalLength += 30 + entry.nameBytes.length + entry.size;
  });

  const centralDirOffset = totalLength;
  let centralDirSize = 0;

  fileEntries.forEach(entry => {
    centralDirSize += 46 + entry.nameBytes.length;
  });

  const zipSize = centralDirOffset + centralDirSize + 22;
  const buffer = new ArrayBuffer(zipSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  fileEntries.forEach(entry => {
    const offset = entry.offset;
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 10, true);
    view.setUint16(offset + 6, 0, true);
    view.setUint16(offset + 8, 0, true);
    view.setUint32(offset + 10, 0, true);
    view.setUint32(offset + 14, entry.crc, true);
    view.setUint32(offset + 18, entry.size, true);
    view.setUint32(offset + 22, entry.size, true);
    view.setUint16(offset + 26, entry.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true);

    bytes.set(entry.nameBytes, offset + 30);
    bytes.set(entry.contentBytes, offset + 30 + entry.nameBytes.length);
  });

  let cdOffset = centralDirOffset;
  fileEntries.forEach(entry => {
    view.setUint32(cdOffset, 0x02014b50, true);
    view.setUint16(cdOffset + 4, 10, true);
    view.setUint16(cdOffset + 6, 10, true);
    view.setUint16(cdOffset + 8, 0, true);
    view.setUint16(cdOffset + 10, 0, true);
    view.setUint32(cdOffset + 12, 0, true);
    view.setUint32(cdOffset + 16, entry.crc, true);
    view.setUint32(cdOffset + 20, entry.size, true);
    view.setUint32(cdOffset + 24, entry.size, true);
    view.setUint16(cdOffset + 28, entry.nameBytes.length, true);
    view.setUint16(cdOffset + 30, 0, true);
    view.setUint16(cdOffset + 32, 0, true);
    view.setUint16(cdOffset + 34, 0, true);
    view.setUint16(cdOffset + 36, 0, true);
    view.setUint32(cdOffset + 38, 0, true);
    view.setUint32(cdOffset + 42, entry.offset, true);

    bytes.set(entry.nameBytes, cdOffset + 46);
    cdOffset += 46 + entry.nameBytes.length;
  });

  const eocdOffset = zipSize - 22;
  view.setUint32(eocdOffset, 0x06054b50, true);
  view.setUint16(eocdOffset + 4, 0, true);
  view.setUint16(eocdOffset + 6, 0, true);
  view.setUint16(eocdOffset + 8, fileEntries.length, true);
  view.setUint16(eocdOffset + 10, fileEntries.length, true);
  view.setUint32(eocdOffset + 12, centralDirSize, true);
  view.setUint32(eocdOffset + 16, centralDirOffset, true);
  view.setUint16(eocdOffset + 20, 0, true);

  return bytes;
}

// Pure JS uncompressed ZIP parser
export function parseStoreZip(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  const files = {};
  let offset = 0;

  while (offset < bytes.length - 30) {
    const sig = view.getUint32(offset, true);
    if (sig === 0x04034b50) { 
      const uncompSize = view.getUint32(offset + 22, true);
      const fnLen = view.getUint16(offset + 26, true);
      const extraLen = view.getUint16(offset + 28, true);

      const fnBytes = bytes.subarray(offset + 30, offset + 30 + fnLen);
      const filename = new TextDecoder().decode(fnBytes);

      const fileDataBytes = bytes.subarray(offset + 30 + fnLen + extraLen, offset + 30 + fnLen + extraLen + uncompSize);
      const content = new TextDecoder().decode(fileDataBytes);

      files[filename] = content;
      offset += 30 + fnLen + extraLen + uncompSize;
    } else {
      break; 
    }
  }
  return files;
}

// Complete local Backup Creator
export async function exportBackupZip() {
  const storage = await chrome.storage.local.get(['darkMode', 'focusRingMode', 'focusRingPosition', 'workspaces', 'dataRetentionPeriod']);
  
  const focusSessions = await readAllDB('focusSessions');
  const activityLogs = await readAllDB('activityLogs');
  const recommendationHistory = await readAllDB('recommendationHistory');
  const intentionLogs = await readAllDB('intentionLogs');

  const backupData = {
    'settings.json': JSON.stringify({
      darkMode: storage.darkMode || null,
      focusRingMode: storage.focusRingMode || 'off',
      focusRingPosition: storage.focusRingPosition || 'top-right',
      dataRetentionPeriod: storage.dataRetentionPeriod || 365,
      schemaVersion: DB_VERSION
    }, null, 2),
    'workspaces.json': JSON.stringify(storage.workspaces || [], null, 2),
    'focusSessions.json': JSON.stringify(focusSessions, null, 2),
    'activityLogs.json': JSON.stringify(activityLogs, null, 2),
    'recommendationHistory.json': JSON.stringify(recommendationHistory, null, 2),
    'intentionLogs.json': JSON.stringify(intentionLogs, null, 2)
  };

  const zipBytes = generateStoreZip(backupData);
  return new Blob([zipBytes], { type: 'application/zip' });
}

// Restore backup ZIP with validation and deduplication
export async function importBackupZip(arrayBuffer) {
  const files = parseStoreZip(arrayBuffer);

  const required = ['settings.json', 'workspaces.json', 'focusSessions.json', 'activityLogs.json', 'recommendationHistory.json'];
  const missing = required.filter(f => !files[f]);
  if (missing.length > 0) {
    throw new Error(`Invalid backup structure. Missing files: ${missing.join(', ')}`);
  }

  const settings = JSON.parse(files['settings.json']);
  const workspaces = JSON.parse(files['workspaces.json']);
  const focusSessions = JSON.parse(files['focusSessions.json']);
  const activityLogs = JSON.parse(files['activityLogs.json']);
  const recommendationHistory = JSON.parse(files['recommendationHistory.json']);


  await chrome.storage.local.set({
    darkMode: settings.darkMode,
    focusRingMode: settings.focusRingMode,
    focusRingPosition: settings.focusRingPosition,
    dataRetentionPeriod: settings.dataRetentionPeriod || 365,
    workspaces
  });

  const db = await openDB();
  
  // Deduplicate focusSessions
  const existingSessions = await readAllDB('focusSessions');
  const existingSessionIds = new Set(existingSessions.map(s => s.id));
  for (const s of focusSessions) {
    if (!existingSessionIds.has(s.id)) {
      await writeDB('focusSessions', s);
    }
  }

  // Deduplicate activityLogs
  const existingLogs = await readAllDB('activityLogs');
  const logKey = (l) => `${l.domain}_${l.startTime}_${l.endTime}`;
  const existingLogKeys = new Set(existingLogs.map(logKey));
  for (const l of activityLogs) {
    const key = logKey(l);
    if (!existingLogKeys.has(key)) {
      l.domain = cleanDomain(l.domain);
      await writeDB('activityLogs', l);
    }
  }

  // Deduplicate recommendationHistory
  const existingRecs = await readAllDB('recommendationHistory');
  const existingRecIds = new Set(existingRecs.map(r => r.id));
  for (const r of recommendationHistory) {
    if (!existingRecIds.has(r.id)) {
      await writeDB('recommendationHistory', r);
    }
  }



  // Restore intentionLogs
  const intentionLogs = files['intentionLogs.json'] ? JSON.parse(files['intentionLogs.json']) : [];
  const existingIntentions = await readAllDB('intentionLogs');
  const existingIntentionIds = new Set(existingIntentions.map(i => i.id));
  for (const i of intentionLogs) {
    if (!existingIntentionIds.has(i.id)) {
      await writeDB('intentionLogs', i);
    }
  }

  await rebuildDerivedCaches();
}

// Rebuild derived data cache layer
export async function rebuildDerivedCaches() {
  const storage = await chrome.storage.local.get(['workspaces']);
  const workspaces = storage.workspaces || [];

  // 1. Recommendations cache
  const activeRecs = await generateWorkspaceRecommendations(workspaces);
  const recommendationCache = {
    generatedAt: Date.now(),
    data: activeRecs
  };

  // 2. Personal Insights cache
  const insights = await getPersonalInsights();
  const insightCache = {
    generatedAt: Date.now(),
    data: insights
  };

  // 3. Weekly Report cache
  const dObj = new Date();
  const day = dObj.getDay();
  const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(dObj.setDate(diff));
  monday.setHours(0,0,0,0);
  
  const weeklyAnalytics = await getWeeklyAnalytics(monday.getTime());
  const weeklyReportCache = {
    generatedAt: Date.now(),
    data: weeklyAnalytics
  };

  // 5. Attention Scorecards cache
  const scorecards = await getAttentionScorecard();
  const attentionScorecard = {
    generatedAt: Date.now(),
    data: scorecards
  };

  await setStorage({
    insightCache,
    recommendationCache,
    weeklyReportCache,
    attentionScorecard
  });
}

// Update browsing activity state and write completed segments to IndexedDB
export async function updateActiveDomain(newUrl, isFocused) {
  const newDomain = cleanDomain(newUrl);
  const storage = await chrome.storage.local.get(['activityTrackingState', 'focusModeActive', 'activeWorkspaceId', 'focusSessionDomainSequence']);
  
  const state = await chrome.storage.local.get(['focusModeActive', 'sessionStartTime', 'activeWorkspaceId']);
  const focusSessionId = state.focusModeActive ? `fs-${state.sessionStartTime || Date.now()}` : null;
  const workspaceId = state.focusModeActive ? state.activeWorkspaceId : null;
  
  const now = Date.now();
  const tracking = storage.activityTrackingState;
  
  if (tracking) {
    if (tracking.domain && isTrackableDomain(tracking.domain)) {
      let segment = 0;
      if (tracking.isFocused) {
        segment = now - tracking.lastActiveTime;
      }
      const totalActiveTime = (tracking.activeTimeAccumulated || 0) + segment;
      const totalDuration = now - tracking.startTime;
      
      if (totalDuration > 0) {
        await logActivityRecord({
          domain: tracking.domain,
          startTime: tracking.startTime,
          endTime: now,
          duration: totalDuration,
          activeTime: totalActiveTime,
          workspaceId: tracking.workspaceId,
          focusSessionId: tracking.focusSessionId
        });
        
        if (newDomain && newDomain !== tracking.domain && isTrackableDomain(newDomain)) {
          await logTransitionRecord(tracking.domain, newDomain);
        }
      }
    }
  }
  
  // Update visited domains order in focusSessionDomainSequence
  if (focusSessionId && newDomain && isTrackableDomain(newDomain)) {
    const sequence = storage.focusSessionDomainSequence || [];
    // Only record if it is a transition change (remove consecutive duplicates)
    if (sequence.length === 0 || sequence[sequence.length - 1] !== newDomain) {
      sequence.push(newDomain);
      await chrome.storage.local.set({ focusSessionDomainSequence: sequence });
    }
  }
  
  const isNewDomainTrackable = isTrackableDomain(newDomain);
  const nextTracking = {
    domain: isNewDomainTrackable ? newDomain : null,
    startTime: now,
    lastActiveTime: now,
    activeTimeAccumulated: 0,
    isFocused: !!(isNewDomainTrackable && isFocused),
    focusSessionId,
    workspaceId
  };
  
  await chrome.storage.local.set({ activityTrackingState: nextTracking });
}

// Update focus status of active domain
export async function updateFocusState(isFocused) {
  const storage = await chrome.storage.local.get(['activityTrackingState']);
  const tracking = storage.activityTrackingState;
  if (!tracking || !tracking.domain) return;
  
  const now = Date.now();
  if (tracking.isFocused === isFocused) return;
  
  if (tracking.isFocused) {
    const segment = now - tracking.lastActiveTime;
    tracking.activeTimeAccumulated = (tracking.activeTimeAccumulated || 0) + segment;
  }
  
  tracking.isFocused = isFocused;
  tracking.lastActiveTime = now;
  
  await chrome.storage.local.set({ activityTrackingState: tracking });
}



// Update the outcome, rating, and reflection of a focus session
export async function updateSessionReflection(sessionId, outcome, rating, reflection) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['focusSessions'], 'readwrite');
    const store = transaction.objectStore('focusSessions');
    const getReq = store.get(sessionId);
    getReq.onsuccess = () => {
      const session = getReq.result;
      if (session) {
        session.outcome = outcome;
        session.productivityRating = rating;
        session.reflection = reflection;
        store.put(session);
      }
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = (e) => reject(e.target.error);
  });
}

// Run one-time database cleanup migration for Focus Lock v4.6
export async function runDataCleanupMigration() {
  const storage = await chrome.storage.local.get(['dataCleanupMigrationComplete']);
  if (storage.dataCleanupMigrationComplete) {
    return;
  }

  try {
    const db = await openDB();

    // Step 1: Pre-migration count and checkpoint
    const counts = await new Promise((resolve, reject) => {
      const tx = db.transaction(['activityLogs', 'transitions', 'focusSessions'], 'readonly');
      const actReq = tx.objectStore('activityLogs').count();
      const trReq = tx.objectStore('transitions').count();
      const fsReq = tx.objectStore('focusSessions').count();
      
      tx.oncomplete = () => {
        resolve({
          activityLogs: actReq.result,
          transitions: trReq.result,
          focusSessions: fsReq.result
        });
      };
      tx.onerror = (e) => reject(tx.error);
    });

    await chrome.storage.local.set({
      migrationStarted: true,
      migrationVersion: 'v4.6',
      preMigrationCounts: counts
    });

    console.log('[Migration] Checkpoint created with pre-migration counts:', counts);

    // Step 2: Cleanup records
    const cleanTx = db.transaction(['activityLogs', 'transitions', 'focusSessions'], 'readwrite');
    
    // Purge activityLogs
    const activityStore = cleanTx.objectStore('activityLogs');
    const activityReq = activityStore.getAll();
    activityReq.onsuccess = () => {
      const logs = activityReq.result || [];
      logs.forEach(log => {
        if (!log.domain || !isTrackableDomain(log.domain)) {
          activityStore.delete(log.id);
        }
      });
    };

    // Purge transitions
    const transitionsStore = cleanTx.objectStore('transitions');
    const transitionsReq = transitionsStore.getAll();
    transitionsReq.onsuccess = () => {
      const records = transitionsReq.result || [];
      records.forEach(rec => {
        if (!rec.fromDomain || !isTrackableDomain(rec.fromDomain) || !rec.toDomain || !isTrackableDomain(rec.toDomain)) {
          transitionsStore.delete(rec.id);
        }
      });
    };

    // Clean focusSessions domain arrays
    const sessionsStore = cleanTx.objectStore('focusSessions');
    const sessionsReq = sessionsStore.getAll();
    sessionsReq.onsuccess = () => {
      const sessions = sessionsReq.result || [];
      sessions.forEach(session => {
        const origDomains = session.domains || [];
        const cleanDomains = origDomains.filter(d => isTrackableDomain(d));
        if (origDomains.length !== cleanDomains.length) {
          session.domains = cleanDomains;
          sessionsStore.put(session);
        }
      });
    };

    await new Promise((resolve, reject) => {
      cleanTx.oncomplete = () => resolve();
      cleanTx.onerror = (e) => reject(cleanTx.error);
    });

    // Step 3: Post-migration count and final checkpoint
    const postCounts = await new Promise((resolve, reject) => {
      const tx = db.transaction(['activityLogs', 'transitions', 'focusSessions'], 'readonly');
      const actReq = tx.objectStore('activityLogs').count();
      const trReq = tx.objectStore('transitions').count();
      const fsReq = tx.objectStore('focusSessions').count();
      
      tx.oncomplete = () => {
        resolve({
          activityLogs: actReq.result,
          transitions: trReq.result,
          focusSessions: fsReq.result
        });
      };
      tx.onerror = (e) => reject(tx.error);
    });

    await chrome.storage.local.set({
      migrationCompleted: true,
      migrationVersion: 'v4.6',
      postMigrationCounts: postCounts,
      dataCleanupMigrationComplete: true
    });

    console.log('[Migration] Migration complete. Checkpoint post-migration counts:', postCounts);
  } catch (e) {
    console.error('[Migration] Error executing data cleanup migration:', e);
  }
}
