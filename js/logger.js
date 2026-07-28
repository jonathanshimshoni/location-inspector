// Location Inspector - Logging & API Safe Mode Layer

// Live Logging System State
let apiLogs = [];
const MAX_LOG_COUNT = 100;
let unreadLogCount = 0;
let activeLogFilter = 'all';

// Safety Configuration & Thresholds
const HARD_CAPS = {
    maploads: 200,     // Max Map initialization loads
    autocomplete: 300, // Max Autocomplete session selections/keypresses
    places: 200,       // Max unique Place nearby searches
    matrix: 1000,      // Max Distance Matrix elements queried
    directions: 500   // Max Directions path requests
};

const PRICING_RATES = {
    maploads: 0.007,
    autocomplete: 0.017,
    places: 0.032,
    matrix: 0.010,
    directions: 0.010
};

let apiCounters = {
    maploads: 0,
    autocomplete: 0,
    places: 0,
    matrix: 0,
    directions: 0
};

let lifetimeSavings = 0.0;

// ==========================================
// LIVE REQUEST LOGGING SYSTEM UTILITIES
// ==========================================

function getApiDisplayName(type) {
    switch (type) {
        case 'maploads': return 'Map Load (טעינת מפה)';
        case 'autocomplete': return 'Autocomplete (השלמה)';
        case 'places': return 'Places API (חיפוש)';
        case 'matrix': return 'Distance Matrix (זמנים)';
        case 'directions': return 'Directions API (נתיב)';
        case 'system': return 'מערכת (System)';
        default: return type;
    }
}

function getApiIcon(type) {
    switch (type) {
        case 'maploads': return '🗺️';
        case 'autocomplete': return '✍️';
        case 'places': return '🔍';
        case 'matrix': return '🔢';
        case 'directions': return '🛣️';
        case 'system': return '⚙️';
        default: return '⚡';
    }
}

function logApiRequest(type, details) {
    const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    const mode = details.isCached ? 'cache' : (type === 'system' ? 'system' : (isLiveMode ? 'live' : 'mock'));

    let cost = 0.0;
    const rate = PRICING_RATES[type] || 0.0;
    const multiplier = details.elements || 1;
    if (mode === 'live') {
        cost = rate * multiplier;
    }
    const newLog = {
        id: logId,
        type: type,
        timestamp: new Date(),
        mode: mode,
        status: details.status || 'ongoing', // ongoing, success, failed
        details: details.text || '',
        cost: cost
    };

    apiLogs.push(newLog);
    if (apiLogs.length > MAX_LOG_COUNT) {
        apiLogs.shift();
    }

    // Update unread count if sidebar is closed
    const sidebar = document.getElementById("left-sidebar");
    if (sidebar && sidebar.classList.contains("collapsed")) {
        unreadLogCount++;
        updateLogBadgeUI();
    }

    renderLogs();

    return {
        success: (extraDetails = {}) => {
            updateLogStatus(logId, 'success', extraDetails);
        },
        fail: (errorMsg = '') => {
            updateLogStatus(logId, 'failed', { text: errorMsg });
        }
    };
}

function updateLogStatus(id, newStatus, extraDetails = {}) {
    const log = apiLogs.find(l => l.id === id);
    if (log) {
        log.status = newStatus;
        if (extraDetails.text) {
            log.details = extraDetails.text;
        }
        if (extraDetails.elements && log.mode === 'live') {
            const rate = PRICING_RATES[log.type] || 0.0;
            log.cost = rate * extraDetails.elements;
        }
        renderLogs();
    }
}

function updateLogBadgeUI() {
    const badge = document.getElementById("log-count-badge");
    if (badge) {
        if (unreadLogCount > 0) {
            badge.textContent = unreadLogCount;
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
}

function renderLogs() {
    const container = document.getElementById("api-log-container");
    if (!container) return;

    // Filter logs
    let filteredLogs = apiLogs;
    if (activeLogFilter !== 'all') {
        filteredLogs = apiLogs.filter(log => log.mode === activeLogFilter);
    }

    if (filteredLogs.length === 0) {
        container.innerHTML = `<div class="log-placeholder">אין פעילות מתאימה לסינון שנבחר.</div>`;
        return;
    }

    container.innerHTML = '';
    filteredLogs.forEach(log => {
        const item = document.createElement("div");
        item.className = `log-item status-${log.status}`;

        const timeStr = log.timestamp.toTimeString().split(' ')[0];

        let statusText = 'ממתין...';
        if (log.status === 'success') statusText = log.mode === 'cache' ? 'מטמון' : 'הושלם';
        else if (log.status === 'failed') statusText = 'נכשל';

        let costLabel = '';
        if (log.mode === 'live') {
            costLabel = `$${log.cost.toFixed(3)}`;
        } else if (log.mode === 'cache') {
            const rate = PRICING_RATES[log.type] || 0.0;
            const elements = log.details.includes('אלמנטים') ? parseInt(log.details.replace(/\D/g, '')) || 1 : 1;
            const saved = rate * elements;
            costLabel = `$0.000 (נחסך $${saved.toFixed(3)})`;
        } else if (log.mode === 'system') {
            costLabel = '-';
        } else {
            costLabel = '$0.000 (סימולציה)';
        }

        let badgeModeText = 'סימולציה';
        if (log.mode === 'live') badgeModeText = 'זמן אמת';
        else if (log.mode === 'cache') badgeModeText = 'מטמון';
        else if (log.mode === 'system') badgeModeText = 'מערכת';

        item.innerHTML = `
            <div class="log-item-header">
                <div class="log-item-title-wrapper">
                    <span>${getApiIcon(log.type)}</span>
                    <span>${getApiDisplayName(log.type)}</span>
                </div>
                <span class="log-item-time">${timeStr}</span>
            </div>
            <div class="log-item-body">
                ${log.details}
            </div>
            <div class="log-item-footer">
                <span class="log-badge-mode ${log.mode}">${badgeModeText}</span>
                <span class="log-item-cost">${costLabel}</span>
            </div>
        `;
        container.appendChild(item);
    });

    // Auto-scroll to bottom
    container.scrollTop = container.scrollHeight;
}

// ==========================================
// API SAFE MODE MECHANISMS & STORAGE
// ==========================================

function loadSafeModeState() {
    // Load counters
    const savedCounters = localStorage.getItem('telaviv_api_counters');
    if (savedCounters) {
        try {
            apiCounters = JSON.parse(savedCounters);
            if (typeof apiCounters.places !== 'number' ||
                typeof apiCounters.matrix !== 'number' ||
                typeof apiCounters.maploads !== 'number' ||
                typeof apiCounters.autocomplete !== 'number') {
                throw new Error();
            }
        } catch (e) {
            resetSafeModeCounters();
        }
    } else {
        resetSafeModeCounters();
    }

    // Load savings
    const savedSavings = localStorage.getItem('telaviv_api_savings');
    if (savedSavings) {
        lifetimeSavings = parseFloat(savedSavings) || 0.0;
    } else {
        lifetimeSavings = 0.0;
    }
}

function saveSafeModeState() {
    localStorage.setItem('telaviv_api_counters', JSON.stringify(apiCounters));
    localStorage.setItem('telaviv_api_savings', lifetimeSavings.toFixed(4));
}

function resetSafeModeCounters() {
    apiCounters = { maploads: 0, autocomplete: 0, places: 0, matrix: 0, directions: 0 };
    saveSafeModeState();
    updateSafeModeUI();
}

function checkApiCap(type, requiredCount = 1) {
    if (apiCounters[type] + requiredCount > HARD_CAPS[type]) {
        showLimitExceededModal(type);
        throw new Error(`[API Safety Cap] Capping blocked request for ${type} to prevent charges.`);
    }
}

function incrementCounter(type, count = 1) {
    apiCounters[type] += count;
    saveSafeModeState();
    updateSafeModeUI();
}

function recordSearchSavings() {
    // Savings = 1 Places search + 4 walking elements + 14 commutes elements
    const savedAmount = PRICING_RATES.places + (4 * 0.007) + (14 * PRICING_RATES.matrix);
    lifetimeSavings += savedAmount;
    saveSafeModeState();
    updateSafeModeUI();
}

function recordDirectionsSavings() {
    lifetimeSavings += PRICING_RATES.directions;
    saveSafeModeState();
    updateSafeModeUI();
}

function updateSafeModeUI() {
    const hasKey = typeof GOOGLE_MAPS_API_KEY !== 'undefined' &&
        GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY_HERE" &&
        GOOGLE_MAPS_API_KEY.trim() !== "";

    const warningEl = document.getElementById("api-key-warning");
    const statsEl = document.getElementById("safe-mode-stats-container");
    const statusBadge = document.getElementById("safe-mode-status-badge");

    if (!hasKey) {
        if (warningEl) warningEl.classList.remove("hidden");
        if (statsEl) statsEl.classList.remove("hidden");
        if (statusBadge) {
            statusBadge.textContent = "חסר מפתח (סימולציה)";
            statusBadge.className = "status-badge live-inactive";
        }
    } else {
        if (warningEl) warningEl.classList.add("hidden");
        if (statsEl) statsEl.classList.remove("hidden");
        if (statusBadge) {
            if (isLiveMode) {
                statusBadge.textContent = "זמן אמת";
                statusBadge.className = "status-badge live-active";
            } else {
                statusBadge.textContent = "סימולציה";
                statusBadge.className = "status-badge live-inactive";
            }
        }
    }

    const updateBar = (id, valId, current, max) => {
        const bar = document.getElementById(id);
        const text = document.getElementById(valId);
        if (bar && text) {
            const pct = Math.min(100, (current / max) * 100);
            bar.style.width = `${pct}%`;
            text.textContent = `${current} / ${max}`;

            bar.classList.remove("warning", "danger");
            if (pct >= 90) {
                bar.classList.add("danger");
            } else if (pct >= 70) {
                bar.classList.add("warning");
            }
        }
    };

    updateBar("bar-maploads", "val-maploads", apiCounters.maploads, HARD_CAPS.maploads);
    updateBar("bar-autocomplete", "val-autocomplete", apiCounters.autocomplete, HARD_CAPS.autocomplete);
    updateBar("bar-places", "val-places", apiCounters.places, HARD_CAPS.places);
    updateBar("bar-matrix", "val-matrix", apiCounters.matrix, HARD_CAPS.matrix);
    updateBar("bar-directions", "val-directions", apiCounters.directions, HARD_CAPS.directions);

    const maploads = apiCounters.maploads || 0;
    const autocomplete = apiCounters.autocomplete || 0;
    const places = apiCounters.places || 0;
    const matrix = apiCounters.matrix || 0;
    const directions = apiCounters.directions || 0;

    const savingsPctEl = document.getElementById("val-savings-pct");
    const savingsCostEl = document.getElementById("val-savings-cost");
    const savingsLegacyEl = document.getElementById("val-savings");

    if (savingsPctEl || savingsCostEl || savingsLegacyEl) {
        // Monthly quota baselines (10,000 for standard APIs, 5,000 for Places)
        const maploadsPct = (maploads / 10000) * 100;
        const autocompletePct = (autocomplete / 10000) * 100;
        const placesPct = (places / 5000) * 100;
        const matrixPct = (matrix / 10000) * 100;
        const directionsPct = (directions / 10000) * 100;

        const maxPct = Math.max(maploadsPct, autocompletePct, placesPct, matrixPct, directionsPct);

        const spent = (
            maploads * (PRICING_RATES.maploads || 0.007) +
            autocomplete * (PRICING_RATES.autocomplete || 0.017) +
            places * (PRICING_RATES.places || 0.032) +
            matrix * (PRICING_RATES.matrix || 0.010) +
            directions * (PRICING_RATES.directions || 0.010)
        );

        let pctText = "0.00%";
        if (maxPct > 0) {
            pctText = maxPct >= 0.01 ? `${maxPct.toFixed(2)}%` : `${maxPct.toFixed(4)}%`;
        }

        if (savingsPctEl) savingsPctEl.textContent = pctText;
        if (savingsCostEl) savingsCostEl.textContent = `$${spent.toFixed(3)}`;
        if (savingsLegacyEl) savingsLegacyEl.textContent = pctText;
    }
}

function showLimitExceededModal() {
    const modal = document.getElementById("limit-modal");
    if (modal) {
        document.getElementById("modal-maploads-count").textContent = `${apiCounters.maploads} / ${HARD_CAPS.maploads}`;
        document.getElementById("modal-autocomplete-count").textContent = `${apiCounters.autocomplete} / ${HARD_CAPS.autocomplete}`;
        document.getElementById("modal-places-count").textContent = `${apiCounters.places} / ${HARD_CAPS.places}`;
        document.getElementById("modal-matrix-count").textContent = `${apiCounters.matrix} / ${HARD_CAPS.matrix}`;
        document.getElementById("modal-directions-count").textContent = `${apiCounters.directions} / ${HARD_CAPS.directions}`;
        modal.classList.remove("hidden");
    }
}

function hideLimitExceededModal() {
    const modal = document.getElementById("limit-modal");
    if (modal) {
        modal.classList.add("hidden");
    }
}

function increaseLimits() {
    HARD_CAPS.places = Math.round(HARD_CAPS.places * 1.5);
    HARD_CAPS.matrix = Math.round(HARD_CAPS.matrix * 1.5);
    HARD_CAPS.directions = Math.round(HARD_CAPS.directions * 1.5);
    hideLimitExceededModal();
    updateSafeModeUI();

    logApiRequest('system', {
        status: 'success',
        text: `הגדלת מגבלות בטיחות ב-50% (Places: ${HARD_CAPS.places}, Matrix: ${HARD_CAPS.matrix}, Directions: ${HARD_CAPS.directions})`
    });
}

function resetCounters() {
    resetSafeModeCounters();
    hideLimitExceededModal();

    logApiRequest('system', {
        status: 'success',
        text: "איפוס מוני שימוש בטיחותיים"
    });
}

function switchToMockMode() {
    isLiveMode = false;
    hideLimitExceededModal();

    document.getElementById("btn-mode-live").classList.remove("active");
    document.getElementById("btn-mode-mock").classList.add("active");
    document.getElementById("mock-map-overlay").classList.remove("hidden");

    clearMapRoute();
    resetLiveMarkers();
    updateSafeModeUI();
}
