import { fmt, escapeHtml } from "../format.js";

// Used by both the Home screen and the Scoring screen's "Full Leaderboard",
// so it lives here rather than inside either page module.
export function standingsListHtml(ranked, maxPts) {
  return ranked.map((m, i) => {
    const isFirst = i === 0;
    const isLast = i === ranked.length - 1 && ranked.length > 1;
    const isLeaderTie = !isFirst && m.totalStandingsPoints === maxPts;
    const rowClass = isFirst ? "is-first" : isLeaderTie ? "is-leader-tie" : "";
    const badgeClass = isFirst ? "is-first" : isLeaderTie ? "is-leader-tie" : "";
    const badge = isLast ? "🌭" : String(i + 1);
    return `
      <div class="standings-row ${rowClass}">
        <div class="rank-badge ${badgeClass} ${isLast ? "is-hotdog" : ""}">${badge}</div>
        <div class="standings-row__name">${escapeHtml(m.name)}</div>
        <div class="standings-row__pts">${fmt(m.totalStandingsPoints)}</div>
      </div>`;
  }).join("");
}
