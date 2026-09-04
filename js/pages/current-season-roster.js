import { $ } from "../dom.js";
import { escapeHtml } from "../format.js";
import { state } from "../state.js";
import { renderRosterFlipCard } from "./roster-flip-card.js";

// Rendered from inside the Scoring tab's Sleeper pillar (scoring.js), just
// below the Sleeper flip card. Scoped to whichever season is CURRENT, not
// every season — for browsing past seasons' rosters, that's what the Year
// Review overlay (opened from History > Previous Leagues) is for.

function seasonStartYear_(label) {
  const m = String(label).match(/\d{4}/);
  return m ? m[0] : String(label);
}

function currentSeasonFromData_(data) {
  const historicalYears = new Set((data.historicalSeasons || []).map(s => seasonStartYear_(s.season)));
  
  // Extract and sort seasons in descending order based on their start year
  const seasons = [...new Set((data.yearReviews || []).map(yr => yr.season))]
    .sort((a, b) => seasonStartYear_(b) - seasonStartYear_(a));

  return seasons.find(s => !historicalYears.has(seasonStartYear_(s))) || null;
}

export function renderCurrentSeasonRosterCard(managers, data) {
  const wrap = $("#sleeperRosterCard");
  if (!wrap) return;

  const currentSeason = currentSeasonFromData_(data);
  const managerNames = managers.map(m => m.name);
  if (!state.scoringRosterManager || !managerNames.includes(state.scoringRosterManager)) {
    state.scoringRosterManager = managerNames[0];
  }

  const review = (data.yearReviews || []).find(yr => yr.season === currentSeason && yr.manager === state.scoringRosterManager);

  wrap.innerHTML = `
    <div class="section-label">${escapeHtml(state.scoringRosterManager)}'s Roster</div>
    <div id="scoringRosterCardTarget"></div>`;

  renderRosterFlipCard({
    renderTarget: $("#scoringRosterCardTarget"),
    review: review,
    orderedManagers: managerNames,
    currentManager: state.scoringRosterManager,
    isFlipped: state.scoringRosterFlipped,
    onToggleFlip: () => {
      state.scoringRosterFlipped = !state.scoringRosterFlipped;
    },
    onSwipeManager: (newManager) => {
      state.scoringRosterManager = newManager;
      state.scoringRosterFlipped = false;
      renderCurrentSeasonRosterCard(managers, data);
    },
  });
}