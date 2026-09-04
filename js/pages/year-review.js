import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state, store } from "../state.js";
import { ordinal } from "./history.js";
import { renderRosterFlipCard } from "./roster-flip-card.js";

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
  overlay.innerHTML = renderOverlayContent_(review, manager, season, teamName, historyEntry);
  wireOverlayEvents_(data, orderedManagers, review, manager, season);
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

  if (starterPoints) {
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Points For</div>
        <div class="stat-card__value">${fmt(starterPoints.pointsFor)}</div>
        ${starterPoints.pointsProjected ? `<div class="stat-card__sub">Proj: ${fmt(starterPoints.pointsProjected)}</div>` : ""}
      </div>`);
    cards.push(`
      <div class="stat-card">
        <div class="stat-card__label">Points Against</div>
        <div class="stat-card__value" style="color:#f38ba8">${fmt(starterPoints.pointsAgainst)}</div>
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

  if (!cards.length) return "";
  return `<div class="year-review-stats">${cards.join("")}</div>`;
}

function renderOverlayContent_(review, manager, season, teamName, historyEntry) {
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
    <div id="yearReviewRosterCard"></div>
  `;
}

function wireOverlayEvents_(data, orderedManagers, review, manager, season) {
  const closeBtn = $("#yearReviewClose");
  if (closeBtn) closeBtn.addEventListener("click", closeYearReview);

  renderRosterFlipCard({
    renderTarget: $("#yearReviewRosterCard"),
    swipeZone: $("#yearReviewOverlay"), // whole overlay is swipeable, not just the roster card portion of it
    review: review,
    orderedManagers: orderedManagers,
    currentManager: manager,
    isFlipped: state.rosterTab === "final",
    onToggleFlip: () => {
      state.rosterTab = state.rosterTab === "drafted" ? "final" : "drafted";
    },
    onSwipeManager: (newManager) => {
      state.yearReviewOpen = `${newManager}|${season}`;
      state.rosterTab = "drafted";
      renderYearReview(data);
    },
  });
}