// Focus Lock - Report Dashboard Logic (ES Module)
import { openDB, getWeeklyAnalytics, cleanDomain, getDomainCategory, getAttentionGraph } from './modules/intelligence.js';

// Demo dataset used only for screenshots and demonstrations
const DEMO_DATASET = {
  weeklyReportCache: {
    data: {
      current: {
        weekString: "Week of " + new Date().toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}),
        totalFocusTime: 25.5 * 60 * 60 * 1000, // 25.5 hours
        totalSessionsCount: 18,
        averageSessionLength: 85 * 60 * 1000, // 85 mins
        distractionsCount: 12,
        topDomainsList: [
          { domain: "github.com", activeTime: 12.4 * 60 * 60 * 1000 },
          { domain: "chatgpt.com", activeTime: 6.8 * 60 * 60 * 1000 },
          { domain: "stackoverflow.com", activeTime: 3.5 * 60 * 60 * 1000 },
          { domain: "notion.so", activeTime: 1.8 * 60 * 60 * 1000 },
          { domain: "figma.com", activeTime: 1.0 * 60 * 60 * 1000 }
        ],
        categoriesBreakdown: [
          { category: "Development", activeTime: 15.9 * 60 * 60 * 1000 },
          { category: "Learning & Docs", activeTime: 6.8 * 60 * 60 * 1000 },
          { category: "Productivity & Notes", activeTime: 1.8 * 60 * 60 * 1000 },
          { category: "Design", activeTime: 1.0 * 60 * 60 * 1000 }
        ]
      },
      previous: {
        totalFocusTime: 20.8 * 60 * 60 * 1000,
        totalSessionsCount: 15,
        averageSessionLength: 63 * 60 * 1000,
        distractionsCount: 34
      },
      narrative: "Your average focus session increased by 22 minutes while context switching dropped by 88%.\n\nYou're gradually building longer periods of uninterrupted work."
    }
  },
  attentionScorecard: {
    data: {
      focusQuality: { label: "High", reason: "Average focus duration ↑ 35% from last week." },
      contextSwitching: { label: "Low", reason: "Daily switches ↓ 64% from last week." },
      deepWork: { label: "Strong", reason: "Deep work represents 44% of focus sessions." },
      workflowStability: { label: "Stable", reason: "69% of browsing switches came from your top transition." }
    }
  },
  recommendationCache: {
    data: [
      {
        action: "pending",
        recommendation: "Consolidate learning routines",
        explanation: "You spent 6.8h on chatgpt.com this week. Group research questions into one dedicated block to avoid fracturing focus."
      },
      {
        action: "pending",
        recommendation: "Protect StackOverflow workflows",
        explanation: "Transitions between github.com and stackoverflow.com are high. Consider keeping both open side-by-side to reduce context switching."
      }
    ]
  }
};

const urlParams = new URLSearchParams(window.location.search);
const isDemoMode = urlParams.get('demo') === 'true';

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
  // Display timestamp
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  document.getElementById('generatedDate').textContent = `Generated: ${dateStr} at ${timeStr}`;

  if (isDemoMode) {
    document.getElementById('demoModeBadge').style.display = 'inline-block';
    renderDashboard(DEMO_DATASET.weeklyReportCache.data, DEMO_DATASET.attentionScorecard.data, DEMO_DATASET.recommendationCache.data);
    return;
  }

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

    const scorecard = result.attentionScorecard ? result.attentionScorecard.data : null;
    const recs = result.recommendationCache ? result.recommendationCache.data : [];

    renderDashboard(reportData, scorecard, recs);
  });
}

// Render complete dashboard content
async function renderDashboard(reportData, scorecard, recs) {
  const curr = reportData.current;
  const prev = reportData.previous;

  // Render scorecards
  renderReportScorecards(scorecard);

  // Render suggestions
  renderReportSuggestions(recs);

  // Render Header Info
  document.getElementById('reportWeekRange').textContent = curr.weekString || 'This Week';
  document.getElementById('narrativeSummary').textContent = reportData.narrative || 'No narrative compiled for this week.';

  // Render highlight chip
  renderWeeklyHighlight(reportData);

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

  // Render Top Domains List with Favicons
  const domainsListEl = document.getElementById('topDomainsList');
  domainsListEl.innerHTML = '';
  
  if (curr.topDomainsList.length === 0) {
    domainsListEl.innerHTML = `
      <div class="empty-state-card">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="empty-state-title">No focus data yet</span>
        <span class="empty-state-desc">Start a focus session to begin building your attention history.</span>
      </div>
    `;
  } else {
    const maxDomainTime = curr.topDomainsList.length > 0 ? curr.topDomainsList[0].activeTime : 1;
    curr.topDomainsList.forEach(item => {
      const pct = Math.round((item.activeTime / maxDomainTime) * 100);
      const domDiv = document.createElement('div');
      domDiv.className = 'progress-item';
      domDiv.innerHTML = `
        <div class="progress-meta">
          <span class="progress-name" style="display: flex; align-items: center; gap: 8px;">
            <img class="domain-favicon" src="https://www.google.com/s2/favicons?sz=32&domain=${item.domain}" width="16" height="16" alt="" style="border-radius: 3px;" />
            ${item.domain}
          </span>
          <span class="progress-val">${formatDuration(item.activeTime)}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fg" style="--progress-pct: ${pct}%"></div>
        </div>
      `;
      domainsListEl.appendChild(domDiv);
    });
  }

  // Render Categories Breakdown List
  const categoriesListEl = document.getElementById('categoriesList');
  categoriesListEl.innerHTML = '';
  
  if (curr.categoriesBreakdown.length === 0) {
    categoriesListEl.innerHTML = `
      <div class="empty-state-card">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span class="empty-state-title">No categories tracked</span>
        <span class="empty-state-desc">Active domains will categorize automatically as focus logs build.</span>
      </div>
    `;
  } else {
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
          <div class="progress-bar-fg category-bar" style="--progress-pct: ${pct}%"></div>
        </div>
      `;
      categoriesListEl.appendChild(catDiv);
    });
  }

  // Render Transition Graph Visualizer
  await renderTransitionGraph();

  // Hide skeleton loading and show dashboard content
  document.getElementById('reportSkeletonState').style.display = 'none';
  document.getElementById('reportRealContent').style.display = 'block';
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
      diffStr = `${diffMins}m`;
    }
  }

  // Distractions color: Down is Good (Green), Up is Bad (Red)
  let isGood = diff > 0;
  if (type === 'distractions') {
    isGood = diff < 0;
  }

  el.textContent = `${arrow} ${diffStr} from last week.`;
  el.className = `metric-trend ${isGood ? 'trend-up' : 'trend-down'}`;
}

// Render dynamic highlight weekly insight chip
function renderWeeklyHighlight(reportData) {
  const container = document.getElementById('weeklyHighlightContainer');
  if (!container) return;
  container.innerHTML = '';

  const curr = reportData.current;
  const prev = reportData.previous;

  let highlightText = '';
  
  // 1. Biggest Improvement: Context Switching drop
  if (prev && prev.distractionsCount > 0) {
    const diffSw = curr.distractionsCount - prev.distractionsCount;
    if (diffSw < 0) {
      const pct = Math.round((Math.abs(diffSw) / prev.distractionsCount) * 100);
      if (pct >= 15) {
        highlightText = `Biggest Improvement: Context Switching ↓ ${pct}%`;
      }
    }
  }

  // 2. Longest focus session duration
  if (!highlightText && curr.averageSessionLength > 45 * 60 * 1000) {
    const avgMins = Math.round(curr.averageSessionLength / 60000);
    highlightText = `Longest Focus Session: ${avgMins} minutes average`;
  }

  // 3. Most Productive Domain
  if (!highlightText && curr.topDomainsList && curr.topDomainsList.length > 0) {
    highlightText = `Most Productive Domain: ${curr.topDomainsList[0].domain}`;
  }

  if (highlightText) {
    const chip = document.createElement('div');
    chip.className = 'weekly-highlight-chip';
    chip.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z"/></svg>
      <span>${highlightText}</span>
    `;
    container.appendChild(chip);
  }
}

// Render transition directed graph via SVG
async function renderTransitionGraph() {
  const svg = document.getElementById('transitionSvg');
  if (!svg) return;
  svg.innerHTML = '';

  let graph = null;
  if (isDemoMode) {
    graph = {
      nodes: [
        { id: "github.com", label: "github.com", type: "domain" },
        { id: "ws-coding", label: "Coding Workspace", type: "workspace" },
        { id: "chatgpt.com", label: "chatgpt.com", type: "domain" },
        { id: "stackoverflow.com", label: "stackoverflow.com", type: "domain" },
        { id: "notion.so", label: "notion.so", type: "domain" }
      ],
      edges: [
        { source: "ws-coding", target: "github.com", weight: 42, type: "directed" },
        { source: "github.com", target: "chatgpt.com", weight: 28, type: "directed" },
        { source: "github.com", target: "stackoverflow.com", weight: 15, type: "directed" },
        { source: "stackoverflow.com", target: "ws-coding", weight: 9, type: "directed" },
        { source: "chatgpt.com", target: "notion.so", weight: 4, type: "directed" }
      ]
    };
  } else {
    try {
      graph = await getAttentionGraph();
    } catch (err) {
      console.error('Failed to get attention graph:', err);
    }
  }

  if (!graph || graph.nodes.length < 2) {
    svg.innerHTML = `
      <foreignObject x="150" y="80" width="400" height="200">
        <div class="empty-state-card" style="min-height: 200px;">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          <span class="empty-state-title">No transition data yet</span>
          <span class="empty-state-desc">Browsing patterns will appear after multiple focus sessions.</span>
        </div>
      </foreignObject>
    `;
    return;
  }

  const { nodes, edges } = graph;

  // Draw Marker for Arrowheads
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <marker id="arrow" viewBox="0 0 10 10" refX="32" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--text-muted)" />
    </marker>
  `;
  svg.appendChild(defs);

  // Define node positions symmetrically in a circle
  const centerX = 350;
  const centerY = 175;
  const radius = 110;

  const nodePositions = {};
  nodes.forEach((node, index) => {
    const angle = (index * 2 * Math.PI) / nodes.length - Math.PI / 2;
    nodePositions[node.id] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      radius: node.type === 'workspace' ? 38 : 30
    };
  });

  // 1. Draw directed arrow paths
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
      
      const strokeWidth = Math.min(8, 1.5 + edge.weight / 2.5);
      line.setAttribute('stroke-width', strokeWidth);
      const opacity = edge.weight <= 2 ? '0.25' : '0.65';
      line.setAttribute('opacity', opacity);
      svg.appendChild(line);

      // Label showing weight
      const midX = (x1 + x2) / 2 + 10 * uy;
      const midY = (y1 + y2) / 2 - 10 * ux;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', midX);
      label.setAttribute('y', midY);
      label.setAttribute('fill', 'var(--text-muted)');
      label.setAttribute('font-size', '10px');
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
    txt.setAttribute('font-size', node.type === 'workspace' ? '11px' : '10px');
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
    card.setAttribute('tabindex', '0');

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

    const expandBtn = document.createElement('div');
    expandBtn.className = 'scorecard-expand-btn';
    expandBtn.setAttribute('tabindex', '0');
    expandBtn.setAttribute('role', 'button');
    expandBtn.setAttribute('aria-expanded', 'false');
    expandBtn.textContent = 'How is this calculated?';

    const ruleDiv = document.createElement('div');
    ruleDiv.className = 'scorecard-rule hidden';
    ruleDiv.innerHTML = `<strong>Calculation Rule:</strong><br>${item.rule}`;

    card.appendChild(header);
    card.appendChild(reason);
    card.appendChild(expandBtn);
    card.appendChild(ruleDiv);

    const toggleRule = (e) => {
      e.stopPropagation();
      const isHidden = ruleDiv.classList.toggle('hidden');
      expandBtn.setAttribute('aria-expanded', !isHidden ? 'true' : 'false');
    };

    expandBtn.addEventListener('click', toggleRule);
    expandBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleRule(e);
      }
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
    listEl.innerHTML = `
      <div class="empty-state-card" style="grid-column: span 2;">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
        <span class="empty-state-title">No recommendations yet</span>
        <span class="empty-state-desc">Complete additional sessions to unlock workflow insights.</span>
      </div>
    `;
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
