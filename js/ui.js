// Location Inspector - UI & DOM Card Renderer Layer

function showNotification(message, isSuccess = false) {
    const existing = document.querySelector(".notification-toast");
    if (existing) existing.remove();
    
    const toast = document.createElement("div");
    toast.className = `notification-toast ${isSuccess ? 'success' : ''}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    }, 10);
    
    // Animate out
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(20px)";
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function disableSearchUI() {
    const input = document.getElementById("address-input");
    const btn = document.getElementById("search-btn");
    if (input) input.disabled = true;
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.6";
        btn.style.cursor = "not-allowed";
    }
}

function enableSearchUI() {
    const input = document.getElementById("address-input");
    const btn = document.getElementById("search-btn");
    if (input) input.disabled = false;
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
    }
}

// ==========================================
// RESULTS PANEL RENDERING
// ==========================================

function renderResults(results) {
    if (!results) return;

    // 1. Render 3 Bus Stops (Optimized: DOM document fragment batch)
    const busContainer = document.getElementById("bus-stops-container");
    if (busContainer) {
        busContainer.innerHTML = "";
        if (!results.busStops || results.busStops.length === 0) {
            const noStops = document.createElement("div");
            noStops.className = "no-stops-message";
            noStops.textContent = "לא נמצאו תחנות אוטובוס קרובות בטווח הליכה סביר.";
            busContainer.appendChild(noStops);
        } else {
            const fragment = document.createDocumentFragment();
            results.busStops.forEach((stop, index) => {
                const item = document.createElement("div");
                item.className = "walk-item" + (activeToggles.bus ? " active-toggle" : "");
                item.id = `bus-walk-${index}`;
                
                const lineMarkup = stop.lines ? `<span class="station-type" style="color: var(--text-secondary); margin-top: 2px;">${stop.lines}</span>` : "";
                
                item.innerHTML = `
                    <div class="bus-number-badge">${index + 1}</div>
                    <div class="walk-details">
                        <div class="walk-title-row">
                            <span class="station-name">${stop.name || "תחנה"}</span>
                            <span class="walk-time">${stop.duration || "-"} דק' הליכה</span>
                        </div>
                        ${lineMarkup}
                    </div>
                `;
                
                item.addEventListener("click", () => {
                    activeToggles.bus = !activeToggles.bus;
                    
                    document.querySelectorAll("[id^='bus-walk-']").forEach(el => {
                        el.classList.toggle("active-toggle", activeToggles.bus);
                    });
                    
                    document.querySelectorAll(".mock-bus-element").forEach(el => {
                        el.classList.toggle("hidden", !activeToggles.bus);
                    });
                    
                    if (isLiveMode) {
                        if (liveMarkers.bus) {
                            liveMarkers.bus.forEach(m => m.setMap(activeToggles.bus ? googleMap : null));
                        }
                        if (liveMarkers.busPaths) {
                            liveMarkers.busPaths.forEach(p => p.setMap(activeToggles.bus ? googleMap : null));
                        }
                    }
                });
                
                fragment.appendChild(item);
            });
            busContainer.appendChild(fragment);
        }
    }

    // 2. Render Light Rail
    const railNameEl = document.getElementById("rail-name");
    const railTimeEl = document.getElementById("rail-time");
    
    if (railNameEl && railTimeEl) {
        railNameEl.textContent = results.rail ? (results.rail.name || "-") : "-";
        railTimeEl.textContent = results.rail ? ((results.rail.duration || "-") + " דק' הליכה") : "-";
    }

    const railItem = document.getElementById("rail-walk-info");
    if (railItem) {
        railItem.className = "walk-item";
        const hasValidRail = results.rail && results.rail.name && 
                             results.rail.name !== "אין תחנה קרובה במרחק הליכה סביר" && 
                             results.rail.name !== "לא נמצאה תחנת רכבת קלה קרובה";
        if (activeToggles.rail && hasValidRail) {
            railItem.classList.add("active-toggle", "rail-active");
        }

        const newRailItem = railItem.cloneNode(true);
        railItem.parentNode.replaceChild(newRailItem, railItem);

        newRailItem.addEventListener("click", () => {
            if (!results.rail || results.rail.name === "אין תחנה קרובה במרחק הליכה סביר" || 
                results.rail.name === "לא נמצאה תחנת רכבת קלה קרובה") return;
            
            activeToggles.rail = !activeToggles.rail;
            newRailItem.classList.toggle("active-toggle", activeToggles.rail);
            newRailItem.classList.toggle("rail-active", activeToggles.rail);
            
            document.querySelectorAll(".mock-rail-element").forEach(el => {
                el.classList.toggle("hidden", !activeToggles.rail);
            });
            
            if (isLiveMode) {
                if (liveMarkers.rail) {
                    liveMarkers.rail.setMap(activeToggles.rail ? googleMap : null);
                }
                if (liveMarkers.railPath) {
                    liveMarkers.railPath.setMap(activeToggles.rail ? googleMap : null);
                }
            }
        });
    }

    // 3. Render destination options (Optimized: DOM fragment updates)
    const container = document.getElementById("destinations-container");
    if (container) {
        const fragment = document.createDocumentFragment();

        CONSTANT_LOCATIONS.forEach(dest => {
            const destResults = results.destinations[dest.id];
            if (!destResults || !destResults.options) return;

            const card = document.createElement("div");
            card.className = "results-card destination-card";
            card.id = `card-${dest.id}`;

            const allOptions = destResults.options.filter(o => o !== null);
            if (allOptions.length === 0) return;

            function getCombinedLabel(opt) {
                const isTo = opt.type === "to";
                return isTo ? `הלוך, הגעה ב-${opt.time}` : `חזור, יציאה ב-${opt.time}`;
            }

            const primaryOpt = allOptions[0];
            const primaryHtml = `
                <div class="commute-time-subgroup" style="margin-bottom: 12px;">
                    <div style="font-size: 15px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px;">${getCombinedLabel(primaryOpt)}</div>
                    <div class="commute-options-grid">
                        ${renderOptionMarkup(dest.id, primaryOpt, results.originLat, results.originLng)}
                    </div>
                </div>
            `;

            let secondaryHtml = "";
            if (allOptions.length > 1) {
                allOptions.slice(1).forEach(opt => {
                    secondaryHtml += `
                        <div class="commute-time-subgroup" style="margin-bottom: 12px;">
                            <div style="font-size: 15px; font-weight: 500; color: var(--text-secondary); margin-bottom: 6px;">${getCombinedLabel(opt)}</div>
                            <div class="commute-options-grid">
                                ${renderOptionMarkup(dest.id, opt, results.originLat, results.originLng)}
                            </div>
                        </div>
                    `;
                });
            }

            const cardHeader = document.createElement("h2");
            cardHeader.className = "destination-header";

            const hasSecondary = secondaryHtml !== "";
            let btnHtml = "";
            let arrowHtml = `<span class="destination-arrow" style="font-size: 10px; color: var(--text-secondary); transition: transform 0.2s ease; display: inline-block;">▼</span>`;
            if (hasSecondary) {
                btnHtml = `<button class="toggle-times-btn" data-dest="${dest.id}">הצג זמנים נוספים</button>`;
            }
            
            cardHeader.innerHTML = `
                <div class="destination-header-right">
                    <span class="destination-title-text">${dest.name}</span>
                    ${btnHtml}
                </div>
                <div class="destination-header-left">
                    ${arrowHtml}
                </div>
            `;
            card.appendChild(cardHeader);

            const cardContent = document.createElement("div");
            cardContent.className = "commute-tab-container";
            
            let contentHtml = primaryHtml;
            if (hasSecondary) {
                contentHtml += `
                    <div id="secondary-times-${dest.id}" class="secondary-times hidden" style="border-top: 1px dashed var(--border-color); padding-top: 12px; margin-top: 8px;">
                        ${secondaryHtml}
                    </div>
                `;
            }
            cardContent.innerHTML = contentHtml;
            card.appendChild(cardContent);
            fragment.appendChild(card);
        });

        container.innerHTML = "";
        container.appendChild(fragment);

        document.querySelectorAll(".time-option").forEach(el => {
            el.addEventListener("click", () => {
                const destId = el.getAttribute("data-dest");
                const timeStr = el.getAttribute("data-time");
                const typeStr = el.getAttribute("data-type");
                const modeStr = el.getAttribute("data-mode");
                const originLat = parseFloat(el.getAttribute("data-lat"));
                const originLng = parseFloat(el.getAttribute("data-lng"));

                const wasActive = el.classList.contains("active");

                document.querySelectorAll(".time-option").forEach(btn => btn.classList.remove("active"));

                if (wasActive) {
                    clearMapRoute();
                } else {
                    el.classList.add("active");
                    handleRouteSelection(destId, typeStr, timeStr, modeStr, originLat, originLng);
                }
            });
        });

        document.querySelectorAll(".toggle-times-btn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation(); 
                const destId = btn.getAttribute("data-dest");
                const secondaryDiv = document.getElementById(`secondary-times-${destId}`);
                if (secondaryDiv) {
                    const isHidden = secondaryDiv.classList.contains("hidden");
                    secondaryDiv.classList.toggle("hidden", !isHidden);
                    btn.classList.toggle("expanded", isHidden);
                    btn.textContent = isHidden ? "הסתר זמנים נוספים" : "הצג זמנים נוספים";
                }
            });
        });
    }
}

function renderOptionMarkup(destId, opt, originLat, originLng) {
    // Drive option card (blue themed)
    const carCard = `
        <div class="time-option drive-option" data-dest="${destId}" data-time="${opt.time}" data-type="${opt.type}" data-mode="car" data-lat="${originLat || ''}" data-lng="${originLng || ''}">
            <div class="option-meta" style="margin-bottom: 2px;">
                <span class="mode-icon car-small-icon"></span>
            </div>
            <div class="option-duration">${opt.car.duration} דק'</div>
        </div>
    `;

    // Transit option card (red themed)
    const transitCard = `
        <div class="time-option transit-option" data-dest="${destId}" data-time="${opt.time}" data-type="${opt.type}" data-mode="transit" data-lat="${originLat || ''}" data-lng="${originLng || ''}">
            <div class="option-meta" style="margin-bottom: 2px;">
                <span class="mode-icon transit-small-icon"></span>
            </div>
            <div class="option-duration">${opt.transit.duration} דק'</div>
            <div class="option-details" title="${opt.transit.lines}">${opt.transit.lines}</div>
        </div>
    `;

    return carCard + transitCard;
}
