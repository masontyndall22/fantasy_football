import { $, $$ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { rankCategory, pointsFor } from "../ranking.js";
import { state, store, PILLARS, ALL_CATEGORIES } from "../state.js";
import { renderPlayoffPoolSection } from "./playoffs.js";
import { renderCurrentSeasonRosterCard } from "./current-season-roster.js";

const TOTAL_WEEKS = 14;
const MAX_STANDINGS_POINTS = 33; // fixed ceiling for the leaderboard bar fill — not the current leader's score
const SAFE_SCORE = 22;

export function renderScoring(data) {
  const managers = data.managers;
  activeFlipCardIds = []; // fresh registry each full render — stale ids from a previous pillar are harmless but pointless to keep
  renderWeeksLeft(data);
  renderLeaderboardFlipCard(managers);
  renderPillarTabs();
  renderCategorySection(managers, data);
}

// ---------------- Weeks Left header ----------------
function parseWeekNumber_(label) {
  const m = /\d+/.exec(label || "");
  return m ? Number(m[0]) : null;
}

function weeksLeftTier_(weeksLeft) {
  if (weeksLeft > 8) return "green";
  if (weeksLeft > 4) return "purple";
  if (weeksLeft > 1) return "yellow";
  return "red";
}

function renderWeeksLeft(data) {
  const slot = $("#weeksLeftSlot");
  const weekNum = parseWeekNumber_(data.currentWeekLabel);
  if (weekNum == null) { slot.innerHTML = ""; return; } // no parseable week (e.g. "Keeper Review") — nothing to show
  const weeksLeft = Math.max(0, TOTAL_WEEKS - weekNum);
  const tier = weeksLeftTier_(weeksLeft);
  slot.innerHTML = `
    <div class="weeks-left-card tier-${tier}">
      <div class="weeks-left-card__icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18"></path><path d="M8 3v4"></path><path d="M16 3v4"></path></svg>
      </div>
      <div>
        <div class="weeks-left-card__count">${weeksLeft} of ${TOTAL_WEEKS}</div>
        <div class="weeks-left-card__label">Weeks Left</div>
      </div>
    </div>`;
}

// ---------------- Generic measured-height flip card ----------------
// Shared by every flip card on this page (Leaderboard/Breakdown, each of
// FanDuel's 4 cards, Sleeper, Pick'em). Deliberately NOT the CSS-grid-
// stacking technique (grid-area:1/1) — that makes a shorter face inherit
// a taller face's blank space, which looks wrong here since every one of
// these cards flips between a short ranked list and a much taller weekly
// table. Instead, both faces are position:absolute (sized to their own
// content) and the wrapper's height is set explicitly from whichever
// face's real measured offsetHeight is currently active — same fix
// already validated for the Leaderboard/Breakdown card previously.
let activeFlipCardIds = [];

function renderMeasuredFlipCard_(containerId, frontHtml, backHtml, isFlippedGetter, onToggle) {
  if (!activeFlipCardIds.includes(containerId)) activeFlipCardIds.push(containerId);
  const container = $(`#${containerId}`);
  if (!container) return;
  const flipped = isFlippedGetter();
  container.innerHTML = `
    <div class="scoring-flip-wrapper">
      <div class="scoring-flip-inner ${flipped ? "is-flipped" : ""}" id="${containerId}-inner">
        <div class="scoring-flip-face" id="${containerId}-front">${frontHtml}</div>
        <div class="scoring-flip-face" id="${containerId}-back">${backHtml}</div>
      </div>
    </div>`;
  const inner = $(`#${containerId}-inner`);
  const front = $(`#${containerId}-front`);
  const back = $(`#${containerId}-back`);
  const activeEl = flipped ? back : front;
  inner.style.height = activeEl.offsetHeight + "px";

  // .onclick (not addEventListener) since these ids get reused across
  // re-renders of the same card — addEventListener would stack listeners
  // and fire the toggle multiple times per tap.
  const toggle = () => {
    onToggle();
    const nowFlipped = isFlippedGetter();
    inner.classList.toggle("is-flipped", nowFlipped);
    const el = nowFlipped ? back : front;
    inner.style.height = el.offsetHeight + "px";
  };
  front.onclick = toggle;
  back.onclick = toggle;
}

// Re-measures every currently-registered flip card against its active
// face. Needed because offsetHeight reports 0 while a screen is
// display:none — see nav.js, which calls this the moment the Scoring tab
// actually becomes visible (covering the case where it was rendered
// hidden at initial page load). Transition is briefly disabled so this
// correction snaps instantly instead of visibly animating from the wrong
// (0px) height up to the real one — that transition should only ever
// play for an actual user-triggered flip.
export function remeasureScoringFlipCards() {
  activeFlipCardIds.forEach(id => {
    const inner = $(`#${id}-inner`);
    if (!inner) return;
    const front = $(`#${id}-front`), back = $(`#${id}-back`);
    if (!front || !back) return;
    const activeEl = inner.classList.contains("is-flipped") ? back : front;
    const prevTransition = inner.style.transition;
    inner.style.transition = "none";
    inner.style.height = activeEl.offsetHeight + "px";
    inner.offsetHeight; // force a reflow so the "none" transition actually takes effect before we restore it
    inner.style.transition = prevTransition;
  });
}

// ---------------- Full Leaderboard ⇄ Full Breakdown ----------------
function renderLeaderboardFlipCard(managers) {
  const ranked = [...managers].sort((a, b) => b.totalStandingsPoints - a.totalStandingsPoints);
  const safeLeftPct = (SAFE_SCORE / MAX_STANDINGS_POINTS) * 100;

  const rowsHtml = ranked.map((m, i) => {
    const pct = Math.min(100, Math.max(4, (m.totalStandingsPoints / MAX_STANDINGS_POINTS) * 100));
    return `
      <div class="scoring-leaderboard-row ${i === 0 ? "is-first" : ""}">
        <div class="scoring-leaderboard-row__fill" style="width:${pct}%"></div>
        <div class="scoring-leaderboard-row__safe-marker" style="left:${safeLeftPct}%"></div>
        <div class="scoring-leaderboard-row__name">${escapeHtml(m.name)}</div>
        <div class="scoring-leaderboard-row__pts">${fmt(m.totalStandingsPoints)}</div>
      </div>`;
  }).join("");

  const frontHtml = `
    <div class="scoring-leaderboard-list">${rowsHtml}</div>
    <div class="scoring-safe-legend"><span class="scoring-safe-legend__swatch"></span>Safe Score (${SAFE_SCORE} pts)</div>
    <div class="scoring-caption">Tap to see full breakdown</div>
  `;
  const backHtml = `
    <div class="table-card">
      <table class="breakdown-table">${buildBreakdownTableHtml_(managers)}</table>
    </div>
    <div class="scoring-caption">Tap to see leaderboard</div>
  `;

  renderMeasuredFlipCard_("scoringLeaderboard", frontHtml, backHtml,
    () => state.scoringFlipped,
    () => { state.scoringFlipped = !state.scoringFlipped; });
}

function buildBreakdownTableHtml_(managers) {
  const names = managers.map(m => m.name);
  const rowsHtml = ALL_CATEGORIES.map(cat => {
    const pts = pointsFor(managers, cat);
    return `<tr><td>${escapeHtml(cat.label)}</td>${names.map(n => `<td>${fmt(pts[n])}</td>`).join("")}</tr>`;
  }).join("");

  // MVP Bonus isn't a tie-split ranked category — it's a flat manual bonus
  // per manager (0 or a small whole number), so it's shown using the raw
  // value directly rather than going through pointsFor().
  const mvpByName = {};
  managers.forEach(m => { mvpByName[m.name] = Number(m.mvpBonus) || 0; });
  const mvpRowHtml = `<tr><td>MVP Bonus</td>${names.map(n => `<td>${fmt(mvpByName[n])}</td>`).join("")}</tr>`;

  const totals = names.map(n =>
    ALL_CATEGORIES.reduce((s, cat) => s + pointsFor(managers, cat)[n], 0) + mvpByName[n]
  );
  return `
    <thead><tr><th>Category</th>${names.map(n => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rowsHtml}
      ${mvpRowHtml}
      <tr class="total-row"><td>Total</td>${totals.map(t => `<td>${fmt(t)}</td>`).join("")}</tr>
    </tbody>
  `;
}

// ---------------- By Category (pillar tabs, full-bleed equal-width) ----------------
function renderPillarTabs() {
  $("#pillarTabs").innerHTML = PILLARS.map(p =>
    `<button class="pillar-tab ${p.key === state.pillar ? "is-active" : ""}" data-pillar="${p.key}">${p.label}</button>`
  ).join("");
  $$(".pillar-tab", $("#pillarTabs")).forEach(btn => {
    btn.addEventListener("click", () => {
      state.pillar = btn.dataset.pillar;
      renderPillarTabs();
      renderCategorySection(store.data.managers, store.data);
    });
  });
}

function renderCategorySection(managers, data) {
  const slot = $("#categorySlot");
  if (state.pillar === "sleeper") {
    renderSleeperSection_(slot, managers, data);
  } else if (state.pillar === "fanduel") {
    renderFanDuelSection_(slot, managers, data);
  } else if (state.pillar === "pickem") {
    renderPickemSection_(slot, managers, data);
  } else {
    renderPlayoffPoolSection(slot, data);
  }
}

// ---------------- FanDuel: 4 independently-flippable weekly-breakdown cards ----------------
function renderFanDuelSection_(slot, managers, data) {
  const fdPillar = PILLARS.find(p => p.key === "fanduel");
  const weekly = data.fanduelWeekly || { fdWins: [], fdTop5: {}, fdTop10: {}, fdAllWeeks: {} };

  slot.innerHTML = fdPillar.categories.map(cat =>
    `<div class="fanduel-flip-card" id="fdCard-${cat.key}"></div>`
  ).join("");

  fdPillar.categories.forEach(cat => {
    const rows = rankCategory(managers, cat.valueFn, cat.higherBetter);
    const frontHtml = `
      <div class="table-card">
        <table class="data-table">
          <thead><tr><th>Manager</th><th>${escapeHtml(cat.label)}</th><th>Pts</th></tr></thead>
          <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.value)}</td><td class="pts">${fmt(r.points)}</td></tr>`).join("")}</tbody>
        </table>
      </div>
      <div class="scoring-caption">Tap to see weekly breakdown</div>`;

    const backHtml = cat.key === "fdWins"
      ? buildFanDuelWinsBackHtml_(managers, weekly.fdWins)
      : buildFanDuelPooledBackHtml_(managers, cat, weekly);

    renderMeasuredFlipCard_(`fdCard-${cat.key}`, frontHtml, backHtml,
      () => !!state.fanduelCardFlipped[cat.key],
      () => { state.fanduelCardFlipped[cat.key] = !state.fanduelCardFlipped[cat.key]; });
  });
}

function buildFanDuelWinsBackHtml_(managers, fdWins) {
  const rowsHtml = (fdWins || []).map(w => {
    const values = managers.map(m => w.scores[m.name] || 0);
    const max = Math.max(...values);
    const cells = managers.map((m, i) => {
      const v = values[i];
      const cls = v === max && max > 0 ? "pts" : "";
      return `<td class="${cls}">${fmt(v)}</td>`;
    }).join("");
    return `<tr><td>Wk ${escapeHtml(String(w.week))}</td>${cells}</tr>`;
  }).join("");

  return `
    <div class="table-card">
      <table class="breakdown-table">
        <thead><tr><th>Week</th>${managers.map(m => `<th>${escapeHtml(m.name)}</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="${managers.length + 1}">No weeks played yet</td></tr>`}</tbody>
      </table>
    </div>
    <div class="scoring-caption">Highlighted score won the week</div>`;
}

// Top 5 / Top 10 / Total — each manager's own qualifying scores, pooled
// and sorted independently (not a per-week table, since each manager can
// have a different number of qualifying weeks).
function buildFanDuelPooledBackHtml_(managers, cat, weekly) {
  const pool = cat.key === "fdSeasonTotal" ? weekly.fdAllWeeks
    : cat.key === "fdTop5Total" ? weekly.fdTop5
    : weekly.fdTop10;
  const maxLen = Math.max(0, ...managers.map(m => (pool[m.name] || []).length));
  const rowsHtml = Array.from({ length: maxLen }, (_, i) => {
    const cells = managers.map(m => {
      const v = (pool[m.name] || [])[i];
      return `<td>${v != null ? fmt(v) : "—"}</td>`;
    }).join("");
    return `<tr><td>#${i + 1}</td>${cells}</tr>`;
  }).join("");

  const captionLabel = cat.key === "fdSeasonTotal" ? "All weeks" : `${cat.label} weeks`;
  return `
    <div class="table-card">
      <table class="breakdown-table">
        <thead><tr><th>Rank</th>${managers.map(m => `<th>${escapeHtml(m.name)}</th>`).join("")}</tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="${managers.length + 1}">No qualifying weeks yet</td></tr>`}</tbody>
      </table>
    </div>
    <div class="scoring-caption">${escapeHtml(captionLabel)}, sorted highest to lowest</div>`;
}

// ---------------- Sleeper: single flip card ----------------
// Combined front (Points + Placement, same as before). Back is a real
// weekly W/L table built from data.matchups (win green, loss red).
//
// NOTE: the design spec also calls for a "rivalry" highlight on certain
// weeks (tinted row + bold accent names) — that's not built here. There's
// no data source anywhere in this app that defines what counts as a
// "rivalry" week; it'd need a real decision on where that comes from
// (a manual sheet flag? a computed head-to-head streak?) before it can
// be implemented rather than guessed at.
function renderSleeperSection_(slot, managers, data) {
  const sleeperPillar = PILLARS.find(p => p.key === "sleeper");
  const pointsCat = sleeperPillar.categories.find(c => c.key === "sleeperPts");
  const placeCat = sleeperPillar.categories.find(c => c.key === "sleeperPlacement");
  const pointsMap = pointsFor(managers, pointsCat);
  const placeMap = pointsFor(managers, placeCat);
  const combinedRows = managers.map(m => ({
    name: m.name,
    points: pointsCat.valueFn(m),
    place: placeCat.valueFn(m),
    pts: (pointsMap[m.name] || 0) + (placeMap[m.name] || 0),
  })).sort((a, b) => b.pts - a.pts);

  const frontHtml = `
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>Manager</th><th>Points</th><th>Place</th><th>Pts</th></tr></thead>
        <tbody>${combinedRows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.points)}</td><td>${fmt(r.place)}</td><td class="pts">${fmt(r.pts)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <div class="scoring-caption">Tap to see weekly breakdown</div>`;

  const matchups = data.matchups || [];
  const seasons = matchups.map(m => Number(m.season)).filter(n => !isNaN(n));
  const currentSeason = seasons.length ? Math.max(...seasons) : null;
  const thisSeasonMatchups = matchups.filter(m => Number(m.season) === currentSeason);
  const weeks = [...new Set(thisSeasonMatchups.map(m => Number(m.week)))].sort((a, b) => a - b);

  const backRowsHtml = weeks.map(week => {
    const weekMatchups = thisSeasonMatchups.filter(m => Number(m.week) === week);
    const cellByName = {};
    weekMatchups.forEach(m => {
      const tie = m.winner === "Tie";
      cellByName[m.managerA] = { score: m.scoreA, result: tie ? "tie" : (m.winner === m.managerA ? "win" : "loss") };
      cellByName[m.managerB] = { score: m.scoreB, result: tie ? "tie" : (m.winner === m.managerB ? "win" : "loss") };
    });
    const cells = managers.map(m => {
      const c = cellByName[m.name];
      if (!c) return `<td>—</td>`;
      const cls = c.result === "win" ? "is-win" : c.result === "loss" ? "is-loss" : "";
      return `<td class="${cls}">${fmt(c.score)}</td>`;
    }).join("");
    return `<tr><td>Wk ${week}</td>${cells}</tr>`;
  }).join("");

  const backHtml = `
    <div class="table-card">
      <table class="breakdown-table">
        <thead><tr><th>Week</th>${managers.map(m => `<th>${escapeHtml(m.name)}</th>`).join("")}</tr></thead>
        <tbody>${backRowsHtml || `<tr><td colspan="${managers.length + 1}">No weeks played yet</td></tr>`}</tbody>
      </table>
    </div>
    <div class="scoring-caption">Tap to see leaderboard</div>`;

  slot.innerHTML = `
    <div id="sleeperFlipCard"></div>
    <div id="sleeperRosterCard"></div>`;
  renderMeasuredFlipCard_("sleeperFlipCard", frontHtml, backHtml,
    () => state.sleeperFlipped,
    () => { state.sleeperFlipped = !state.sleeperFlipped; });
  renderCurrentSeasonRosterCard(managers, data);
}

// ---------------- Pick'em: single flip card ----------------
function renderPickemSection_(slot, managers, data) {
  const pickemPillar = PILLARS.find(p => p.key === "pickem");
  const cat = pickemPillar.categories[0];
  const rows = rankCategory(managers, cat.valueFn, cat.higherBetter);
  const frontHtml = `
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>Manager</th><th>${escapeHtml(cat.label)}</th><th>Pts</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.value)}</td><td class="pts">${fmt(r.points)}</td></tr>`).join("")}</tbody>
      </table>
    </div>
    <div class="scoring-caption">Tap to see weekly breakdown</div>`;

  const weekly = data.pickemWeekly || {};
  const weekCount = weekly[managers[0].name] ? weekly[managers[0].name].length : 0;
  const backRowsHtml = Array.from({ length: weekCount }, (_, i) => {
    const values = managers.map(m => (weekly[m.name] && weekly[m.name][i]) || 0);
    const max = Math.max(...values);
    const cells = managers.map((m, idx) => {
      const v = values[idx];
      const cls = v === max && max > 0 ? "pts" : "";
      return `<td class="${cls}">${fmt(v)}</td>`;
    }).join("");
    return `<tr><td>Wk ${i + 1}</td>${cells}</tr>`;
  }).join("");

  const backHtml = `
    <div class="table-card">
      <table class="breakdown-table">
        <thead><tr><th>Week</th>${managers.map(m => `<th>${escapeHtml(m.name)}</th>`).join("")}</tr></thead>
        <tbody>${backRowsHtml || `<tr><td colspan="${managers.length + 1}">No weeks played yet</td></tr>`}</tbody>
      </table>
    </div>
    <div class="scoring-caption">Tap to see leaderboard</div>`;

  slot.innerHTML = `<div id="pickemFlipCard"></div>`;
  renderMeasuredFlipCard_("pickemFlipCard", frontHtml, backHtml,
    () => state.pickemFlipped,
    () => { state.pickemFlipped = !state.pickemFlipped; });
}