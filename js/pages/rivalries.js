import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state } from "../state.js";

const CHEVRON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>`;

// cssId() turns a manager name into a safe DOM id fragment (spaces/punctuation stripped).
function cssId(name) { return String(name).replace(/[^a-z0-9]/gi, ""); }

// "Winner" column in the sheet is expected to hold a manager name or "Tie".
function outcomeFor(m, name) {
  if (m.winner === "Tie") return "tie";
  return m.winner === name ? "win" : "loss";
}

// Parses "2023/24" (or a plain year) into a sortable leading-year number.
function seasonYear(season) {
  const m = String(season).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

// Streak badge: looks at a manager's last 3 games in chronological order.
// All wins → 🔥, all losses → 🧊, anything mixed → no badge.
function streakBadge(ownMatchupsChronological, name) {
  const last3 = ownMatchupsChronological.slice(-3);
  if (last3.length < 3) return "";
  const outcomes = last3.map(m => outcomeFor(m, name));
  if (outcomes.every(o => o === "win")) return " 🔥";
  if (outcomes.every(o => o === "loss")) return " 🧊";
  return "";
}

export function renderRivals(data) {
  const names = (data.managers || []).map(m => m.name);
  const matchups = data.matchups || [];
  const slot = $("#rivalsList");

  if (names.length < 2) {
    slot.innerHTML = `<div class="empty-state"><div class="empty-state__title">Not enough managers yet</div></div>`;
    return;
  }
  if (!matchups.length) {
    slot.innerHTML = `<div class="empty-state"><div class="empty-state__title">No matchups logged yet</div><div class="empty-state__body">Head-to-head records will appear here once games are synced from the sheet.</div></div>`;
    return;
  }

  slot.innerHTML = names.map(name => rivalCardHtml(name, names, matchups)).join("") + `
    <div class="legend">
      <span class="legend__item">🔥 Won last 3</span>
      <span class="legend__item">🧊 Lost last 3</span>
    </div>`;

  names.forEach(name => {
    const toggle = $(`#rivalToggle-${cssId(name)}`);
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      state.expandedRival[name] = !state.expandedRival[name];
      renderRivals(data);
    });
  });
}

function rivalCardHtml(name, allNames, matchups) {
  const own = matchups.filter(m => m.managerA === name || m.managerB === name);
  let wins = 0, losses = 0, ties = 0;
  const byOpponent = {};

  own.forEach(m => {
    const opponent = m.managerA === name ? m.managerB : m.managerA;
    const outcome = outcomeFor(m, name);
    if (outcome === "win") wins++;
    else if (outcome === "loss") losses++;
    else ties++;
    if (!byOpponent[opponent]) byOpponent[opponent] = { wins: 0, losses: 0, ties: 0 };
    byOpponent[opponent][outcome === "win" ? "wins" : outcome === "loss" ? "losses" : "ties"]++;
  });

  const totalRecord = ties > 0 ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  const chronological = [...own].sort((a, b) => {
    const yearDiff = seasonYear(a.season) - seasonYear(b.season);
    if (yearDiff !== 0) return yearDiff;
    return (Number(a.week) || 0) - (Number(b.week) || 0);
  });
  const recordWithStreak = totalRecord + streakBadge(chronological, name);

  const opponentRowsHtml = allNames.filter(n => n !== name).map(opp => {
    const rec = byOpponent[opp] || { wins: 0, losses: 0, ties: 0 };
    const recStr = rec.ties > 0 ? `${rec.wins}-${rec.losses}-${rec.ties}` : `${rec.wins}-${rec.losses}`;
    return `<div class="rival-opponent-row"><span>vs ${escapeHtml(opp)}</span><span>${recStr}</span></div>`;
  }).join("");

  const expanded = !!state.expandedRival[name];
  const sorted = [...own].sort((a, b) => {
    if (String(a.season) !== String(b.season)) return String(b.season).localeCompare(String(a.season));
    return (Number(b.week) || 0) - (Number(a.week) || 0);
  });

  const matchupRowsHtml = sorted.map(m => {
    const isA = m.managerA === name;
    const myScore = isA ? m.scoreA : m.scoreB;
    const oppScore = isA ? m.scoreB : m.scoreA;
    const opponent = isA ? m.managerB : m.managerA;
    const outcome = outcomeFor(m, name);
    const myClass = outcome === "win" ? "is-winner" : outcome === "loss" ? "is-loser" : "";
    const oppClass = outcome === "loss" ? "is-winner" : outcome === "win" ? "is-loser" : "";
    return `
      <div class="matchup-row">
        <div class="matchup-row__meta"><div>Wk ${escapeHtml(m.week)}</div><div class="matchup-row__season">${escapeHtml(m.season)}</div></div>
        <div class="matchup-row__scores">
          <span class="${myClass}">${fmt(myScore)}</span>
          <span class="matchup-row__vs">vs ${escapeHtml(opponent)}</span>
          <span class="${oppClass}">${fmt(oppScore)}</span>
        </div>
      </div>`;
  }).join("");

  return `
    <div class="rival-card">
      <div class="rival-card__head">
        <div class="rival-card__name">${escapeHtml(name)}</div>
        <div class="rival-card__record">${recordWithStreak}</div>
      </div>
      <div class="rival-card__opponents">${opponentRowsHtml}</div>
      <div class="rival-card__toggle" id="rivalToggle-${cssId(name)}">
        <span>${expanded ? "Hide matchups" : "Show all matchups"}</span>
        <span class="rival-card__chevron ${expanded ? "" : "is-collapsed"}">${CHEVRON_SVG}</span>
      </div>
      ${expanded ? `<div class="matchup-list">${matchupRowsHtml || `<div class="empty-state__body">No matchups found.</div>`}</div>` : ""}
    </div>`;
}