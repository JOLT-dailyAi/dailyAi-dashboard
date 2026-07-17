
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
                masterSchedulerContainer.style.display = 'block';
                const data = await res.json();
                scheduleFileSha = data.sha;
                
                // Decode base64 content
                const contentStr = decodeURIComponent(escape(atob(data.content)));
                currentScheduleData = JSON.parse(contentStr);
                
                renderMasterSchedule();
            } else {
                console.warn("No master_schedule.json found, skipping scheduler section.");
                masterSchedulerContainer.style.display = 'none';
            }
        } catch (e) {
            console.error("Failed to fetch master schedule:", e);
        }
    }

    function renderMasterSchedule() {
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

    // Hook into showDashboard to load schedule
    const originalShowDashboard = showDashboard;
    showDashboard = async function() {
        await originalShowDashboard();
        await fetchMasterSchedule();
    };
