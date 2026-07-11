const GITHUB_OWNER = 'JOLT-dailyAi';
const GITHUB_REPO = 'dailyAi';
const WORKFLOW_ID = 'aggregator.yml';
const UPLOADER_WORKFLOW_ID = 'uploader.yml';
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
    const gridToggleBtn = document.getElementById('grid-toggle-btn');
    
    const uploadersGrid = document.getElementById('uploaders-grid');
    const triggerAllUploadersBtn = document.getElementById('trigger-all-uploaders-btn');
    const uploaderGridToggleBtn = document.getElementById('uploader-grid-toggle-btn');
    
    if (gridToggleBtn) {
        gridToggleBtn.addEventListener('click', () => {
            const isCurrentlyOpen = gridToggleBtn.classList.contains('open');
            
            // Toggle grid state
            gridToggleBtn.classList.toggle('open');
            grid.classList.toggle('collapsed');
            
            // If we are collapsing the grid, collapse all child log panels
            if (isCurrentlyOpen) {
                const openPanels = document.querySelectorAll('.log-panel-title.open');
                openPanels.forEach(panel => {
                    panel.classList.remove('open');
                    const carousel = panel.nextElementSibling;
                    if (carousel && carousel.classList.contains('carousel-container')) {
                        carousel.classList.remove('open');
                    }
                });
            }
        });
    }
    
    if (triggerAllBtn) {
        triggerAllBtn.addEventListener('click', (e) => {
            triggerGitHubAction(e.target, 'all', WORKFLOW_ID);
        });
    }
    
    if (uploaderGridToggleBtn) {
        uploaderGridToggleBtn.addEventListener('click', () => {
            const isCurrentlyOpen = uploaderGridToggleBtn.classList.contains('open');
            uploaderGridToggleBtn.classList.toggle('open');
            uploadersGrid.classList.toggle('collapsed');
        });
    }
    
    if (triggerAllUploadersBtn) {
        triggerAllUploadersBtn.addEventListener('click', (e) => {
            triggerGitHubAction(e.target, 'all', UPLOADER_WORKFLOW_ID);
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
    let globalUploaderLogs = null;

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

    async function fetchUploaderLogs() {
        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/logs/uploader_dashboard_logs.json`, {
                headers: {
                    'Authorization': `Bearer ${pat}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            if (res.ok) {
                const text = await res.text();
                globalUploaderLogs = JSON.parse(text);
            }
        } catch (e) {
            console.error("Failed to fetch uploader logs", e);
        }
    }

    async function fetchDashboardData() {
        try {
            await fetchGlobalLogs();
            await fetchUploaderLogs();
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
            renderUploaderCards();
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
                    <h2 class="card-title">${(wf.Workflow || '').toLowerCase() === 'desimemes' ? 'Memes' : (wf.Workflow || 'Unknown')}</h2>
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
                triggerGitHubAction(e.target, wf.Workflow, WORKFLOW_ID);
            });
            
            grid.appendChild(card);
            
            // Render the JSON carousel logs directly
            renderCarouselLogs(wf.Workflow, card);
        });
    }

    async function triggerGitHubAction(btnElement, workflowName, targetWorkflowId = WORKFLOW_ID) {
        const originalText = btnElement.innerText;
        btnElement.innerText = 'Triggering...';
        
        // Disable ALL action buttons to prevent parallel runs
        const allTriggers = document.querySelectorAll('.trigger-btn, #trigger-all-btn, #trigger-all-uploaders-btn');
        allTriggers.forEach(btn => btn.disabled = true);

        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${targetWorkflowId}/dispatches`, {
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
                allTriggers.forEach(btn => btn.disabled = false);
            }
        } catch (e) {
            showToast(`Error: ${e.message}`, 'error');
            btnElement.innerText = originalText;
            allTriggers.forEach(btn => btn.disabled = false);
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

        const enableAllButtons = () => {
            btnElement.innerText = originalText;
            const allTriggers = document.querySelectorAll('.trigger-btn, #trigger-all-btn, #trigger-all-uploaders-btn');
            allTriggers.forEach(btn => btn.disabled = false);
        };

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
                    enableAllButtons();
                    fetchDashboardData(); // Refresh UI
                    return;
                }
            } catch (e) {}

            if (attempts >= maxAttempts) {
                clearInterval(interval);
                showToast(`${workflowName} timed out or is taking a while.`, 'info');
                enableAllButtons();
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
    
    function renderCarouselLogs(workflowName, cardElement, providedRuns = null) {
        let runs = providedRuns;
        if (!runs) {
            if (!globalDashboardLogs || !globalDashboardLogs[workflowName]) return;
            runs = globalDashboardLogs[workflowName];
        }
        
        if (!runs || runs.length === 0) return;

        let html = `
            <div class="log-panel">
                <button class="log-panel-title collapsible-toggle" style="width: 100%; justify-content: space-between; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 0.5rem 1rem;" onclick="this.classList.toggle('open'); document.getElementById('carousel-${workflowName}').classList.toggle('open')">
                    Execution Logs <span class="chevron" style="display: inline-block; transition: transform 0.25s;">▶</span>
                </button>
                <div class="carousel-container" id="carousel-${workflowName}" style="display: none; margin-top: 10px;">
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
        
        const navHtml = `
            <div class="run-footer-nav" style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 10px; margin-bottom: 10px;">
                <button class="nav-prev glass-btn-small">◀</button>
                <div class="run-header" style="margin-bottom: 0; flex: 1; display: flex; justify-content: space-between; padding: 0 15px;">
                    <span class="run-ts" style="font-size: 0.85rem;">${run.timestamp} | ${run.status}</span>
                    <span class="run-counter" style="font-size: 0.85rem; font-weight: 600;">${currentIdx} / ${totalIdx}</span>
                </div>
                <button class="nav-next glass-btn-small">▶</button>
            </div>
        `;

        let html = `
            <div class="carousel-slide">
                <div class="run-block ${statusClass}">
                    ${navHtml}
                    
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
                        <div class="step-stats" style="font-size: 0.85rem; padding: 2px 0;">
                            <b>${step.function_name}</b>: ${step.input} in → ${step.passed} pass, <span class="${step.failed > 0 ? 'error-text' : ''}">${step.failed} fail</span>
                        </div>
                        ${step.failed_urls && step.failed_urls.length > 0 ? generateDroppedUrlsHtml("Failed URLs", step.failed_urls) : ''}
                    </div>
                `;
            });
        } else {
            const emptyMsg = (run.videos_appended !== undefined) ? "Uploader finished successfully. (Step-by-step funnel tracking is currently only available for Aggregators)." : "No pipeline steps executed.";
            html += `<div class="run-step"><div class="step-stats" style="font-size: 0.85rem;">${emptyMsg}</div></div>`;
        }

        html += `
                    </div>
                    
                    <div class="run-footer-nav" style="margin-top: 15px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px; border-bottom: none; margin-bottom: 0;">
                        <button class="nav-prev glass-btn-small">◀</button>
                        <div class="run-header" style="margin-bottom: 0; flex: 1; display: flex; justify-content: space-between; padding: 0 15px;">
                            <span class="run-ts" style="font-size: 0.85rem;">${run.timestamp} | ${run.status}</span>
                            <span class="run-counter" style="font-size: 0.85rem; font-weight: 600;">${currentIdx} / ${totalIdx}</span>
                        </div>
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
    
    function renderUploaderCards() {
        if (!uploadersGrid) return;
        uploadersGrid.innerHTML = '';
        const defaultNiches = ['desimemes', 'animeHour', 'Cosplay', 'FpsClips'];
        defaultNiches.forEach(nicheKey => {
            const baseLog = (globalUploaderLogs && globalUploaderLogs[nicheKey.toLowerCase()]) || {};
            const logEntry = baseLog.latest ? baseLog.latest : baseLog;
            
            const card = document.createElement('div');
            card.className = 'glass-card';
            
            const status = logEntry.status || 'Pending';
            const isSuccess = status.includes('Success');
            const statusColor = isSuccess ? '#22c55e' : (status.includes('Failed') ? '#ef4444' : '#3b82f6');
            
            card.innerHTML = `
                <div class="card-header">
                    <h2 class="card-title">${nicheKey.toLowerCase() === 'desimemes' ? 'Memes' : nicheKey}</h2>
                    <span class="status-badge" style="color: ${statusColor}; border: 1px solid ${statusColor}">
                        ${status}
                    </span>
                </div>
                
                <div class="card-meta">
                    <div class="meta-row">
                        <span class="meta-label">IG Followers</span>
                        <span class="meta-value">${logEntry.ig_follower_count || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Discord Members</span>
                        <span class="meta-value">${logEntry.discord_member_count || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Videos Posted</span>
                        <span class="meta-value">${logEntry.videos_posted || '0'}</span>
                    </div>
                </div>
                
                <button class="glow-btn trigger-btn">Trigger Uploader</button>
            `;
            
            card.querySelector('.trigger-btn').addEventListener('click', (e) => {
                triggerGitHubAction(e.target, nicheKey, UPLOADER_WORKFLOW_ID);
            });
            
            uploadersGrid.appendChild(card);
            
            // Render historical logs for Uploader
            const uploaderHistory = baseLog.history || [logEntry]; // Fallback to a 1-item array if no history exists yet
            if (uploaderHistory.length > 0 && Object.keys(uploaderHistory[0]).length > 0) {
                // Map the Uploader log format to what generateRunHtml expects
                const mappedRuns = uploaderHistory.map(run => ({
                    status: run.status || 'Pending',
                    timestamp: run.last_run_time_ist || run.timestamp || 'Unknown',
                    images_appended: 0,
                    videos_appended: run.videos_posted || 0,
                    funnel: run.funnel || []
                }));
                renderCarouselLogs('uploader_' + nicheKey, card, mappedRuns);
            }
        });
    }
});
