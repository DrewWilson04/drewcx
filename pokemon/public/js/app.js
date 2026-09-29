import { api } from "./api.js";
import { esc, fmtDateTime, freshness, toLocalInput } from "./util.js";
import * as mapView from "./map.js";
import { renderList } from "./list.js";
import { renderDrops } from "./drops.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const state = {
  stores: [],
  view: "map",
  search: "",
  chains: new Set(), // empty = all chains
  recentStock: false,
  userPos: null,
};

// ---------------------------------------------------------------------------
// Small helpers

function toast(msg, ms = 3500) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

const storage = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

function showError(form, msg) {
  const el = form.querySelector("[data-error]");
  el.textContent = msg ?? "";
  el.hidden = !msg;
}

// ---------------------------------------------------------------------------
// Data + rendering

function filteredStores() {
  const q = state.search.toLowerCase();
  return state.stores.filter(
    (s) =>
      (!q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)) &&
      (!state.chains.size || state.chains.has(s.chain || "Other")) &&
      (!state.recentStock || freshness(s) === "fresh"),
  );
}

function renderChainFilters() {
  const chains = [...new Set(state.stores.map((s) => s.chain || "Other"))].sort();
  $("#chain-filters").innerHTML = chains
    .map((c) => `<button class="chip" aria-pressed="${state.chains.has(c)}" data-chain="${esc(c)}">${esc(c)}</button>`)
    .join("");
}

function render() {
  const stores = filteredStores();
  mapView.renderMarkers(stores);
  renderList($("#store-list"), stores, $("#sort").value, state.userPos);
  $("#list-count").textContent = `${stores.length} of ${state.stores.length} stores`;
}

async function loadStores() {
  state.stores = await api("/api/stores");
  renderChainFilters();
  render();
}

function upsertStore(store) {
  const i = state.stores.findIndex((s) => s.id === store.id);
  if (i >= 0) state.stores[i] = store;
  else state.stores.push(store);
  renderChainFilters();
  render();
}

// ---------------------------------------------------------------------------
// Views, menu

function setView(view) {
  state.view = view;
  for (const v of ["map", "list", "drops"]) $(`#view-${v}`).hidden = v !== view;
  $$(".tabs [data-view]").forEach((b) => b.setAttribute("aria-selected", b.dataset.view === view));
  storage.set("view", view);
  if (view === "map") mapView.invalidate();
  if (view === "drops") renderDrops($("#drops-list"));
}

function toggleDrawer(open = $("#drawer").hidden) {
  $("#drawer").hidden = !open;
  $("#scrim").hidden = !open;
  $("#menu-btn").setAttribute("aria-expanded", open);
}

// ---------------------------------------------------------------------------
// Dialogs

let editingId = null;

function openStoreDialog(store = null) {
  editingId = store?.id ?? null;
  const form = $("#store-form");
  form.reset();
  showError(form);
  $("#store-dialog-title").textContent = store ? "Edit store" : "Add store";
  if (store) for (const k of ["name", "chain", "address", "restock_notes"]) form.elements[k].value = store[k] ?? "";
  $("#store-dialog").showModal();
}

async function saveStore(form) {
  const data = Object.fromEntries(new FormData(form));
  const existing = state.stores.find((s) => s.id === editingId);
  try {
    let store;
    if (existing) {
      let { lat, lng } = existing;
      if (data.address.trim() !== existing.address) {
        ({ lat, lng } = await api(`/api/geocode?q=${encodeURIComponent(data.address)}`).catch(() => ({ lat, lng })));
      }
      store = await api(`/api/stores/${existing.id}`, { method: "PATCH", body: { ...data, lat, lng } });
    } else {
      try {
        store = await api("/api/stores", { method: "POST", body: data });
      } catch (err) {
        if (err.status !== 422) throw err;
        // Address didn't geocode: let the user drop the pin by hand.
        $("#store-dialog").close();
        setView("map");
        toast("Couldn't find that address. Tap the map where the store is.", 8000);
        const pos = await mapView.pickLocation();
        store = await api("/api/stores", { method: "POST", body: { ...data, ...pos } });
      }
    }
    $("#store-dialog").close();
    upsertStore(store);
    if (state.view === "map") mapView.focusStore(store.id);
    toast(existing ? "Store updated" : "Store added");
  } catch (err) {
    if ($("#store-dialog").open) showError(form, err.message);
    else toast(err.message);
  }
}

let visitStoreId = null;

function openVisitDialog(id) {
  const store = state.stores.find((s) => s.id === id);
  if (!store) return;
  visitStoreId = id;
  const form = $("#visit-form");
  form.reset();
  showError(form);
  $("#visit-store-name").textContent = store.name;
  form.elements.visited_at.value = toLocalInput();
  $("#visit-dialog").showModal();
}

async function saveVisit(form) {
  const f = form.elements;
  try {
    await api(`/api/stores/${visitStoreId}/visits`, {
      method: "POST",
      body: {
        visited_at: new Date(f.visited_at.value).toISOString(),
        confirmed: f.confirmed.checked,
        in_stock: f.in_stock.checked,
        products: f.products.value,
        notes: f.notes.value,
        visitor: $("#nickname").value,
      },
    });
    $("#visit-dialog").close();
    await loadStores();
    toast("Visit logged");
  } catch (err) {
    showError(form, err.message);
  }
}

async function openHistory(id) {
  const store = state.stores.find((s) => s.id === id);
  if (!store) return;
  $("#history-title").textContent = store.name;
  const list = $("#history-list");
  list.innerHTML = `<li class="muted">Loading…</li>`;
  $("#history-dialog").showModal();
  const visits = await api(`/api/stores/${id}/visits`);
  list.innerHTML = visits.length
    ? visits
        .map(
          (v) => `
      <li class="${v.in_stock ? "ok" : ""}">
        <div class="card-head">
          <b>${fmtDateTime(v.visited_at)}</b>
          <button class="link small" data-action="delete-visit" data-id="${v.id}" data-store="${id}">Delete</button>
        </div>
        <span>${v.confirmed ? "" : "(unconfirmed) "}${v.in_stock ? "In stock" : "Nothing"}${
            v.products ? `: ${esc(v.products)}` : ""}</span>
        ${v.notes ? `<p class="notes">${esc(v.notes)}</p>` : ""}
        ${v.visitor ? `<span class="muted small">by ${esc(v.visitor)}</span>` : ""}
      </li>`,
        )
        .join("")
    : `<li class="muted">No visits logged yet.</li>`;
  list.insertAdjacentHTML(
    "beforeend",
    `<li class="danger-zone"><button class="link small" data-action="delete-store" data-id="${id}">Delete this store</button></li>`,
  );
}

function openEventDialog() {
  const form = $("#event-form");
  form.reset();
  showError(form);
  $("#event-dialog").showModal();
}

async function saveEvent(form) {
  const data = Object.fromEntries(new FormData(form));
  try {
    await api("/api/events", { method: "POST", body: { ...data, starts_at: new Date(data.starts_at).toISOString() } });
    $("#event-dialog").close();
    setView("drops");
    toast("Restock added");
  } catch (err) {
    showError(form, err.message);
  }
}

// ---------------------------------------------------------------------------
// Actions from popups, list cards, history and drops

async function onAction(action, id, btn) {
  switch (action) {
    case "visit": return openVisitDialog(id);
    case "history": return openHistory(id);
    case "edit": return openStoreDialog(state.stores.find((s) => s.id === id));
    case "show": setView("map"); return mapView.focusStore(id);
    case "delete-visit":
      if (!confirm("Delete this visit?")) return;
      await api(`/api/visits/${id}`, { method: "DELETE" });
      await loadStores();
      return openHistory(Number(btn.dataset.store));
    case "delete-store":
      if (!confirm("Delete this store and all its visits?")) return;
      await api(`/api/stores/${id}`, { method: "DELETE" });
      $("#history-dialog").close();
      return loadStores();
    case "delete-event":
      if (!confirm("Remove this restock?")) return;
      await api(`/api/events/${id}`, { method: "DELETE" });
      return renderDrops($("#drops-list"));
  }
}

function delegate(root) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (btn) onAction(btn.dataset.action, Number(btn.dataset.id), btn).catch((err) => toast(err.message));
  });
}

// ---------------------------------------------------------------------------
// Location

function locate({ quiet = false } = {}) {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (p) => {
      state.userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
      mapView.centerOn(state.userPos);
      render();
    },
    () => {
      if (!quiet) toast("Location unavailable");
    },
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
  );
}

// ---------------------------------------------------------------------------
// Wire-up

mapView.initMap($("#map"), (action, id) => onAction(action, id).catch((err) => toast(err.message)));
delegate($("#store-list"));
delegate($("#drops-list"));
delegate($("#history-list"));

$("#menu-btn").addEventListener("click", () => toggleDrawer());
$("#scrim").addEventListener("click", () => toggleDrawer(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && toggleDrawer(false));

$$(".tabs [data-view]").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
$("#drops-link").addEventListener("click", () => {
  setView("drops");
  toggleDrawer(false);
});

$("#store-search").addEventListener("input", (e) => {
  state.search = e.target.value;
  render();
});
$("#chain-filters").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-chain]");
  if (!chip) return;
  const c = chip.dataset.chain;
  state.chains.has(c) ? state.chains.delete(c) : state.chains.add(c);
  chip.setAttribute("aria-pressed", state.chains.has(c));
  render();
});
$("#filter-recent-stock").addEventListener("change", (e) => {
  state.recentStock = e.target.checked;
  render();
});
$("#sort").addEventListener("change", render);

$("#add-store-btn").addEventListener("click", () => {
  toggleDrawer(false);
  openStoreDialog();
});
$("#add-event-btn").addEventListener("click", () => {
  toggleDrawer(false);
  openEventDialog();
});
$("#locate-btn").addEventListener("click", () => locate());

const nickname = $("#nickname");
nickname.value = storage.get("nickname") ?? "";
nickname.addEventListener("change", () => storage.set("nickname", nickname.value.trim()));

$$("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
for (const [id, save] of [["#store-form", saveStore], ["#visit-form", saveVisit], ["#event-form", saveEvent]]) {
  $(id).addEventListener("submit", (e) => {
    e.preventDefault();
    save(e.target);
  });
}

// Refresh store data when the tab comes back into focus (someone may have logged a visit).
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadStores().catch(() => {});
});

setView(["map", "list", "drops"].includes(storage.get("view")) ? storage.get("view") : "map");
loadStores()
  .then(() => {
    mapView.fitStores(state.stores);
    locate({ quiet: true }); // centers on the user if they allow it
  })
  .catch((err) => toast(err.message));
