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

    let globalDashboardLogs = null;

    async function fetchGlobalLogs() {
        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/logs/dashboard_logs.json`, {
                headers: {
                    'Authorization': `Bearer ${pat}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            if (res.ok) {
                const text = await res.text();
                globalDashboardLogs = JSON.parse(text);
            }
        } catch (e) {
            console.error("Failed to fetch dashboard_logs.json", e);
        }
    }

    async function fetchDashboardData() {
        try {
            await fetchGlobalLogs();
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
            
            // Render the JSON carousel logs directly
            renderCarouselLogs(wf.Workflow, card);
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

    // --- Log Parsing and Rendering (JSON Carousel) ---
    
    function renderCarouselLogs(workflowName, cardElement) {
        if (!globalDashboardLogs || !globalDashboardLogs[workflowName]) return;
        
        const runs = globalDashboardLogs[workflowName];
        if (runs.length === 0) return;

        let html = `
            <div class="log-panel">
                <div class="log-panel-title">Execution Logs</div>
                <div class="carousel-container" id="carousel-${workflowName}">
                    <div class="carousel-track" id="track-${workflowName}">
        `;

        runs.forEach((run, index) => {
            html += generateRunHtml(run, index + 1, runs.length);
        });

        html += `
                    </div>
                </div>
            </div>
        `;
        
        const panel = document.createElement('div');
        panel.innerHTML = html;
        cardElement.appendChild(panel.firstElementChild);

        // Attach event listeners for this carousel
        setupCarousel(workflowName, runs.length);
    }

    function generateRunHtml(run, currentIdx, totalIdx) {
        let statusClass = 'run-info';
        if (run.status.includes('Success')) statusClass = 'run-success';
        else if (run.status.includes('Failed')) statusClass = 'run-error';
        
        const headerFooter = `
            <div class="run-header">
                <span class="run-ts">${run.timestamp} | ${run.status}</span>
                <span class="run-counter">${currentIdx} / ${totalIdx}</span>
            </div>
        `;

        let html = `
            <div class="carousel-slide">
                <div class="run-block ${statusClass}">
                    ${headerFooter}
                    
                    <div class="run-summary">
                        <div class="run-stat summary-stat">Images: <span>${run.images_appended}</span></div>
                        <div class="run-stat summary-stat">Videos: <span>${run.videos_appended}</span></div>
                    </div>
                    
                    <div class="run-steps">
        `;

        if (run.funnel && run.funnel.length > 0) {
            run.funnel.forEach((step, idx) => {
                html += `
                    <div class="run-step">
                        <div class="step-stats">
                            Input (${step.input}) → <b>[${step.function_name}]</b> → Result (${step.passed} pass, <span class="${step.failed > 0 ? 'error-text' : ''}">${step.failed} fail</span>)
                        </div>
                        ${step.failed_urls && step.failed_urls.length > 0 ? generateDroppedUrlsHtml("Failed URLs", step.failed_urls) : ''}
                    </div>
                `;
            });
        } else {
            html += `<div class="run-step"><div class="step-stats">No pipeline steps executed.</div></div>`;
        }

        html += `
                    </div>
                    
                    <div class="run-footer-nav" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
                        <button class="nav-prev glass-btn-small">◀</button>
                        ${headerFooter}
                        <button class="nav-next glass-btn-small">▶</button>
                    </div>
                </div>
            </div>
        `;
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
                    return `<div class="dead-link-item"><a href="${cleanLink}" target="_blank">${link}</a></div>`;
                }).join('')}
            </div>
        `;
    }

    function setupCarousel(workflowName, totalSlides) {
        const track = document.getElementById(`track-${workflowName}`);
        const container = document.getElementById(`carousel-${workflowName}`);
        if (!track || !container) return;

        let currentIndex = 0;

        const updateTransform = () => {
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
        };

        const prevBtns = container.querySelectorAll('.nav-prev');
        const nextBtns = container.querySelectorAll('.nav-next');

        prevBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (currentIndex > 0) {
                    currentIndex--;
                    updateTransform();
                }
            });
        });

        nextBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (currentIndex < totalSlides - 1) {
                    currentIndex++;
                    updateTransform();
                }
            });
        });
    }
});
