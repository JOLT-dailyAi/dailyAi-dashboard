const GITHUB_OWNER = 'JOLT-dailyAi';
const GITHUB_REPO = 'dailyAi';
const WORKFLOW_ID = 'aggregator.yml';
const UPLOADER_WORKFLOW_ID = 'uploader.yml';
const IMAGE_UPLOADER_WORKFLOW_ID = 'image_uploader.yml';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1vcm1LTJov1Chx50WXkAywgQS1HLe6gHBD0vxU6voWJM/export?format=csv&gid=342308422';

const WF_LOG_FILE_MAP = {
    'Desimemes': 'desimemes_latest.txt',
    'AnimeHour': 'animeHour_latest.txt',
    'Cosplay': 'Cosplay_latest.txt',
    'FpsClips': 'FpsClips_latest.txt'
};


function parseCSV(text) {
    let result = [];
    let row = [];
    let inQuotes = false;
    let val = '';
    for (let i = 0; i < text.length; i++) {
        let char = text[i];
        if (char === '"' && text[i+1] === '"') {
            val += '"'; i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(val.trim());
            val = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && text[i+1] === '\n') i++;
            row.push(val.trim());
            result.push(row);
            row = [];
            val = '';
        } else {
            val += char;
        }
    }
    row.push(val.trim());
    if (row.length > 0 && row.some(v => v !== '')) result.push(row);
    return result;
}

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
    
    const imageUploadersGrid = document.getElementById('image-uploaders-grid');
    const triggerAllImageUploadersBtn = document.getElementById('trigger-all-image-uploaders-btn');
    const imageUploaderGridToggleBtn = document.getElementById('image-uploader-grid-toggle-btn');
    
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
    
    if (imageUploaderGridToggleBtn) {
        imageUploaderGridToggleBtn.addEventListener('click', () => {
            const isCurrentlyOpen = imageUploaderGridToggleBtn.classList.contains('open');
            imageUploaderGridToggleBtn.classList.toggle('open');
            imageUploadersGrid.classList.toggle('collapsed');
        });
    }
    
    if (triggerAllImageUploadersBtn) {
        triggerAllImageUploadersBtn.addEventListener('click', (e) => {
            triggerGitHubAction(e.target, 'all', IMAGE_UPLOADER_WORKFLOW_ID);
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
    let globalImageUploaderLogs = null;

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

    async function fetchImageUploaderLogs() {
        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/logs/image_uploader_dashboard_logs.json`, {
                headers: {
                    'Authorization': `Bearer ${pat}`,
                    'Accept': 'application/vnd.github.v3.raw'
                }
            });
            if (res.ok) {
                const text = await res.text();
                globalImageUploaderLogs = JSON.parse(text);
            }
        } catch (e) {
            console.error("Failed to fetch image uploader logs", e);
        }
    }

    async function fetchFollowerStats() {
        const statsBar = document.getElementById('stats-bar');
        if (!statsBar) return;
        statsBar.innerHTML = '';
        
        const niches = [
            { id: 'desimemes', label: 'Memes', assetPath: 'Memes', pfpName: 'desimemes.jpg' },
            { id: 'animeHour', label: 'AnimeHour', assetPath: 'animeHour', pfpName: 'animehour.gif' },
            { id: 'Cosplay', label: 'Cosplay', assetPath: 'cosplay', pfpName: 'cosplay.png' },
            { id: 'FpsClips', label: 'FpsClips', assetPath: 'fpsClips', pfpName: 'fpsclips.png' }
        ];
        
        // Inline SVGs for crisp rendering without extra API calls
        const igSvg = `<svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #E1306C;"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>`;
        const discordSvg = `<svg class="stat-icon" viewBox="0 0 24 24" fill="currentColor" style="color: #5865F2;"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>`;

        for (const niche of niches) {
            try {
                // Fetch stats json
                const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/assets/${niche.assetPath}/Followers_Count/followersCount.json`, {
                    headers: {
                        'Authorization': `Bearer ${pat}`,
                        'Accept': 'application/vnd.github.v3.raw'
                    }
                });
                
                if (res.ok) {
                    const text = await res.text();
                    const data = JSON.parse(text);
                    
                    let pfpSrc = '';
                    try {
                        // Fetch the raw PFP image blob
                        const pfpRes = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/assets/pfps/${niche.pfpName}`, {
                            headers: {
                                'Authorization': `Bearer ${pat}`,
                                'Accept': 'application/vnd.github.v3.raw'
                            }
                        });
                        if (pfpRes.ok) {
                            const blob = await pfpRes.blob();
                            pfpSrc = URL.createObjectURL(blob);
                        }
                    } catch(e) {
                        console.warn(`Failed to fetch PFP for ${niche.label}`, e);
                    }
                    
                    let html = `<div class="stat-item">`;
                    if (pfpSrc) {
                        html += `<img src="${pfpSrc}" class="stat-pfp" alt="${niche.label} PFP">`;
                    }
                    html += `<span class="stat-label">${niche.label}:</span>`;
                    
                    if (data.followers_count) {
                        html += `${igSvg} ${data.followers_count}`;
                    }
                    if (data.member_count) {
                        html += ` <span style="margin-left: 8px; display: inline-flex; align-items: center; gap: 4px;">${discordSvg} ${data.member_count}</span>`;
                    }
                    
                    html += `</div>`;
                    statsBar.innerHTML += html;
                }
            } catch (e) {
                console.warn(`Failed to fetch stats for ${niche.label}`, e);
            }
        }
    }

    async function fetchDashboardData() {
        try {
            await fetchGlobalLogs();
            await fetchUploaderLogs();
            await fetchImageUploaderLogs();
            await fetchFollowerStats();
            const res = await fetch(SHEET_CSV_URL);
            if (!res.ok) throw new Error('Failed to fetch Google Sheet CSV. Check share permissions.');
            const csvText = await res.text();
            
            const rows = parseCSV(csvText);
            
            const headers = rows[0];
            const data = rows.slice(1).filter(r => r.length > 1).map(row => {
                let obj = {};
                // Only take the first 7 columns for the Aggregators to avoid duplicate header overwrites
                row.slice(0, 7).forEach((val, i) => obj[headers[i]] = val);
                return obj;
            });

            renderCards(data);
            renderUploaderCards();
            renderImageUploaderCards();
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
        const allTriggers = document.querySelectorAll('.trigger-btn, #trigger-all-btn, #trigger-all-uploaders-btn, #trigger-all-image-uploaders-btn');
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
            const allTriggers = document.querySelectorAll('.trigger-btn, #trigger-all-btn, #trigger-all-uploaders-btn, #trigger-all-image-uploaders-btn');
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
        const rows = parseCSV(csvText);
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
                        <div class="run-stat summary-stat">Aggregator: <span>${run.aggregator_count ?? run.images_appended ?? 0}</span></div>
                        <div class="run-stat summary-stat">Posted: <span>${run.posted_count ?? run.videos_appended ?? 0}</span></div>
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
                        ${step.details_list && step.details_list.length > 0 ? generateDetailsHtml(step.details_label || "Details", step.details_list) : ''}
                    </div>
                `;
            });
        } else {
            const emptyMsg = (run.videos_appended !== undefined || run.posted_count !== undefined) ? "Uploader finished successfully. (Step-by-step funnel tracking is currently only available for Aggregators)." : "No pipeline steps executed.";
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
    
    function generateDetailsHtml(label, items) {
        return `
            <button class="collapsible-toggle" onclick="this.classList.toggle('open'); this.nextElementSibling.classList.toggle('open')">
                ${label} (${items.length}) <span class="chevron">▶</span>
            </button>
            <div class="dead-links-list">
                ${items.map(item => {
                    // Simple text div instead of anchor tag
                    return `<div class="dead-link-item" style="white-space: pre-wrap; font-size: 0.8rem; padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05);">${item}</div>`;
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
    

    function parseISTDateString(dateString) {
        if (!dateString || dateString === 'Never' || dateString === 'Unknown') return null;
        const match = dateString.match(/(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}):(\d{2}) (AM|PM)/);
        if (!match) return new Date(dateString);
        const [_, datePart, h, m, s, ampm] = match;
        let hour = parseInt(h, 10);
        if (ampm === 'PM' && hour < 12) hour += 12;
        if (ampm === 'AM' && hour === 12) hour = 0;
        return new Date(`${datePart}T${hour.toString().padStart(2, '0')}:${m}:${s}+05:30`);
    }

    function checkUploaderEligibility(uploaderHistory) {
        if (!uploaderHistory || uploaderHistory.length === 0) return { canRun: true, reason: '' };
        
        const now = new Date();
        const lastRun = parseISTDateString(uploaderHistory[0].last_run_time_ist || uploaderHistory[0].timestamp);
        const lastStatus = uploaderHistory[0].status || '';
        const postedCount = uploaderHistory[0].posted_count || 0;
        const isFailed = lastStatus.toLowerCase().includes('failed') || lastStatus.toLowerCase().includes('partial success');
        
        if (lastRun) {
            const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);
            
            // Apply the 12-hour cooldown unless it failed AND posted 0 videos.
            if (hoursSinceLastRun < 12 && (!isFailed || postedCount > 0)) {
                const nextRunDate = new Date(lastRun.getTime() + 12 * 60 * 60 * 1000);
                const nextRunStr = nextRunDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                return { 
                    canRun: false, 
                    reason: `Last run was only ${Math.round(hoursSinceLastRun * 10) / 10}h ago (Wait 12h)`,
                    nextRunLabel: `Next: ${nextRunStr}`
                };
            }
        }
        
        let postedLast24h = 0;
        for (const run of uploaderHistory) {
            const runDate = parseISTDateString(run.last_run_time_ist || run.timestamp);
            if (runDate) {
                const hoursSinceRun = (now - runDate) / (1000 * 60 * 60);
                if (hoursSinceRun <= 24) {
                    postedLast24h += (run.posted_count || 0);
                } else {
                    break;
                }
            }
        }
        
        if (postedLast24h > 13) {
            return { 
                canRun: false, 
                reason: `Posted ${postedLast24h} videos in last 24h (Limit is 13 to avoid hitting IG 25 cap)`,
                nextRunLabel: "IG Limit Reached"
            };
        }
        
        return { canRun: true, reason: '', nextRunLabel: '' };
    }

    function renderUploaderCards() {
        if (!uploadersGrid) return;
        uploadersGrid.innerHTML = '';
        const defaultNiches = ['desimemes', 'animeHour', 'Cosplay', 'FpsClips'];
        let anyIneligible = false;
        defaultNiches.forEach(nicheKey => {
            const baseLog = (globalUploaderLogs && globalUploaderLogs[nicheKey.toLowerCase()]) || {};
            const logEntry = baseLog.latest ? baseLog.latest : baseLog;
            const uploaderHistory = baseLog.history || (Object.keys(logEntry).length ? [logEntry] : []);
            
            const eligibility = checkUploaderEligibility(uploaderHistory);
            if (!eligibility.canRun) {
                anyIneligible = true;
            }
            
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
                        <span class="meta-label">Aggregator</span>
                        <span class="meta-value">${logEntry.aggregator_count || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Posted</span>
                        <span class="meta-value">${logEntry.posted_count || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Videos Posted to IG</span>
                        <span class="meta-value">${logEntry.posted_count || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Last Run</span>
                        <span class="meta-value" style="font-size: 0.85rem">${logEntry.last_run_time_ist || 'Never'}</span>
                    </div>
                </div>
                
                <button class="glow-btn trigger-btn ${eligibility.canRun ? '' : 'cooldown-btn'}" 
                    ${eligibility.canRun ? '' : `title="${eligibility.reason}"`}
                    data-cooldown="Cooldown Active"
                    data-nextrun="${eligibility.nextRunLabel}">
                    ${eligibility.canRun ? 'Trigger Uploader' : eligibility.nextRunLabel}
                </button>
            `;
            
            card.querySelector('.trigger-btn').addEventListener('click', (e) => {
                const btn = e.target;
                if (btn.classList.contains('cooldown-btn')) {
                    if (btn.innerText === btn.getAttribute('data-cooldown')) {
                        btn.innerText = btn.getAttribute('data-nextrun');
                    } else {
                        btn.innerText = btn.getAttribute('data-cooldown');
                    }
                    return;
                }
                triggerGitHubAction(btn, nicheKey, UPLOADER_WORKFLOW_ID);
            });
            
            uploadersGrid.appendChild(card);
            
            // Render historical logs for Uploader
                        if (uploaderHistory.length > 0 && Object.keys(uploaderHistory[0]).length > 0) {
                // Map the Uploader log format to what generateRunHtml expects
                const mappedRuns = uploaderHistory.map(run => ({
                    status: run.status || 'Pending',
                    timestamp: run.last_run_time_ist || run.timestamp || 'Unknown',
                    aggregator_count: run.aggregator_count || 0,
                    posted_count: run.posted_count || 0,
                    funnel: run.funnel || []
                }));
                renderCarouselLogs('uploader_' + nicheKey, card, mappedRuns);
            }
        });

        const btnAllUploaders = document.getElementById('trigger-all-uploaders-btn');
        if (btnAllUploaders) {
            if (anyIneligible) {
                btnAllUploaders.disabled = true;
                btnAllUploaders.style.opacity = '0.5';
                btnAllUploaders.style.cursor = 'not-allowed';
                btnAllUploaders.title = 'One or more niches are currently on cooldown or have reached API limits.';
            } else {
                btnAllUploaders.disabled = false;
                btnAllUploaders.style.opacity = '1';
                btnAllUploaders.style.cursor = 'pointer';
                btnAllUploaders.title = '';
            }
        }
    }

    function renderImageUploaderCards() {
        if (!imageUploadersGrid) return;
        imageUploadersGrid.innerHTML = '';
        const defaultNiches = ['desimemes', 'animeHour', 'Cosplay', 'FpsClips'];
        let anyIneligible = false;
        
        defaultNiches.forEach(nicheKey => {
            const baseLog = (globalImageUploaderLogs && globalImageUploaderLogs[nicheKey.toLowerCase()]) || {};
            const logEntry = baseLog.latest ? baseLog.latest : baseLog;
            const uploaderHistory = baseLog.history || (Object.keys(logEntry).length ? [logEntry] : []);
            
            // Re-use eligibility check (image_uploader uploads 1 reel per run, limits rarely hit, but keeps it safe)
            const eligibility = checkUploaderEligibility(uploaderHistory);
            if (!eligibility.canRun) {
                anyIneligible = true;
            }
            
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
                        <span class="meta-label">Buffer Filtered</span>
                        <span class="meta-value">${logEntry.aggregator_count || '0'}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Compilation Reels</span>
                        <span class="meta-value">${Array.isArray(logEntry.videos_posted_to_ig) ? logEntry.videos_posted_to_ig.length : (typeof logEntry.posted_count === 'number' ? logEntry.posted_count : '0')}</span>
                    </div>
                    <div class="meta-row">
                        <span class="meta-label">Last Run</span>
                        <span class="meta-value" style="font-size: 0.85rem">${logEntry.last_run_time_ist || 'Never'}</span>
                    </div>
                </div>
                
                <button class="glow-btn trigger-btn ${eligibility.canRun ? '' : 'cooldown-btn'}" 
                    ${eligibility.canRun ? '' : `title="${eligibility.reason}"`}
                    data-cooldown="Cooldown Active"
                    data-nextrun="${eligibility.nextRunLabel}">
                    ${eligibility.canRun ? 'Trigger Image Uploader' : eligibility.nextRunLabel}
                </button>
            `;
            
            card.querySelector('.trigger-btn').addEventListener('click', (e) => {
                const btn = e.target;
                if (btn.classList.contains('cooldown-btn')) {
                    if (btn.innerText === btn.getAttribute('data-cooldown')) {
                        btn.innerText = btn.getAttribute('data-nextrun');
                    } else {
                        btn.innerText = btn.getAttribute('data-cooldown');
                    }
                    return;
                }
                triggerGitHubAction(btn, nicheKey, IMAGE_UPLOADER_WORKFLOW_ID);
            });
            
            imageUploadersGrid.appendChild(card);
            
            if (uploaderHistory.length > 0 && Object.keys(uploaderHistory[0]).length > 0) {
                const mappedRuns = uploaderHistory.map(run => ({
                    status: run.status || 'Pending',
                    timestamp: run.last_run_time_ist || run.timestamp || 'Unknown',
                    aggregator_count: run.aggregator_count || 0,
                    posted_count: run.posted_count || 0,
                    funnel: run.funnel || []
                }));
                renderCarouselLogs('image_uploader_' + nicheKey, card, mappedRuns);
            }
        });

        const btnAllImageUploaders = document.getElementById('trigger-all-image-uploaders-btn');
        if (btnAllImageUploaders) {
            if (anyIneligible) {
                btnAllImageUploaders.disabled = true;
                btnAllImageUploaders.style.opacity = '0.5';
                btnAllImageUploaders.style.cursor = 'not-allowed';
                btnAllImageUploaders.title = 'One or more niches are currently on cooldown or have reached API limits.';
            } else {
                btnAllImageUploaders.disabled = false;
                btnAllImageUploaders.style.opacity = '1';
                btnAllImageUploaders.style.cursor = 'pointer';
                btnAllImageUploaders.title = '';
            }
        }
    }

    // MASTER SCHEDULER LOGIC
    const schedulerToggleBtn = document.getElementById('scheduler-toggle-btn');
    const masterSchedulerContainer = document.getElementById('master-scheduler-container');
    const schedulerContent = document.getElementById('scheduler-content');
    const schedulerList = document.getElementById('scheduler-list');
    const saveScheduleBtn = document.getElementById('save-schedule-btn');

    let currentScheduleData = null;
    let scheduleFileSha = null;

    if (schedulerToggleBtn) {
        schedulerToggleBtn.addEventListener('click', () => {
            schedulerToggleBtn.classList.toggle('open');
            schedulerContent.style.display = schedulerToggleBtn.classList.contains('open') ? 'block' : 'none';
        });
    }

    async function fetchMasterSchedule() {
        if (!pat) return;
        try {
            const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/schedule/master_schedule.json`, {
                headers: {
                    'Authorization': `Bearer ${pat}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (res.ok) {
                if (masterSchedulerContainer) masterSchedulerContainer.style.display = 'block';
                const data = await res.json();
                scheduleFileSha = data.sha;
                
                // Decode base64 content
                const contentStr = decodeURIComponent(escape(atob(data.content)));
                currentScheduleData = JSON.parse(contentStr);
                
                renderMasterSchedule();
            } else {
                console.warn("No master_schedule.json found, skipping scheduler section.");
                if (masterSchedulerContainer) masterSchedulerContainer.style.display = 'none';
            }
        } catch (e) {
            console.error("Failed to fetch master schedule:", e);
        }
    }

    function renderMasterSchedule() {
        if (!schedulerList) return;
        schedulerList.innerHTML = '';
        if (!currentScheduleData) return;

        for (const [niche, config] of Object.entries(currentScheduleData)) {
            const row = document.createElement('div');
            row.style.display = 'grid';
            row.style.gridTemplateColumns = '2fr 3fr 3fr 1fr';
            row.style.gap = '15px';
            row.style.alignItems = 'center';
            row.style.padding = '15px 0';
            row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

            const isActive = config.active !== false;

            // Niche Name
            const nicheDiv = document.createElement('div');
            nicheDiv.style.fontWeight = '600';
            nicheDiv.style.textTransform = 'capitalize';
            nicheDiv.innerText = niche === 'desimemes' ? 'Memes' : niche;

            // Uploader array
            const uploaderDiv = document.createElement('div');
            uploaderDiv.appendChild(createBadgeEditor(niche, 'uploader', config.uploader || []));

            // Image Uploader array
            const imgUploaderDiv = document.createElement('div');
            imgUploaderDiv.appendChild(createBadgeEditor(niche, 'image_uploader', config.image_uploader || []));

            // Toggle
            const toggleDiv = document.createElement('div');
            toggleDiv.style.textAlign = 'right';
            const toggleLabel = document.createElement('label');
            toggleLabel.className = 'switch';
            toggleLabel.innerHTML = `
                <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleWorkflowActive('${niche}', this.checked)">
                <span class="slider round"></span>
            `;
            toggleDiv.appendChild(toggleLabel);

            row.appendChild(nicheDiv);
            row.appendChild(uploaderDiv);
            row.appendChild(imgUploaderDiv);
            row.appendChild(toggleDiv);

            schedulerList.appendChild(row);
        }
    }

    function createBadgeEditor(niche, type, hoursArray) {
        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '5px';
        container.style.alignItems = 'center';

        hoursArray.forEach(hour => {
            const badge = document.createElement('span');
            badge.style.background = 'rgba(59, 130, 246, 0.2)';
            badge.style.border = '1px solid rgba(59, 130, 246, 0.5)';
            badge.style.padding = '2px 8px';
            badge.style.borderRadius = '12px';
            badge.style.fontSize = '0.85rem';
            badge.style.display = 'flex';
            badge.style.alignItems = 'center';
            badge.style.gap = '4px';
            
            badge.innerHTML = `
                ${hour} 
                <span style="cursor:pointer; color:#ef4444; font-weight:bold; margin-left:4px;" onclick="removeScheduleHour('${niche}', '${type}', '${hour}')">×</span>
            `;
            container.appendChild(badge);
        });

        // Add button
        const addBtn = document.createElement('button');
        addBtn.innerText = '+ Add';
        addBtn.className = 'glass-btn-small';
        addBtn.style.padding = '2px 8px';
        addBtn.style.fontSize = '0.8rem';
        addBtn.onclick = () => {
            const val = prompt(`Enter time for ${niche} ${type} (e.g., '5 AM', '2 PM'):`);
            if (val) addScheduleHour(niche, type, val.trim().toUpperCase());
        };
        container.appendChild(addBtn);

        return container;
    }

    window.toggleWorkflowActive = function(niche, isActive) {
        if (currentScheduleData && currentScheduleData[niche]) {
            currentScheduleData[niche].active = isActive;
        }
    };

    window.removeScheduleHour = function(niche, type, hour) {
        if (currentScheduleData && currentScheduleData[niche] && currentScheduleData[niche][type]) {
            currentScheduleData[niche][type] = currentScheduleData[niche][type].filter(h => h !== hour);
            renderMasterSchedule();
        }
    };

    window.addScheduleHour = function(niche, type, hour) {
        // Simple validation for AM/PM format
        if (!hour.match(/^(1[0-2]|[1-9])\s?(AM|PM)$/)) {
            alert("Please use 12-hour format like '5 AM' or '12 PM'");
            return;
        }
        
        if (currentScheduleData && currentScheduleData[niche]) {
            if (!currentScheduleData[niche][type]) currentScheduleData[niche][type] = [];
            if (!currentScheduleData[niche][type].includes(hour)) {
                currentScheduleData[niche][type].push(hour);
                // Sort array (roughly, AM before PM)
                currentScheduleData[niche][type].sort((a,b) => {
                    const isPam = a.includes('PM');
                    const isPbm = b.includes('PM');
                    if(isPam !== isPbm) return isPam ? 1 : -1;
                    return parseInt(a) - parseInt(b);
                });
                renderMasterSchedule();
            }
        }
    };

    if (saveScheduleBtn) {
        saveScheduleBtn.addEventListener('click', async () => {
            if (!pat || !currentScheduleData || !scheduleFileSha) return;
            
            const originalText = saveScheduleBtn.innerText;
            saveScheduleBtn.innerText = 'Saving...';
            saveScheduleBtn.disabled = true;

            try {
                const jsonStr = JSON.stringify(currentScheduleData, null, 2);
                const encodedContent = btoa(unescape(encodeURIComponent(jsonStr)));
                
                const res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data/schedule/master_schedule.json`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${pat}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: "chore: update master schedule via dashboard",
                        content: encodedContent,
                        sha: scheduleFileSha,
                        branch: "main"
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    scheduleFileSha = data.content.sha; // Update SHA for next save
                    showToast("Schedule updated successfully!", 'success');
                } else {
                    const err = await res.json();
                    showToast(`Failed to save: ${err.message}`, 'error');
                }
            } catch(e) {
                showToast(`Error: ${e.message}`, 'error');
            }
            
            saveScheduleBtn.innerText = originalText;
            saveScheduleBtn.disabled = false;
        });
    }

    // Call fetchMasterSchedule directly since it's already inside DOMContentLoaded
    fetchMasterSchedule();

});
