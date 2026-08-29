import { $, $$ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state, store } from "../state.js";
import { ordinal } from "./history.js";

const TAG_COLORS = {
  dropped: { bg: "rgba(243,139,168,0.14)", fg: "#f38ba8" },
  traded: { bg: "rgba(125,211,252,0.14)", fg: "#7dd3fc" },
  trade: { bg: "rgba(125,211,252,0.14)", fg: "#7dd3fc" },
  waiver: { bg: "rgba(210,206,253,0.14)", fg: "#d2cefd" },
};

export function openYearReview(manager, season) {
  state.yearReviewOpen = `${manager}|${season}`;
  state.rosterTab = "drafted";
  renderYearReview(store.data);
}

export function closeYearReview() {
  state.yearReviewOpen = null;
  renderYearReview(store.data);
}

export function renderYearReview(data) {
  const overlay = $("#yearReviewOverlay");
  if (!overlay) return;
  if (!state.yearReviewOpen || !data) {
    overlay.classList.remove("is-open");
    overlay.innerHTML = "";
    return;
  }

  const [manager, season] = state.yearReviewOpen.split("|");
  const reviews = data.yearReviews || [];
  const yearManagerNames = [...new Set(reviews.filter(r => r.season === season).map(r => r.manager))];
  // Keep a stable, familiar order (matching the managers list) rather than
  // whatever order the data happens to come back in.
  const managerNameOrder = (data.managers || []).map(m => m.name).filter(n => yearManagerNames.includes(n));
  const orderedManagers = managerNameOrder.length ? managerNameOrder : yearManagerNames;

  const review = reviews.find(r => r.manager === manager && r.season === season);
  const historyEntry = (data.memberHistory || []).find(h => h.manager === manager && String(h.year) === String(season));
  const teamName = historyEntry ? historyEntry.teamName : "";

  overlay.classList.add("is-open");
  overlay.innerHTML = renderOverlayContent_(review, manager, season, orderedManagers, teamName, historyEntry);
  wireOverlayEvents_(data, orderedManagers);
}

function tagPillHtml_(tagKey, week) {
  const color = TAG_COLORS[tagKey];
  if (!color) return "";
  const label = week != null ? `Wk ${escapeHtml(String(week))}` : "";
  return `<span class="tag-pill" style="background:${color.bg};color:${color.fg}">${label}</span>`;
}

function renderDraftedRows_(drafted) {
  if (!drafted || !drafted.length) {
    return `<div class="empty-state__body">No draft data for this season yet.</div>`;
  }
  return drafted.map(d => `
    <div class="roster-row">
      <div class="roster-row__round">${escapeHtml(String(d.round))}</div>
      <span class="pos-pill">${escapeHtml(d.position || "")}</span>
      <div class="roster-row__name ${d.exitTag ? "is-exited" : ""}">${escapeHtml(d.name)}${d.isKeeper ? " 🔒" : ""}</div>
      ${d.exitTag ? tagPillHtml_(d.exitTag, d.exitWeek) : ""}
    </div>`).join("");
}

function renderFinalRows_(review) {
  const final = review.final || [];
  if (!final.length) {
    return `<div class="empty-state__body">No final roster data for this season yet.</div>`;
  }
  let benchLabelShown = false;
  const rowsHtml = final.map(f => {
    let benchDivider = "";
    if (review.hasBenchSplit && !f.isStarter && !benchLabelShown) {
      benchLabelShown = true;
      benchDivider = `<div class="roster-bench-label">Bench</div>`;
    }
    const hasPoints = f.points != null;
    const hasDelta = hasPoints && f.projectedPoints != null;
    const delta = hasDelta ? f.points - f.projectedPoints : null;
    const deltaClass = hasDelta && delta >= 0 ? "is-positive" : "is-negative";
    return `
      ${benchDivider}
      <div class="roster-row roster-row--final">
        <div class="roster-row__left">
          <span class="pos-pill">${escapeHtml(f.position || "")}</span>
          <div class="roster-row__name">${escapeHtml(f.name)}</div>
          ${f.tag !== "kept" ? tagPillHtml_(f.tag, f.tagWeek) : ""}
        </div>
        <div class="roster-row__right">
          <span class="roster-row__points">${hasPoints ? fmt(f.points) : "NA"}</span>
          ${hasDelta ? `<span class="delta-pill ${deltaClass}">${delta >= 0 ? "+" : ""}${fmt(delta)}</span>` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="roster-final-header"><span>Player</span><span>Points</span></div>
    ${rowsHtml}`;
}

function renderDots_(orderedManagers, activeManager) {
  return orderedManagers.map(m =>
    `<span class="year-review-dot ${m === activeManager ? "is-active" : ""}"></span>`
  ).join("");
}

function renderGradeBadge_(review) {
  if (!review || !review.seasonGrade) {
    return `
      <div class="year-review-grade">
        <div class="grade-badge"><span class="grade-badge__letter">—</span></div>
        <div class="grade-badge__label">Season Grade</div>
        <div class="grade-badge__note">Not enough data yet to grade this season.</div>
      </div>`;
  }
  return `
    <div class="year-review-grade">
      <div class="grade-badge"><span class="grade-badge__letter">${escapeHtml(review.seasonGrade.letter)}</span></div>
      <div class="grade-badge__label">Season Grade</div>
      <div class="grade-badge__note">${escapeHtml(review.gradeNote || "")}</div>
    </div>`;
}

function renderStatCards_(review, historyEntry) {
  if (!review) return "";

  const kept = review.final.filter(f => f.tag === "kept").length;
  const totalPlayers = review.final.length;
  const starterPoints = review.starterPoints;
  const tx = review.transactions;
  const faabSpent = review.faabSpent;

  const cards = [];

  if (historyEntry) {
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Finish</div>
        <div class="stat-card__value" style="color:var(--gold)">${ordinal(historyEntry.place)}</div>
        <div class="stat-card__sub">${fmt(historyEntry.wins)}-${fmt(historyEntry.losses)}</div>
      </div>`);
  }

  if (faabSpent > 0) {
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">FAAB Spent</div>
        <div class="stat-card__value">$${fmt(faabSpent)}</div>
      </div>`);
  }

  if (totalPlayers > 0) {
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Roster Kept</div>
        <div class="stat-card__value">${kept}/${totalPlayers}</div>
      </div>`);
  }

  if (tx) {
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Transactions</div>
        <div class="stat-card__value">${tx.total}</div>
        <div class="stat-card__sub">${tx.adds} + · ${tx.trades} ⇄</div>
      </div>`);
  }

  if (starterPoints) {
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Starter Total</div>
        <div class="stat-card__value">${fmt(starterPoints.pointsFor)}</div>
        ${starterPoints.pointsProjected ? `<div class="stat-card__sub">Proj: ${fmt(starterPoints.pointsProjected)}</div>` : ""}
      </div>`);
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Points Against</div>
        <div class="stat-card__value" style="color:#f38ba8">${fmt(starterPoints.pointsAgainst)}</div>
      </div>`);
  }

  if (!cards.length) return "";
  return `<div class="year-review-stats">${cards.join("")}</div>`;
}

function renderOverlayContent_(review, manager, season, orderedManagers, teamName, historyEntry) {
  const rosterTab = state.rosterTab;
  const draftedHtml = review ? renderDraftedRows_(review.drafted) : `<div class="empty-state__body">No data for this manager/season yet.</div>`;
  const finalHtml = review ? renderFinalRows_(review) : `<div class="empty-state__body">No data for this manager/season yet.</div>`;

  return `
    <div class="year-review-header">
      <div>
        <div class="year-review-header__title">${escapeHtml(manager)} — ${escapeHtml(season)}</div>
        ${teamName ? `<div class="year-review-header__subtitle">${escapeHtml(teamName)}</div>` : ""}
      </div>
      <button class="year-review-close" id="yearReviewClose" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"></path></svg>
      </button>
    </div>
    ${renderGradeBadge_(review)}
    ${renderStatCards_(review, historyEntry)}
    <div class="year-review-dots">${renderDots_(orderedManagers, manager)}</div>
    <div class="roster-flip-wrapper">
      <div class="roster-flip-inner ${rosterTab === "final" ? "is-flipped" : ""}" id="rosterFlipInner">
        <div class="roster-face" id="rosterFrontFace">
          <div class="roster-face__title">Drafted</div>
          <div class="roster-list">${draftedHtml}</div>
          <div class="roster-caption">Tap to see final lineup</div>
        </div>
        <div class="roster-face" id="rosterBackFace">
          <div class="roster-face__title">Final Lineup</div>
          <div class="roster-list">${finalHtml}</div>
          <div class="roster-caption">Tap to see draft day</div>
        </div>
      </div>
    </div>
    <div class="roster-legend">
      <span class="legend-dot" style="background:#f38ba8"></span><span>Dropped</span>
      <span class="legend-dot" style="background:#7dd3fc"></span><span>Trade</span>
      <span class="legend-dot" style="background:#d2cefd"></span><span>Waiver</span>
      <span>🔒 Keeper</span>
    </div>
  `;
}

function wireOverlayEvents_(data, orderedManagers) {
  const closeBtn = $("#yearReviewClose");
  if (closeBtn) closeBtn.addEventListener("click", closeYearReview);

  // Toggle the class on the existing element rather than re-rendering the
  // whole overlay — a full re-render would create the flipped card already
  // in its final rotated state with no "before" frame to animate from, so
  // it'd snap instead of flipping (same fix as the Bios flip cards).
  const flipInner = $("#rosterFlipInner");
  const toggleFlip = () => {
    state.rosterTab = state.rosterTab === "drafted" ? "final" : "drafted";
    if (flipInner) flipInner.classList.toggle("is-flipped", state.rosterTab === "final");
  };
  const front = $("#rosterFrontFace");
  const back = $("#rosterBackFace");
  if (front) front.addEventListener("click", toggleFlip);
  if (back) back.addEventListener("click", toggleFlip);

  const overlay = $("#yearReviewOverlay");
  let touchStartX = null;
  overlay.ontouchstart = (e) => { touchStartX = e.touches[0].clientX; };
  overlay.ontouchend = (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(dx) < 40) return; // ignore taps/jitter
    switchManager_(data, orderedManagers, dx < 0 ? 1 : -1);
  };
}

function switchManager_(data, orderedManagers, delta) {
  const [currentManager, season] = state.yearReviewOpen.split("|");
  const idx = orderedManagers.indexOf(currentManager);
  const nextIdx = Math.max(0, Math.min(orderedManagers.length - 1, idx + delta));
  if (nextIdx === idx) return; // clamped at the ends — no wraparound
  state.yearReviewOpen = `${orderedManagers[nextIdx]}|${season}`;
  state.rosterTab = "drafted";
  renderYearReview(data);
}