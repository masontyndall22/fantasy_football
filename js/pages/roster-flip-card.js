import { $ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";

const TAG_COLORS = {
  dropped: { bg: "rgba(243,139,168,0.14)", fg: "#f38ba8" },
  traded: { bg: "rgba(125,211,252,0.14)", fg: "#7dd3fc" },
  trade: { bg: "rgba(125,211,252,0.14)", fg: "#7dd3fc" },
  waiver: { bg: "rgba(210,206,253,0.14)", fg: "#d2cefd" },
};

function tagPillHtml_(tagKey, week) {
  const color = TAG_COLORS[tagKey];
  if (!color) return "";
  const label = week != null ? `Wk ${escapeHtml(String(week))}` : "";
  return `<span class="tag-pill" style="background:${color.bg};color:${color.fg}">${label}</span>`;
}

export function renderDraftedRows(drafted) {
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

export function renderFinalRows(review) {
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

// The one shared flip-card component: dots + the drafted/final flip card +
// legend, plus all its flip-tap and swipe-to-change-manager wiring.
//
// State ownership stays with the CALLER — this only reads isFlipped/
// currentManager and calls back via onToggleFlip/onSwipeManager rather
// than owning any state itself, so two independent call sites (the Year
// Review overlay and the Scoring tab's embedded card) never share or
// clobber each other's flip/manager-selection state.
//
// `swipeZone` defaults to `renderTarget` but callers needing a larger
// swipeable area (e.g. Year Review wants the whole full-screen overlay
// swipeable, not just the roster card portion of it) can pass a
// different element.
export function renderRosterFlipCard({
  renderTarget,
  swipeZone,
  review,
  orderedManagers,
  currentManager,
  isFlipped,
  onToggleFlip,
  onSwipeManager,
}) {
  const zone = swipeZone || renderTarget;
  const draftedHtml = review ? renderDraftedRows(review.drafted) : `<div class="empty-state__body">No data for this manager/season yet.</div>`;
  const finalHtml = review ? renderFinalRows(review) : `<div class="empty-state__body">No data for this manager/season yet.</div>`;

  renderTarget.innerHTML = `
    <div class="year-review-dots">${renderDots_(orderedManagers, currentManager)}</div>
    <div class="roster-flip-wrapper">
      <div class="roster-flip-inner ${isFlipped ? "is-flipped" : ""}" id="rosterFlipInner">
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
    <div class="year-review-dots">${renderDots_(orderedManagers, currentManager)}</div>
    <div class="roster-legend">
      <span class="legend-dot" style="background:#f38ba8"></span><span>Dropped</span>
      <span class="legend-dot" style="background:#7dd3fc"></span><span>Trade</span>
      <span class="legend-dot" style="background:#d2cefd"></span><span>Waiver</span>
      <span>🔒 Keeper</span>
    </div>`;

  const inner = $("#rosterFlipInner", renderTarget);
  const front = $("#rosterFrontFace", renderTarget);
  const back = $("#rosterBackFace", renderTarget);

  // Toggle the class directly rather than re-rendering — a full rebuild
  // would create the flipped card already in its final rotated state with
  // no "before" frame to animate from, so it'd snap instead of flipping.
  const toggle = () => {
    onToggleFlip();
    if (inner) inner.classList.toggle("is-flipped");
  };
  if (front) front.onclick = toggle;
  if (back) back.onclick = toggle;

  // Swipe to switch managers — clamped, no wraparound. Direction is
  // determined early in the gesture (first ~10px of movement) so a
  // horizontal swipe can block the browser's default touch handling
  // (needed so it doesn't fight with our own manager-switch logic)
  // while a vertical scroll is left completely alone — this zone can be
  // the entire Year Review overlay, which still needs to scroll normally.
  // (A blanket preventDefault on every touchmove, regardless of
  // direction, was an actual regression here: it blocked vertical
  // scrolling for the whole overlay, not just horizontal swipes.)
  let touchStartX = null, touchStartY = null, swipeDirection = null;
  zone.ontouchstart = (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swipeDirection = null;
  };
  zone.ontouchmove = (e) => {
    if (touchStartX == null) return;
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (swipeDirection === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      swipeDirection = Math.abs(dx) > Math.abs(dy) ? "horizontal" : "vertical";
    }
    if (swipeDirection === "horizontal") e.preventDefault();
  };
  zone.ontouchend = (e) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    touchStartY = null;
    swipeDirection = null;
    if (Math.abs(dx) < 40) return;
    const idx = orderedManagers.indexOf(currentManager);
    const nextIdx = Math.max(0, Math.min(orderedManagers.length - 1, idx + (dx < 0 ? 1 : -1)));
    if (nextIdx === idx) return;
    requestAnimationFrame(() => onSwipeManager(orderedManagers[nextIdx]));
  };
}