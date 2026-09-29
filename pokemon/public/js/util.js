const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

const DAY = 86400_000;

export function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - Date.parse(iso);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Value for <input type="datetime-local"> in the viewer's own time zone. */
export function toLocalInput(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/** "fresh" = product seen within 3 days, "visited" = checked within 3 days, else "stale". */
export function freshness(store) {
  const recent = (iso) => iso && Date.now() - Date.parse(iso) < 3 * DAY;
  if (recent(store.last_stock_at)) return "fresh";
  if (recent(store.last_visit_at)) return "visited";
  return "stale";
}

export function milesBetween(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function directionsUrl(store) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(store.address)}`;
}

/** Shared bit of markup for a store's latest visit, used by map popups and list cards. */
export function lastVisitHtml(s) {
  if (!s.last_visit_at) return `<p class="visit none">No confirmed visits yet</p>`;
  const stock = s.last_visit_in_stock
    ? `<b class="ok">In stock</b>${s.last_visit_products ? `: ${esc(s.last_visit_products)}` : ""}`
    : `<b class="bad">Nothing</b>`;
  const by = s.last_visit_by ? ` by ${esc(s.last_visit_by)}` : "";
  let html = `<p class="visit">Last checked <b>${timeAgo(s.last_visit_at)}</b>${by} &middot; ${stock}</p>`;
  if (s.last_stock_at && s.last_stock_at !== s.last_visit_at) {
    html += `<p class="visit small">Last stock seen ${timeAgo(s.last_stock_at)}${
      s.last_stock_products ? `: ${esc(s.last_stock_products)}` : ""}</p>`;
  }
  return html;
}
