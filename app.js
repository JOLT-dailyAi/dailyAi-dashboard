const GITHUB_OWNER = 'JOLT-dailyAi';
const GITHUB_REPO = 'dailyAi';
const WORKFLOW_ID = 'aggregator.yml';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1vcm1LTJov1Chx50WXkAywgQS1HLe6gHBD0vxU6voWJM/export?format=csv&gid=342308422';

const WF_LOG_FILE_MAP = {
    'Desimemes': 'desimemes_latest.txt',
    'AnimeHour': 'animeHour_latest.txt',
    'Cosplay': 'Cosplay_latest.txt',
    'FpsClips': 'FpsClips_latest.txt'
};

document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('login-modal');
    const mainDashboard = document.getElementById('main-dashboard');
    const patInput = document.getElementById('github-pat');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const errorMsg = document.getElementById('login-error');
    const grid = document.getElementById('workflows-grid');
    const triggerAllBtn = document.getElementById('trigger-all-btn');
    
    if (triggerAllBtn) {
        triggerAllBtn.addEventListener('click', (e) => {
            triggerGitHubAction(e.target, 'all');
        });
    }
    
    // Check Auth
    let pat = localStorage.getItem('github_pat');
    if (pat) {
        showDashboard();
    } else {
        loginModal.style.display = 'flex';
    }

    loginBtn.addEventListener('click', async () => {
        const token = patInput.value.trim();
        if (!token) return;
        
        loginBtn.innerText = 'Verifying...';
        
        // Verify token by fetching user
        try {
            const res = await fetch('https://api.github.com/user', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                localStorage.setItem('github_pat', token);
                pat = token;
                loginModal.style.display = 'none';
                showDashboard();
            } else {
                errorMsg.style.display = 'block';
            }
        } catch (e) {
            errorMsg.style.display = 'block';
        }
        loginBtn.innerText = 'Connect';
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('github_pat');
        pat = null;
        mainDashboard.style.display = 'none';
        loginModal.style.display = 'flex';
        patInput.value = '';
    });

    refreshBtn.addEventListener('click', () => {
        fetchDashboardData();
        showToast('Refreshing status...', 'info');
    });

    async function showDashboard() {
        mainDashboard.style.display = 'block';
        await fetchDashboardData();
    }

    async function fetchDashboardData() {
        try {
            const res = await fetch(SHEET_CSV_URL);
            if (!res.ok) throw new Error('Failed to fetch Google Sheet CSV. Check share permissions.');
            const csvText = await res.text();
            
            // Robust CSV parser
            const rows = csvText.split('\n').map(row => {
                // Split by comma, but ignore commas inside quotes
                const matches = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
                return matches.map(val => val.trim().replace(/^"|"$/g, ''));
            });
            
            const headers = rows[0];
            const data = rows.slice(1).filter(r => r.length > 1).map(row => {
                let obj = {};
                row.forEach((val, i) => obj[headers[i]] = val);
                return obj;
            });

            renderCards(data);
        } catch (e) {
            showToast(e.message, 'error');
        }
    }

    function renderCards(workflows) {
        grid.innerHTML = '';
        workflows.forEach(wf => {
            const card = document.createElement('div');
            card.className = 'glass-card';
            
            const isSuccess = wf.Status?.includes('Success');
            const statusColor = isSuccess ? '#22c55e' : (wf.Status?.includes('Failed') ? '#ef4444' : '#3b82f6');
            
            card.innerHTML = `
                <div class="card-header">
                    <h2 class="card-title">${wf.Workflow || 'Unknown'}</h2>
                    <span class="status-badge" style="color: ${statusColor}; border: 1px solid ${statusColor}">
                        ${wf.Status || 'Pending'}
                    </span>
                </div>
                
                <div class="card-meta">
                    <div class="meta-row">
                        <span class="meta-label">Last Message ID</span>
                        <span class="meta-value">${wf.LastMessageId || 'N/A'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Images Appended</span>
                        <span class="meta-value">${wf.ImagesAppended || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Videos Appended</span>
                        <span class="meta-value">${wf.VideosAppended || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Last Run</span>
                        <span class="meta-value" style="font-size: 0.85rem">${wf.LastRunTimeIST || wf.LastRunTime || 'Never'}</span>
                    </div>
                </div>
                
                <button class="glow-btn trigger-btn">Trigger Automation</button>
            `;
            
            card.querySelector('.trigger-btn').addEventListener('click', (e) => {
                triggerGitHubAction(e.target, wf.Workflow);
            });
            
            grid.appendChild(card);
            
            // Asynchronously fetch and render logs for this card
            fetchAndParseLogs(wf.Workflow, card);
        });
    }

    async function triggerGitHubAction(btnElement, workflowName) {
        const originalText = btnElement.innerText;
        btnElement.innerText = 'Triggering...';
        btnElement.disabled = true;

        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_ID}/dispatches`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${pat}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    ref: 'main',
                    inputs: { target_workflow: workflowName }
                })
            });

            if (res.ok) {
                showToast('Action triggered! Running in background...', 'success');
                pollForCompletion(btnElement, originalText, workflowName);
            } else {
                const err = await res.json();
                showToast(`Failed to trigger: ${err.message}`, 'error');
                btnElement.innerText = originalText;
                btnElement.disabled = false;
            }
        } catch (e) {
            showToast(`Error: ${e.message}`, 'error');
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }
    }

    async function pollForCompletion(btnElement, originalText, workflowName) {
        // Record the current LastRunTime to compare against
        let initialRunTime = null;
        try {
            const res = await fetch(SHEET_CSV_URL);
            const csvText = await res.text();
            initialRunTime = extractRunTimeForWorkflow(csvText, workflowName);
        } catch (e) {}

        let attempts = 0;
        const maxAttempts = 24; // 2 minutes (every 5s)
        
        const interval = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch(SHEET_CSV_URL);
                const csvText = await res.text();
                const currentRunTime = extractRunTimeForWorkflow(csvText, workflowName);
                
                if (currentRunTime && initialRunTime && currentRunTime !== initialRunTime) {
                    // It changed! The workflow finished.
                    clearInterval(interval);
                    showToast(`${workflowName} finished!`, 'success');
                    btnElement.innerText = originalText;
                    btnElement.disabled = false;
                    fetchDashboardData(); // Refresh UI
                    return;
                }
            } catch (e) {}

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                showToast(`${workflowName} timed out or is taking a while.`, 'info');
                btnElement.innerText = originalText;
                btnElement.disabled = false;
                fetchDashboardData();
            }
        }, 5000);
    }

    function extractRunTimeForWorkflow(csvText, workflowName) {
        const rows = csvText.split('\n').map(row => {
            const matches = row.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
            return matches.map(val => val.trim().replace(/^"|"$/g, ''));
        });
        const headers = rows[0];
        const wfIndex = headers.indexOf('Workflow');
        const rtIndex = headers.indexOf('LastRunTime');
        
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][wfIndex] === workflowName) {
                return rows[i][rtIndex];
            }
        }
        return null;
    }

    function showToast(message, type) {
        const toast = document.getElementById('toast');
        toast.innerText = message;
        toast.style.borderColor = type === 'error' ? '#ef4444' : (type === 'success' ? '#22c55e' : '#3b82f6');
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // --- Log Parsing and Rendering ---
    
    async function fetchAndParseLogs(workflowName, cardElement) {
        const logFileName = WF_LOG_FILE_MAP[workflowName];
        if (!logFileName) return;
        
        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/logs/${logFileName}`, {
                headers: {
                    'Authorization': `Bearer ${pat}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            
            if (!res.ok) throw new Error("Failed to fetch logs");
            const text = await res.text();
            
            // Split by "======== START:" but keep the boundary or at least properly group
            const runs = text.split(/======== START: .*? ========\n/).filter(r => r.trim() !== '');
            if (runs.length === 0) return;
            
            // Reverse to show latest first
            runs.reverse();
            renderLogPanel(runs, cardElement);
        } catch(e) {
            console.error("Log fetch failed:", e);
        }
    }

    function parseRunText(runText) {
        const lines = runText.trim().split('\n');
        let fetched = '0', newMsgs = '0', duplicates = '0';
        let images = '0', videos = '0';
        let deadLinks = [];
        let status = 'Unknown';
        let ts = '';
        
        if (lines.length > 0) {
            // Get timestamp from the last line (the END line usually)
            const matchTs = lines[lines.length-1].match(/^([\d-]+ [\d:,]+)/);
            if (matchTs) ts = matchTs[1];
        }

        lines.forEach(line => {
            if (line.includes('Discord → fetched')) {
                const m = line.match(/fetched (\d+) messages/);
                if (m) fetched = m[1];
            }
            if (line.includes('Filter New Messages →')) {
                const m = line.match(/→ (\d+) new messages/);
                if (m) newMsgs = m[1];
            }
            if (line.includes('Remove Duplicates →')) {
                const m = line.match(/→ (\d+) IDs already in sheets/);
                if (m) duplicates = m[1];
            }
            if (line.includes('Appended') && line.includes('image rows')) {
                const m = line.match(/Appended (\d+) image rows/);
                if (m) images = m[1];
            }
            if (line.includes('Appended') && line.includes('video rows')) {
                const m = line.match(/Appended (\d+) video rows/);
                if (m) videos = m[1];
            }
            if (line.includes('HTTP Request') && line.includes('dead link')) {
                const m = line.match(/dead link.*?:\s*(https?:\/\/[^\s]+)/);
                if (m) deadLinks.push(m[1].trim());
            }
            if (line.includes('======== END: ')) {
                if (line.includes('success')) status = 'Success';
                else if (line.includes('no new messages')) status = 'No New Messages';
                else status = 'Failed';
            }
        });

        return { fetched, newMsgs, duplicates, images, videos, deadLinks, status, ts };
    }

    function renderLogPanel(runs, cardElement) {
        const latestRun = parseRunText(runs[0]);
        const pastRuns = runs.slice(1).map(parseRunText);
        
        let html = `
            <div class="log-panel">
                <div class="log-panel-title">Execution Logs</div>
                ${generateRunHtml(latestRun)}
        `;
        
        if (pastRuns.length > 0) {
            html += `
                <button class="past-runs-toggle" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
                    See/Hide Past Log Runs <span class="chevron">▼</span>
                </button>
                <div class="past-runs-list">
                    ${pastRuns.map(r => generateRunHtml(r)).join('')}
                </div>
            `;
        }
        
        html += `</div>`;
        
        const panel = document.createElement('div');
        panel.innerHTML = html;
        cardElement.appendChild(panel.firstElementChild);
    }

    function generateRunHtml(run) {
        let statusClass = 'run-info';
        if (run.status === 'Success') statusClass = 'run-success';
        if (run.status === 'Failed') statusClass = 'run-error';
        
        let html = `
            <div class="run-block ${statusClass}">
                <div class="run-header">
                    <span class="run-ts">${run.ts}</span>
                    <span class="run-status-tag">${run.status}</span>
                </div>
                <div class="run-stats">
                    <div class="run-stat">Fetched: <span>${run.fetched}</span></div>
                    <div class="run-stat">New Msgs: <span>${run.newMsgs}</span></div>
                    <div class="run-stat">Duplicates: <span>${run.duplicates}</span></div>
                    <div class="run-stat">Images: <span>${run.images}</span></div>
                    <div class="run-stat">Videos: <span>${run.videos}</span></div>
                </div>
        `;
        
        if (run.deadLinks.length > 0) {
            html += `
                <button class="collapsible-toggle" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
                    Failed/Dead Links (${run.deadLinks.length}) <span class="chevron">▶</span>
                </button>
                <div class="dead-links-list">
                    ${run.deadLinks.map(link => `<div class="dead-link-item"><a href="${link}" target="_blank">${link}</a></div>`).join('')}
                </div>
            `;
        }
        
        html += `</div>`;
        return html;
    }
});
