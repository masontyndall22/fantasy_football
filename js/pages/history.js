import { $, $$ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state } from "../state.js";
import { openYearReview } from "./year-review.js";

export function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return num + "th";
  switch (num % 10) {
    case 1: return num + "st";
    case 2: return num + "nd";
    case 3: return num + "rd";
    default: return num + "th";
  }
}

export function renderHistory(data) {
  renderRecords(data);
  renderFantasyHistory(data);
  renderLeagueHistory(data);
}

// ---------------- Previous Leagues (new, from the manually-kept sheet) ----------------
function renderFantasyHistory(data) {
  const rows = data.memberHistory || [];
  const open = state.fantasyHistoryOpen;

  const byYear = {};
  rows.forEach(r => {
    if (!byYear[r.year]) byYear[r.year] = [];
    byYear[r.year].push(r);
  });
  const years = Object.keys(byYear).sort((a, b) => String(b).localeCompare(String(a)));

  const bodyHtml = years.length ? years.map(year => {
    const entries = [...byYear[year]].sort((a, b) => (Number(a.place) || 99) - (Number(b.place) || 99));
    const maxPlace = Math.max(...entries.map(e => Number(e.place) || 0));
    const rowsHtml = entries.map(e => {
      const place = Number(e.place);
      const placeClass = place === 1 ? "is-gold" : (place === maxPlace && maxPlace > 1) ? "is-last" : "";
      return `
        <div class="fantasy-year-row" data-manager="${escapeHtml(e.manager)}" data-year="${escapeHtml(String(year))}">
          <div class="fantasy-year-row__main">
            <div class="fantasy-year-row__manager">${escapeHtml(e.manager)}</div>
            <div class="fantasy-year-row__team">${escapeHtml(e.teamName || "—")}</div>
          </div>
          <div class="fantasy-year-row__record">${fmt(e.wins)}-${fmt(e.losses)}</div>
          <div class="fantasy-year-row__place ${placeClass}">${ordinal(e.place)}</div>
        </div>`;
    }).join("");
    return `
      <div class="fantasy-year-card">
        <div class="fantasy-year-card__label">${escapeHtml(year)}</div>
        ${rowsHtml}
      </div>`;
  }).join("") : `<div class="empty-state"><div class="empty-state__title">No previous league history yet</div><div class="empty-state__body">Add rows to the League_History sheet and they'll show up here.</div></div>`;

  $("#fantasyHistorySlot").innerHTML = `
    <div class="collapsible-toggle" id="fantasyHistoryToggle">
      <span>Previous Leagues</span>
      <svg class="collapsible-toggle__chevron ${open ? "" : "is-collapsed"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
    </div>
    ${open ? `<div class="collapsible-body">${bodyHtml}</div>` : ""}
  `;
  $("#fantasyHistoryToggle").addEventListener("click", () => {
    state.fantasyHistoryOpen = !state.fantasyHistoryOpen;
    renderFantasyHistory(data);
  });

  $$(".fantasy-year-row", $("#fantasyHistorySlot")).forEach(row => {
    row.addEventListener("click", () => openYearReview(row.dataset.manager, row.dataset.year));
  });
}

// ---------------- History & Punishment (existing timeline) ----------------
function renderLeagueHistory(data) {
  const seasons = data.leagueHistory || [];
  const open = state.leagueHistoryOpen;

  const timelineHtml = seasons.length ? `<div class="timeline">${seasons.map(s => `
    <div class="timeline-item">
      <div class="timeline-item__season">${escapeHtml(s.season)}</div>
      <div class="timeline-item__champ">${escapeHtml(s.champion)} <span class="score">— ${fmt(s.championScore)} pts</span></div>
      <div class="timeline-item__meta">Last place: ${escapeHtml(s.lastPlace)} — ${fmt(s.lastPlaceScore)} pts</div>
      <div class="timeline-item__punishment">${escapeHtml(s.punishment)}</div>
    </div>
  `).join("")}</div>` : `<div class="empty-state"><div class="empty-state__title">No history yet</div><div class="empty-state__body">Past seasons will appear here once they're logged.</div></div>`;

  $("#leagueHistorySlot").innerHTML = `
    <div class="collapsible-toggle" id="leagueHistoryToggle">
      <span>History &amp; Punishment</span>
      <svg class="collapsible-toggle__chevron ${open ? "" : "is-collapsed"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
    </div>
    ${open ? `<div class="collapsible-body">${timelineHtml}</div>` : ""}
  `;
  $("#leagueHistoryToggle").addEventListener("click", () => {
    state.leagueHistoryOpen = !state.leagueHistoryOpen;
    renderLeagueHistory(data);
  });
}

// ---------------- All-Time Records ----------------
function recordCard(label, valueHtml, subHtml, variant) {
  return `<div class="record-card"><div class="record-card__label">${escapeHtml(label)}</div><div class="record-card__value ${variant || ""}">${valueHtml}</div><div class="record-card__sub">${subHtml}</div></div>`;
}

function bestWorstWeek(weeklyByManager) {
  let best = null, worst = null;
  Object.entries(weeklyByManager || {}).forEach(([manager, weeks]) => {
    weeks.forEach((val, i) => {
      if (!val) return; // 0 = not yet played, excluded
      const entry = { manager, week: i + 1, value: val };
      if (!best || val > best.value) best = entry;
      if (!worst || val < worst.value) worst = entry;
    });
  });
  return { best, worst };
}

function renderRecords(data) {
  const seasons = data.historicalSeasons || [];
  const names = (data.managers || []).map(m => m.name);

  let highestSeason = null, lowestSeason = null;
  const champCounts = {};
  names.forEach(n => { champCounts[n] = 0; });
  seasons.forEach(s => {
    Object.entries(s.totals).forEach(([manager, val]) => {
      if (val == null) return;
      if (!highestSeason || val > highestSeason.value) highestSeason = { manager, season: s.season, value: val };
      if (!lowestSeason || val < lowestSeason.value) lowestSeason = { manager, season: s.season, value: val };
    });
    const champ = Object.keys(s.places).find(m => s.places[m] === 1);
    if (champ) champCounts[champ] = (champCounts[champ] || 0) + 1;
  });
  const maxChamps = Math.max(0, ...Object.values(champCounts));
  const champLeaders = Object.entries(champCounts).filter(([, count]) => count === maxChamps && count > 0).map(([name]) => name);

  const bios = data.bios || [];
  let maxLosses = 0;
  bios.forEach(b => { const l = Number(b.leagueLosses) || 0; if (l > maxLosses) maxLosses = l; });
  const mostPunishedLeaders = bios.filter(b => (Number(b.leagueLosses) || 0) === maxLosses).map(b => b.manager);

  const fd = bestWorstWeek(data.weeklyFanDuel);

  // Shared logic for any "manager -> {highest, lowest}" all-time records
  // object — both Sleeper_Score_Records and FanDuel_Score_Records use this
  // same shape, so find the single league-wide best/worst the same way for each.
  function leagueWideExtreme(scoreRecords) {
    let best = null, worst = null;
    Object.entries(scoreRecords || {}).forEach(([manager, rec]) => {
      if (rec.highest && rec.highest.value != null) {
        if (!best || rec.highest.value > best.value) {
          best = { manager, value: rec.highest.value, season: rec.highest.season, week: rec.highest.week };
        }
      }
      if (rec.lowest && rec.lowest.value != null) {
        if (!worst || rec.lowest.value < worst.value) {
          worst = { manager, value: rec.lowest.value, season: rec.lowest.season, week: rec.lowest.week };
        }
      }
    });
    return { best, worst };
  }

  const sleeperAllTime = leagueWideExtreme(data.sleeperScoreRecords);
  const fdAllTime = leagueWideExtreme(data.fanDuelScoreRecords);

  const allTimeCards = seasons.length ? `
    ${recordCard("Highest Season Total Ever", fmt(highestSeason.value), `${escapeHtml(highestSeason.manager)} — ${escapeHtml(highestSeason.season)}`)}
    ${recordCard("Lowest Season Total Ever", fmt(lowestSeason.value), `${escapeHtml(lowestSeason.manager)} — ${escapeHtml(lowestSeason.season)}`, "is-low")}
    ${champLeaders.length ? recordCard("Most Championships", maxChamps, champLeaders.map(escapeHtml).join(", ")) : ""}
    ${maxLosses > 0 ? recordCard("Most Punishments", maxLosses, mostPunishedLeaders.map(escapeHtml).join(", "), "is-punishment") : ""}
  ` : `<div class="empty-state"><div class="empty-state__title">No completed seasons yet</div></div>`;

  const weeklyCards = `
    ${fd.best ? recordCard("Best FanDuel Week (this season)", fmt(fd.best.value), `${escapeHtml(fd.best.manager)} — Week ${fd.best.week}`) : ""}
    ${fd.worst ? recordCard("Worst FanDuel Week (this season)", fmt(fd.worst.value), `${escapeHtml(fd.worst.manager)} — Week ${fd.worst.week}`, "is-low") : ""}
    ${fdAllTime.best ? recordCard("Highest FanDuel Score Ever", fmt(fdAllTime.best.value), `${escapeHtml(fdAllTime.best.manager)} — ${escapeHtml(String(fdAllTime.best.season))} Week ${fdAllTime.best.week}`) : ""}
    ${fdAllTime.worst ? recordCard("Lowest FanDuel Score Ever", fmt(fdAllTime.worst.value), `${escapeHtml(fdAllTime.worst.manager)} — ${escapeHtml(String(fdAllTime.worst.season))} Week ${fdAllTime.worst.week}`, "is-low") : ""}
    ${sleeperAllTime.best ? recordCard("Highest Sleeper Score Ever", fmt(sleeperAllTime.best.value), `${escapeHtml(sleeperAllTime.best.manager)} — ${escapeHtml(String(sleeperAllTime.best.season))} Week ${sleeperAllTime.best.week}`) : ""}
    ${sleeperAllTime.worst ? recordCard("Lowest Sleeper Score Ever", fmt(sleeperAllTime.worst.value), `${escapeHtml(sleeperAllTime.worst.manager)} — ${escapeHtml(String(sleeperAllTime.worst.season))} Week ${sleeperAllTime.worst.week}`, "is-low") : ""}
  `;
  const hasWeeklyData = fd.best || fd.worst || fdAllTime.best || fdAllTime.worst || sleeperAllTime.best || sleeperAllTime.worst;
  const open = state.recordsOpen;

  const bodyHtml = `
    <div class="records-grid">${allTimeCards}</div>
    ${hasWeeklyData ? `<div class="records-grid" style="margin-top:10px">${weeklyCards}</div>` : `<div class="empty-state" style="margin-top:10px"><div class="empty-state__title">No weeks played yet this season</div><div class="empty-state__body">FanDuel and Sleeper weekly records will show up here once games start.</div></div>`}
  `;

  $("#recordsSlot").innerHTML = `
    <div class="collapsible-toggle" id="recordsToggle">
      <span>All-Time Records</span>
      <svg class="collapsible-toggle__chevron ${open ? "" : "is-collapsed"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
    </div>
    ${open ? `<div class="collapsible-body">${bodyHtml}</div>` : ""}
  `;
  $("#recordsToggle").addEventListener("click", () => {
    state.recordsOpen = !state.recordsOpen;
    renderRecords(data);
  });
}