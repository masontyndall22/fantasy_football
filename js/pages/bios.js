import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";

const TROPHY_SVG = '<svg viewBox="0 0 24 24"><path d="M6 3h12v2h2a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4 5.5 5.5 0 0 1-3.09 2.44c.2 1.13.83 1.83 2.09 2.06.5.09.9.5.9 1.01v.99a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-.99c0-.51.4-.92.9-1.01 1.26-.23 1.89-.93 2.09-2.06A5.5 5.5 0 0 1 8.9 11H8a4 4 0 0 1-4-4V6a1 1 0 0 1 1-1h2V3Zm0 4V7H5a2 2 0 0 0 2 2V7Zm12 0a2 2 0 0 0 2-2h-2v2ZM9 19h6v1a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-1Z"></path></svg>';

export function renderBios(data) {
  const reigningChampion = data.leagueHistory && data.leagueHistory.length ? data.leagueHistory[0].champion : null;

  $("#bioList").innerHTML = (data.bios || []).map(b => {
    const isChampion = !!reigningChampion && b.manager === reigningChampion;
    const wins = Number(b.leagueWins) || 0;
    return `
    <div class="bio-card ${isChampion ? "is-champion" : ""}">
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
      </div>
      <div class="bio-card__row"><span class="label">Strength — </span><span class="value">${escapeHtml(b.strength || "—")}</span></div>
      <div class="bio-card__row"><span class="label">Weakness — </span><span class="value">${escapeHtml(b.weakness || "—")}</span></div>
      <div class="bio-card__row"><span class="label">Punishments served — </span><span class="value">${escapeHtml(b.punishmentsDone || "—")}</span></div>
    </div>
  `;
  }).join("") || `<div class="empty-state"><div class="empty-state__title">No bios yet</div><div class="empty-state__body">Add manager info to the Stats tab and it'll show up here.</div></div>`;
}
