// Location Inspector - Core Engine

// Global Map State
let selectedAddress = null; // Contains { name, lat, lng }
let isLiveMode = false;
let googleMap = null;
let googleDirectionsRenderer = null;
let googleDirectionsService = null;
let resultsCache = {}; // In-memory fallback
let currentSearchId = 0; // Monotonically increasing search request ID

// Caching & Safety Configuration
let directionsCache = {}; // Directions service routes cache
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // Cache search results for 24 hours

let lastSearchTime = 0;
const SEARCH_THROTTLE_MS = 2000;

// Toggle States for Nearby Stations (Invisible by default)
let activeToggles = {
    bus: true,
    rail: true
};

// Live Markers Cache
let liveMarkers = {
    origin: null,
    bus: [],
    busPaths: [],
    rail: null,
    railPath: null,
    destination: null,
    constantLocationMarker: null,
    transitLegPolylines: [],
    transitLegMarkers: []
};

// Initialize on DOM Load
document.addEventListener("DOMContentLoaded", () => {
    // Initialize Mock elements so they are ready if toggled
    initMockMap();
    setupMockAutocomplete();

    // Load Safe Mode tracking data
    loadSafeModeState();

    // Check if key is configured
    const isKeyConfigured = typeof GOOGLE_MAPS_API_KEY !== 'undefined' &&
        GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY_HERE" &&
        GOOGLE_MAPS_API_KEY.trim() !== "";

    if (isKeyConfigured) {
        isLiveMode = true;
        document.getElementById("btn-mode-mock").classList.remove("active");
        document.getElementById("btn-mode-live").classList.add("active");
        loadLiveGoogleMaps();
    } else {
        isLiveMode = false;
        document.getElementById("btn-mode-live").classList.remove("active");
        document.getElementById("btn-mode-mock").classList.add("active");
        logApiRequest('maploads', {
            status: 'success',
            text: "טעינת מפת סימולציה (SVG Map Overlay)"
        });
    }

    updateSafeModeUI();

    // Attach search events
    document.getElementById("search-btn").addEventListener("click", performSearch);
    document.getElementById("address-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            const pacContainers = document.querySelectorAll(".pac-container");
            let isDropdownOpen = false;
            for (const container of pacContainers) {
                if (container.style.display !== "none") {
                    isDropdownOpen = true;
                    break;
                }
            }
            if (isDropdownOpen) {
                return; // Let autocomplete select it, place_changed will run the search
            }
            performSearch();
        }
    });

    // Autocomplete session tracker
    let lastAutocompleteInputTime = 0;
    document.getElementById("address-input").addEventListener("input", () => {
        selectedAddress = null; // Clear selectedAddress on input change to prevent stale address bugs
        const now = Date.now();
        if (now - lastAutocompleteInputTime > 5000) { // 5 seconds session throttle
            lastAutocompleteInputTime = now;

            const logTracker = logApiRequest('autocomplete', { text: "פתיחת סשן השלמת כתובת" });

            if (!isLiveMode) {
                setTimeout(() => logTracker.success({ text: "סשן השלמה בסימולציה פעיל" }), 200);
                return;
            }

            try {
                checkApiCap('autocomplete', 1);
                incrementCounter('autocomplete', 1);
                setTimeout(() => logTracker.success({ text: "סשן השלמה מול Google Places פעיל" }), 200);
            } catch (e) {
                console.warn(e.message);
                logTracker.fail(e.message);
            }
        }
    });

    // Toggle Mode buttons
    document.getElementById("btn-mode-mock").addEventListener("click", () => {
        if (isLiveMode) {
            isLiveMode = false;
            document.getElementById("btn-mode-live").classList.remove("active");
            document.getElementById("btn-mode-mock").classList.add("active");
            document.getElementById("mock-map-overlay").classList.remove("hidden");
            clearMapRoute();
            resetLiveMarkers();
            updateSafeModeUI();

            logApiRequest('system', {
                status: 'success',
                text: "מעבר למצב עבודה: סימולציה"
            });
        }
    });

    document.getElementById("btn-mode-live").addEventListener("click", () => {
        if (!isLiveMode) {
            const hasKey = typeof GOOGLE_MAPS_API_KEY !== 'undefined' &&
                GOOGLE_MAPS_API_KEY !== "YOUR_API_KEY_HERE" &&
                GOOGLE_MAPS_API_KEY.trim() !== "";
            if (!hasKey) {
                showNotification("מפתח API חסר בקובץ config.js! לא ניתן לעבור למצב זמן אמת.");
                return;
            }

            isLiveMode = true;
            document.getElementById("btn-mode-mock").classList.remove("active");
            document.getElementById("btn-mode-live").classList.add("active");
            document.getElementById("mock-map-overlay").classList.add("hidden");

            logApiRequest('system', {
                status: 'success',
                text: "מעבר למצב עבודה: זמן אמת (Live)"
            });

            if (!googleMap) {
                loadLiveGoogleMaps();
            }
            updateSafeModeUI();
        }
    });

    // Reset counters
    document.getElementById("btn-reset-counters").addEventListener("click", () => {
        resetSafeModeCounters();
        logApiRequest('system', {
            status: 'success',
            text: "איפוס מוני שימוש בטיחותיים"
        });
    });

    // Warning Modal actions
    document.getElementById("modal-btn-increase").addEventListener("click", increaseLimits);
    document.getElementById("modal-btn-reset").addEventListener("click", resetCounters);
    document.getElementById("modal-btn-close").addEventListener("click", switchToMockMode);

    // Event delegation for collapsible card sections in sidebar panel
    const resultsSection = document.getElementById("results-section");
    resultsSection.addEventListener("click", (e) => {
        const h2 = e.target.closest(".results-card h2");
        if (!h2) return;

        const content = h2.nextElementSibling;
        if (content) {
            h2.classList.toggle("collapsed");
            content.classList.toggle("hidden");
        }
    });

    // Left Sidebar Toggle Listeners
    const leftSidebar = document.getElementById("left-sidebar");
    const leftSidebarToggle = document.getElementById("left-sidebar-toggle-btn");
    const leftSidebarClose = document.getElementById("left-sidebar-close-btn");

    if (leftSidebarToggle && leftSidebar && leftSidebarClose) {
        leftSidebarToggle.addEventListener("click", () => {
            leftSidebar.classList.remove("collapsed");
            leftSidebarToggle.classList.add("hidden");
            unreadLogCount = 0;
            updateLogBadgeUI();

            // Scroll to bottom when opening
            const container = document.getElementById("api-log-container");
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });

        leftSidebarClose.addEventListener("click", () => {
            leftSidebar.classList.add("collapsed");
            leftSidebarToggle.classList.remove("hidden");
        });
    }

    // Clear Logs Listener
    const btnClearLogs = document.getElementById("btn-clear-logs");
    if (btnClearLogs) {
        btnClearLogs.addEventListener("click", () => {
            apiLogs = [];
            unreadLogCount = 0;
            updateLogBadgeUI();
            renderLogs();
        });
    }

    // Filter Chips Listeners
    const filterChips = document.querySelectorAll(".log-filter-chip");
    filterChips.forEach(chip => {
        chip.addEventListener("click", () => {
            filterChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            activeLogFilter = chip.getAttribute("data-filter");
            renderLogs();
        });
    });
});

// ==========================================
// LOCAL STORAGE CACHE UTILITIES
// ==========================================

function getCachedResult(addressName, lat, lng) {
    const cacheStr = localStorage.getItem('telaviv_commute_results_cache_v4');
    if (!cacheStr) return null;

    let cache = {};
    try {
        cache = JSON.parse(cacheStr);
    } catch (e) {
        return null;
    }

    // Clean expired cache items
    const now = Date.now();
    let cacheCleaned = false;
    for (const key in cache) {
        if (now - cache[key].timestamp > CACHE_TTL_MS) {
            delete cache[key];
            cacheCleaned = true;
        }
    }
    if (cacheCleaned) {
        localStorage.setItem('telaviv_commute_results_cache_v4', JSON.stringify(cache));
    }

    if (cache[addressName]) {
        return {
            name: addressName,
            lat: cache[addressName].lat,
            lng: cache[addressName].lng,
            results: cache[addressName].results
        };
    }

    // Proximity search logic (within 50 meters)
    for (const key in cache) {
        const item = cache[key];
        const distance = calculateDistance(lat, lng, item.lat, item.lng) * 1000;
        if (distance < 50) {
            console.log(`[Cache Hit] Serving coordinates proximity hit for ${addressName}`);
            return {
                name: key, // Serve using cached key name to prevent duplicate calculations
                lat: item.lat,
                lng: item.lng,
                results: item.results
            };
        }
    }

    return null;
}

function saveToCache(addressName, lat, lng, results) {
    let cache = {};
    const cacheStr = localStorage.getItem('telaviv_commute_results_cache_v4');
    if (cacheStr) {
        try {
            cache = JSON.parse(cacheStr);
        } catch (e) {
            cache = {};
        }
    }

    cache[addressName] = {
        lat: lat,
        lng: lng,
        timestamp: Date.now(),
        results: results
    };

    try {
        localStorage.setItem('telaviv_commute_results_cache_v4', JSON.stringify(cache));
    } catch (e) {
        console.warn("Storage quota exceeded. Clearing cache.");
        localStorage.removeItem('telaviv_commute_results_cache_v4');
    }
}


// ==========================================
// SEARCH & COORDINATION CONTROLLER
// ==========================================

function performSearch() {
    const input = document.getElementById("address-input");
    const addressText = input.value.trim();

    if (!addressText) {
        showNotification("נא להזין כתובת לחיפוש");
        return;
    }

    // Ensure coordinates match the input box text to prevent stale coordinates from previous searches
    if (selectedAddress && selectedAddress.name !== addressText) {
        selectedAddress = null;
    }

    // Throttling Check
    const now = Date.now();
    if (now - lastSearchTime < SEARCH_THROTTLE_MS) {
        return;
    }
    lastSearchTime = now;

    currentSearchId++;
    const thisSearchId = currentSearchId;

    // Resolve autocomplete selection fallback
    if (!selectedAddress) {
        if (!isLiveMode) {
            const found = MOCK_ADDRESSES.find(addr => addr.name.includes(addressText));
            selectedAddress = found || {
                name: addressText,
                lat: 32.0780 + (Math.random() - 0.5) * 0.02,
                lng: 34.7742 + (Math.random() - 0.5) * 0.02
            };
        } else {
            showNotification("נא לבחור כתובת מתוך רשימת ההצעות");
            return;
        }
    }

    // 1. Check Local Cache
    const cachedEntry = getCachedResult(selectedAddress.name, selectedAddress.lat, selectedAddress.lng);
    if (cachedEntry) {
        disableSearchUI();
        document.getElementById("initial-message").classList.add("hidden");
        document.getElementById("results-section").classList.add("hidden");
        document.getElementById("loader").classList.remove("hidden");

        const cacheLog = logApiRequest('matrix', {
            text: `שליפת תוצאות מהמטמון עבור ${selectedAddress.name}`,
            isCached: true
        });

        setTimeout(() => {
            if (thisSearchId !== currentSearchId) {
                console.log("[Race Condition Prevented] Ignoring obsolete cached results");
                return;
            }

            // Sync selectedAddress coordinates/name with the cached entry
            selectedAddress = {
                name: cachedEntry.name,
                lat: cachedEntry.lat,
                lng: cachedEntry.lng
            };
            const cached = cachedEntry.results;
            if (cached) {
                if (!cached.originLat) cached.originLat = cachedEntry.lat;
                if (!cached.originLng) cached.originLng = cachedEntry.lng;
            }

            // Log caching statistics
            recordSearchSavings();

            activeToggles.bus = true;
            activeToggles.rail = true;
            clearMapRoute();
            resetLiveMarkers();

            if (isLiveMode) {
                googleMap.setCenter({ lat: selectedAddress.lat, lng: selectedAddress.lng });
                googleMap.setZoom(14);

                const originMarker = new google.maps.Marker({
                    position: { lat: selectedAddress.lat, lng: selectedAddress.lng },
                    map: googleMap,
                    title: "מוצא",
                    icon: { url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png" }
                });
                liveMarkers.origin = originMarker;

                recreateCachedStops(selectedAddress, cached);
            } else {
                renderMockSearchElements(selectedAddress, cached.busStops, cached.rail);
                const svgCoords = convertLatLngToSvg(selectedAddress.lat, selectedAddress.lng);
                mockViewBoxOffset.x = svgCoords.x - 300;
                mockViewBoxOffset.y = svgCoords.y - 300;
                mockZoomScale = 1.25;
                updateMockViewBox();
            }

            cacheLog.success({ text: `תוצאות עבור ${selectedAddress.name} נשלפו בהצלחה מהמטמון (נחסכו Places ו-Distance Matrix API)` });
            renderResults(cached);
            document.getElementById("loader").classList.add("hidden");
            document.getElementById("results-section").classList.remove("hidden");
            enableSearchUI();
        }, 300);
        return;
    }

    // Cache Miss (New address chosen): Clear previous cached routes and results
    directionsCache = {};
    localStorage.removeItem('telaviv_commute_results_cache_v4');

    // Reset overlay map assets
    activeToggles.bus = true;
    activeToggles.rail = true;
    clearMapRoute();
    resetLiveMarkers();

    // Toggle loader views
    document.getElementById("initial-message").classList.add("hidden");
    document.getElementById("results-section").classList.add("hidden");
    document.getElementById("loader").classList.remove("hidden");

    disableSearchUI();

    if (isLiveMode) {
        // Cap Check: 1 Places + 14 Matrix elements + 8 Directions elements
        try {
            checkApiCap('places', 1);
            checkApiCap('matrix', 14);
            checkApiCap('directions', 8);
        } catch (e) {
            console.warn(e.message);
            enableSearchUI();
            return;
        }

        queryLiveAPIs(selectedAddress, thisSearchId);
    } else {
        const mockLog = logApiRequest('places', { text: `חיפוש כתובת ומקומות (סימולציה) עבור ${selectedAddress.name}` });

        // Run Mock Mode with a slight delay
        setTimeout(() => {
            if (thisSearchId !== currentSearchId) {
                console.log("[Race Condition Prevented] Ignoring obsolete mock results");
                return;
            }
            const results = calculateMockData(selectedAddress);
            resultsCache[selectedAddress.name] = results;
            saveToCache(selectedAddress.name, selectedAddress.lat, selectedAddress.lng, results);
            renderResults(results);
            renderMockSearchElements(selectedAddress, results.busStops, results.rail);

            mockLog.success({ text: `נמצאו תחנות וזמני נסיעה בסימולציה עבור ${selectedAddress.name}` });

            // Adjust SVG map bounds to searched address
            const svgCoords = convertLatLngToSvg(selectedAddress.lat, selectedAddress.lng);
            mockViewBoxOffset.x = svgCoords.x - 300;
            mockViewBoxOffset.y = svgCoords.y - 300;
            mockZoomScale = 1.25;
            updateMockViewBox();

            document.getElementById("loader").classList.add("hidden");
            document.getElementById("results-section").classList.remove("hidden");
            enableSearchUI();
        }, 650);
    }
}


