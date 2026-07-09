// Focus Lock - Report Dashboard Logic (ES Module)
import { openDB, getWeeklyAnalytics, cleanDomain, getDomainCategory, getAttentionGraph } from './modules/intelligence.js';

document.addEventListener('DOMContentLoaded', async () => {
  await syncReportTheme();
  await populateReportData();
  setupReportActions();
});

// Sync report theme with extension settings
async function syncReportTheme() {
  chrome.storage.local.get(['darkMode'], (result) => {
    let isDark = result.darkMode;
    if (isDark === null || isDark === undefined) {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    if (isDark) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.add('light');
      document.body.classList.remove('dark');
    }
  });
}

// Convert ms to clean "2h 17m" or "45m" format
function formatDuration(ms) {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Populate Weekly Report Data
async function populateReportData() {
  chrome.storage.local.get(['weeklyReportCache', 'attentionScorecard', 'recommendationCache'], async (result) => {
    let reportData = null;
    
    if (result.weeklyReportCache) {
      reportData = result.weeklyReportCache.data;
    } else {
      // Re-calculate if cache is missing
      const dObj = new Date();
      const day = dObj.getDay();
      const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dObj.setDate(diff));
      monday.setHours(0,0,0,0);
      try {
        reportData = await getWeeklyAnalytics(monday.getTime());
      } catch (err) {
        console.error('Failed to generate report insights:', err);
      }
    }

    if (!reportData || !reportData.current || reportData.current.totalSessionsCount === 0) {
      renderEmptyState();
      return;
    }

    // Render scorecards
    const scorecard = result.attentionScorecard ? result.attentionScorecard.data : null;
    renderReportScorecards(scorecard);

    // Render suggestions
    const recs = result.recommendationCache ? result.recommendationCache.data : [];
    renderReportSuggestions(recs);

    const curr = reportData.current;
    const prev = reportData.previous;

    // Render Header Info
    document.getElementById('reportWeekRange').textContent = curr.weekString || 'This Week';
    document.getElementById('narrativeSummary').textContent = reportData.narrative || 'No narrative compiled for this week.';

    // Render Metrics
    document.getElementById('metricFocusTime').textContent = formatDuration(curr.totalFocusTime);
    document.getElementById('metricSessions').textContent = curr.totalSessionsCount;
    document.getElementById('metricAvgSession').textContent = `${Math.round(curr.averageSessionLength / 60000)}m`;
    document.getElementById('metricDistractions').textContent = curr.distractionsCount;

    // Render Trends
    renderTrendElement('trendFocusTime', curr.totalFocusTime, prev.totalFocusTime, 'ms');
    renderTrendElement('trendSessions', curr.totalSessionsCount, prev.totalSessionsCount, 'count');
    renderTrendElement('trendAvgSession', curr.averageSessionLength, prev.averageSessionLength, 'ms');
    renderTrendElement('trendDistractions', curr.distractionsCount, prev.distractionsCount, 'distractions');

    // Render Top Domains List
    const domainsListEl = document.getElementById('topDomainsList');
    domainsListEl.innerHTML = '';
    
    const maxDomainTime = curr.topDomainsList.length > 0 ? curr.topDomainsList[0].activeTime : 1;
    curr.topDomainsList.forEach(item => {
      const pct = Math.round((item.activeTime / maxDomainTime) * 100);
      const domDiv = document.createElement('div');
      domDiv.className = 'progress-item';
      domDiv.innerHTML = `
        <div class="progress-meta">
          <span class="progress-name">${item.domain}</span>
          <span class="progress-val">${formatDuration(item.activeTime)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fg" style="width: ${pct}%"></div>
        </div>
      `;
      domainsListEl.appendChild(domDiv);
    });

    // Render Categories Breakdown List
    const categoriesListEl = document.getElementById('categoriesList');
    categoriesListEl.innerHTML = '';
    
    const maxCatTime = curr.categoriesBreakdown.length > 0 ? curr.categoriesBreakdown[0].activeTime : 1;
    curr.categoriesBreakdown.forEach(item => {
      const pct = Math.round((item.activeTime / maxCatTime) * 100);
      const catDiv = document.createElement('div');
      catDiv.className = 'progress-item';
      catDiv.innerHTML = `
        <div class="progress-meta">
          <span class="progress-name">${item.category}</span>
          <span class="progress-val">${formatDuration(item.activeTime)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fg category-bar" style="width: ${pct}%"></div>
        </div>
      `;
      categoriesListEl.appendChild(catDiv);
    });

    // Render Transition Graph Visualizer
    await renderTransitionGraph();
  });
}

// Render trend text and arrow
function renderTrendElement(elementId, currVal, prevVal, type) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (prevVal === undefined || prevVal === null || prevVal === 0) {
    el.textContent = 'New Metric';
    el.className = 'metric-trend trend-neutral';
    return;
  }

  const diff = currVal - prevVal;
  const pct = Math.round((Math.abs(diff) / prevVal) * 100);
  
  if (diff === 0) {
    el.textContent = 'Stable';
    el.className = 'metric-trend trend-neutral';
    return;
  }

  let arrow = diff > 0 ? '↑' : '↓';
  
  // Custom wording for ms
  let diffStr = `${pct}%`;
  if (type === 'ms') {
    const diffMins = Math.round(Math.abs(diff) / 60000);
    if (diffMins > 0) {
      diffStr = `${diffMins} Mins`;
    }
  }

  // Distractions color: Down is Good (Green), Up is Bad (Red)
  let isGood = diff > 0;
  if (type === 'distractions') {
    isGood = diff < 0;
  }

  el.textContent = `${arrow} ${diffStr} vs Last Week`;
  el.className = `metric-trend ${isGood ? 'trend-up' : 'trend-down'}`;
}

// Render transition directed graph via SVG
async function renderTransitionGraph() {
  const svg = document.getElementById('transitionSvg');
  if (!svg) return;
  svg.innerHTML = '';

  let graph;
  try {
    graph = await getAttentionGraph();
  } catch (err) {
    console.error('Failed to get attention graph:', err);
    svg.innerHTML = `<text x="350" y="150" fill="var(--text-muted)" text-anchor="middle">Failed to load graph.</text>`;
    return;
  }

  const { nodes, edges } = graph;

  if (nodes.length < 2) {
    svg.innerHTML = `<text x="350" y="150" fill="var(--text-muted)" text-anchor="middle">Not enough focus data to render attention graph.</text>`;
    return;
  }

  // Draw Marker for Arrowheads
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
    </marker>
  `;
  svg.appendChild(defs);

  // Define node positions symmetrically in a circle
  const centerX = 350;
  const centerY = 150;
  const radius = 100;

  const nodePositions = {};
  nodes.forEach((node, index) => {
    const angle = (index * 2 * Math.PI) / nodes.length - Math.PI / 2;
    nodePositions[node.id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      radius: node.type === 'workspace' ? 34 : 26
    };
  });

  // 1. Draw directed arrow paths and co-occurrences
  edges.forEach(edge => {
    const p1 = nodePositions[edge.source];
    const p2 = nodePositions[edge.target];

    if (p1 && p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist === 0) return;

      const ux = dx / dist;
      const uy = dy / dist;

      // Start/End offset points
      const x1 = p1.x + p1.radius * ux;
      const y1 = p1.y + p1.radius * uy;
      const x2 = p2.x - p2.radius * ux;
      const y2 = p2.y - p2.radius * uy;

      // Draw path line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1);
      line.setAttribute('y1', y1);
      line.setAttribute('x2', x2);
      line.setAttribute('y2', y2);
      
      if (edge.type === 'cooccurrence') {
        line.setAttribute('stroke', 'var(--color-amber)');
        line.setAttribute('stroke-dasharray', '4,4');
      } else {
        line.setAttribute('stroke', 'var(--text-muted)');
        line.setAttribute('marker-end', 'url(#arrow)');
      }
      
      const strokeWidth = Math.min(5, 1 + edge.weight / 4);
      line.setAttribute('stroke-width', strokeWidth);
      line.setAttribute('opacity', '0.6');
      svg.appendChild(line);

      // Label showing weight
      const midX = (x1 + x2) / 2 + 10 * uy;
      const midY = (y1 + y2) / 2 - 10 * ux;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', midX);
      label.setAttribute('y', midY);
      label.setAttribute('fill', 'var(--text-muted)');
      label.setAttribute('font-size', '9px');
      label.setAttribute('font-weight', 'bold');
      label.setAttribute('text-anchor', 'middle');
      label.textContent = edge.weight;
      svg.appendChild(label);
    }
  });

  // 2. Draw circular nodes
  nodes.forEach(node => {
    const pos = nodePositions[node.id];
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    // Draw Circle Node
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.setAttribute('cx', pos.x);
    circ.setAttribute('cy', pos.y);
    circ.setAttribute('r', pos.radius);
    circ.setAttribute('fill', 'var(--bg-card)');
    
    if (node.type === 'workspace') {
      circ.setAttribute('stroke', 'var(--color-sage)');
      circ.setAttribute('stroke-width', '3');
    } else {
      circ.setAttribute('stroke', 'var(--color-cyan)');
      circ.setAttribute('stroke-width', '2');
    }
    circ.setAttribute('style', 'filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.05))');

    // Draw Node label text
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', pos.x);
    txt.setAttribute('y', pos.y + 4);
    txt.setAttribute('fill', 'var(--text-primary)');
    txt.setAttribute('font-size', node.type === 'workspace' ? '9px' : '8px');
    txt.setAttribute('font-weight', '600');
    txt.setAttribute('text-anchor', 'middle');

    const shortLabel = node.label.length > 13 ? node.label.slice(0, 10) + '...' : node.label;
    txt.textContent = shortLabel;

    group.appendChild(circ);
    group.appendChild(txt);
    svg.appendChild(group);
  });
}

// Render empty report page state
function renderEmptyState() {
  document.getElementById('narrativeSummary').textContent = 'Insufficient data tracked to generate attention insights. Create custom spaces and track focused work sessions first.';
  const grid = document.querySelector('.metrics-grid');
  grid.innerHTML = '<div style="grid-column: span 4; text-align: center; color: var(--text-muted); padding: 20px;">No metrics available for the current week yet. Run a focus session to see data populate here!</div>';
  
  const charts = document.querySelector('.charts-container');
  charts.style.display = 'none';
}

// Setup report actions listeners
function setupReportActions() {
  document.getElementById('btnPrint').addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btnExportJson').addEventListener('click', exportJson);
  document.getElementById('btnExportCsv').addEventListener('click', exportCsv);
}

// JSON Export
async function exportJson() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['activityLogs', 'focusSessions'], 'readonly');
    const logsReq = transaction.objectStore('activityLogs').getAll();
    const sessionsReq = transaction.objectStore('focusSessions').getAll();
    
    transaction.oncomplete = () => {
      const dObj = new Date();
      const day = dObj.getDay();
      const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dObj.setDate(diff));
      monday.setHours(0,0,0,0);
      const startTime = monday.getTime();
      
      const weeklyLogs = logsReq.result.filter(l => l.startTime >= startTime);
      const weeklySessions = sessionsReq.result.filter(s => s.startTime >= startTime);
      
      const exportData = {
        weekOf: monday.toDateString(),
        activityLogs: weeklyLogs,
        focusSessions: weeklySessions
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focus-lock-report-${startTime}.json`;
      a.click();
      URL.revokeObjectURL(url);
    };
  } catch(e) {
    alert(`Export failed: ${e.message}`);
  }
}

// CSV Export
async function exportCsv() {
  try {
    const db = await openDB();
    const transaction = db.transaction(['activityLogs'], 'readonly');
    const logsReq = transaction.objectStore('activityLogs').getAll();
    
    transaction.oncomplete = () => {
      const dObj = new Date();
      const day = dObj.getDay();
      const diff = dObj.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(dObj.setDate(diff));
      monday.setHours(0,0,0,0);
      const startTime = monday.getTime();
      
      const weeklyLogs = logsReq.result.filter(l => l.startTime >= startTime);
      
      let csv = 'Domain,Start Date,Duration (Minutes),Active Time (Minutes),Focus Session ID,Workspace\r\n';
      weeklyLogs.forEach(l => {
        const dateStr = new Date(l.startTime).toLocaleDateString();
        const durationMins = Math.round(l.duration / 60000);
        const activeMins = Math.round(l.activeTime / 60000);
        const focusId = l.focusSessionId || 'None';
        const ws = l.workspaceId || 'None';
        csv += `"${l.domain}","${dateStr}",${durationMins},${activeMins},"${focusId}","${ws}"\r\n`;
      });
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focus-lock-report-${startTime}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    };
  } catch(e) {
    alert(`Export failed: ${e.message}`);
  }
}

function renderReportScorecards(scorecard) {
  const scorecardList = document.getElementById('reportScorecardList');
  if (!scorecardList) return;
  scorecardList.innerHTML = '';

  if (!scorecard) {
    scorecardList.innerHTML = '<div style="grid-column: span 4; text-align: center; color: var(--text-muted); padding: 10px;">No scorecard computed.</div>';
    return;
  }

  const items = [
    {
      name: 'Focus Quality',
      data: scorecard.focusQuality,
      rule: '• <strong>High</strong>: Weekly average focus duration increased by ≥10% and distractions decreased by ≥5% compared to the previous week.<br>• <strong>Low</strong>: Duration decreased by &gt;10%.<br>• <strong>Medium</strong>: Stable or otherwise.'
    },
    {
      name: 'Context Switching',
      data: scorecard.contextSwitching,
      rule: '• <strong>Low</strong>: Daily context switches average &lt;30, or decreased by ≥10% compared to the previous week.<br>• <strong>High</strong>: Switches increased by ≥15%.<br>• <strong>Moderate</strong>: Stable or otherwise.'
    },
    {
      name: 'Deep Work',
      data: scorecard.deepWork,
      rule: '• <strong>Strong</strong>: Deep Work sessions represent ≥35% of total focus sessions.<br>• <strong>Moderate</strong>: Deep Work sessions represent 15% to 35% of focus sessions.<br>• <strong>Emerging</strong>: Deep Work sessions represent &lt;15% of focus sessions.'
    },
    {
      name: 'Workflow Stability',
      data: scorecard.workflowStability,
      rule: '• <strong>Stable</strong>: Top transition count represents ≥25% of total transitions.<br>• <strong>Improving</strong>: Top transition count represents 10% to 25% of transitions.<br>• <strong>Fluctuating</strong>: Top transitions represent &lt;10% of transitions.'
    }
  ];

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'scorecard-card';

    const header = document.createElement('div');
    header.className = 'scorecard-header';

    const name = document.createElement('span');
    name.className = 'scorecard-name';
    name.textContent = item.name;

    const badge = document.createElement('span');
    const labelLower = item.data.label.toLowerCase().replace(' ', '_');
    badge.className = `scorecard-badge ${labelLower}`;
    badge.textContent = item.data.label;

    header.appendChild(name);
    header.appendChild(badge);

    const reason = document.createElement('div');
    reason.className = 'scorecard-reason';
    reason.textContent = item.data.reason;

    const ruleDiv = document.createElement('div');
    ruleDiv.className = 'scorecard-rule hidden';
    ruleDiv.innerHTML = `<strong>Calculation Rule:</strong><br>${item.rule}`;

    card.appendChild(header);
    card.appendChild(reason);
    card.appendChild(ruleDiv);

    card.addEventListener('click', () => {
      ruleDiv.classList.toggle('hidden');
    });

    scorecardList.appendChild(card);
  });
}

function renderReportSuggestions(recommendations) {
  const listEl = document.getElementById('reportSuggestionsList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const pendingRecs = recommendations ? recommendations.filter(r => r.action === 'pending') : [];

  if (pendingRecs.length === 0) {
    listEl.innerHTML = '<div style="color: var(--text-muted); padding: 10px;">No focus recommendations. Focus Lock is observing your activity.</div>';
    return;
  }

  pendingRecs.forEach(rec => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    
    const title = document.createElement('div');
    title.className = 'suggestion-title';
    title.textContent = rec.recommendation;

    const desc = document.createElement('div');
    desc.className = 'suggestion-desc';
    desc.textContent = rec.explanation;

    item.appendChild(title);
    item.appendChild(desc);
    listEl.appendChild(item);
  });
}
