import { $ } from "./dom.js";

const DATA_URL = "data.json";

export async function loadData(bustCache) {
  const url = bustCache ? `${DATA_URL}?t=${Date.now()}` : DATA_URL;
  const res = await fetch(url, { cache: bustCache ? "no-store" : "default" });
  if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
  return res.json();
}

export function setLastUpdated(iso, refreshing) {
  const el = $("#lastUpdated");
  if (refreshing) { el.textContent = "Updating…"; return; }
  if (!iso) { el.textContent = "Last updated: unknown"; return; }
  const d = new Date(iso);
  el.textContent = "Updated " + d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " at " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
