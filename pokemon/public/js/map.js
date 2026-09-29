import { esc, freshness, lastVisitHtml, directionsUrl } from "./util.js";

const US_CENTER = [39.8, -98.6];
const COLORS = { fresh: "#16a34a", visited: "#2563eb", stale: "#9ca3af" };

let map;
let layer;
const markers = new Map();

export function initMap(el, onAction) {
  map = L.map(el, { zoomControl: false }).setView(US_CENTER, 4);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  layer = L.layerGroup().addTo(map);

  // Popup buttons are plain HTML, so handle them with one delegated listener.
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) onAction(btn.dataset.action, Number(btn.dataset.id));
  });
  return map;
}

function popupHtml(s) {
  return `
    <div class="popup">
      <h3>${esc(s.name)}</h3>
      <p class="muted small">${s.chain ? `${esc(s.chain)} &middot; ` : ""}${esc(s.address)}</p>
      ${lastVisitHtml(s)}
      ${s.restock_notes ? `<p class="notes">${esc(s.restock_notes)}</p>` : ""}
      <div class="actions">
        <button class="primary" data-action="visit" data-id="${s.id}">Log visit</button>
        <button data-action="history" data-id="${s.id}">History (${s.visit_count})</button>
        <button data-action="edit" data-id="${s.id}">Edit</button>
        <a href="${directionsUrl(s)}" target="_blank" rel="noopener">Directions</a>
      </div>
    </div>`;
}

export function renderMarkers(stores) {
  const openId = [...markers].find(([, m]) => m.isPopupOpen())?.[0];
  layer.clearLayers();
  markers.clear();
  for (const s of stores) {
    const m = L.circleMarker([s.lat, s.lng], {
      radius: 9,
      weight: 2,
      color: "#fff",
      fillColor: COLORS[freshness(s)],
      fillOpacity: 1,
    })
      .bindTooltip(esc(s.name))
      .bindPopup(popupHtml(s), { maxWidth: 300 });
    m.addTo(layer);
    markers.set(s.id, m);
  }
  if (openId != null) markers.get(openId)?.openPopup();
}

export function fitStores(stores) {
  if (stores.length) map.fitBounds(stores.map((s) => [s.lat, s.lng]), { padding: [40, 40], maxZoom: 13 });
}

export function centerOn(pos, zoom = 12) {
  map.setView([pos.lat, pos.lng], zoom);
}

export function focusStore(id) {
  const m = markers.get(id);
  if (!m) return;
  map.setView(m.getLatLng(), Math.max(map.getZoom(), 14));
  m.openPopup();
}

export function invalidate() {
  map.invalidateSize();
}

/** Resolves with the next spot the user taps on the map. */
export function pickLocation() {
  map.getContainer().classList.add("picking");
  return new Promise((resolve) => {
    map.once("click", (e) => {
      map.getContainer().classList.remove("picking");
      resolve({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
  });
}
