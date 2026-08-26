import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state } from "../state.js";

const TROPHY_SVG = '<svg viewBox="0 0 24 24"><path d="M6 3h12v2h2a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4 5.5 5.5 0 0 1-3.09 2.44c.2 1.13.83 1.83 2.09 2.06.5.09.9.5.9 1.01v.99a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-.99c0-.51.4-.92.9-1.01 1.26-.23 1.89-.93 2.09-2.06A5.5 5.5 0 0 1 8.9 11H8a4 4 0 0 1-4-4V6a1 1 0 0 1 1-1h2V3Zm0 4V7H5a2 2 0 0 0 2 2V7Zm12 0a2 2 0 0 0 2-2h-2v2ZM9 19h6v1a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-1Z"></path></svg>';

// cssId() turns a manager name into a safe DOM id fragment (spaces/punctuation stripped).
function cssId(name) { return String(name).replace(/[^a-z0-9]/gi, ""); }

// Fallback when a manager has no explicit `careerStats` array yet: derive
// Season High / Season Low from historicalSeasons so the back face isn't
// empty before the sheet starts publishing real careerStats entries.
function fallbackCareerStats(data, manager) {
  const seasons = data.historicalSeasons || [];
  let high = null, low = null;
  seasons.forEach(s => {
    const val = s.totals ? s.totals[manager] : undefined;
    if (val == null) return;
    if (!high || val > high.value) high = { value: val, season: s.season };
    if (!low || val < low.value) low = { value: val, season: s.season };
  });
  const out = [];
  if (high) out.push({ label: "Season High", value: fmt(high.value), sub: high.season });
  if (low) out.push({ label: "Season Low", value: fmt(low.value), sub: low.season });
  return out;
}

// For a given stat label, find the league-wide best value across every
// manager's careerStats list ("Low" labels compare as min, everything else
// as max) so a manager's own value can be graded against the field.
function leagueBestsByLabel(allCareerStats) {
  const bests = {};
  Object.entries(allCareerStats).forEach(([, stats]) => {
    stats.forEach(cs => {
      const num = Number(cs.value);
      if (Number.isNaN(num)) return;
      const isLow = /low/i.test(cs.label);
      if (!(cs.label in bests)) bests[cs.label] = num;
      else bests[cs.label] = isLow ? Math.min(bests[cs.label], num) : Math.max(bests[cs.label], num);
    });
  });
  return bests;
}

export function renderBios(data) {
  const reigningChampion = data.leagueHistory && data.leagueHistory.length ? data.leagueHistory[0].champion : null;
  const bios = data.bios || [];

  const allCareerStats = {};
  bios.forEach(b => {
    allCareerStats[b.manager] = (b.careerStats && b.careerStats.length) ? b.careerStats : fallbackCareerStats(data, b.manager);
  });
  const bests = leagueBestsByLabel(allCareerStats);

  $("#bioList").innerHTML = bios.map(b => {
    const isChampion = !!reigningChampion && b.manager === reigningChampion;
    const wins = Number(b.leagueWins) || 0;
    const isFlipped = !!state.flippedBios[b.manager];
    const careerStats = allCareerStats[b.manager];

    const frontHtml = `
      <div class="bio-face bio-face--front">
        ${isChampion ? `<div class="bio-card__champion-badge">${TROPHY_SVG}Current Champion</div>` : ""}
        <div class="bio-card__head">
          <div class="bio-card__avatar">${escapeHtml((b.manager || "?").slice(0, 1).toUpperCase())}</div>
          <div style="flex:1">
            <div class="bio-card__name">${escapeHtml(b.manager)}</div>
            <div class="bio-card__team">${escapeHtml(b.favoriteTeam || "—")}</div>
          </div>
          ${wins > 0 ? `<div class="bio-card__trophies">${TROPHY_SVG.repeat(wins)}</div>` : ""}
        </div>
        <div class="bio-card__stats">
          <div><div class="bio-card__stat-num">${fmt(b.leagueWins)}</div><div class="bio-card__stat-label">Wins</div></div>
          <div><div class="bio-card__stat-num">${fmt(b.leagueLosses)}</div><div class="bio-card__stat-label">Losses</div></div>
          <div><div class="bio-card__stat-num">${fmt(b.averagePlace)}</div><div class="bio-card__stat-label">Avg Place</div></div>
          <div><div class="bio-card__stat-num is-lifetime">${fmt(b.cumulativeScore)}</div><div class="bio-card__stat-label">Lifetime</div></div>
          <div><div class="bio-card__stat-num is-lifetime">${escapeHtml(b.allTimeRecord || "—")}</div><div class="bio-card__stat-label">Record</div></div>
        </div>
        <div class="bio-card__row"><span class="label">Strength — </span><span class="value">${escapeHtml(b.strength || "—")}</span></div>
        <div class="bio-card__row"><span class="label">Weakness — </span><span class="value">${escapeHtml(b.weakness || "—")}</span></div>
        <div class="bio-card__row"><span class="label">Punishments served — </span><span class="value">${escapeHtml(b.punishmentsDone || "—")}</span></div>
        <div class="bio-card__flip-hint">Tap for career highs &amp; lows</div>
      </div>`;

    const backRowsHtml = careerStats.map(cs => {
      const num = Number(cs.value);
      const isBest = !Number.isNaN(num) && bests[cs.label] === num;
      const gradeClass = isBest ? (/low/i.test(cs.label) ? "is-best-low" : "is-best-high") : "";
      return `
      <div class="career-stat-row">
        <div class="career-stat-row__label">${escapeHtml(cs.label)}${cs.sub ? `<span class="career-stat-row__sub">${escapeHtml(String(cs.sub))}</span>` : ""}</div>
        <div class="career-stat-row__value ${gradeClass}">${escapeHtml(String(cs.value))}</div>
      </div>`;
    }).join("") || `<div class="empty-state__body">No career stats yet.</div>`;

    const gridClass = careerStats.length > 3 ? "is-two-col" : "";

    const backHtml = `
      <div class="bio-face bio-face--back">
        <div class="bio-card__back-title">Career Stats</div>
        <div class="career-stat-list ${gridClass}">${backRowsHtml}</div>
        <div class="bio-card__flip-hint">Tap to flip back</div>
      </div>`;

    return `
      <div class="bio-flip-wrapper" id="bioFlip-${cssId(b.manager)}">
        <div class="bio-flip-inner ${isFlipped ? "is-flipped" : ""}">
          <div class="bio-card ${isChampion ? "is-champion" : ""}">${frontHtml}</div>
          <div class="bio-card ${isChampion ? "is-champion" : ""}">${backHtml}</div>
        </div>
      </div>`;
  }).join("") || `<div class="empty-state"><div class="empty-state__title">No bios yet</div><div class="empty-state__body">Add manager info to the Stats tab and it'll show up here.</div></div>`;

  bios.forEach(b => {
    const wrapper = $(`#bioFlip-${cssId(b.manager)}`);
    if (!wrapper) return;
    wrapper.addEventListener("click", () => {
      // Toggle the class directly on the existing element rather than
      // calling renderBios() again — a full innerHTML rebuild would create
      // the card already in its final rotated state, with no "before" frame
      // for the CSS transition to animate from, so it'd just snap instead
      // of flipping. Nothing else about the card changes on tap, so there's
      // nothing else that needs re-rendering here.
      const flipped = !state.flippedBios[b.manager];
      state.flippedBios[b.manager] = flipped;
      const inner = wrapper.querySelector(".bio-flip-inner");
      if (inner) inner.classList.toggle("is-flipped", flipped);
    });
  });
}