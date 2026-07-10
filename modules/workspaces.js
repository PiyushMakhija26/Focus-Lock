// Focus Lock - Workspaces Module
import { getStorage, setStorage } from './storage.js';

// Retrieve all workspaces
export async function getWorkspaces() {
  const result = await getStorage(['workspaces']);
  return result.workspaces || [];
}

// Save workspaces list
export async function saveWorkspaces(workspaces) {
  await setStorage({ workspaces });
}

// Add a new custom workspace
export async function addWorkspace(name, domains = []) {
  const workspaces = await getWorkspaces();
  const newWorkspace = {
    id: `ws-${Date.now()}`,
    name,
    domains: domains.map(d => cleanDomain(d)).filter(Boolean),
    isDefault: false
  };
  workspaces.push(newWorkspace);
  await saveWorkspaces(workspaces);
  return newWorkspace;
}

// Edit an existing workspace
export async function editWorkspace(id, name, domains) {
  const workspaces = await getWorkspaces();
  const index = workspaces.findIndex(w => w.id === id);
  if (index !== -1) {
    workspaces[index].name = name;
    workspaces[index].domains = domains.map(d => cleanDomain(d)).filter(Boolean);
    await saveWorkspaces(workspaces);
    return workspaces[index];
  }
  return null;
}

// Delete a workspace
export async function deleteWorkspace(id) {
  const workspaces = await getWorkspaces();
  const filtered = workspaces.filter(w => w.id !== id);
  await saveWorkspaces(filtered);
}

// Helper to clean domain inputs
function cleanDomain(input) {
  if (!input) return '';
  let cleaned = input.trim().toLowerCase();
  // Strip protocol if present
  if (cleaned.includes('://')) {
    try {
      cleaned = new URL(cleaned).hostname;
    } catch (e) {
      cleaned = cleaned.split('://')[1];
    }
  }
  // Strip path or port
  cleaned = cleaned.split('/')[0].split(':')[0];
  // Strip leading 'www.' if present
  if (cleaned.startsWith('www.')) {
    cleaned = cleaned.slice(4);
  }
  return cleaned;
}

// Check if hostname matches allowed domain or subdomain securely
export function matchDomain(hostname, target) {
  if (!hostname || !target) return false;
  const host = hostname.toLowerCase().trim();
  const cleanT = cleanDomain(target);
  if (!cleanT) return false;
  return host === cleanT || host.endsWith('.' + cleanT);
}

// Check if a URL's hostname matches the workspace list
export function isDomainAllowedInWorkspace(hostname, domainsList) {
  if (!hostname) return false;
  return domainsList.some(domain => matchDomain(hostname, domain));
}

// Check if domain is in temporary session whitelists
export async function isTempWhitelisted(hostname) {
  if (!hostname) return false;
  
  const storage = await getStorage(['tempWhitelistedDomains', 'tempWhitelistedUntil']);
  const tempDomains = storage.tempWhitelistedDomains || [];
  const tempUntil = storage.tempWhitelistedUntil || {};
  
  // 1. Check permanent session whitelist (Open Anyway)
  if (tempDomains.some(d => matchDomain(hostname, d))) {
    return true;
  }
  
  // 2. Check timed session whitelist (Continue for 5 Minutes)
  const now = Date.now();
  for (const domain in tempUntil) {
    if (now < tempUntil[domain]) {
      if (matchDomain(hostname, domain)) {
        return true;
      }
    }
  }
  
  return false;
}

// Add a domain to the permanent session whitelist (Open Anyway)
export async function addTempWhitelistDomain(domain) {
  const host = cleanDomain(domain);
  if (!host) return;
  
  const storage = await getStorage(['tempWhitelistedDomains']);
  const tempDomains = storage.tempWhitelistedDomains || [];
  
  if (!tempDomains.includes(host)) {
    tempDomains.push(host);
    await setStorage({ tempWhitelistedDomains: tempDomains });
  }
}

// Add a domain to the timed session whitelist (Continue for dynamic duration)
export async function addTimedWhitelistDomain(domain, durationMinutes = 5) {
  const host = cleanDomain(domain);
  if (!host) return;
  
  const storage = await getStorage(['tempWhitelistedUntil']);
  const tempUntil = storage.tempWhitelistedUntil || {};
  
  tempUntil[host] = Date.now() + durationMinutes * 60 * 1000;
  await setStorage({ tempWhitelistedUntil: tempUntil });
}
