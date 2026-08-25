import { $ } from "./js/dom.js";
import { store } from "./js/state.js";
import { loadData, setLastUpdated } from "./js/data-loader.js";
import { renderHome } from "./js/pages/home.js";
import { renderBios } from "./js/pages/bios.js";
import { renderScoring } from "./js/pages/scoring.js";
import { renderPlayoffs } from "./js/pages/playoffs.js";
import { renderHistory } from "./js/pages/history.js";
import { initNav, initRefresh } from "./js/nav.js";

function renderAll(data) {
  store.data = data;
  setLastUpdated(data.generatedAt, false);
  renderHome(data);
  renderBios(data);
  renderScoring(data);
  renderPlayoffs(data);
  renderHistory(data);
}

async function boot() {
  initNav();
  initRefresh(renderAll);
  try {
    const data = await loadData(true);
    renderAll(data);
  } catch (e) {
    console.error(e);
    $("#lastUpdated").textContent = "Couldn't load data — check your connection and try refreshing.";
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

document.addEventListener("DOMContentLoaded", boot);
