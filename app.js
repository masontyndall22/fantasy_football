import { $ } from "./js/dom.js";
import { store } from "./js/state.js";
import { loadData, setLastUpdated } from "./js/data-loader.js";
import { renderHome } from "./js/pages/home.js";
import { renderBios } from "./js/pages/bios.js";
import { renderScoring } from "./js/pages/scoring.js";
import { renderRivals } from "./js/pages/rivalries.js";
import { renderHistory } from "./js/pages/history.js";
import { renderYearReview } from "./js/pages/year-review.js";
import { initNav, initRefresh } from "./js/nav.js";

function renderAll(data) {
  store.data = data;
  setLastUpdated(data.generatedAt, false);
  renderHome(data);
  renderBios(data);
  renderScoring(data);
  renderRivals(data);
  renderHistory(data);
  renderYearReview(data);
}

// Season Sept 9 -> Feb 15, purely date math with no dependency on
// data.json. Works no matter what time of year it currently is by
// checking three candidate windows (last year's, this year's, and next
// year's Sept 9 -> Feb 15 span) rather than assuming "this year."
function getSeasonWindow_(now) {
  const y = now.getFullYear();
  const windows = [
    { start: new Date(y - 1, 8, 9), end: new Date(y, 1, 15) },
    { start: new Date(y, 8, 9), end: new Date(y + 1, 1, 15) },
    { start: new Date(y + 1, 8, 9), end: new Date(y + 2, 1, 15) },
  ];
  return windows.find(w => now >= w.start && now < w.end)
    || windows.find(w => w.start > now)
    || windows[windows.length - 1];
}

function renderSeasonCountdown() {
  const el = $("#seasonCountdown");
  if (!el) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { start, end } = getSeasonWindow_(now);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  if (today.getTime() === startDay.getTime()) {
    el.textContent = "Game Day!";
    el.classList.add("is-gameday");
    return;
  }
  el.classList.remove("is-gameday");
  if (today < startDay) {
    const daysLeft = Math.round((startDay - today) / 86400000);
    el.textContent = `${daysLeft} Days to Season Start`;
  } else {
    const weeksLeft = Math.max(0, Math.ceil((end - now) / (7 * 86400000)));
    el.textContent = `Weeks Left: ${weeksLeft}`;
  }
}

async function boot() {
  initNav();
  initRefresh(renderAll);
  renderSeasonCountdown();
  setInterval(renderSeasonCountdown, 60 * 60 * 1000); // keeps it correct if the tab stays open across midnight
  try {
    const data = await loadData(true);
    renderAll(data);
  } catch (e) {
    console.error(e);
    $("#lastUpdated").textContent = "Couldn't load data — check your connection and try refreshing.";
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js")
      .then(reg => reg.update()) // force an immediate check for a newer sw.js on every open,
      .catch(() => {});          // rather than waiting for the browser's own periodic check

    // The moment a newer service worker actually takes over, reload once so
    // the fresh version shows up automatically — nobody has to notice a
    // change happened, let alone reinstall or rebookmark.
    let reloadedOnce = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    });
  }
}

document.addEventListener("DOMContentLoaded", boot);