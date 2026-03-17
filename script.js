let map, markerGroup, mapInitialized = false;
let allPlanes = [], currentGeo = null, currentRadius = 100;
let countdownInterval = null, refreshSeconds = 5;
let autoRefreshActive = false;

// Consent
const overlay = document.getElementById('consent-overlay');
const denied = document.getElementById('consent-denied');

document.getElementById('btn-accept').addEventListener('click', () => {
  overlay.style.display = 'none';
  localStorage.setItem('consent', 'accepted');
  initMap();
});
document.getElementById('btn-decline').addEventListener('click', () => {
  overlay.style.display = 'none';
  denied.style.display = 'flex';
  localStorage.setItem('consent', 'declined');
});
document.getElementById('btn-reopen').addEventListener('click', () => {
  denied.style.display = 'none';
  overlay.style.display = 'flex';
});

const savedConsent = localStorage.getItem('consent');
if (savedConsent === 'accepted') {
  overlay.style.display = 'none';
  initMap();
} else if (savedConsent === 'declined') {
  overlay.style.display = 'none';
  denied.style.display = 'flex';
}

function initMap() {
  if (mapInitialized) return;
  mapInitialized = true;
  map = L.map('map').setView([51.2, 6.8], 7);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap', maxZoom: 14
  }).addTo(map);
  markerGroup = L.layerGroup().addTo(map);
}

// Auto-Refresh
const refreshToggle = document.getElementById('refresh-toggle');
const countdownEl = document.getElementById('countdown');

refreshToggle.addEventListener('click', () => {
  autoRefreshActive = !autoRefreshActive;
  refreshToggle.classList.toggle('active', autoRefreshActive);
  autoRefreshActive ? startRefreshCycle() : stopRefreshCycle();
});

function startRefreshCycle() {
  stopRefreshCycle();
  let remaining = refreshSeconds;
  countdownEl.textContent = `${remaining}s`;
  countdownInterval = setInterval(() => {
    remaining--;
    countdownEl.textContent = `${remaining}s`;
    if (remaining <= 0) {
      remaining = refreshSeconds;
      if (currentGeo) fetchAndRender();
    }
  }, 1000);
}

function stopRefreshCycle() {
  clearInterval(countdownInterval);
  countdownEl.textContent = '';
}

// Filter
document.getElementById('filter-country').addEventListener('change', renderPlanes);
document.getElementById('filter-reset').addEventListener('click', () => {
  document.getElementById('filter-country').value = '';
  renderPlanes();
});

function updateCountryFilter(planes) {
  const select = document.getElementById('filter-country');
  const current = select.value;
  const countries = [...new Set(planes.map(s => s[2]).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Alle Länder</option>';
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (c === current) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderPlanes() {
  const filterCountry = document.getElementById('filter-country').value;
  const list = document.getElementById('plane-list');
  markerGroup.clearLayers();

  if (currentGeo) {
    L.circle([currentGeo.lat, currentGeo.lon], {
      radius: currentRadius * 1000, color: '#378ADD', fillColor: '#E6F1FB', fillOpacity: 0.2, weight: 1.5
    }).addTo(markerGroup);
    L.marker([currentGeo.lat, currentGeo.lon]).bindPopup(`<b>${currentGeo.name}</b>`).addTo(markerGroup);
  }

  const filtered = filterCountry ? allPlanes.filter(s => s[2] === filterCountry) : allPlanes;
  document.getElementById('sidebar-title').textContent = `${filtered.length} Flugzeuge${filterCountry ? ' (' + filterCountry + ')' : ''}`;
  list.innerHTML = '';

  if (!filtered.length) {
    list.innerHTML = '<div id="empty-state">Keine Flugzeuge gefunden.</div>';
    return;
  }

  filtered.forEach(s => {
    const callsign = (s[1] || 'N/A').trim();
    const icao24 = s[0] || '';
    const lat = s[6], lon = s[5];
    const alt = s[7] ? Math.round(s[7]) + ' m' : '–';
    const speed = s[9] ? Math.round(s[9] * 3.6) + ' km/h' : '–';
    const heading = s[10] || 0;
    const country = s[2] || '–';
    const dist = Math.round(haversine(currentGeo.lat, currentGeo.lon, lat, lon));

    const color = getPlaneColor(s);
    const vsRaw = s[11];
    const vsText = vsRaw > 0.5 ? '⬆ steigend' : vsRaw < -0.5 ? '⬇ sinkend' : '→ konstant';
    const onGround = s[8];
    const squawk = s[14] || '–';
    const isEmergency = ['7500','7600','7700'].includes(s[14]);
    const emergencyLabel = s[14] === '7700' ? '🚨 NOTFALL' : s[14] === '7500' ? '🚨 HIJACK' : s[14] === '7600' ? '🚨 FUNKAUSFALL' : '';

    const marker = L.marker([lat, lon], { icon: planeIcon(heading, color) }).addTo(markerGroup);
    marker.bindPopup(`
      <b>✈ ${callsign}</b>${isEmergency ? ' <span style="color:red;font-weight:bold">' + emergencyLabel + '</span>' : ''}<br>
      Land: ${country}<br>
      Höhe: ${alt}<br>
      Speed: ${speed}<br>
      Entfernung: ${dist} km<br>
      Vertikal: ${vsText}<br>
      Status: ${onGround ? '🛞 Am Boden' : '✈ In der Luft'}<br>
      Squawk: ${squawk}
    `);

    const card = document.createElement('div');
    card.className = 'plane-card';
    if (isEmergency) card.style.borderColor = '#e74c3c';
    card.innerHTML = `
      <div class="callsign">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:6px;flex-shrink:0;vertical-align:middle;"></span>
        ✈ ${callsign}${isEmergency ? ' <span style="color:#e74c3c;font-size:11px;">' + emergencyLabel + '</span>' : ''}
      </div>
      <div class="detail">Land: <b>${country}</b> &nbsp;|&nbsp; Höhe: <b>${alt}</b> &nbsp;|&nbsp; Speed: <b>${speed}</b> &nbsp;|&nbsp; ${dist} km &nbsp;|&nbsp; ${vsText}</div>`;
    card.addEventListener('click', () => { map.setView([lat, lon], 11); marker.openPopup(); });
    list.appendChild(card);
  });
}

function kmToDeg(km) { return km / 111; }

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function getPlaneColor(s) {
  const squawk = s[14] || '';
  const onGround = s[8];
  const vs = s[11]; // vertical speed m/s
  if (['7500','7600','7700'].includes(squawk)) return '#e74c3c'; // Notfall: rot
  if (onGround) return '#888888'; // Am Boden: grau
  if (vs > 0.5) return '#27ae60';  // Steigend: grün
  if (vs < -0.5) return '#2980b9'; // Sinkend: blau
  return '#000000'; // Höhe halten: schwarz
}

function planeIcon(heading, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 640 640" style="transform:rotate(${heading||0}deg);display:block;">
    <path fill="${color}" d="M264 88C264 57.1 289.1 32 320 32C350.9 32 376 57.1 376 88L376 215.3L549.6 374.5C556.2 380.6 560 389.1 560 398.1L560 441.8C560 452.7 549.3 460.4 538.9 457L376 402.7L376 502.4L442 555.2C445.8 558.2 448 562.8 448 567.7L448 587.5C448 597.9 438.2 605.5 428.1 603L320 576L211.9 603C201.8 605.5 192 597.9 192 587.5L192 567.7C192 562.8 194.2 558.2 198 555.2L264 502.4L264 402.7L101.1 457C90.7 460.4 80 452.7 80 441.8L80 398.1C80 389.1 83.8 380.6 90.4 374.5L264 215.3L264 88z"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
}

async function geocode(location) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
  const data = await res.json();
  if (!data.length) throw new Error('Ort nicht gefunden.');
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name.split(',')[0] };
}

async function fetchFlights(lat, lon, radius) {
  const deg = kmToDeg(radius);
  const url = `https://opensky-network.org/api/states/all?lamin=${lat-deg}&lomin=${lon-deg}&lamax=${lat+deg}&lomax=${lon+deg}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OpenSky API nicht erreichbar – evtl. Rate-Limit, kurz warten.');
  const data = await res.json();
  return data.states || [];
}

async function fetchAndRender() {
  const status = document.getElementById('status-bar');
  try {
    const states = await fetchFlights(currentGeo.lat, currentGeo.lon, currentRadius);
    allPlanes = states.filter(s => s[5] && s[6] && haversine(currentGeo.lat, currentGeo.lon, s[6], s[5]) <= currentRadius);
    updateCountryFilter(allPlanes);
    renderPlanes();
    status.textContent = `${allPlanes.length} Flugzeuge im Umkreis von ${currentRadius} km um ${currentGeo.name} – ${new Date().toLocaleTimeString('de-DE')}`;
  } catch(e) {
    status.textContent = 'Fehler: ' + e.message;
  }
}

async function searchFlights() {
  if (!mapInitialized) { alert('Bitte zuerst die Datenschutzerklärung akzeptieren.'); return; }
  const location = document.getElementById('location-input').value.trim();
  const radius = parseInt(document.getElementById('radius-input').value) || 100;
  const status = document.getElementById('status-bar');
  const btn = document.getElementById('search-btn');
  if (!location) { status.textContent = 'Bitte einen Ort eingeben.'; return; }

  btn.disabled = true;
  status.textContent = 'Suche Koordinaten...';
  document.getElementById('plane-list').innerHTML = '';

  try {
    const geo = await geocode(location);
    currentGeo = geo;
    currentRadius = radius;
    map.setView([geo.lat, geo.lon], 8);
    status.textContent = `${geo.name} gefunden – lade Flugdaten...`;
    await fetchAndRender();
    if (autoRefreshActive) startRefreshCycle();
  } catch(e) {
    status.textContent = 'Fehler: ' + e.message;
    document.getElementById('plane-list').innerHTML = `<div id="empty-state">${e.message}</div>`;
  }
  btn.disabled = false;
}

document.getElementById('search-btn').addEventListener('click', searchFlights);
document.getElementById('location-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') searchFlights();
});
