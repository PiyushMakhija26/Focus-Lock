// Focus Lock - Analytics Module
import { getStorage, setStorage } from './storage.js';

// Get YYYY-MM-DD date string
export function getDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get the Monday of the week for a given date
function getMonday(d) {
  const dateObj = new Date(d);
  const day = dateObj.getDay();
  const diff = dateObj.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(dateObj.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

// Record a distraction attempt today
export async function recordDistraction() {
  const todayStr = getDateString();
  const storage = await getStorage(['analytics', 'focusModeActive', 'focusSessionDistractions']);
  const analytics = storage.analytics || { daily: {} };
  
  if (!analytics.daily[todayStr]) {
    analytics.daily[todayStr] = { focusTime: 0, distractions: 0 };
  }
  
  analytics.daily[todayStr].distractions += 1;
  
  const updates = { analytics };
  if (storage.focusModeActive) {
    updates.focusSessionDistractions = (storage.focusSessionDistractions || 0) + 1;
  }
  
  await setStorage(updates);
}

// Record completed focus session, log reflection, and save resume metadata
export async function recordFocusSession(startTime, endTime, intent, reflection = '', endedEarly = false, activeTimeMs = 0, idleTimeMs = 0, lockedTimeMs = 0) {
  const duration = activeTimeMs > 0 ? activeTimeMs : Math.max(0, endTime - startTime);
  const todayStr = getDateString();
  
  // 1. Update daily stats
  const storage = await getStorage(['analytics', 'sessionLogs']);
  const analytics = storage.analytics || { daily: {} };
  const sessionLogs = storage.sessionLogs || [];
  
  if (!analytics.daily[todayStr]) {
    analytics.daily[todayStr] = { focusTime: 0, distractions: 0 };
  }
  
  analytics.daily[todayStr].focusTime += duration;
  
  // 2. Append to session logs
  const newLog = {
    id: `log-${Date.now()}`,
    startTime,
    endTime,
    duration,
    idleTimeMs,
    lockedTimeMs,
    intent: intent || 'Unnamed Focus Session',
    reflection: reflection.trim(),
    endedEarly
  };
  sessionLogs.unshift(newLog); // Newer logs at the top
  
  // 3. Save resume metadata (lastSessionMetadata) for future feature support
  const durationMinutes = Math.round(duration / 60000);
  const lastSessionMetadata = {
    intent: intent || 'Unnamed Focus Session',
    focusedDuration: durationMinutes,
    endedEarly,
    timestamp: endTime
  };
  
  await setStorage({
    analytics,
    sessionLogs: sessionLogs.slice(0, 100), // Cap at last 100 logs for size efficiency
    lastSessionMetadata
  });
}

// Convert ms to clean "2h 17m" or "45m" format
export function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Get analytics summaries
export async function getAnalyticsSummary() {
  const storage = await getStorage(['analytics']);
  const analytics = storage.analytics || { daily: {} };
  
  const todayStr = getDateString();
  const todayData = analytics.daily[todayStr] || { focusTime: 0, distractions: 0 };
  
  // Calculate this week's accumulated focus time
  const monday = getMonday(new Date());
  let weeklyFocusTime = 0;
  
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(monday);
    nextDay.setDate(monday.getDate() + i);
    const dayStr = getDateString(nextDay);
    if (analytics.daily[dayStr]) {
      weeklyFocusTime += analytics.daily[dayStr].focusTime;
    }
  }
  
  return {
    todayFocusTime: formatDuration(todayData.focusTime),
    weeklyFocusTime: formatDuration(weeklyFocusTime),
    todayDistractions: todayData.distractions
  };
}
