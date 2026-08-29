import { $, $$ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { rankCategory, pointsFor } from "../ranking.js";
import { state, store, PILLARS, ALL_CATEGORIES } from "../state.js";

const TOTAL_WEEKS = 14;
const MAX_STANDINGS_POINTS = 33; // fixed ceiling for the leaderboard bar fill — not the current leader's score
const SAFE_SCORE = 22;

export function renderScoring(data) {
  const managers = data.managers;
  renderWeeksLeft(data);
  renderLeaderboardFlipCard(managers);
  renderPillarTabs();
  renderCategorySection(managers);
}

// Re-measures both flip cards' heights against their currently active
// face. Needed because offsetHeight reports 0 while a screen is
// display:none — see nav.js, which calls this the moment the Scoring tab
// actually becomes visible (covering the case where it was rendered
// hidden at initial page load). The transition is briefly disabled here
// so this correction snaps instantly instead of visibly animating from
// the wrong (0px) height up to the real one — that transition should only
// ever play for an actual user-triggered flip.
export function remeasureScoringFlipCards() {
  [
    ["#scoringFlipInner", "#scoringFrontFace", "#scoringBackFace", () => state.scoringFlipped],
    ["#fdFlipInner", "#fdFrontFace", "#fdBackFace", () => state.fdCompareFlipped],
  ].forEach(([innerSel, frontSel, backSel, isFlipped]) => {
    const inner = $(innerSel);
    if (!inner) return;
    const front = $(frontSel), back = $(backSel);
    const activeEl = isFlipped() ? back : front;
    if (!activeEl) return;
    const prevTransition = inner.style.transition;
    inner.style.transition = "none";
    inner.style.height = activeEl.offsetHeight + "px";
    inner.offsetHeight; // force a reflow so the "none" transition actually takes effect before we restore it
    inner.style.transition = prevTransition;
  });
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

// ---------------- Full Leaderboard ⇄ Full Breakdown (measured-height flip) ----------------
// Deliberately NOT the grid-stacking flip technique used elsewhere (Bios,
// Year Review) — that makes the shorter face inherit the taller face's
// blank space, which looks wrong here since we want the card to visibly
// grow/shrink as it flips between the short leaderboard and the taller
// breakdown table. Instead: both faces are position:absolute (sized to
// their own content), and the wrapper's height is set explicitly from
// whichever face's real measured offsetHeight is currently active.
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

  $("#scoringFrontFace").innerHTML = `
    <div class="scoring-leaderboard-list">${rowsHtml}</div>
    <div class="scoring-safe-legend"><span class="scoring-safe-legend__swatch"></span>Safe Score (${SAFE_SCORE} pts)</div>
    <div class="scoring-caption">Tap to see full breakdown</div>
  `;
  $("#scoringBackFace").innerHTML = `
    <div class="table-card">
      <table class="breakdown-table" id="breakdownTable"></table>
    </div>
    <div class="scoring-caption">Tap to see leaderboard</div>
  `;
  renderBreakdownTable(managers);

  const inner = $("#scoringFlipInner");
  const front = $("#scoringFrontFace");
  const back = $("#scoringBackFace");
  inner.classList.toggle("is-flipped", state.scoringFlipped);
  const activeEl = state.scoringFlipped ? back : front;
  inner.style.height = activeEl.offsetHeight + "px";

  // .onclick (not addEventListener) since these face elements persist
  // across re-renders (only their innerHTML is replaced above) — using
  // addEventListener here would stack a new listener on every data
  // refresh, firing the toggle multiple times per tap.
  const toggle = () => {
    state.scoringFlipped = !state.scoringFlipped;
    inner.classList.toggle("is-flipped", state.scoringFlipped);
    const el = state.scoringFlipped ? back : front;
    inner.style.height = el.offsetHeight + "px";
  };
  front.onclick = toggle;
  back.onclick = toggle;
}

function renderBreakdownTable(managers) {
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
  $("#breakdownTable").innerHTML = `
    <thead><tr><th>Category</th>${names.map(n => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
    <tbody>
      ${rowsHtml}
      ${mvpRowHtml}
      <tr class="total-row"><td>Total</td>${totals.map(t => `<td>${fmt(t)}</td>`).join("")}</tr>
    </tbody>
  `;
}

// ---------------- By Category (pillar tabs, no sub-tab chips) ----------------
function renderPillarTabs() {
  $("#pillarTabs").innerHTML = PILLARS.map(p =>
    `<button class="pillar-tab ${p.key === state.pillar ? "is-active" : ""}" data-pillar="${p.key}">${p.label}</button>`
  ).join("");
  $$(".pillar-tab", $("#pillarTabs")).forEach(btn => {
    btn.addEventListener("click", () => {
      state.pillar = btn.dataset.pillar;
      state.fdCategoryIndex = 0; // reset FanDuel swipe position when switching pillars
      renderPillarTabs();
      renderCategorySection(store.data.managers);
    });
  });
}

function renderCategorySection(managers) {
  const slot = $("#categorySlot");
  if (state.pillar === "sleeper") {
    slot.innerHTML = renderSleeperCombinedHtml_(managers);
  } else if (state.pillar === "fanduel") {
    renderFanDuelSection_(slot, managers);
  } else {
    const pillar = PILLARS.find(p => p.key === state.pillar);
    slot.innerHTML = renderSingleCategoryTableHtml_(managers, pillar.categories[0]);
  }
}

function renderSingleCategoryTableHtml_(managers, cat) {
  const rows = rankCategory(managers, cat.valueFn, cat.higherBetter);
  return `
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>Manager</th><th>${escapeHtml(cat.label)}</th><th>Pts</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.value)}</td><td class="pts">${fmt(r.points)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

// Sleeper has no separate "Wins" stat in the data model — just Points and
// Placement — so both fit in one combined table without needing a swipe.
function renderSleeperCombinedHtml_(managers) {
  const sleeperPillar = PILLARS.find(p => p.key === "sleeper");
  const pointsCat = sleeperPillar.categories.find(c => c.key === "sleeperPts");
  const placeCat = sleeperPillar.categories.find(c => c.key === "sleeperPlacement");
  const pointsMap = pointsFor(managers, pointsCat);
  const placeMap = pointsFor(managers, placeCat);
  const rows = managers.map(m => ({
    name: m.name,
    points: pointsCat.valueFn(m),
    place: placeCat.valueFn(m),
    pts: (pointsMap[m.name] || 0) + (placeMap[m.name] || 0),
  })).sort((a, b) => b.pts - a.pts);

  return `
    <div class="table-card">
      <table class="data-table">
        <thead><tr><th>Manager</th><th>Points</th><th>Place</th><th>Pts</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.points)}</td><td>${fmt(r.place)}</td><td class="pts">${fmt(r.pts)}</td></tr>`).join("")}</tbody>
      </table>
    </div>`;
}

// FanDuel: front face swipes between its 4 categories (dots below), a tap
// on the caption flips to a back face comparing all 4 at once (managers as
// columns, categories as rows). The flip uses the same measured-height
// technique as the leaderboard card above. Swiping re-renders this whole
// section (content-only change, no animation to protect); flipping does
// NOT re-render (would break the CSS transition — same lesson as Bios).
// FanDuel: previously a swipeable single-category card with a flip to a
// compare-all view. Both the swipe and the flip's touch handling proved
// fragile (forced scroll-to-top on some devices, unresolved after two
// targeted fixes) — replaced with the simplest possible thing: one plain
// card per category, stacked vertically, scrolled like anything else.
function renderFanDuelSection_(slot, managers) {
  const fdPillar = PILLARS.find(p => p.key === "fanduel");
  slot.innerHTML = `<div class="fanduel-stack">${fdPillar.categories.map(cat => renderSingleCategoryTableHtml_(managers, cat)).join("")}</div>`;
}