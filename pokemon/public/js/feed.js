import { api } from "./api.js";
import { esc, timeAgo, fmtDateTime } from "./util.js";

// Makes bare URLs in tweet text clickable. Runs on already-escaped text.
const linkify = (html) =>
  html.replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

export async function renderFeed(el, mode) {
  el.innerHTML = `<li class="empty">Loading…</li>`;
  try {
    if (mode === "events") {
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
      return;
    }

    const tweets = await api(mode === "online" ? "/api/tweets?online=1" : "/api/tweets");
    el.innerHTML = tweets.length
      ? tweets
          .map(
            (t) => `
        <li class="card tweet">
          <div class="card-head">
            <b>@${esc(t.handle)}</b>
            <a class="muted small" href="${esc(t.url)}" target="_blank" rel="noopener">${timeAgo(t.posted_at)}</a>
          </div>
          <p>${linkify(esc(t.text))}</p>
          ${t.is_online ? `<span class="tag">online drop</span>` : ""}
        </li>`,
          )
          .join("")
      : `<li class="empty">No posts yet. The feed refreshes every 15 minutes once X accounts are configured.</li>`;
  } catch (err) {
    el.innerHTML = `<li class="empty error">${esc(err.message)}</li>`;
  }
}
