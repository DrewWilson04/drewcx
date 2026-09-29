import { api } from "./api.js";
import { esc, fmtDateTime } from "./util.js";

// Upcoming online restocks the group has entered by hand.
export async function renderDrops(el) {
  el.innerHTML = `<li class="empty">Loading…</li>`;
  try {
    const events = await api("/api/events");
    el.innerHTML = events.length
      ? events
          .map(
            (e) => `
        <li class="card event">
          <div class="card-head">
            <h3>${esc(e.title)}</h3>
            <button class="link small" data-action="delete-event" data-id="${e.id}">Remove</button>
          </div>
          <p><b>${fmtDateTime(e.starts_at)}</b>${e.retailer ? ` &middot; ${esc(e.retailer)}` : ""}</p>
          ${e.notes ? `<p class="notes">${esc(e.notes)}</p>` : ""}
          ${e.url ? `<p><a href="${esc(e.url)}" target="_blank" rel="noopener">Open link</a></p>` : ""}
        </li>`,
          )
          .join("")
      : `<li class="empty">No upcoming online restocks. Add one from the menu.</li>`;
  } catch (err) {
    el.innerHTML = `<li class="empty error">${esc(err.message)}</li>`;
  }
}
