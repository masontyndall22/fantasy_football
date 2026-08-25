import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";

export function renderHistory(data) {
  renderTimeline(data);
  renderRecords(data);
}

function renderTimeline(data) {
  const seasons = data.leagueHistory || [];
  $("#historyTimeline").innerHTML = seasons.map(s => `
    <div class="timeline-item">
      <div class="timeline-item__season">${escapeHtml(s.season)}</div>
      <div class="timeline-item__champ">${escapeHtml(s.champion)} <span class="score">— ${fmt(s.championScore)} pts</span></div>
      <div class="timeline-item__meta">Last place: ${escapeHtml(s.lastPlace)} — ${fmt(s.lastPlaceScore)} pts</div>
      <div class="timeline-item__punishment">${escapeHtml(s.punishment)}</div>
    </div>
  `).join("") || `<div class="empty-state"><div class="empty-state__title">No history yet</div><div class="empty-state__body">Past seasons will appear here once they're logged.</div></div>`;
}

// ---------------- All-Time Records ----------------
function recordCard(label, valueHtml, subHtml) {
  return `<div class="record-card"><div class="record-card__label">${escapeHtml(label)}</div><div class="record-card__value">${valueHtml}</div><div class="record-card__sub">${subHtml}</div></div>`;
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
    ${recordCard("Lowest Season Total Ever", fmt(lowestSeason.value), `${escapeHtml(lowestSeason.manager)} — ${escapeHtml(lowestSeason.season)}`)}
    ${champLeaders.length ? recordCard("Most Championships", maxChamps, champLeaders.map(escapeHtml).join(", ")) : ""}
  ` : `<div class="empty-state"><div class="empty-state__title">No completed seasons yet</div></div>`;

  const weeklyCards = `
    ${fd.best ? recordCard("Best FanDuel Week (this season)", fmt(fd.best.value), `${escapeHtml(fd.best.manager)} — Week ${fd.best.week}`) : ""}
    ${fd.worst ? recordCard("Worst FanDuel Week (this season)", fmt(fd.worst.value), `${escapeHtml(fd.worst.manager)} — Week ${fd.worst.week}`) : ""}
    ${fdAllTime.best ? recordCard("Highest FanDuel Score Ever", fmt(fdAllTime.best.value), `${escapeHtml(fdAllTime.best.manager)} — ${escapeHtml(String(fdAllTime.best.season))} Week ${fdAllTime.best.week}`) : ""}
    ${fdAllTime.worst ? recordCard("Lowest FanDuel Score Ever", fmt(fdAllTime.worst.value), `${escapeHtml(fdAllTime.worst.manager)} — ${escapeHtml(String(fdAllTime.worst.season))} Week ${fdAllTime.worst.week}`) : ""}
    ${sleeperAllTime.best ? recordCard("Highest Sleeper Score Ever", fmt(sleeperAllTime.best.value), `${escapeHtml(sleeperAllTime.best.manager)} — ${escapeHtml(String(sleeperAllTime.best.season))} Week ${sleeperAllTime.best.week}`) : ""}
    ${sleeperAllTime.worst ? recordCard("Lowest Sleeper Score Ever", fmt(sleeperAllTime.worst.value), `${escapeHtml(sleeperAllTime.worst.manager)} — ${escapeHtml(String(sleeperAllTime.worst.season))} Week ${sleeperAllTime.worst.week}`) : ""}
  `;
  const hasWeeklyData = fd.best || fd.worst || fdAllTime.best || fdAllTime.worst || sleeperAllTime.best || sleeperAllTime.worst;

  $("#recordsContent").innerHTML = `
    <div class="records-grid">${allTimeCards}</div>
    ${hasWeeklyData ? `<div class="records-grid" style="margin-top:10px">${weeklyCards}</div>` : `<div class="empty-state" style="margin-top:10px"><div class="empty-state__title">No weeks played yet this season</div><div class="empty-state__body">FanDuel and Sleeper weekly records will show up here once games start.</div></div>`}
  `;
}