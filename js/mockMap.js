// Location Inspector - Simulated Mock Map Layer

// SVG Map coordinate mapping bounds (Tel Aviv area)
const MIN_LAT = 32.0400;
const MAX_LAT = 32.1300;
const MIN_LNG = 34.7450;
const MAX_LNG = 34.8250;

let mockZoomScale = 1.0;
let mockViewBoxOffset = { x: 0, y: 0 };

// Predefined Mock Addresses for Autocomplete in Mock Mode
const MOCK_ADDRESSES = [
    { name: "דיזנגוף 100, תל אביב יפו", lat: 32.0780, lng: 34.7742 },
    { name: "שדרות רוטשילד 30, תל אביב יפו", lat: 32.0625, lng: 34.7708 },
    { name: "אבן גבירול 70, תל אביב יפו", lat: 32.0818, lng: 34.7812 },
    { name: "הרצל 12, תל אביב יפו", lat: 32.0605, lng: 34.7691 },
    { name: "שאול המלך 39, תל אביב יפו", lat: 32.0785, lng: 34.7924 },
    { name: "חיים לבנון 30, תל אביב יפו", lat: 32.1115, lng: 34.8010 },
    { name: "פנקס 15, תל אביב יפו", lat: 32.0910, lng: 34.7905 },
    { name: "בן יהודה 120, תל אביב יפו", lat: 32.0850, lng: 34.7715 }
];

// ==========================================
// MOCK MAP IMPLEMENTATION (SVG BASED)
// ==========================================

function initMockMap() {
    const svgMap = document.getElementById("mock-svg-map");
    if (!svgMap) return;
    svgMap.setAttribute("viewBox", "0 0 600 600");
    
    // Zoom control buttons
    // Remove listeners first to avoid duplicates
    const btnIn = document.getElementById("zoom-in-mock");
    const btnOut = document.getElementById("zoom-out-mock");
    
    const newBtnIn = btnIn.cloneNode(true);
    const newBtnOut = btnOut.cloneNode(true);
    btnIn.parentNode.replaceChild(newBtnIn, btnIn);
    btnOut.parentNode.replaceChild(newBtnOut, btnOut);
    
    newBtnIn.addEventListener("click", () => {
        mockZoomScale = Math.min(2.0, mockZoomScale + 0.15);
        updateMockViewBox();
    });
    
    newBtnOut.addEventListener("click", () => {
        mockZoomScale = Math.max(0.6, mockZoomScale - 0.15);
        updateMockViewBox();
    });
    
    renderMockConstantMarkers();
}

function updateMockViewBox() {
    const svgMap = document.getElementById("mock-svg-map");
    const width = 600;
    const height = 600;
    
    const newWidth = width / mockZoomScale;
    const newHeight = height / mockZoomScale;
    
    const x = (width - newWidth) / 2 + mockViewBoxOffset.x;
    const y = (height - newHeight) / 2 + mockViewBoxOffset.y;
    
    svgMap.setAttribute("viewBox", `${x} ${y} ${newWidth} ${newHeight}`);
}

// Convert coordinates to 600x600 SVG grid space
function convertLatLngToSvg(lat, lng) {
    const xPercent = (lng - MIN_LNG) / (MAX_LNG - MIN_LNG);
    const yPercent = (MAX_LAT - lat) / (MAX_LAT - MIN_LAT); // Invert y
    
    return {
        x: xPercent * 600,
        y: yPercent * 600
    };
}

function renderMockConstantMarkers() {
    const markersGroup = document.getElementById("mock-markers");
    if (!markersGroup) return;
    markersGroup.innerHTML = "";
    
    CONSTANT_LOCATIONS.forEach(loc => {
        const coords = convertLatLngToSvg(loc.lat, loc.lng);
        
        const pinG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        pinG.setAttribute("class", "mock-pin");
        pinG.setAttribute("transform", `translate(${coords.x}, ${coords.y})`);
        
        let innerLogoHtml = "";
        
        if (loc.id === "tau") {
            innerLogoHtml = `
                <path d="M -6 -27 L 0 -30 L 6 -27 L 0 -24 Z" fill="#ffffff" />
                <path d="M -3 -25.5 L -3 -23.5 C -3 -22 3 -22 3 -23.5 L 3 -25.5" fill="none" stroke="#ffffff" stroke-width="1" />
                <path d="M 2.5 -25.5 L 5 -23 L 5 -20" fill="none" stroke="#ffffff" stroke-width="0.8" />
            `;
        } else if (loc.id === "court") {
            innerLogoHtml = `
                <path d="M 0 -29 L 0 -19" stroke="#ffffff" stroke-width="1" />
                <path d="M -5 -27 L 5 -27" stroke="#ffffff" stroke-width="1" stroke-linecap="round" />
                <path d="M -5 -27 L -7 -22 L -3 -22 Z" fill="#ffffff" />
                <path d="M 5 -27 L 3 -22 L 7 -22 Z" fill="#ffffff" />
                <path d="M -3 -19 L 3 -19" stroke="#ffffff" stroke-width="1" />
            `;
        } else {
            innerLogoHtml = `<circle cx="0" cy="-24" r="4" fill="#ffffff" />`;
        }
        
        // Determine fill color: purple for tau and court, default grey otherwise
        const fillColor = (loc.id === "tau" || loc.id === "court") ? "#800080" : "#70757a";
        
        pinG.innerHTML = `
            <path d="M0,0 C-8,-8 -12,-16 -12,-24 A12,12 0 0,1 12,-24 C12,-16 8,-8 0,0 Z" fill="${fillColor}" stroke="#ffffff" stroke-width="1.5" />
            ${innerLogoHtml}
            <text x="0" y="15" text-anchor="middle" class="mock-pin-label">${loc.name}</text>
        `;
        
        markersGroup.appendChild(pinG);
    });
}

function setupMockAutocomplete() {
    const input = document.getElementById("address-input");
    
    // Create Autocomplete dropdown container
    let autocompleteContainer = document.getElementById("mock-autocomplete-container");
    if (!autocompleteContainer) {
        autocompleteContainer = document.createElement("div");
        autocompleteContainer.className = "pac-container hidden";
        autocompleteContainer.id = "mock-autocomplete-container";
        document.body.appendChild(autocompleteContainer);
    }
    
    function positionDropdown() {
        const rect = input.getBoundingClientRect();
        autocompleteContainer.style.top = `${rect.bottom + window.scrollY}px`;
        autocompleteContainer.style.left = `${rect.left + window.scrollX}px`;
        autocompleteContainer.style.width = `${rect.width}px`;
    }
    
    // Smooth Optimization: Debounced window resizing handler to prevent layout thrashing
    let resizeTimeout;
    const debouncedPositionDropdown = () => {
        if (resizeTimeout) cancelAnimationFrame(resizeTimeout);
        resizeTimeout = requestAnimationFrame(positionDropdown);
    };
    
    input.addEventListener("input", () => {
        // Only run mock autocomplete logic if we are NOT in Live mode
        if (isLiveMode) return;
        
        const val = input.value.trim();
        if (!val) {
            autocompleteContainer.classList.add("hidden");
            return;
        }
        
        const filtered = MOCK_ADDRESSES.filter(addr => addr.name.includes(val));
        
        if (filtered.length === 0) {
            autocompleteContainer.classList.add("hidden");
            return;
        }
        
        // Performance Optimization: DOM Fragment creation for faster autocomplete rendering
        const fragment = document.createDocumentFragment();
        filtered.forEach(addr => {
            const item = document.createElement("div");
            item.className = "pac-item";
            item.textContent = addr.name;
            item.addEventListener("mousedown", () => {
                input.value = addr.name;
                selectedAddress = addr;
                autocompleteContainer.classList.add("hidden");
            });
            fragment.appendChild(item);
        });
        
        autocompleteContainer.innerHTML = "";
        autocompleteContainer.appendChild(fragment);
        
        positionDropdown();
        autocompleteContainer.classList.remove("hidden");
    });
    
    input.addEventListener("focus", () => {
        if (!isLiveMode && input.value.trim() !== "") {
            positionDropdown();
            autocompleteContainer.classList.remove("hidden");
        }
    });
    
    input.addEventListener("blur", () => {
        setTimeout(() => {
            autocompleteContainer.classList.add("hidden");
        }, 200);
    });
    
    window.addEventListener("resize", debouncedPositionDropdown);
}

// Calculate distance in KM using Haversine formula
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
}

function calculateMockData(origin) {
    const results = {
        destinations: {},
        originLat: origin.lat,
        originLng: origin.lng
    };

    // 1. Closest Light Rail
    let closestRail = null;
    let minRailDist = Infinity;
    
    LIGHT_RAIL_STATIONS.forEach(station => {
        const dist = calculateDistance(origin.lat, origin.lng, station.lat, station.lng) * 1000;
        if (dist < minRailDist) {
            minRailDist = dist;
            closestRail = station;
        }
    });

    const railWalkMin = Math.round(minRailDist / 80);
    results.rail = {
        name: closestRail.name,
        distance: Math.round(minRailDist),
        duration: railWalkMin === 0 ? 1 : railWalkMin,
        lat: closestRail.lat,
        lng: closestRail.lng
    };

    // 2. Bus stops generator (proportional to distance but randomized street names)
    const busStreets = ["דיזנגוף", "אבן גבירול", "בן יהודה", "הירקון", "שאול המלך", "אלנבי", "שד' רוטשילד", "דרך נמיר", "ארלוזורוב", "קינג ג'ורג'"];
    results.busStops = [];

    // Stop 1
    const name1 = busStreets[Math.floor(Math.random() * busStreets.length)] + " / " + busStreets[Math.floor(Math.random() * busStreets.length)];
    const dist1 = 120 + Math.random() * 80;
    const walkMin1 = Math.round(dist1 / 80);
    results.busStops.push({
        name: name1,
        distance: Math.round(dist1),
        duration: walkMin1 === 0 ? 1 : walkMin1,
        lat: origin.lat + 0.0015,
        lng: origin.lng + 0.0012
    });

    // Stop 2
    const name2 = busStreets[Math.floor(Math.random() * busStreets.length)] + " / " + busStreets[Math.floor(Math.random() * busStreets.length)];
    const dist2 = 250 + Math.random() * 100;
    const walkMin2 = Math.round(dist2 / 80);
    results.busStops.push({
        name: name2,
        distance: Math.round(dist2),
        duration: walkMin2 === 0 ? 1 : walkMin2,
        lat: origin.lat - 0.0018,
        lng: origin.lng + 0.0015
    });

    // Stop 3
    const name3 = busStreets[Math.floor(Math.random() * busStreets.length)] + " / " + busStreets[Math.floor(Math.random() * busStreets.length)];
    const dist3 = 400 + Math.random() * 120;
    const walkMin3 = Math.round(dist3 / 80);
    results.busStops.push({
        name: name3,
        distance: Math.round(dist3),
        duration: walkMin3 === 0 ? 1 : walkMin3,
        lat: origin.lat + 0.0008,
        lng: origin.lng - 0.0022
    });

    // 3. Commute calculation to fixed destinations
    CONSTANT_LOCATIONS.forEach(dest => {
        const baseDist = calculateDistance(origin.lat, origin.lng, dest.lat, dest.lng);
        results.destinations[dest.id] = {
            id: dest.id,
            name: dest.name,
            lat: dest.lat,
            lng: dest.lng,
            options: []
        };

        dest.commutes.forEach(commute => {
            const timeStr = commute.time;
            const hour = parseInt(timeStr.split(":")[0]);
            
            let carSpeed = 30;
            let transitSpeed = 16;
            let delayFactor = 1.0;

            // Congestion simulation
            if (commute.type === "to") {
                if (hour === 8 || hour === 9) {
                    delayFactor = 1.8;
                } else if (hour === 10 || hour === 15) {
                    delayFactor = 1.35;
                }
            } else {
                if (hour === 14) {
                    delayFactor = 1.3;
                } else if (hour === 19) {
                    delayFactor = 1.7;
                }
            }

            const carDurationMin = Math.round((baseDist / carSpeed) * 60 * delayFactor);
            const transitDurationMin = Math.round((baseDist / transitSpeed) * 60 * (delayFactor * 0.9));

            const lineOptions = ["קו 25", "קו 189", "קו 74", "קו 10", "קו 149", "קו 4", "קו 5", "קו 125"];
            const transitLegs = [];
            
            if (baseDist > 3.5) {
                transitLegs.push(lineOptions[Math.floor(Math.random() * 4)]);
                const rand = Math.random();
                if (rand > 0.6) {
                    transitLegs.push("רכבת קלה");
                } else if (rand > 0.3) {
                    transitLegs.push("רכבת");
                } else {
                    transitLegs.push(lineOptions[Math.floor(Math.random() * 4) + 4]);
                }
            } else {
                transitLegs.push(lineOptions[Math.floor(Math.random() * lineOptions.length)]);
            }
            
            const transitLinesText = transitLegs.join(" ← ");

            results.destinations[dest.id].options.push({
                type: commute.type,
                time: commute.time,
                car: {
                    duration: carDurationMin < 5 ? 5 : carDurationMin,
                    distance: baseDist.toFixed(1)
                },
                transit: {
                    duration: transitDurationMin < 8 ? 8 : transitDurationMin,
                    distance: baseDist.toFixed(1),
                    lines: transitLinesText
                }
            });
        });
    });

    return results;
}

// Render dynamic elements to SVG map (Mock Mode)
function renderMockSearchElements(originCoords, busStops, railCoords) {
    const markersGroup = document.getElementById("mock-markers");
    if (!markersGroup) return;
    
    renderMockConstantMarkers();
    
    const originSvg = convertLatLngToSvg(originCoords.lat, originCoords.lng);
    
    // Origin Pin (Green)
    const originG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    originG.setAttribute("class", "mock-pin");
    originG.setAttribute("transform", `translate(${originSvg.x}, ${originSvg.y})`);
    originG.innerHTML = `
        <path d="M0,0 C-8,-8 -12,-16 -12,-24 A12,12 0 0,1 12,-24 C12,-16 8,-8 0,0 Z" fill="#34a853" stroke="#ffffff" stroke-width="1.5" />
        <circle cx="0" cy="-24" r="4" fill="#ffffff" />
        <text x="0" y="15" text-anchor="middle" class="mock-pin-label">מיקום מוצא</text>
    `;
    markersGroup.appendChild(originG);

    // Bus stops paths & markers
    if (busStops) {
        busStops.forEach((stop, index) => {
            if (!stop.lat) return;
            const stopSvg = convertLatLngToSvg(stop.lat, stop.lng);
            
            // Path (dashed yellow line)
            const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "line");
            pathEl.setAttribute("x1", originSvg.x);
            pathEl.setAttribute("y1", originSvg.y);
            pathEl.setAttribute("x2", stopSvg.x);
            pathEl.setAttribute("y2", stopSvg.y);
            pathEl.setAttribute("stroke", "#fbc02d");
            pathEl.setAttribute("stroke-width", "3");
            pathEl.setAttribute("stroke-dasharray", "5,5");
            pathEl.setAttribute("class", `mock-bus-element${activeToggles.bus ? "" : " hidden"}`);
            markersGroup.appendChild(pathEl);
            
            // Pin (yellow circle)
            const pinG = document.createElementNS("http://www.w3.org/2000/svg", "g");
            pinG.setAttribute("class", `mock-pin mock-bus-element${activeToggles.bus ? "" : " hidden"}`);
            pinG.setAttribute("transform", `translate(${stopSvg.x}, ${stopSvg.y})`);
            pinG.innerHTML = `
                <circle cx="0" cy="0" r="12" fill="#fbc02d" stroke="#ffffff" stroke-width="1.5" />
            `;
            markersGroup.appendChild(pinG);
        });
    }

    // Rail path & marker
    if (railCoords && railCoords.lat && railCoords.lng && railCoords.name && railCoords.name !== "אין תחנה קרובה במרחק הליכה סביר") {
        const railSvg = convertLatLngToSvg(railCoords.lat, railCoords.lng);
        
        // Path (dashed red line)
        const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "line");
        pathEl.setAttribute("x1", originSvg.x);
        pathEl.setAttribute("y1", originSvg.y);
        pathEl.setAttribute("x2", railSvg.x);
        pathEl.setAttribute("y2", railSvg.y);
        pathEl.setAttribute("stroke", "#d32f2f");
        pathEl.setAttribute("stroke-width", "3");
        pathEl.setAttribute("stroke-dasharray", "5,5");
        pathEl.setAttribute("class", `mock-rail-element${activeToggles.rail ? "" : " hidden"}`);
        markersGroup.appendChild(pathEl);
        
        // Pin (red circle with white inner circle)
        const pinG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        pinG.setAttribute("class", `mock-pin mock-rail-element${activeToggles.rail ? "" : " hidden"}`);
        pinG.setAttribute("transform", `translate(${railSvg.x}, ${railSvg.y})`);
        pinG.innerHTML = `
            <circle cx="0" cy="0" r="12" fill="#d32f2f" stroke="#ffffff" stroke-width="1.5" />
            <circle cx="0" cy="0" r="4" fill="#ffffff" />
            <text x="0" y="22" text-anchor="middle" class="mock-pin-label">${railCoords.name}</text>
        `;
        markersGroup.appendChild(pinG);
    }
}

// Highlight routing path in Mock mode
function drawMockRoute(fromLat, fromLng, toLat, toLng, travelMode) {
    document.querySelectorAll(".mock-route-segment").forEach(el => el.remove());
    
    const pathEl = document.getElementById("mock-route-path");
    if (!pathEl) return;
    pathEl.classList.add("hidden");
    
    const start = convertLatLngToSvg(fromLat, fromLng);
    const end = convertLatLngToSvg(toLat, toLng);
    
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    
    if (travelMode === "car") {
        const cx = start.x + dx/2 - dy/6;
        const cy = start.y + dy/2 + dx/6;
        
        pathEl.setAttribute("d", `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`);
        pathEl.setAttribute("stroke", "#1a73e8");
        pathEl.setAttribute("marker-end", "url(#arrow-blue)");
        pathEl.classList.remove("hidden");
    } else {
        // Transit path components (Walk -> Transit -> Walk)
        const walk1Ratio = 0.12;
        const walk2Ratio = 0.88;
        
        const tStart = {
            x: start.x + dx * walk1Ratio + (dy * 0.05),
            y: start.y + walk1Ratio * dy - (dx * 0.05)
        };
        
        const tEnd = {
            x: start.x + dx * walk2Ratio + (dy * 0.05),
            y: start.y + walk2Ratio * dy - (dx * 0.05)
        };
        
        const svgNS = "http://www.w3.org/2000/svg";
        const markersGroup = document.getElementById("mock-markers");
        
        // 1. Walk Leg 1
        const walk1 = document.createElementNS(svgNS, "line");
        walk1.setAttribute("x1", start.x);
        walk1.setAttribute("y1", start.y);
        walk1.setAttribute("x2", tStart.x);
        walk1.setAttribute("y2", tStart.y);
        walk1.setAttribute("stroke", "#70757a");
        walk1.setAttribute("stroke-width", "3");
        walk1.setAttribute("stroke-dasharray", "4,4");
        walk1.setAttribute("class", "mock-route-segment");
        markersGroup.appendChild(walk1);
        
        // 2. Transit Legs (Draw multiple colored segments if active option has multiple legs)
        const activeOption = document.querySelector(".time-option.transit-option.active");
        let transitLegsCount = 1;
        if (activeOption) {
            const detailsEl = activeOption.querySelector(".option-details");
            if (detailsEl && detailsEl.textContent) {
                const parts = detailsEl.textContent.split("←");
                transitLegsCount = Math.max(1, parts.length);
            }
        }
        
        const tDx = tEnd.x - tStart.x;
        const tDy = tEnd.y - tStart.y;
        
        if (transitLegsCount === 1) {
            const transitLeg = document.createElementNS(svgNS, "path");
            const tCx = tStart.x + tDx/2 - tDy/8;
            const tCy = tStart.y + tDy/2 + tDx/8;
            
            transitLeg.setAttribute("d", `M ${tStart.x} ${tStart.y} Q ${tCx} ${tCy} ${tEnd.x} ${tEnd.y}`);
            transitLeg.setAttribute("stroke", "#ff9800"); // Standard Orange
            transitLeg.setAttribute("stroke-width", "5");
            transitLeg.setAttribute("fill", "none");
            transitLeg.setAttribute("marker-end", "url(#arrow-orange)");
            transitLeg.setAttribute("class", "mock-route-segment");
            markersGroup.appendChild(transitLeg);
        } else {
            // Draw multiple colored segments to represent the different transit legs
            const colors = ["#1976d2", "#388e3c", "#7b1fa2", "#d32f2f"]; // Blue, Green, Purple, Red
            for (let i = 0; i < transitLegsCount; i++) {
                const ratioStart = i / transitLegsCount;
                const ratioEnd = (i + 1) / transitLegsCount;
                
                const legStart = {
                    x: tStart.x + tDx * ratioStart,
                    y: tStart.y + tDy * ratioStart
                };
                const legEnd = {
                    x: tStart.x + tDx * ratioEnd,
                    y: tStart.y + tDy * ratioEnd
                };
                
                const legDx = legEnd.x - legStart.x;
                const legDy = legEnd.y - legStart.y;
                const legCx = legStart.x + legDx/2 - legDy/8;
                const legCy = legStart.y + legDy/2 + legDx/8;
                
                const transitLeg = document.createElementNS(svgNS, "path");
                transitLeg.setAttribute("d", `M ${legStart.x} ${legStart.y} Q ${legCx} ${legCy} ${legEnd.x} ${legEnd.y}`);
                transitLeg.setAttribute("stroke", colors[i % colors.length]);
                transitLeg.setAttribute("stroke-width", "5");
                transitLeg.setAttribute("fill", "none");
                transitLeg.setAttribute("class", "mock-route-segment");
                
                // Add arrow marker to the final leg
                if (i === transitLegsCount - 1) {
                    transitLeg.setAttribute("marker-end", "url(#arrow-orange)");
                }
                markersGroup.appendChild(transitLeg);
            }
        }
        
        // 3. Walk Leg 2
        const walk2 = document.createElementNS(svgNS, "line");
        walk2.setAttribute("x1", tEnd.x);
        walk2.setAttribute("y1", tEnd.y);
        walk2.setAttribute("x2", end.x);
        walk2.setAttribute("y2", end.y);
        walk2.setAttribute("stroke", "#70757a");
        walk2.setAttribute("stroke-width", "3");
        walk2.setAttribute("stroke-dasharray", "4,4");
        walk2.setAttribute("class", "mock-route-segment");
        markersGroup.appendChild(walk2);
    }
}
