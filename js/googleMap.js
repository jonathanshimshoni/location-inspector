// Location Inspector - Live Google Maps SDK Layer

function loadLiveGoogleMaps() {
    const script = document.getElementById("google-maps-script");
    if (script.src) return; // Already loading
    
    const logTracker = logApiRequest('maploads', { text: "טעינת מפת Google JavaScript SDK" });
    
    // Check Map loads cap
    try {
        checkApiCap('maploads', 1);
    } catch(e) {
        console.warn(e.message);
        logTracker.fail(e.message);
        return;
    }
    incrementCounter('maploads', 1);
    
    window.mapLoadLogTracker = logTracker;
    
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&language=he&region=IL&libraries=places&callback=initLiveGoogleMaps`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
        if (window.mapLoadLogTracker) {
            window.mapLoadLogTracker.fail("שגיאה בטעינת קובץ ה-SDK מהשרת");
        }
    };
}

window.initLiveGoogleMaps = function() {
    if (window.mapLoadLogTracker) {
        window.mapLoadLogTracker.success({ text: "מפת Google JavaScript SDK נטענה בהצלחה" });
    }
    
    // Hide SVG overlay
    document.getElementById("mock-map-overlay").classList.add("hidden");
    
    // Initialize standard Map
    googleMap = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 32.0808, lng: 34.7805 }, // Rabin Square
        zoom: 13,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    });
    
    googleDirectionsService = new google.maps.DirectionsService();
    googleDirectionsRenderer = new google.maps.DirectionsRenderer({
        map: googleMap,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: {
            strokeColor: "#1a73e8",
            strokeWeight: 5
        }
    });

    // Hook Google Autocomplete to search box
    const input = document.getElementById("address-input");
    const options = {
        componentRestrictions: { country: "il" },
        fields: ["geometry", "name", "formatted_address"],
        origin: googleMap.getCenter()
    };
    
    const autocomplete = new google.maps.places.Autocomplete(input, options);
    autocomplete.bindTo("bounds", googleMap);
    
    autocomplete.addListener("place_changed", () => {
        const logTracker = logApiRequest('autocomplete', { text: "בחירת כתובת מתוך השלמה" });
        try {
            const place = autocomplete.getPlace();
            if (!place.geometry || !place.geometry.location) {
                selectedAddress = null;
                logTracker.fail("הכתובת שנבחרה אינה כוללת מידע גיאוגרפי");
                return;
            }
            
            selectedAddress = {
                name: place.formatted_address || place.name,
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng()
            };
            logTracker.success({ text: `נבחרה כתובת: ${selectedAddress.name}` });
            
            // Automatically execute search upon selecting from autocomplete
            performSearch();
        } catch (err) {
            logTracker.fail(`שגיאה בבחירת מיקום: ${err.message}`);
        }
    });
};

function fetchWalkingDirections(origin, target) {
    return new Promise((resolve) => {
        try {
            checkApiCap('directions', 1);
            incrementCounter('directions', 1);
        } catch (e) {
            console.warn(`[Walking Directions Fallback] Cap exceeded: ${e.message}`);
            resolve({
                status: 'CAP_EXCEEDED',
                distance: Math.round(calculateDistance(origin.lat, origin.lng, target.lat, target.lng) * 1000),
                duration: Math.round(Math.round(calculateDistance(origin.lat, origin.lng, target.lat, target.lng) * 1000) / 80),
                path: [
                    { lat: origin.lat, lng: origin.lng },
                    { lat: target.lat, lng: target.lng }
                ]
            });
            return;
        }

        const directionsService = new google.maps.DirectionsService();
        directionsService.route({
            origin: new google.maps.LatLng(origin.lat, origin.lng),
            destination: new google.maps.LatLng(target.lat, target.lng),
            travelMode: google.maps.TravelMode.WALKING
        }, (response, status) => {
            if (status === 'OK' && response && response.routes && response.routes[0]) {
                const route = response.routes[0];
                const leg = route.legs[0];
                resolve({
                    status: 'OK',
                    duration: Math.round(leg.duration.value / 60),
                    distance: leg.distance.value,
                    path: route.overview_path.map(p => ({ lat: p.lat(), lng: p.lng() }))
                });
            } else {
                console.warn(`[Walking Directions Fallback] API status ${status} for ${target.name}`);
                resolve({
                    status: 'FAIL',
                    distance: Math.round(calculateDistance(origin.lat, origin.lng, target.lat, target.lng) * 1000),
                    duration: Math.round(Math.round(calculateDistance(origin.lat, origin.lng, target.lat, target.lng) * 1000) / 80),
                    path: [
                        { lat: origin.lat, lng: origin.lng },
                        { lat: target.lat, lng: target.lng }
                    ]
                });
            }
        });
    });
}

function queryLiveAPIs(origin, searchId) {
    const results = {
        destinations: {},
        originLat: origin.lat,
        originLng: origin.lng
    };

    if (googleDirectionsRenderer) {
        googleDirectionsRenderer.setDirections({ routes: [] });
    }

    googleMap.setCenter({ lat: origin.lat, lng: origin.lng });
    googleMap.setZoom(14);

    // Render a marker at search origin
    const originMarker = new google.maps.Marker({
        position: { lat: origin.lat, lng: origin.lng },
        map: googleMap,
        title: "מוצא",
        icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
        }
    });
    liveMarkers.origin = originMarker;

    // 1. Nearby Search for 3 Bus Stops (Places API)
    const placesLog = logApiRequest('places', { text: `חיפוש תחנות אוטובוס קרובות ל-${origin.name}` });
    
    try {
        checkApiCap('places', 1);
        incrementCounter('places', 1);
    } catch(e) {
        placesLog.fail(e.message);
        document.getElementById("loader").classList.add("hidden");
        enableSearchUI();
        return;
    }
    
    try {
        const placesService = new google.maps.places.PlacesService(googleMap);
        const busRequest = {
            location: { lat: origin.lat, lng: origin.lng },
            type: 'transit_station', // Broad search type to capture roadside bus stops
            rankBy: google.maps.places.RankBy.DISTANCE
        };

        results.busStops = [];

        placesService.nearbySearch(busRequest, (placeResults, status) => {
            if (searchId !== currentSearchId) {
                console.log("[Race Condition Prevented] Ignoring obsolete Places API results");
                return;
            }
            try {
                const walkTargets = [];
                if (status === google.maps.places.PlacesServiceStatus.OK && placeResults && placeResults.length > 0) {
                    // Filter out train and light rail stations to keep only roadside bus stops
                    const busStopsFound = placeResults.filter(place => {
                        const types = place.types || [];
                        return !types.includes('train_station') && 
                               !types.includes('light_rail_station') && 
                               !types.includes('subway_station');
                    });
                    
                    placesLog.success({ text: `נמצאו ${busStopsFound.length} תחנות אוטובוס קרובות` });
                    const numStops = Math.min(3, busStopsFound.length);
                    for (let i = 0; i < numStops; i++) {
                        const busPlace = busStopsFound[i];
                        const stopObj = {
                            name: busPlace.name,
                            lat: busPlace.geometry.location.lat(),
                            lng: busPlace.geometry.location.lng(),
                            isBus: true,
                            index: i
                        };
                        results.busStops.push(stopObj);
                        walkTargets.push(stopObj);
                    }
                } else {
                    placesLog.fail(`שגיאה בחיפוש תחנות: ${status}`);
                    results.busStops = [
                        { name: "לא נמצאו תחנות אוטובוס קרובות", duration: "-", distance: 0 }
                    ];
                }

                // 2. Light Rail Station (filtered locally)
                let closestRail = null;
                let minRailDist = Infinity;
                LIGHT_RAIL_STATIONS.forEach(station => {
                    const dist = calculateDistance(origin.lat, origin.lng, station.lat, station.lng) * 1000;
                    if (dist < minRailDist) {
                        minRailDist = dist;
                        closestRail = station;
                    }
                });

                if (closestRail) {
                    results.rail = {
                        name: closestRail.name,
                        lat: closestRail.lat,
                        lng: closestRail.lng,
                        isRail: true
                    };
                    walkTargets.push(results.rail);
                } else {
                    results.rail = { name: "לא נמצאה תחנת רכבת קלה קרובה", duration: "-", distance: 0 };
                }

                // 3. Batch Walk Queries
                if (walkTargets.length > 0) {
                    const directionsLog = logApiRequest('directions', {
                        text: `חישוב מסלולי הליכה מפורטים עבור ${walkTargets.length} תחנות`,
                        elements: walkTargets.length
                    });
                    
                    try {
                        checkApiCap('directions', walkTargets.length);
                    } catch (e) {
                        directionsLog.fail(e.message);
                        queryCommuteTimes(origin, results, searchId);
                        return;
                    }

                    const promises = walkTargets.map(target => {
                        return fetchWalkingDirections(origin, target).then(res => {
                            target.duration = res.duration;
                            target.distance = res.distance;
                            target.path = res.path;
                            return target;
                        });
                    });

                    Promise.all(promises).then((processedTargets) => {
                        if (searchId !== currentSearchId) {
                            console.log("[Race Condition Prevented] Ignoring obsolete walking directions results");
                            return;
                        }
                        directionsLog.success({ text: `חושבו מסלולי הליכה ומרחקים עבור ${processedTargets.length} תחנות` });
                        
                        processedTargets.forEach(target => {
                            createLiveStopMapElements(origin, target, target.path, !!target.isBus);
                        });
                        
                        queryCommuteTimes(origin, results, searchId);
                    }).catch(err => {
                        directionsLog.fail(`שגיאה בעיבוד מסלולי הליכה: ${err.message}`);
                        walkTargets.forEach(t => {
                            t.distance = Math.round(calculateDistance(origin.lat, origin.lng, t.lat, t.lng) * 1000);
                            t.duration = Math.round(t.distance / 80);
                            t.path = [
                                { lat: origin.lat, lng: origin.lng },
                                { lat: t.lat, lng: t.lng }
                            ];
                            createLiveStopMapElements(origin, t, t.path, !!t.isBus);
                        });
                        queryCommuteTimes(origin, results, searchId);
                    });
                } else {
                    queryCommuteTimes(origin, results, searchId);
                }
            } catch (err) {
                placesLog.fail(`שגיאה בעיבוד תחנות אוטובוס: ${err.message}`);
                queryCommuteTimes(origin, results, searchId);
            }
        });
    } catch (err) {
        placesLog.fail(`שגיאה באתחול חיפוש תחנות: ${err.message}`);
        document.getElementById("loader").classList.add("hidden");
        enableSearchUI();
    }
}

function queryCommuteTimes(origin, results, searchId) {
    let pendingRequests = 0;
    
    // Count commutes to allocate requests correctly
    CONSTANT_LOCATIONS.forEach(dest => {
        pendingRequests += dest.commutes.length * 2; // 1 driving + 1 transit per commute
    });
    
    const totalRequests = pendingRequests;
    const matrixLog = logApiRequest('matrix', {
        text: `חישוב זמני הגעה ליעדים קבועים עבור ${origin.name} (${totalRequests} אלמנטים)`,
        elements: totalRequests
    });
    
    // Safe mode element tracking increment
    try {
        checkApiCap('matrix', pendingRequests);
        incrementCounter('matrix', pendingRequests);
    } catch(e) {
        matrixLog.fail(e.message);
        document.getElementById("loader").classList.add("hidden");
        enableSearchUI();
        return;
    }
    
    let succeededCount = 0;
    let failedCount = 0;
    
    function checkComplete() {
        pendingRequests--;
        if (pendingRequests === 0) {
            if (searchId !== currentSearchId) {
                console.log("[Race Condition Prevented] Ignoring obsolete live API results");
                return;
            }
            if (failedCount === 0) {
                matrixLog.success({ text: `חושבו בהצלחה זמני הגעה עבור ${totalRequests} אלמנטים` });
            } else {
                matrixLog.fail(`נכשלו ${failedCount} מתוך ${totalRequests} חישובי זמני נסיעה`);
            }
            saveToCache(origin.name, origin.lat, origin.lng, results);
            renderResults(results);
            document.getElementById("loader").classList.add("hidden");
            document.getElementById("results-section").classList.remove("hidden");
            enableSearchUI();
        }
    }
    
    CONSTANT_LOCATIONS.forEach(dest => {
        results.destinations[dest.id] = {
            id: dest.id,
            name: dest.name,
            lat: dest.lat,
            lng: dest.lng,
            options: new Array(dest.commutes.length) // Pre-allocate array to preserve order
        };
        
        dest.commutes.forEach((commute, commuteIdx) => {
            const isTo = commute.type === "to";
            const targetDate = getNextMondayAt(commute.time);
            const originLoc = new google.maps.LatLng(origin.lat, origin.lng);
            const destLoc = new google.maps.LatLng(dest.lat, dest.lng);
            
            const distanceMatrixService = new google.maps.DistanceMatrixService();
            
            let carDuration = "-";
            let carDistText = "-";
            
            function runTransitQuery() {
                try {
                    distanceMatrixService.getDistanceMatrix({
                        origins: [originLoc],
                        destinations: [destLoc],
                        travelMode: google.maps.TravelMode.TRANSIT,
                        transitOptions: isTo ? { arrivalTime: targetDate } : { departureTime: targetDate }
                    }, (transitResponse, transitStatus) => {
                        try {
                            let transitDuration = "-";
                            let transitDistText = "-";
                            let transitLinesText = "הליכה ← קווי תחבורה";
                            
                            if (transitStatus === 'OK' && transitResponse && transitResponse.rows && transitResponse.rows[0]) {
                                const element = transitResponse.rows[0].elements[0];
                                if (element && element.status === 'OK') {
                                    transitDuration = Math.round(element.duration.value / 60);
                                    transitDistText = (element.distance.value / 1000).toFixed(1);
                                    succeededCount++;
                                } else {
                                    failedCount++;
                                }
                            } else {
                                failedCount++;
                            }
                            
                            results.destinations[dest.id].options[commuteIdx] = {
                                type: commute.type,
                                time: commute.time,
                                car: {
                                    duration: carDuration,
                                    distance: carDistText
                                },
                                transit: {
                                    duration: transitDuration,
                                    distance: transitDistText,
                                    lines: transitLinesText
                                }
                            };
                            checkComplete();
                        } catch (err) {
                            console.error("Error in DistanceMatrix callback:", err);
                            failedCount++;
                            results.destinations[dest.id].options[commuteIdx] = {
                                type: commute.type,
                                time: commute.time,
                                car: {
                                    duration: carDuration,
                                    distance: carDistText
                                },
                                transit: {
                                    duration: transitDuration,
                                    distance: transitDistText,
                                    lines: transitLinesText
                                }
                            };
                            checkComplete();
                        }
                    });
                } catch (err) {
                    console.error("Error starting DistanceMatrix transit query:", err);
                    failedCount++;
                    results.destinations[dest.id].options[commuteIdx] = {
                        type: commute.type,
                        time: commute.time,
                        car: {
                            duration: carDuration,
                            distance: carDistText
                        },
                        transit: {
                            duration: "-",
                            distance: "-",
                            lines: "שגיאה"
                        }
                    };
                    checkComplete();
                }
            }

            try {
                distanceMatrixService.getDistanceMatrix({
                    origins: [originLoc],
                    destinations: [destLoc],
                    travelMode: google.maps.TravelMode.DRIVING,
                    drivingOptions: {
                        departureTime: targetDate,
                        trafficModel: google.maps.TrafficModel.BEST_GUESS
                    }
                }, (driveResponse, driveStatus) => {
                    try {
                        if (driveStatus === 'OK') {
                            succeededCount++;
                            if (driveResponse && driveResponse.rows && driveResponse.rows[0]) {
                                const element = driveResponse.rows[0].elements[0];
                                if (element && element.status === 'OK') {
                                    const durationSec = element.duration_in_traffic ? element.duration_in_traffic.value : element.duration.value;
                                    carDuration = Math.round(durationSec / 60);
                                    carDistText = (element.distance.value / 1000).toFixed(1);
                                }
                            }
                        } else {
                            failedCount++;
                        }
                        
                        runTransitQuery();
                        checkComplete();
                    } catch (err) {
                        console.error("Error in driving callback:", err);
                        failedCount++;
                        runTransitQuery();
                        checkComplete();
                    }
                });
            } catch (err) {
                console.error("Error starting driving query:", err);
                failedCount++;
                runTransitQuery();
                checkComplete();
            }
        });
    });
}

// Generate Date object for Next Monday at custom HH:MM
function getNextMondayAt(timeStr) {
    const now = new Date();
    const date = new Date();
    
    const currentDay = now.getDay(); // 0 is Sunday, 1 is Monday...
    const daysToAdd = (currentDay === 0) ? 1 : 8 - currentDay;
    date.setDate(now.getDate() + daysToAdd);
    
    const parts = timeStr.split(":");
    date.setHours(parseInt(parts[0]), parseInt(parts[1]), 0, 0);
    
    return date;
}

function resetLiveMarkers() {
    if (liveMarkers.origin) liveMarkers.origin.setMap(null);
    if (liveMarkers.bus) {
        liveMarkers.bus.forEach(m => { if (m) m.setMap(null); });
    }
    if (liveMarkers.busPaths) {
        liveMarkers.busPaths.forEach(p => { if (p) p.setMap(null); });
    }
    if (liveMarkers.rail) liveMarkers.rail.setMap(null);
    if (liveMarkers.railPath) liveMarkers.railPath.setMap(null);
    if (liveMarkers.destination) liveMarkers.destination.setMap(null);
    if (liveMarkers.constantLocationMarker) liveMarkers.constantLocationMarker.setMap(null);
    if (liveMarkers.transitLegMarkers) {
        liveMarkers.transitLegMarkers.forEach(m => { if (m) m.setMap(null); });
    }
    clearManualTransitPolylines();
    
    liveMarkers = {
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
}

function createLiveStopMapElements(origin, stop, path, isBus) {
    const marker = new google.maps.Marker({
        position: { lat: stop.lat, lng: stop.lng },
        map: isBus ? (activeToggles.bus ? googleMap : null) : (activeToggles.rail ? googleMap : null),
        title: stop.name,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: isBus ? 8 : 10,
            fillColor: isBus ? '#fbc02d' : '#d32f2f',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2
        }
    });

    const polyline = new google.maps.Polyline({
        path: path || [
            { lat: origin.lat, lng: origin.lng },
            { lat: stop.lat, lng: stop.lng }
        ],
        geodesic: true,
        strokeColor: isBus ? '#fbc02d' : '#d32f2f',
        strokeOpacity: 0,
        icons: [{
            icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.8,
                scale: 2,
                strokeColor: isBus ? '#fbc02d' : '#d32f2f'
            },
            offset: '0',
            repeat: '10px'
        }],
        map: isBus ? (activeToggles.bus ? googleMap : null) : (activeToggles.rail ? googleMap : null)
    });

    if (isBus) {
        liveMarkers.bus.push(marker);
        liveMarkers.busPaths.push(polyline);
    } else {
        liveMarkers.rail = marker;
        liveMarkers.railPath = polyline;
    }
}

function recreateCachedStops(origin, cached) {
    if (!cached) return;
    if (cached.busStops) {
        cached.busStops.forEach(stop => {
            if (!stop.lat) return;
            createLiveStopMapElements(origin, stop, stop.path, true);
        });
    }
    
    if (cached.rail && cached.rail.lat && cached.rail.lng) {
        createLiveStopMapElements(origin, cached.rail, cached.rail.path, false);
    }
}

function handleRouteSelection(destId, typeStr, timeStr, modeStr, originLat, originLng) {
    const dest = CONSTANT_LOCATIONS.find(d => d.id === destId);
    if (!dest) return;

    const latVal = (!isNaN(originLat) && originLat !== null && originLat !== undefined) ? originLat : (selectedAddress ? selectedAddress.lat : null);
    const lngVal = (!isNaN(originLng) && originLng !== null && originLng !== undefined) ? originLng : (selectedAddress ? selectedAddress.lng : null);

    if (latVal === null || lngVal === null || isNaN(latVal) || isNaN(lngVal)) {
        console.warn("[Route Selection] Cannot load route: invalid coordinates. Please re-run search.");
        return;
    }

    const fromLat = typeStr === "to" ? latVal : dest.lat;
    const fromLng = typeStr === "to" ? lngVal : dest.lng;
    const toLat = typeStr === "to" ? dest.lat : latVal;
    const toLng = typeStr === "to" ? dest.lng : lngVal;

    if (!isLiveMode) {
        logApiRequest('directions', {
            status: 'success',
            text: `חישוב מסלול (סימולציה) ל-${dest.name} (${modeStr === 'car' ? 'רכב' : 'תחבורה'})`
        });
        drawMockRoute(fromLat, fromLng, toLat, toLng, modeStr);
    } else {
        const cacheKey = `${fromLat.toFixed(6)},${fromLng.toFixed(6)}_to_${dest.id}_${typeStr}_${timeStr}_${modeStr}`;
        
        if (googleDirectionsRenderer) {
            googleDirectionsRenderer.setMap(modeStr === "car" ? googleMap : null); // Only attach for driving
            if (modeStr === "car") {
                googleDirectionsRenderer.setOptions({
                    suppressPolylines: false,
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: "#1a73e8",
                        strokeWeight: 6
                    }
                });
            }
        }

        // Draw custom destination/constant markers
        if (liveMarkers.destination) {
            liveMarkers.destination.setMap(null);
            liveMarkers.destination = null;
        }
        if (liveMarkers.constantLocationMarker) {
            liveMarkers.constantLocationMarker.setMap(null);
            liveMarkers.constantLocationMarker = null;
        }

        if (typeStr === "to") {
            // Constant location is the destination
            liveMarkers.destination = new google.maps.Marker({
                position: { lat: toLat, lng: toLng },
                map: googleMap,
                title: dest.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 6, // Small circle
                    fillColor: '#800080', // Purple circle for constant location
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });
        } else {
            // Constant location is the source (fromLat, fromLng)
            liveMarkers.constantLocationMarker = new google.maps.Marker({
                position: { lat: fromLat, lng: fromLng },
                map: googleMap,
                title: dest.name,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 6, // Small circle
                    fillColor: '#800080', // Purple circle for constant location
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2
                }
            });
        }

        if (directionsCache[cacheKey]) {
            const cacheLog = logApiRequest('directions', {
                text: `שליפת נתיב הגעה מהמטמון עבור ${dest.name} (${modeStr === 'car' ? 'רכב' : 'תחבורה'})`,
                isCached: true
            });
            setTimeout(() => {
                cacheLog.success({ text: `נתיב הגעה ל-${dest.name} נטען בהצלחה מהמטמון` });
            }, 200);
            
            console.log("[Directions Cache Hit]");
            if (modeStr === "car") {
                googleDirectionsRenderer.setDirections(directionsCache[cacheKey]);
                clearManualTransitPolylines();
            } else {
                clearManualTransitPolylines();
                drawManualTransitPolylines(directionsCache[cacheKey]);
                updateOptionTransitDetails(directionsCache[cacheKey]);
            }
            recordDirectionsSavings();
            return;
        }
        
        const directionsLog = logApiRequest('directions', {
            text: `בקשת נתיב הגעה ל-${dest.name} (${modeStr === 'car' ? 'נסיעה ברכב' : 'תחבורה ציבורית'})`
        });
        
        // Cap Check
        try {
            checkApiCap('directions', 1);
        } catch (e) {
            console.warn(e.message);
            directionsLog.fail(e.message);
            return;
        }
        
        incrementCounter('directions', 1);
        
        const travelMode = modeStr === "car" ? google.maps.TravelMode.DRIVING : google.maps.TravelMode.TRANSIT;
        const targetDate = getNextMondayAt(timeStr);
        
        const request = {
            origin: { lat: fromLat, lng: fromLng },
            destination: { lat: toLat, lng: toLng },
            travelMode: travelMode,
            transitOptions: travelMode === google.maps.TravelMode.TRANSIT ? (
                typeStr === "to" ? { arrivalTime: targetDate } : { departureTime: targetDate }
            ) : null,
            drivingOptions: travelMode === google.maps.TravelMode.DRIVING ? {
                departureTime: targetDate,
                trafficModel: google.maps.TrafficModel.BEST_GUESS
            } : null
        };

        try {
            googleDirectionsService.route(request, (result, status) => {
                try {
                    if (status === google.maps.DirectionsStatus.OK) {
                        directionsLog.success({ text: `נתיב הגעה ל-${dest.name} התקבל וצויר בהצלחה` });
                        directionsCache[cacheKey] = result;
                        
                        if (modeStr === "car") {
                            googleDirectionsRenderer.setDirections(result);
                            clearManualTransitPolylines();
                        } else {
                            clearManualTransitPolylines();
                            drawManualTransitPolylines(result);
                            updateOptionTransitDetails(result);
                        }
                    } else {
                        directionsLog.fail(`שגיאה בחישוב מסלול: ${status}`);
                        console.error("Directions service failed: " + status);
                    }
                } catch (err) {
                    console.error("Error in Directions callback:", err);
                    directionsLog.fail(`שגיאה בעיבוד נתיב: ${err.message}`);
                }
            });
        } catch (err) {
            console.error("Error starting Directions query:", err);
            directionsLog.fail(`שגיאה באתחול נתיב: ${err.message}`);
        }
    }
}

function updateOptionTransitDetails(result) {
    if (result.routes && result.routes[0]) {
        const route = result.routes[0];
        const leg = route.legs[0];
        const transitLegs = [];
        
        if (leg && leg.steps) {
            leg.steps.forEach(step => {
                if (step.travel_mode === 'TRANSIT') {
                    const transitDetails = step.transit;
                    const lineShortName = transitDetails?.line?.short_name || transitDetails?.line?.name || "עירוני";
                    const vehicleType = transitDetails?.line?.vehicle?.type;
                    
                    let vehicleLabel = "קו " + lineShortName;
                    const isLightRail = vehicleType === 'TRAM' || vehicleType === 'SUBWAY' || vehicleType === 'METRO_RAIL';
                    const isHeavyRail = vehicleType === 'HEAVY_RAIL' || vehicleType === 'COMMUTER_TRAIN' || vehicleType === 'HIGH_SPEED_TRAIN' || vehicleType === 'RAIL';
                    
                    if (isLightRail) {
                        vehicleLabel = "רכבת קלה";
                    } else if (isHeavyRail) {
                        vehicleLabel = "רכבת";
                    }
                    
                    transitLegs.push(vehicleLabel);
                }
            });
            
            const transitLinesText = transitLegs.join(" ← ");
            const activeOption = document.querySelector(".time-option.transit-option.active");
            if (activeOption) {
                const detailsEl = activeOption.querySelector(".option-details");
                if (detailsEl) {
                    detailsEl.textContent = transitLinesText;
                    detailsEl.setAttribute("title", transitLinesText);
                }
            }
        }
    }
}

function clearMapRoute() {
    if (!isLiveMode) {
        const pathEl = document.getElementById("mock-route-path");
        if (pathEl) {
            pathEl.setAttribute("d", "");
            pathEl.classList.add("hidden");
        }
        document.querySelectorAll(".mock-route-segment").forEach(el => el.remove());
    } else {
        if (googleDirectionsRenderer) {
            googleDirectionsRenderer.setDirections({ routes: [] });
            googleDirectionsRenderer.setMap(null);
        }
        clearManualTransitPolylines();
        if (liveMarkers.destination) {
            liveMarkers.destination.setMap(null);
            liveMarkers.destination = null;
        }
        if (liveMarkers.constantLocationMarker) {
            liveMarkers.constantLocationMarker.setMap(null);
            liveMarkers.constantLocationMarker = null;
        }
    }
}

function clearManualTransitPolylines() {
    if (liveMarkers.transitLegPolylines) {
        liveMarkers.transitLegPolylines.forEach(p => {
            if (p) p.setMap(null);
        });
    }
    liveMarkers.transitLegPolylines = [];
    if (liveMarkers.transitLegMarkers) {
        liveMarkers.transitLegMarkers.forEach(m => {
            if (m) m.setMap(null);
        });
    }
    liveMarkers.transitLegMarkers = [];
}

function drawManualTransitPolylines(result) {
    if (!result || !result.routes || !result.routes[0]) return;
    
    const route = result.routes[0];
    const leg = route.legs[0];
    if (!leg || !leg.steps) return;
    
    let transitLegIndex = 0;
    const transitColors = ["#1976d2", "#388e3c", "#f57c00", "#7b1fa2", "#d32f2f"]; // Blue, Green, Orange, Purple, Red
    
    leg.steps.forEach(step => {
        if (step.travel_mode === 'WALKING') {
            // Draw as dotted grey line
            const walkPoly = new google.maps.Polyline({
                path: step.path,
                strokeColor: '#70757a',
                strokeOpacity: 0,
                icons: [{
                    icon: {
                        path: 'M 0,-1 0,1',
                        strokeOpacity: 0.8,
                        scale: 2,
                        strokeWeight: 2
                    },
                    offset: '0',
                    repeat: '8px'
                }],
                map: googleMap
            });
            liveMarkers.transitLegPolylines.push(walkPoly);
        } else if (step.travel_mode === 'TRANSIT') {
            const transitDetails = step.transit;
            const vehicleType = transitDetails?.line?.vehicle?.type;
            
            const isLightRail = vehicleType === 'TRAM' || vehicleType === 'SUBWAY' || vehicleType === 'METRO_RAIL';
            const isHeavyRail = vehicleType === 'HEAVY_RAIL' || vehicleType === 'COMMUTER_TRAIN' || vehicleType === 'HIGH_SPEED_TRAIN' || vehicleType === 'RAIL';
            
            let color;
            if (vehicleType === 'BUS') {
                color = transitColors[transitLegIndex % transitColors.length];
                transitLegIndex++;
            } else if (isLightRail) {
                color = '#ff1744'; // Red/Pink for Light Rail
            } else if (isHeavyRail) {
                color = '#00a152'; // Green for Train
            } else {
                color = transitColors[transitLegIndex % transitColors.length];
                transitLegIndex++;
            }
            
            const transitPoly = new google.maps.Polyline({
                path: step.path,
                strokeColor: color,
                strokeOpacity: 0.9,
                strokeWeight: 6,
                map: googleMap
            });
            liveMarkers.transitLegPolylines.push(transitPoly);
            
            const isBus = vehicleType === 'BUS';
            
            if (isHeavyRail || isLightRail || isBus) {
                let labelText = "";
                let labelClassName = "";
                
                if (isHeavyRail) {
                    labelText = "רכבת";
                    labelClassName = "rail-map-label";
                } else if (isLightRail) {
                    labelText = "רכבת קלה";
                    labelClassName = "rail-map-label light-rail";
                } else if (isBus) {
                    const lineShortName = transitDetails?.line?.short_name || transitDetails?.line?.name || "";
                    labelText = lineShortName ? "קו " + lineShortName : "אוטובוס";
                    labelClassName = "bus-map-label";
                }
                
                if (labelText && step.path && step.path.length > 0) {
                    const midpointIndex = Math.floor(step.path.length / 2);
                    const midpoint = step.path[midpointIndex];
                    if (midpoint) {
                        const labelMarker = new google.maps.Marker({
                            position: midpoint,
                            map: googleMap,
                            icon: {
                                path: google.maps.SymbolPath.CIRCLE,
                                scale: 0
                            },
                            label: {
                                text: labelText,
                                color: isBus ? '#202124' : '#ffffff',
                                fontWeight: 'bold',
                                fontSize: '11px',
                                className: labelClassName
                            }
                        });
                        if (!liveMarkers.transitLegMarkers) {
                            liveMarkers.transitLegMarkers = [];
                        }
                        liveMarkers.transitLegMarkers.push(labelMarker);
                    }
                }
            }
        } else {
            const fallbackPoly = new google.maps.Polyline({
                path: step.path,
                strokeColor: '#1a73e8',
                strokeOpacity: 0.9,
                strokeWeight: 6,
                map: googleMap
            });
            liveMarkers.transitLegPolylines.push(fallbackPoly);
        }
    });
}
