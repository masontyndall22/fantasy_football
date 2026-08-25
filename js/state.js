// ---- config: group preference for the last-place callout tone ----
// one of: "neutral" | "dry" | "trash"
export const COPY_TONE = "neutral";
export const TONE = {
  neutral: { title: "On Dog Watch", body: n => n + " is currently in last place." },
  dry: { title: "Sweating it", body: n => n + " is keeping the basement warm right now." },
  trash: { title: "Choking already", body: n => n + " is getting cooked and everyone knows it." },
};

export const PILLARS = [
  { key: "fanduel", label: "FanDuel", categories: [
    { key: "fdWins", label: "Wins", unit: "Wins", valueFn: m => m.fdWins },
    { key: "fdTop5Total", label: "Top 5", unit: "Pts", valueFn: m => m.fdTop5Total },
    { key: "fdTop10Total", label: "Top 10", unit: "Pts", valueFn: m => m.fdTop10Total },
    { key: "fdSeasonTotal", label: "Total", unit: "Pts", valueFn: m => m.fdSeasonTotal },
  ] },
  { key: "sleeper", label: "Sleeper", categories: [
    { key: "sleeperPts", label: "Sleeper Points", unit: "Pts", valueFn: m => m.sleeperPprSeasonPoints },
    { key: "sleeperPlacement", label: "Sleeper Placement", unit: "Place", valueFn: m => m.sleeperFinalPlacement, higherBetter: false },
  ] },
  { key: "pickem", label: "Pick'em", categories: [
    { key: "pickem", label: "Pick'em", unit: "Correct", valueFn: m => m.pickemTotalCorrect },
  ] },
  { key: "playoffs", label: "Playoff Pool", categories: [
    { key: "playoffs", label: "Playoffs", unit: "Score", valueFn: m => m.playoffBracketScore },
  ] },
];
export const ALL_CATEGORIES = PILLARS.flatMap(p => p.categories.map(c => ({ ...c, pillar: p.label })));
export const GROUP_ORDER = ["Make the Playoffs", "Wild Card Round", "Divisional Round", "Conference Championship", "Super Bowl"];

// Shared, mutable UI state — page modules read/write properties on this
// same object directly (e.g. `state.pillar = "sleeper"`), rather than each
// keeping their own local copy, so tab selections persist correctly as you
// move between screens.
export const state = {
  screen: "home",
  pillar: "fanduel",
  subCategory: "fdWins",
  playoffMgr: null,
  summaryOpen: true,
};

// Holds the most recently loaded data.json payload. Page modules that need
// to re-render after something other than a full data reload (e.g. a
// pillar-tab click) read from here instead of re-fetching.
export const store = { data: null };
