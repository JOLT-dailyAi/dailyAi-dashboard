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
        
        let runData = {
            ts: '',
            status: 'Unknown',
            summary: { fetched: '0', finalImages: '0', finalVideos: '0' },
            steps: {
                filterNew: { input: '0', passed: '0' },
                extract: { input: '0', passed: '0', failedMissing: '0', failedDup: '0', droppedUrls: [] },
                validate: { input: '0', passed: '0', failedDead: '0', droppedUrls: [] },
                upload: { input: '0', passed: '0', failedUnsupported: '0', droppedUrls: [] }
            },
            isLegacy: false
        };
        
        if (lines.length > 0) {
            const matchTs = lines[lines.length-1].match(/^([\d-]+ [\d:,]+)/);
            if (matchTs) runData.ts = matchTs[1];
        }

        lines.forEach(line => {
            if (line.includes('======== END: ')) {
                if (line.includes('success')) runData.status = 'Success';
                else if (line.includes('no new messages')) runData.status = 'No New Messages';
                else runData.status = 'Failed';
            }
            
            // --- Legacy Log Matching ---
            if (line.includes('Discord → fetched')) {
                const m = line.match(/fetched (\d+) messages/);
                if (m) { runData.summary.fetched = m[1]; runData.isLegacy = true; }
            }
            if (line.includes('Filter New Messages →')) {
                const m = line.match(/→ (\d+) new messages/);
                if (m) { runData.steps.filterNew.passed = m[1]; runData.isLegacy = true; }
            }
            if (line.includes('Remove Duplicates →')) {
                const m = line.match(/→ (\d+) IDs already in sheets/);
                if (m) { runData.steps.extract.failedDup = m[1]; runData.isLegacy = true; }
            }
            if (line.includes('Appended') && line.includes('image rows') && !line.includes('google_sheets_api.py')) {
                const m = line.match(/Appended (\d+) image rows/);
                if (m) runData.summary.finalImages = m[1];
            }
            if (line.includes('Appended') && line.includes('video rows') && !line.includes('google_sheets_api.py')) {
                const m = line.match(/Appended (\d+) video rows/);
                if (m) runData.summary.finalVideos = m[1];
            }
            if (line.includes('HTTP Request') && line.includes('dead link')) {
                const m = line.match(/dead link.*?:\s*(https?:\/\/[^\s]+)/);
                if (m) runData.steps.validate.droppedUrls.push(m[1].trim());
            }

            // --- New Explicit Log Matching ---
            if (line.includes('Node 2 [discord_api.py] | Fetched')) {
                const m = line.match(/Fetched (\d+) messages/);
                if (m) runData.summary.fetched = m[1];
            }
            if (line.includes('Node 4 [filter_new_messages.py] | Input:')) {
                const m = line.match(/Input: (\d+), Passed: (\d+)/);
                if (m) { runData.steps.filterNew.input = m[1]; runData.steps.filterNew.passed = m[2]; }
            }
            if (line.includes('Node 6-7 [extract_reddit_post_id.py] | Input:')) {
                const m = line.match(/Input: (\d+), Passed: (\d+), Failed \(Missing Data\): (\d+), Failed \(Duplicate\): (\d+)/);
                if (m) {
                    runData.steps.extract.input = m[1];
                    runData.steps.extract.passed = m[2];
                    runData.steps.extract.failedMissing = m[3];
                    runData.steps.extract.failedDup = m[4];
                }
            }
            if (line.includes('Node 6-7 [extract_reddit_post_id.py] | Dropped')) {
                const m = line.match(/Dropped \((.*?)\): (https?:\/\/[^\s]+)/);
                if (m) runData.steps.extract.droppedUrls.push(`[${m[1]}] ${m[2].trim()}`);
            }
            if (line.includes('Node 8 [url_validator.py] | Input:')) {
                const m = line.match(/Input: (\d+), Passed: (\d+), Failed \(Dead\): (\d+)/);
                if (m) {
                    runData.steps.validate.input = m[1];
                    runData.steps.validate.passed = m[2];
                    runData.steps.validate.failedDead = m[3];
                }
            }
            if (line.includes('Node 8 [url_validator.py] | Dropped')) {
                const m = line.match(/Dropped \(Dead Link\): (https?:\/\/[^\s]+)/);
                if (m) runData.steps.validate.droppedUrls.push(m[1].trim());
            }
            if (line.includes('Node 9 [prepare_for_upload.py] | Input:')) {
                const m = line.match(/Input: (\d+), Passed: (\d+), Failed \(Unsupported\): (\d+)/);
                if (m) {
                    runData.steps.upload.input = m[1];
                    runData.steps.upload.passed = m[2];
                    runData.steps.upload.failedUnsupported = m[3];
                }
            }
            if (line.includes('Node 9 [prepare_for_upload.py] | Dropped')) {
                const m = line.match(/Dropped \(Unsupported Type\): (https?:\/\/[^\s]+)/);
                if (m) runData.steps.upload.droppedUrls.push(m[1].trim());
            }
            if (line.includes('Node 10 [google_sheets_api.py] | Appended')) {
                const m = line.match(/Appended (\d+) image rows/);
                if (m) runData.summary.finalImages = m[1];
            }
            if (line.includes('Node 11 [google_sheets_api.py] | Appended')) {
                const m = line.match(/Appended (\d+) video rows/);
                if (m) runData.summary.finalVideos = m[1];
            }
        });

        return runData;
    }

    function renderLogPanel(runs, cardElement) {
        const latestRun = runs[0] ? parseRunText(runs[0]) : null;
        if (!latestRun) return;

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
                
                <div class="run-summary">
                    <div class="run-stat summary-stat">Fetched: <span>${run.summary.fetched}</span></div>
                    <div class="run-stat summary-stat">Final Images: <span>${run.summary.finalImages}</span></div>
                    <div class="run-stat summary-stat">Final Videos: <span>${run.summary.finalVideos}</span></div>
                </div>
        `;

        if (run.isLegacy) {
            html += `
                <div class="run-steps-legacy">
                    <i>(Legacy Log Format)</i>
                    <div class="run-stat">New Msgs: <span>${run.steps.filterNew.passed}</span></div>
                    <div class="run-stat">Duplicates: <span>${run.steps.extract.failedDup}</span></div>
                </div>
            `;
            if (run.steps.validate.droppedUrls.length > 0) {
                html += generateDroppedUrlsHtml("Failed/Dead Links", run.steps.validate.droppedUrls);
            }
        } else {
            html += `
                <div class="run-steps">
                    <div class="run-step">
                        <div class="step-title">1. Filter New Messages</div>
                        <div class="step-stats">Input: <b>${run.steps.filterNew.input}</b> | Passed: <b>${run.steps.filterNew.passed}</b></div>
                    </div>
                    
                    <div class="run-step">
                        <div class="step-title">2. Extract & Pre-Filter</div>
                        <div class="step-stats">Input: <b>${run.steps.extract.input}</b> | Passed: <b>${run.steps.extract.passed}</b></div>
                        <div class="step-stats error-text">Failed Missing Data: <b>${run.steps.extract.failedMissing}</b> | Duplicate: <b>${run.steps.extract.failedDup}</b></div>
                        ${run.steps.extract.droppedUrls.length > 0 ? generateDroppedUrlsHtml("Dropped URLs", run.steps.extract.droppedUrls) : ''}
                    </div>

                    <div class="run-step">
                        <div class="step-title">3. URL Validation</div>
                        <div class="step-stats">Input: <b>${run.steps.validate.input}</b> | Passed: <b>${run.steps.validate.passed}</b></div>
                        <div class="step-stats error-text">Failed (Dead): <b>${run.steps.validate.failedDead}</b></div>
                        ${run.steps.validate.droppedUrls.length > 0 ? generateDroppedUrlsHtml("Dead Links", run.steps.validate.droppedUrls) : ''}
                    </div>

                    <div class="run-step">
                        <div class="step-title">4. Prepare For Upload</div>
                        <div class="step-stats">Input: <b>${run.steps.upload.input}</b> | Passed: <b>${run.steps.upload.passed}</b></div>
                        <div class="step-stats error-text">Failed (Unsupported): <b>${run.steps.upload.failedUnsupported}</b></div>
                        ${run.steps.upload.droppedUrls.length > 0 ? generateDroppedUrlsHtml("Unsupported URLs", run.steps.upload.droppedUrls) : ''}
                    </div>
                </div>
            `;
        }

        html += `</div>`;
        return html;
    }

    function generateDroppedUrlsHtml(label, urls) {
        return `
            <button class="collapsible-toggle" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
                ${label} (${urls.length}) <span class="chevron">▶</span>
            </button>
            <div class="dead-links-list">
                ${urls.map(link => {
                    const cleanLink = link.replace(/^\[.*?\]\s*/, '');
                    return \`<div class="dead-link-item"><a href="\${cleanLink}" target="_blank">\${link}</a></div>\`;
                }).join('')}
            </div>
        `;
    }
});
