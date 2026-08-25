import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";

export function renderHistory(data) {
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
