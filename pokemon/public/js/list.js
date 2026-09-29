import { esc, freshness, lastVisitHtml, milesBetween, directionsUrl } from "./util.js";

const SORTS = {
  name: (a, b) => a.name.localeCompare(b.name),
  visit: (a, b) => (b.last_visit_at ?? "").localeCompare(a.last_visit_at ?? ""),
  stock: (a, b) => (b.last_stock_at ?? "").localeCompare(a.last_stock_at ?? ""),
  distance: (a, b) => (a._miles ?? Infinity) - (b._miles ?? Infinity),
};

export function renderList(el, stores, sort, userPos) {
  const rows = stores.map((s) => ({ ...s, _miles: userPos ? milesBetween(userPos, s) : null }));
  rows.sort(SORTS[sort] ?? SORTS.name);
  el.innerHTML = rows.length
    ? rows
        .map(
          (s) => `
      <li class="card ${freshness(s)}">
        <div class="card-head">
          <h3><button class="link" data-action="show" data-id="${s.id}">${esc(s.name)}</button></h3>
          ${s._miles != null ? `<span class="muted small">${s._miles.toFixed(1)} mi</span>` : ""}
        </div>
        <p class="muted small">${s.chain ? `${esc(s.chain)} &middot; ` : ""}${esc(s.address)}</p>
        ${lastVisitHtml(s)}
        ${s.restock_notes ? `<p class="notes">${esc(s.restock_notes)}</p>` : ""}
        <div class="actions">
          <button class="primary" data-action="visit" data-id="${s.id}">Log visit</button>
          <button data-action="history" data-id="${s.id}">History (${s.visit_count})</button>
          <button data-action="edit" data-id="${s.id}">Edit</button>
          <a href="${directionsUrl(s)}" target="_blank" rel="noopener">Directions</a>
        </div>
      </li>`,
        )
        .join("")
    : `<li class="empty">No stores match. Add one from the menu.</li>`;
}
