import { $, $$ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { rankCategory, pointsFor } from "../ranking.js";
import { state, store, PILLARS, ALL_CATEGORIES } from "../state.js";
import { standingsListHtml } from "../components/standings-list.js";

export function renderScoring(data) {
  const managers = data.managers;
  const ranked = [...managers].sort((a, b) => b.totalStandingsPoints - a.totalStandingsPoints);
  const maxPts = Math.max(...managers.map(m => m.totalStandingsPoints));
  $("#scoringStandingsList").innerHTML = standingsListHtml(ranked, maxPts);

  renderPillarTabs();
  renderSubTabs();
  renderCategoryTable(managers);
  renderBreakdownTable(managers);
}

function renderPillarTabs() {
  $("#pillarTabs").innerHTML = PILLARS.map(p =>
    `<button class="pillar-tab ${p.key === state.pillar ? "is-active" : ""}" data-pillar="${p.key}">${p.label}</button>`
  ).join("");
  $$(".pillar-tab", $("#pillarTabs")).forEach(btn => {
    btn.addEventListener("click", () => {
      state.pillar = btn.dataset.pillar;
      state.subCategory = PILLARS.find(p => p.key === state.pillar).categories[0].key;
      renderPillarTabs();
      renderSubTabs();
      renderCategoryTable(store.data.managers);
    });
  });
}

function renderSubTabs() {
  const activePillar = PILLARS.find(p => p.key === state.pillar);
  const slot = $("#subTabsSlot");
  if (activePillar.categories.length <= 1) { slot.innerHTML = ""; return; }
  slot.innerHTML = `<div class="sub-tabs">${activePillar.categories.map(c =>
    `<button class="sub-tab ${c.key === state.subCategory ? "is-active" : ""}" data-sub="${c.key}">${c.label}</button>`
  ).join("")}</div>`;
  $$(".sub-tab", slot).forEach(btn => {
    btn.addEventListener("click", () => {
      state.subCategory = btn.dataset.sub;
      renderSubTabs();
      renderCategoryTable(store.data.managers);
    });
  });
}

function renderCategoryTable(managers) {
  const activePillar = PILLARS.find(p => p.key === state.pillar);
  const activeDef = activePillar.categories.find(c => c.key === state.subCategory) || activePillar.categories[0];
  const rows = rankCategory(managers, activeDef.valueFn, activeDef.higherBetter);
  $("#categoryTable").innerHTML = `
    <thead><tr><th>Manager</th><th>${escapeHtml(activeDef.unit)}</th><th>Pts</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.value)}</td><td class="pts">${fmt(r.points)}</td></tr>`).join("")}</tbody>
  `;
}

function renderBreakdownTable(managers) {
  const names = managers.map(m => m.name);
  const rowsHtml = ALL_CATEGORIES.map(cat => {
    const pts = pointsFor(managers, cat);
    return `<tr><td>${escapeHtml(cat.label)}</td>${names.map(n => `<td>${fmt(pts[n])}</td>`).join("")}</tr>`;
  }).join("");
  const totals = names.map(n => ALL_CATEGORIES.reduce((s, cat) => s + pointsFor(managers, cat)[n], 0));
  $("#breakdownTable").innerHTML = `
    <thead><tr><th>Category</th>${names.map(n => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row"><td>Total</td>${totals.map(t => `<td>${fmt(t)}</td>`).join("")}</tr>
    </tbody>
  `;
}
