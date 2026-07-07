const GITHUB_OWNER = 'JOLT-dailyAi';
const GITHUB_REPO = 'dailyAi';
const WORKFLOW_ID = 'aggregator.yml';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1vcm1LTJov1Chx50WXkAywgQS1HLe6gHBD0vxU6voWJM/export?format=csv&gid=342308422';

document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('login-modal');
    const mainDashboard = document.getElementById('main-dashboard');
    const patInput = document.getElementById('github-pat');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const refreshBtn = document.getElementById('refresh-btn');
    const errorMsg = document.getElementById('login-error');
    const grid = document.getElementById('workflows-grid');
    
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
            
            // Simple CSV parser
            const rows = csvText.split('\n').map(row => {
                const matches = row.match(/(\s*'[^']+'|\s*[^,]+)(?=,|$)/g);
                return matches ? matches.map(val => val.trim().replace(/^'|'$/g, '')) : [];
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
                        <span class="meta-label">Last Run (IST)</span>
                        <span class="meta-value" style="font-size: 0.85rem">${wf.LastRunTimeIST || wf.LastRunTime || 'Never'}</span>
                    </div>
                </div>
                
                <button class="glow-btn trigger-btn">Trigger Automation</button>
            `;
            
            card.querySelector('.trigger-btn').addEventListener('click', (e) => {
                triggerGitHubAction(e.target);
            });
            
            grid.appendChild(card);
        });
    }

    async function triggerGitHubAction(btnElement) {
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
                body: JSON.stringify({ ref: 'main' })
            });

            if (res.ok) {
                showToast('Action triggered successfully! It will run in the background.', 'success');
            } else {
                const err = await res.json();
                showToast(`Failed to trigger: ${err.message}`, 'error');
            }
        } catch (e) {
            showToast(`Error: ${e.message}`, 'error');
        }

        setTimeout(() => {
            btnElement.innerText = originalText;
            btnElement.disabled = false;
        }, 3000);
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
});
