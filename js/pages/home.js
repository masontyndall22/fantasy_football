import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state, TONE, COPY_TONE } from "../state.js";
import { standingsListHtml } from "../components/standings-list.js";

export function renderHome(data) {
  renderPreseasonSummary(data);

  const managers = data.managers;
  const ranked = [...managers].sort((a, b) => b.totalStandingsPoints - a.totalStandingsPoints);
  const minPts = Math.min(...managers.map(m => m.totalStandingsPoints));
  const maxPts = Math.max(...managers.map(m => m.totalStandingsPoints));
  const isTied = minPts === maxPts;
  const onNoticeList = managers.filter(m => m.totalStandingsPoints === minPts);
  const leader = ranked[0];

  $("#leaderCard").innerHTML = `
    <div class="leader-card__eyebrow">Leader</div>
    <h2 class="leader-card__name">${escapeHtml(leader.name)}</h2>
    <div class="leader-card__points"><b>${fmt(leader.totalStandingsPoints)}</b> standings points${
      isTied ? " — tied with the field" : ` — ${fmt(leader.totalStandingsPoints - ranked[1].totalStandingsPoints)} clear of 2nd`
    }</div>
  `;

  const onNoticeSlot = $("#onNoticeSlot");
  if (!isTied) {
    const tone = TONE[COPY_TONE] || TONE.neutral;
    const name = onNoticeList.length === 1 ? onNoticeList[0].name : `${onNoticeList.length} managers`;
    onNoticeSlot.innerHTML = `
      <div class="on-notice">
        <div class="on-notice__head">
          <svg viewBox="0 0 24 24" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"></path><path d="M12 16.5h.01"></path><path d="M10.3 3.9 2.6 18a1.8 1.8 0 0 0 1.6 2.6h15.6a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0Z"></path></svg>
          <div class="on-notice__title">${escapeHtml(tone.title)}</div>
        </div>
        <div class="on-notice__body">${escapeHtml(tone.body(name))}</div>
      </div>`;
  } else {
    onNoticeSlot.innerHTML = "";
  }

  $("#homeStandingsList").innerHTML = standingsListHtml(ranked, maxPts);
  renderWeeklyUpdate(data);
}

// "New content" badge for the Preseason Summary card — a simple localStorage
// compare, not a full change-tracking system. If the summary text differs
// from whatever was last marked "seen" on this device, show a "!" badge.
// Tapping the card marks the CURRENT text as seen, so the badge won't come
// back unless the summary text actually changes again later.
const PRESEASON_SEEN_KEY = "league:seen:preseasonSummary";

function hasNewPreseasonSummary_(summary) {
  try {
    return localStorage.getItem(PRESEASON_SEEN_KEY) !== summary;
  } catch (e) {
    return false; // localStorage unavailable (private browsing, etc.) — just skip the badge
  }
}

function markPreseasonSummarySeen_(summary) {
  try {
    localStorage.setItem(PRESEASON_SEEN_KEY, summary);
  } catch (e) {
    // ignore — badge just won't persist this dismissal
  }
}

function renderPreseasonSummary(data) {
  const slot = $("#preseasonSlot");
  if (!data.preseasonSummary) { slot.innerHTML = ""; return; }
  const isNew = hasNewPreseasonSummary_(data.preseasonSummary);
  slot.innerHTML = `
    <div class="preseason-toggle" id="preseasonToggle">
      <span>Preseason Summary${isNew ? ` <span class="new-badge">!</span>` : ""}</span>
      <svg class="preseason-toggle__chevron ${state.summaryOpen ? "" : "is-collapsed"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
    </div>
    ${state.summaryOpen ? `<div class="preseason-body">${escapeHtml(data.preseasonSummary)}</div>` : ""}
  `;
  $("#preseasonToggle").addEventListener("click", () => {
    state.summaryOpen = !state.summaryOpen;
    markPreseasonSummarySeen_(data.preseasonSummary);
    renderPreseasonSummary(data);
  });
}

function renderWeeklyUpdate(data) {
  const label = $("#weeklyUpdateLabel");
  const list = $("#weeklyUpdateList");
  const roasts = data.weeklyRoasts || [];
  if (!roasts.length) { label.style.display = "none"; list.innerHTML = ""; return; }
  label.style.display = "";
  label.textContent = "Weekly Update" + (data.currentWeekLabel ? ` — ${data.currentWeekLabel}` : "");
  list.innerHTML = roasts.map(w => `
    <div class="weekly-update-card">
      <div class="weekly-update-card__avatar">${escapeHtml((w.manager || "?").slice(0, 1).toUpperCase())}</div>
      <div>
        <div class="weekly-update-card__name">${escapeHtml(w.manager)}</div>
        <div class="weekly-update-card__roast">${escapeHtml(w.roast)}</div>
      </div>
    </div>
  `).join("");
}