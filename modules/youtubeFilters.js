// Focus Lock - YouTube Filters Management Module
import { getStorage, setStorage } from './storage.js';

export const YOUTUBE_PRESETS = {
  search_only: {
    hideHomeFeed: true,
    hideShorts: true,
    hideRecommendations: true,
    hideEndScreens: true,
    hideComments: true,
    hideTrending: true,
    hideNotifications: true,
    hideCounts: true
  },
  study: {
    hideHomeFeed: true,
    hideShorts: true,
    hideRecommendations: true,
    hideEndScreens: true,
    hideComments: true,
    hideTrending: true,
    hideNotifications: false,
    hideCounts: false
  },
  learning: {
    hideHomeFeed: true,
    hideShorts: true,
    hideRecommendations: false,
    hideEndScreens: true,
    hideComments: false,
    hideTrending: true,
    hideNotifications: false,
    hideCounts: false
  },
  minimal: {
    hideHomeFeed: false,
    hideShorts: true,
    hideRecommendations: false,
    hideEndScreens: false,
    hideComments: false,
    hideTrending: true,
    hideNotifications: false,
    hideCounts: false
  },
  off: {
    hideHomeFeed: false,
    hideShorts: false,
    hideRecommendations: false,
    hideEndScreens: false,
    hideComments: false,
    hideTrending: false,
    hideNotifications: false,
    hideCounts: false
  }
};

// Get individual filters configuration for a preset
export function getPresetFilters(preset) {
  return YOUTUBE_PRESETS[preset] || null;
}

// Apply preset to active filters in storage
export async function applyYoutubePreset(preset) {
  if (preset === 'custom') {
    await setStorage({ youtubePreset: 'custom' });
    return;
  }
  
  const filters = getPresetFilters(preset);
  if (filters) {
    await setStorage({
      youtubePreset: preset,
      ...filters
    });
  }
}

// Backup current filters before a focus session
export async function savePreSessionYoutubeState() {
  const current = await getStorage([
    'youtubePreset',
    'hideHomeFeed',
    'hideShorts',
    'hideRecommendations',
    'hideEndScreens',
    'hideComments',
    'hideTrending',
    'hideNotifications',
    'hideCounts'
  ]);
  
  await setStorage({ preSessionYoutubeState: current });
}

// Restore filters after focus session ends
export async function restorePreSessionYoutubeState() {
  const storage = await getStorage(['preSessionYoutubeState']);
  const backup = storage.preSessionYoutubeState;
  
  if (backup) {
    await setStorage({
      youtubePreset: backup.youtubePreset || 'off',
      hideHomeFeed: !!backup.hideHomeFeed,
      hideShorts: !!backup.hideShorts,
      hideRecommendations: !!backup.hideRecommendations,
      hideEndScreens: !!backup.hideEndScreens,
      hideComments: !!backup.hideComments,
      hideTrending: !!backup.hideTrending,
      hideNotifications: !!backup.hideNotifications,
      hideCounts: !!backup.hideCounts,
      preSessionYoutubeState: null // clear backup
    });
  }
}

// Check workspace preset overrides on session start
export async function updateActiveYoutubeFiltersForSession(workspaceId) {
  if (!workspaceId) return;
  
  const storage = await getStorage(['youtubeWorkspacePresets']);
  const wsPresets = storage.youtubeWorkspacePresets || {};
  const preset = wsPresets[workspaceId];
  
  if (preset && preset !== 'off') {
    // 1. Backup current settings
    await savePreSessionYoutubeState();
    
    // 2. Apply preset
    await applyYoutubePreset(preset);
  }
}
