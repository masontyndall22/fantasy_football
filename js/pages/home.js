import { $ } from "../dom.js";
import { fmt, escapeHtml, formatRichText } from "../format.js";
import { state, TONE, COPY_TONE } from "../state.js";

const TROPHY_SVG = '<svg class="leader-card__trophy" viewBox="0 0 24 24" fill="#e6c766" stroke="none"><path d="M6 3h12v2h2a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4 5.5 5.5 0 0 1-3.09 2.44c.2 1.13.83 1.83 2.09 2.06.5.09.9.5.9 1.01v.99a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-.99c0-.51.4-.92.9-1.01 1.26-.23 1.89-.93 2.09-2.06A5.5 5.5 0 0 1 8.9 11H8a4 4 0 0 1-4-4V6a1 1 0 0 1 1-1h2V3Zm0 4V7H5a2 2 0 0 0 2 2V7Zm12 0a2 2 0 0 0 2-2h-2v2Z"></path></svg>';

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
    <div class="leader-card__eyebrow">${TROPHY_SVG}Leader</div>
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

  renderOtherStandings(ranked, maxPts);
  renderWeeklyUpdate(data);
}

// Every manager except the leader (already shown in the leader card above),
// as a row of compact mini score cards rather than the old vertical list.
// The Scoring tab's "Full Leaderboard" is unrelated and untouched — it still
// uses the shared standingsListHtml component from components/standings-list.js.
function renderOtherStandings(ranked, maxPts) {
  const otherStandings = ranked.slice(1);
  $("#homeStandingsList").innerHTML = otherStandings.map(m => {
    const isLast = m === ranked[ranked.length - 1] && ranked.length > 1;
    const pct = Math.max(10, (m.totalStandingsPoints / maxPts) * 100);
    return `
      <div class="mini-standings-card ${isLast ? "is-last" : ""}">
        <div class="mini-standings-card__fill" style="width:${pct}%"></div>
        <div class="mini-standings-card__accent"></div>
        <div class="mini-standings-card__name">${escapeHtml(m.name)}</div>
        <div class="mini-standings-card__score">${fmt(m.totalStandingsPoints)}</div>
      </div>`;
  }).join("");
}

// "New content" badge for the Summary card — a simple localStorage
// compare, not a full change-tracking system. Keys off BOTH the period
// label and the text together, so either one changing (e.g. still on
// "Week 3" but the text got corrected) is enough to flag it as new.
// Tapping the card marks the current label+text as seen, so the badge
// won't come back until the content genuinely changes again later.
const SUMMARY_SEEN_KEY = "league:seen:summary";

function hasNewSummary_(key) {
  try {
    return localStorage.getItem(SUMMARY_SEEN_KEY) !== key;
  } catch (e) {
    return false; // localStorage unavailable (private browsing, etc.) — just skip the badge
  }
}

function markSummarySeen_(key) {
  try {
    localStorage.setItem(SUMMARY_SEEN_KEY, key);
  } catch (e) {
    // ignore — badge just won't persist this dismissal
  }
}

// One card, reused across the whole season rather than a preseason-only
// card plus a separate weekly one — the header shows whatever period
// label is currently set (e.g. "Preseason", "Post Draft", "Week 1"), and
// the body always shows data.preseasonSummary, since that's the single
// sheet cell the summary gets rewritten into each period.
function renderPreseasonSummary(data) {
  const slot = $("#preseasonSlot");
  if (!data.preseasonSummary) { slot.innerHTML = ""; return; }
  const label = data.currentWeekLabel ? `Summary — ${data.currentWeekLabel}` : "Summary";
  const seenKey = `${data.currentWeekLabel || ""}|${data.preseasonSummary}`;
  const isNew = hasNewSummary_(seenKey);
  slot.innerHTML = `
    <div class="preseason-card">
      <div class="preseason-card__header" id="preseasonToggle">
        <div class="preseason-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>
        </div>
        <span class="preseason-card__label">${escapeHtml(label)}${isNew ? ` <span class="new-badge">!</span>` : ""}</span>
        <svg class="preseason-toggle__chevron ${state.summaryOpen ? "" : "is-collapsed"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
      </div>
      ${state.summaryOpen ? `<div class="preseason-card__body">${formatRichText(data.preseasonSummary)}</div>` : ""}
    </div>
  `;
  $("#preseasonToggle").addEventListener("click", () => {
    state.summaryOpen = !state.summaryOpen;
    markSummarySeen_(seenKey);
    renderPreseasonSummary(data);
  });
}

// Our real weeklyRoasts entries embed the grade INSIDE the roast text
// itself (e.g. "B+ : roast text..."), unlike the design mock's separate
// `grade` field — so pull it back out here rather than expecting a field
// that doesn't exist in the real data. Falls back gracefully (no badge
// color, roast shown as-is) if a roast doesn't follow that format.
function parseRoast_(roastRaw) {
  const m = /^([A-F][+-]?)\s*:\s*([\s\S]*)$/.exec(roastRaw || "");
  if (m) return { grade: m[1], text: m[2].trim() };
  return { grade: null, text: roastRaw || "" };
}

function gradeTier_(grade) {
  const letter = (grade || "").charAt(0).toUpperCase();
  if (letter === "A") return "a";
  if (letter === "B") return "b";
  if (letter === "C") return "c";
  return "d"; // D, F, or no grade found
}

function renderWeeklyUpdate(data) {
  const label = $("#weeklyUpdateLabel");
  const list = $("#weeklyUpdateList");
  const roasts = data.weeklyRoasts || [];
  if (!roasts.length) { label.style.display = "none"; list.innerHTML = ""; return; }
  label.style.display = "";
  label.textContent = "Weekly Update" + (data.currentWeekLabel ? ` — ${data.currentWeekLabel}` : "");

  list.innerHTML = roasts.map(w => {
    const { grade, text } = parseRoast_(w.roast);
    const tier = gradeTier_(grade);
    return `
      <div class="weekly-update-card tier-${tier}">
        <div class="weekly-update-card__badge">${escapeHtml(grade || "?")}</div>
        <div>
          <div class="weekly-update-card__name">${escapeHtml(w.manager)}</div>
          <div class="weekly-update-card__roast">${formatRichText(text)}</div>
        </div>
      </div>`;
  }).join("");
}