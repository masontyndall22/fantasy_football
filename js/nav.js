import { $, $$ } from "./dom.js";
import { state } from "./state.js";
import { loadData, setLastUpdated } from "./data-loader.js";

export function initNav() {
  $$(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.screen = btn.dataset.screen;
      $$(".nav-btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      $$(".screen").forEach(s => s.classList.remove("is-active"));
      $(`#screen-${btn.dataset.screen}`).classList.add("is-active");
      window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    });
  });
}

// Takes renderAll as a parameter (rather than importing it) since renderAll
// lives in the entry file and orchestrates every page module — importing it
// here would create a circular import.
export function initRefresh(renderAll) {
  $("#refreshBtn").addEventListener("click", async () => {
    const btn = $("#refreshBtn");
    if (btn.classList.contains("is-spinning")) return;
    btn.classList.add("is-spinning");
    setLastUpdated(null, true);
    try {
      const data = await loadData(true);
      renderAll(data);
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => btn.classList.remove("is-spinning"), 700);
    }
  });
}
