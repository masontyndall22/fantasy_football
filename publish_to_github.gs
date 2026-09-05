/**
 * PUBLISH TO GITHUB
 * Reads live data straight from this spreadsheet (no Sheety involved) and
 * commits it as data.json to your GitHub Pages repo.
 *
 * SETUP (one time):
 * 1. Go to github.com/settings/tokens > Generate new token (classic)
 *    - Scope needed: just "repo" (or "public_repo" if your repo is public)
 * 2. In this Apps Script project: Project Settings (gear icon) > Script Properties
 *    - Add property: GITHUB_TOKEN = <the token you just copied>
 * 3. Fill in GITHUB_OWNER, GITHUB_REPO, and DATA_FILE_PATH below.
 * 4. Run publishToGithub() once manually to test.
 */

// ==== CONFIG ====
const GITHUB_OWNER = 'masontyndall22';
const GITHUB_REPO = 'fantasy_football';
const DATA_FILE_PATH = 'data.json';
const GITHUB_BRANCH = 'main';

const MANAGER_ORDER = ['Ben', 'Caleb', 'Kyle', 'Mason'];
 
function publishToGithub() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const payload = buildDashboardJson_(ss);
  commitFileToGithub_(JSON.stringify(payload, null, 2));
}
 
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('The League')
    .addItem('Publish Now', 'publishToGithub')
    .addToUi();
}
 
// ============================================================
// Build the JSON payload directly from the live sheet
// ============================================================
function buildDashboardJson_(ss) {
  const homeContent = readHomeContent_(ss);
  const historicalSeasons = readHistoricalSeasons_(ss);
  const sleeperScoreRecords = readScoreRecords_(ss, 'Sleeper_Score_Records');
  const fanDuelScoreRecords = readScoreRecords_(ss, 'FanDuel_Score_Records');
  const memberHistory = readMemberHistory_(ss);
  const currentSeasonRecord = readCurrentSeasonRecord_(ss);
 
  const faabBySeason = readFaabSpendBySeason_(ss);
  const faabSeasonKeys = Object.keys(faabBySeason).map(Number).filter(n => !isNaN(n));
  const currentFaabSeason = faabSeasonKeys.length ? String(Math.max(...faabSeasonKeys)) : null;
  const faabByManager = currentFaabSeason ? (faabBySeason[currentFaabSeason] || {}) : {};
 
  const managersRaw = readManagers_(ss);
  const managers = managersRaw.map(m => ({
    ...m,
    seasonGrade: buildSeasonGrade_(m, managersRaw, faabByManager),
  }));
  const bios = readStats_(ss).map(b => ({
    ...b,
    allTimeRecord: buildAllTimeRecord_(b.manager, memberHistory, currentSeasonRecord),
    careerStats: buildCareerStats_(b.manager, historicalSeasons, sleeperScoreRecords, fanDuelScoreRecords),
  }));
 
  const yearReviews = attachYearReviewStats_(readYearReviews_(ss), ss, historicalSeasons, managersRaw, faabBySeason);
 
  return {
    generatedAt: new Date().toISOString(),
    managers: managers,
    bios: bios,
    playoffCategories: readPlayoffCategories_(ss),
    playoffPicks: readPlayoffPicks_(ss),
    playoffActual: readPlayoffActual_(ss),
    actualMvp: readActualMvp_(ss),
    leagueHistory: readLeagueHistory_(ss),
    historicalSeasons: historicalSeasons,
    weeklyFanDuel: readWeeklyMatrix_(ss, 'FanDuel_Data', 3, 20),
    fanduelWeekly: readFanDuelWeeklyBreakdown_(ss),
    pickemWeekly: readWeeklyMatrix_(ss, 'Sleeper_Pickems_Data', 3, 20),
    sleeperScoreRecords: sleeperScoreRecords,
    fanDuelScoreRecords: fanDuelScoreRecords,
    headToHead: readHeadToHead_(ss),
    matchups: readHeadToHead_(ss),
    memberHistory: memberHistory,
    yearReviews: yearReviews,
    currentSummary: homeContent.currentSummary,
    currentWeekLabel: homeContent.currentWeekLabel,
    weeklyRoasts: homeContent.weeklyRoasts,
  };
}
 
// Per completed season, each manager's final standings Place (1-4) and Total
// points — pulled from League_History_Detail's "Total" and "Place" rows.
// Used for the Rivalry view and all-time season records. Deliberately does
// NOT include the in-progress current season, since comparing an unfinished
// season's running total against final historical totals wouldn't be fair.
function readHistoricalSeasons_(ss) {
  const sheet = ss.getSheetByName('League_History_Detail');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const managerCols = ['Ben', 'Caleb', 'Kyle', 'Mason'];
  const bySeason = {};
  rows.forEach(r => {
    const season = r[0], category = r[1];
    if (!season || (category !== 'Total' && category !== 'Place')) return;
    if (!bySeason[season]) bySeason[season] = { season: season, totals: {}, places: {} };
    managerCols.forEach((m, i) => {
      const val = r[2 + i];
      if (category === 'Total') bySeason[season].totals[m] = val;
      if (category === 'Place') bySeason[season].places[m] = val;
    });
  });
  return Object.values(bySeason);
}
 
// Generic reader for a "Week | Ben | Caleb | Kyle | Mason" weekly matrix tab
// (FanDuel_Data or Sleeper_PPR_Weekly_Log share this exact shape). Returns
// one array per manager; blank/not-yet-played weeks come back as 0.
// Reads FanDuel_Data's per-week Top5/Top10 "helper" columns (V-Y and
// AA-AD — each holds that week's raw score only on weeks the manager
// actually qualified, blank otherwise) alongside the raw weekly scores
// (B-E, same columns weeklyFanDuel already reads). Feeds the FanDuel
// pillar's per-category weekly breakdown cards.
function readFanDuelWeeklyBreakdown_(ss) {
  const managerCols = ['Ben', 'Caleb', 'Kyle', 'Mason'];
  const empty = () => ({ Ben: [], Caleb: [], Kyle: [], Mason: [] });
  const sheet = ss.getSheetByName('FanDuel_Data');
  if (!sheet) return { fdWins: [], fdTop5: empty(), fdTop10: empty(), fdAllWeeks: empty() };
 
  const rows = sheet.getRange(3, 1, 18, 30).getValues(); // A:AD, weeks 1-18
  const fdWins = [];
  const fdTop5 = empty(), fdTop10 = empty(), fdAllWeeks = empty();
 
  rows.forEach(r => {
    const week = r[0];
    if (!week) return;
    const scores = {};
    let anyPlayed = false;
    managerCols.forEach((m, i) => {
      const raw = Number(r[1 + i]) || 0; // cols B-E
      scores[m] = raw;
      if (raw) anyPlayed = true;
    });
    if (anyPlayed) fdWins.push({ week: week, scores: scores }); // 0 = not yet played, same convention used elsewhere
 
    managerCols.forEach((m, i) => {
      const raw = scores[m];
      if (raw) fdAllWeeks[m].push(raw);
      const top5Score = Number(r[21 + i]) || 0; // cols V-Y
      if (top5Score) fdTop5[m].push(top5Score);
      const top10Score = Number(r[26 + i]) || 0; // cols AA-AD
      if (top10Score) fdTop10[m].push(top10Score);
    });
  });
 
  managerCols.forEach(m => {
    fdTop5[m].sort((a, b) => b - a);
    fdTop10[m].sort((a, b) => b - a);
    fdAllWeeks[m].sort((a, b) => b - a);
  });
 
  return { fdWins: fdWins, fdTop5: fdTop5, fdTop10: fdTop10, fdAllWeeks: fdAllWeeks };
}
 
function readWeeklyMatrix_(ss, sheetName, startRow, endRow) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { Ben: [], Caleb: [], Kyle: [], Mason: [] };
  const managerCols = ['Ben', 'Caleb', 'Kyle', 'Mason'];
  const out = { Ben: [], Caleb: [], Kyle: [], Mason: [] };
  const rows = sheet.getRange(startRow, 1, endRow - startRow + 1, 5).getValues();
  rows.forEach(r => {
    managerCols.forEach((m, i) => {
      out[m].push(Number(r[1 + i]) || 0);
    });
  });
  return out;
}
 
// Reads the all-time Sleeper score records (highest/lowest single week ever,
// per manager) — a simple 4-row table rather than a full weekly log, since
// only the two extremes ever matter for this.
// Shared reader for any "highest/lowest score ever" tab — Sleeper_Score_Records
// and FanDuel_Score_Records both use this exact same 7-column shape.
function readScoreRecords_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return {};
  const rows = sheet.getRange(3, 1, 4, 7).getValues();
  const out = {};
  rows.forEach(r => {
    if (!r[0]) return;
    out[r[0]] = {
      highest: { value: r[1], season: r[2], week: r[3] },
      lowest: { value: r[4], season: r[5], week: r[6] },
    };
  });
  return out;
}
 
// Reads the real head-to-head matchup log (populated by sleeper_sync.gs —
// a separate script from this one). Returns one flat row per matchup;
// nothing to compute here, the app does the win/loss tallying client-side.
function readHeadToHead_(ss) {
  const sheet = ss.getSheetByName('Sleeper_Head2Head_Log');
  if (!sheet || sheet.getLastRow() < 3) return [];
  const rows = sheet.getRange(3, 1, sheet.getLastRow() - 2, 7).getValues();
  return rows.filter(r => r[0]).map(r => ({
    season: r[0], week: r[1],
    managerA: r[2], scoreA: r[3],
    managerB: r[4], scoreB: r[5],
    winner: r[6],
  }));
}
 
// Reads this season's live starter-scoped Points For / Points Against /
// Points Projected straight off Sleeper_PPR_Data (columns G, H, and I),
// keyed by manager name.
function readCurrentSeasonStarterPoints_(ss) {
  const sheet = ss.getSheetByName('Sleeper_PPR_Data');
  if (!sheet) return {};
  const rows = sheet.getRange(3, 1, 4, 9).getValues(); // rows 3-6, cols A-I
  const out = {};
  rows.forEach(r => {
    if (!r[0]) return;
    out[r[0]] = { pointsFor: Number(r[6]) || 0, pointsAgainst: Number(r[7]) || 0, pointsProjected: Number(r[8]) || 0 };
  });
  return out;
}
 
// Reads every past season's starter-scoped Points For / Points Projected /
// Points Against from Sleeper_Season_Points_Totals, grouped by season then
// manager.
function readPastSeasonStarterPoints_(ss) {
  const sheet = ss.getSheetByName('Sleeper_Season_Points_Totals');
  if (!sheet || sheet.getLastRow() < 3) return {};
  const rows = sheet.getRange(3, 1, sheet.getLastRow() - 2, 5).getValues();
  const out = {}; // { season: { manager: {pointsFor, pointsProjected, pointsAgainst} } }
  rows.forEach(r => {
    const season = String(r[0]), manager = r[1];
    if (!out[season]) out[season] = {};
    out[season][manager] = { pointsFor: Number(r[2]) || 0, pointsProjected: Number(r[3]) || 0, pointsAgainst: Number(r[4]) || 0 };
  });
  return out;
}
 
// Counts each manager's Add transactions per season, split into "adds"
// (waiver/free_agent) vs. "trades" — drops aren't counted separately since
// every drop already has a matching add counted elsewhere.
function readTransactionCountsBySeasonManager_(ss) {
  const sheet = ss.getSheetByName('Sleeper_Transactions_Log');
  if (!sheet || sheet.getLastRow() < 3) return {};
  const rows = sheet.getRange(3, 1, sheet.getLastRow() - 2, 8).getValues();
  const out = {}; // { season: { manager: {adds, trades, total} } }
  rows.forEach(r => {
    const season = String(r[0]), type = r[2], manager = r[3], action = r[4];
    if (action !== 'Add') return;
    if (!out[season]) out[season] = {};
    if (!out[season][manager]) out[season][manager] = { adds: 0, trades: 0, total: 0 };
    if (type === 'trade') out[season][manager].trades++;
    else out[season][manager].adds++;
    out[season][manager].total++;
  });
  return out;
}
 
// True if `season` is NOT one of the completed seasons in historicalSeasons
// — i.e. it's the live, in-progress season, which is deliberately excluded
// from historicalSeasons (see readHistoricalSeasons_).
// League_History_Detail labels seasons like "2025/26"; Sleeper's own
// `season` field (used everywhere in Sleeper_Draft_Log, Sleeper_Roster_Log,
// Sleeper_Season_Points_Totals, etc.) is a plain year like "2025". A
// straight string comparison between the two never matches, so pull out
// just the leading 4-digit year from either format before comparing.
function seasonStartYear_(label) {
  const m = String(label).match(/\d{4}/);
  return m ? m[0] : String(label);
}
 
// A season is "current" (still live, not yet backfilled) if it has no row
// in Sleeper_Season_Points_Totals — that sheet is populated for every PAST
// season by backfillPastSeasonPointsTotals(), which deliberately skips the
// live season. This is checked directly against pastStarterPoints rather
// than historicalSeasons (League_History_Detail), since that sheet may not
// extend back to older/legacy seasons at all — using it here would
// misclassify any season missing from it as "current" even when it's
// genuinely a backfilled past season sitting right there in
// Sleeper_Season_Points_Totals.
function isCurrentSeason_(season, pastStarterPoints) {
  return !(String(season) in pastStarterPoints);
}
 
// Attaches Season Grade, FAAB spent, transaction counts, and starter
// points/projected onto each yearReviews entry — everything the Year
// Review header's grade badge + stat cards need. Uses historicalSeasons
// for any completed season, and the live managers/Sleeper_PPR_Data for
// whichever season is currently in progress.
function attachYearReviewStats_(yearReviews, ss, historicalSeasons, managersRaw, faabBySeason) {
  const transactionCounts = readTransactionCountsBySeasonManager_(ss);
  const pastStarterPoints = readPastSeasonStarterPoints_(ss);
  const currentStarterPoints = readCurrentSeasonStarterPoints_(ss);
 
  return yearReviews.map(yr => {
    const isCurrent = isCurrentSeason_(yr.season, pastStarterPoints);
    const hist = historicalSeasons.find(s => seasonStartYear_(s.season) === seasonStartYear_(yr.season));
 
    let totalsByManager = null;
    if (hist) {
      totalsByManager = hist.totals;
    } else if (isCurrent) {
      totalsByManager = {};
      managersRaw.forEach(m => { totalsByManager[m.name] = m.totalStandingsPoints; });
    }
 
    const faabSpent = (faabBySeason[String(yr.season)] || {})[yr.manager] || 0;
    const seasonGrade = (totalsByManager && totalsByManager[yr.manager] != null)
      ? buildSeasonGradeGeneric_(yr.manager, totalsByManager, faabSpent)
      : null;
    const gradeNote = seasonGrade
      ? (seasonGrade.reasons.length ? seasonGrade.reasons.join(' • ') : 'Performance matched the season\'s standings.')
      : null;
 
    const txCounts = (transactionCounts[String(yr.season)] || {})[yr.manager] || null;
    const starterPoints = isCurrent
      ? (currentStarterPoints[yr.manager] || null)
      : ((pastStarterPoints[String(yr.season)] || {})[yr.manager] || null);
 
    return {
      ...yr,
      seasonGrade: seasonGrade,
      gradeNote: gradeNote,
      faabSpent: Math.round(faabSpent * 100) / 100,
      transactions: txCounts,
      starterPoints: starterPoints,
    };
  });
}
 
// Reads the manually-maintained League_History tab — one row per manager
// per season, with their team name and W/L/place that year.
function readMemberHistory_(ss) {
  const sheet = ss.getSheetByName('League_History');
  if (!sheet || sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return rows.filter(r => r[0]).map(r => ({
    manager: r[0],
    year: r[1],
    teamName: r[2],
    wins: r[3],
    losses: r[4],
    place: r[5],
  }));
}
 
// ============================================================
// YEAR REVIEW — per manager per season: drafted roster (with exit tags for
// anyone no longer on the final roster) and final roster (with acquisition
// tags for anyone not drafted, plus actual vs. projected points).
// Cross-references Sleeper_Draft_Log, Sleeper_Roster_Log, and
// Sleeper_Transactions_Log — all built by sleeper_history.gs.
// ============================================================
const YEAR_REVIEW_POSITION_ORDER_ = ['QB', 'RB', 'WR', 'TE', 'DEF', 'K'];
 
function yearReviewPositionSortIndex_(pos) {
  const i = YEAR_REVIEW_POSITION_ORDER_.indexOf(pos);
  return i === -1 ? YEAR_REVIEW_POSITION_ORDER_.length : i;
}
 
// Player ID -> Position. Used as the primary lookup wherever an ID exists.
function readPlayerPositions_(ss) {
  const sheet = ss.getSheetByName('Players_Map');
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const out = {};
  rows.forEach(r => { out[String(r[0])] = r[2]; }); // Player ID -> Position
  return out;
}
 
// Name -> Position, lowercased/trimmed for forgiving matching. Fallback for
// legacy (pre-Sleeper) draft rows that have no Player ID to join on —
// Sleeper's player list includes plenty of retired players too, so a name
// match often still resolves. Only ever used when the ID lookup can't
// apply (i.e. Player ID is blank), never as a general substitute for it —
// two different rows both having a blank ID must never be treated as the
// same player, which is exactly what an ID-based join would do by
// accident if blank strings were allowed to collide as a shared key.
function readPlayerPositionsByName_(ss) {
  const sheet = ss.getSheetByName('Players_Map');
  if (!sheet || sheet.getLastRow() < 2) return {};
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const out = {};
  rows.forEach(r => {
    const name = String(r[1] || '').trim().toLowerCase();
    if (!name) return;
    if (!(name in out)) out[name] = r[2]; // first match wins if a name is ambiguous
  });
  return out;
}
 
function readYearReviews_(ss) {
  const draftSheet = ss.getSheetByName('Sleeper_Draft_Log');
  const rosterSheet = ss.getSheetByName('Sleeper_Roster_Log');
  const txSheet = ss.getSheetByName('Sleeper_Transactions_Log');
  if (!draftSheet || !rosterSheet) return [];
 
  const positions = readPlayerPositions_(ss);
  const positionsByName = readPlayerPositionsByName_(ss);
 
  const draftRows = draftSheet.getLastRow() > 2
    ? draftSheet.getRange(3, 1, draftSheet.getLastRow() - 2, 8).getValues() : [];
  const rosterRows = rosterSheet.getLastRow() > 2
    ? rosterSheet.getRange(3, 1, rosterSheet.getLastRow() - 2, 8).getValues() : [];
  const txRows = (txSheet && txSheet.getLastRow() > 2)
    ? txSheet.getRange(3, 1, txSheet.getLastRow() - 2, 8).getValues() : [];
 
  const keysSeen = new Set();
  const draftByKey = {};
  draftRows.forEach(r => {
    const key = `${r[0]}|${r[3]}`; // season|manager
    keysSeen.add(key);
    if (!draftByKey[key]) draftByKey[key] = [];
    draftByKey[key].push({
      round: r[1], playerId: String(r[4]), name: r[5],
      position: r[6] || positions[String(r[4])] ||
        (!r[4] ? positionsByName[String(r[5] || '').trim().toLowerCase()] : null) || '',
      isKeeper: !!r[7],
    });
  });
 
  const rosterByKey = {};
  rosterRows.forEach(r => {
    const key = `${r[0]}|${r[1]}`;
    keysSeen.add(key);
    if (!rosterByKey[key]) rosterByKey[key] = [];
    rosterByKey[key].push({
      playerId: String(r[2]), name: r[3], status: r[4],
      points: (r[5] === '' || r[5] == null) ? null : Number(r[5]),
      projectedPoints: (r[6] === '' || r[6] == null) ? null : Number(r[6]),
      manualPosition: r[7] || '',
    });
  });
 
  // Most recent Drop/Add transaction per (season, manager, player) — used
  // to tag why a drafted player left, or how a non-drafted player arrived.
  const dropByKey = {};
  const addByKey = {};
  txRows.forEach(r => {
    const season = r[0], week = r[1], type = r[2], manager = r[3], action = r[4], playerId = String(r[5]);
    const k = `${season}|${manager}|${playerId}`;
    if (action === 'Drop') {
      if (!dropByKey[k] || week > dropByKey[k].week) dropByKey[k] = { type: type, week: week };
    } else if (action === 'Add') {
      if (!addByKey[k] || week > addByKey[k].week) addByKey[k] = { type: type, week: week };
    }
  });
 
  function exitTagFor_(type) { return type === 'trade' ? 'traded' : 'dropped'; }
  function acquireTagFor_(type) { return type === 'trade' ? 'trade' : 'waiver'; }
 
  // Player ID when one exists; otherwise a lowercased/trimmed name. Legacy
  // (pre-Sleeper) rows all share a blank Player ID, so matching on ID
  // directly would treat every legacy player as "the same player" — this
  // makes the drafted-vs-final comparison fall back to name matching
  // exactly where (and only where) that blank-ID collision would happen.
  function matchKey_(playerId, name) {
    return playerId ? playerId : String(name || '').trim().toLowerCase();
  }
 
  const results = [];
  keysSeen.forEach(key => {
    const [season, manager] = key.split('|');
    const drafted = (draftByKey[key] || []).slice().sort((a, b) => a.round - b.round);
    const finalRosterRaw = rosterByKey[key] || [];
    const draftedIds = new Set(drafted.map(d => matchKey_(d.playerId, d.name)));
    const finalIds = new Set(finalRosterRaw.map(f => matchKey_(f.playerId, f.name)));
 
    const draftedOut = drafted.map(d => {
      let exitTag = null, exitWeek = null;
      // Only guess "dropped" if this season actually has roster tracking
      // at all (i.e. Sleeper_Roster_Log has rows for it). Legacy
      // pre-Sleeper seasons have none — there, "not on the final roster"
      // just means we have no roster data, not that anyone was dropped.
      if (finalRosterRaw.length > 0 && !finalIds.has(matchKey_(d.playerId, d.name))) {
        const drop = dropByKey[`${season}|${manager}|${d.playerId}`];
        if (drop) { exitTag = exitTagFor_(drop.type); exitWeek = drop.week; }
        else { exitTag = 'dropped'; exitWeek = null; } // no matching transaction on record
      }
      return { round: d.round, position: d.position, name: d.name, isKeeper: d.isKeeper, exitTag: exitTag, exitWeek: exitWeek };
    });
 
    // Past seasons have Starter/Bench in Status; the live current season
    // only has Active/Reserve (IR), so there's no bench split to show yet
    // for the in-progress year — hasBenchSplit reflects that gap.
    const hasBenchSplit = finalRosterRaw.some(f => f.status === 'Bench' || f.status === 'Starter');
    const finalOut = finalRosterRaw.map(f => {
      let tag = 'kept', tagWeek = null;
      if (!draftedIds.has(matchKey_(f.playerId, f.name))) {
        const add = addByKey[`${season}|${manager}|${f.playerId}`];
        if (add) { tag = acquireTagFor_(add.type); tagWeek = add.week; }
        else { tag = 'waiver'; tagWeek = null; }
      }
      return {
        position: positions[f.playerId] ||
          (!f.playerId ? positionsByName[String(f.name || '').trim().toLowerCase()] : null) ||
          f.manualPosition || '',
        name: f.name,
        tag: tag,
        tagWeek: tagWeek,
        points: f.points != null ? Math.round(f.points * 100) / 100 : null,
        projectedPoints: f.projectedPoints != null ? Math.round(f.projectedPoints * 100) / 100 : null,
        isStarter: hasBenchSplit ? (f.status === 'Starter') : true,
      };
    }).sort((a, b) => {
      if (a.isStarter !== b.isStarter) return a.isStarter ? -1 : 1;
      return yearReviewPositionSortIndex_(a.position) - yearReviewPositionSortIndex_(b.position);
    });
 
    results.push({ season: season, manager: manager, drafted: draftedOut, final: finalOut, hasBenchSplit: hasBenchSplit });
  });
 
  return results;
}
 
// Builds the per-manager Career Stats list for the Bios back face:
// League High/Low (from League_History_Detail's per-season Total row, via
// readHistoricalSeasons_), Sleeper High/Low, and FanDuel High/Low (both from
// their respective all-time score-records sheets, via readScoreRecords_).
// Any entry with no data yet (e.g. no FanDuel records logged) is simply
// omitted — the front end doesn't need placeholders.
function buildCareerStats_(manager, historicalSeasons, sleeperScoreRecords, fanDuelScoreRecords) {
  const stats = [];
 
  let leagueHigh = null, leagueLow = null;
  historicalSeasons.forEach(s => {
    const val = s.totals ? s.totals[manager] : undefined;
    if (val == null) return;
    if (!leagueHigh || val > leagueHigh.value) leagueHigh = { value: val, season: s.season };
    if (!leagueLow || val < leagueLow.value) leagueLow = { value: val, season: s.season };
  });
  if (leagueHigh) stats.push({ label: 'League High', value: leagueHigh.value, sub: leagueHigh.season });
  if (leagueLow) stats.push({ label: 'League Low', value: leagueLow.value, sub: leagueLow.season });
 
  function pushRecordPair(label, rec) {
    if (!rec) return;
    if (rec.highest && rec.highest.value != null && rec.highest.value !== '') {
      const sub = [rec.highest.season, rec.highest.week ? `Wk ${rec.highest.week}` : ''].filter(Boolean).join(' ');
      stats.push({ label: `${label} High`, value: rec.highest.value, sub: sub });
    }
    if (rec.lowest && rec.lowest.value != null && rec.lowest.value !== '') {
      const sub = [rec.lowest.season, rec.lowest.week ? `Wk ${rec.lowest.week}` : ''].filter(Boolean).join(' ');
      stats.push({ label: `${label} Low`, value: rec.lowest.value, sub: sub });
    }
  }
  pushRecordPair('Sleeper', sleeperScoreRecords[manager]);
  pushRecordPair('FanDuel', fanDuelScoreRecords[manager]);
 
  return stats;
}
 
// Groups every winning-waiver FAAB bid by season, then by manager, from
// Sleeper_Transactions_Log (populated by sleeper_history.gs). Used both
// for the live current-season grade and for grading any past season.
function readFaabSpendBySeason_(ss) {
  const sheet = ss.getSheetByName('Sleeper_Transactions_Log');
  if (!sheet || sheet.getLastRow() < 3) return {};
  const rows = sheet.getRange(3, 1, sheet.getLastRow() - 2, 8).getValues();
  const out = {}; // { season: { manager: total } }
  rows.forEach(r => {
    const bid = Number(r[7]) || 0;
    if (!bid) return;
    const season = String(r[0]), manager = r[3];
    if (!out[season]) out[season] = {};
    out[season][manager] = (out[season][manager] || 0) + bid;
  });
  return out;
}
 
// ============================================================
// SEASON GRADE — mostly performance, with a small management-skill
// modifier layered on top. Everything tunable lives in
// SEASON_GRADE_CONFIG; new factors (beyond FAAB) can be added to
// SEASON_GRADE_FACTORS later without touching the scoring logic itself.
// ============================================================
const SEASON_GRADE_CONFIG = {
  faabBudget: 100, // update if your league's default FAAB budget changes
  spentLotsThresholdPct: 0.5, // spent >= 50% of budget counts as "aggressive"
  spentLittleThresholdPct: 0.2, // spent <= 20% counts as "frugal"
  letterThresholds: [ // [minScore, letter] — checked top-down, first match wins
    [97, 'A+'], [93, 'A'], [90, 'A-'],
    [87, 'B+'], [83, 'B'], [80, 'B-'],
    [77, 'C+'], [73, 'C'], [70, 'C-'],
    [67, 'D+'], [63, 'D'], [60, 'D-'],
    [0, 'F'],
  ],
};
 
// Each factor takes the shared `ctx` and returns { delta, reason } if it
// applies, or null if it doesn't. To add a new factor later (transaction
// count, keeper decisions, etc.), just add another function here — it'll
// automatically fold into the modifier total and the reasons list below.
const SEASON_GRADE_FACTORS = [
  function faabAggressiveAndWon(ctx) {
    if (ctx.topHalf && ctx.faabPct >= SEASON_GRADE_CONFIG.spentLotsThresholdPct) {
      return { delta: 15, reason: 'Spent big on waivers and it paid off' };
    }
    return null;
  },
  function faabFrugalAndWon(ctx) {
    if (ctx.topHalf && ctx.faabPct <= SEASON_GRADE_CONFIG.spentLittleThresholdPct) {
      return { delta: 10, reason: 'Drafted well, barely touched waivers' };
    }
    return null;
  },
  function faabPassiveAndLost(ctx) {
    if (!ctx.topHalf && ctx.faabPct <= SEASON_GRADE_CONFIG.spentLittleThresholdPct) {
      return { delta: -10, reason: 'Passive on waivers while the team struggled' };
    }
    return null;
  },
  // Spent big but still finished bottom half: deliberately no factor fires
  // here — effort is acknowledged, not penalized.
];
 
function scoreToLetter_(score) {
  for (const [min, letter] of SEASON_GRADE_CONFIG.letterThresholds) {
    if (score >= min) return letter;
  }
  return 'F';
}
 
// Core formula, independent of season — takes a plain {manager: points}
// map for the field that season, plus that manager's FAAB spend, so it
// works identically whether the season is live or long finished.
function buildSeasonGradeGeneric_(managerName, totalsByManager, faabSpent) {
  const names = Object.keys(totalsByManager);
  const allPoints = names.map(n => totalsByManager[n]);
  const min = Math.min(...allPoints), max = Math.max(...allPoints);
  const myPoints = totalsByManager[managerName];
  const performanceScore = (max === min) ? 100 : ((myPoints - min) / (max - min)) * 100;
 
  const sortedDesc = [...names].sort((a, b) => totalsByManager[b] - totalsByManager[a]);
  const rank = sortedDesc.indexOf(managerName) + 1;
  const topHalf = rank <= Math.ceil(names.length / 2);
 
  const faabPct = SEASON_GRADE_CONFIG.faabBudget ? (faabSpent || 0) / SEASON_GRADE_CONFIG.faabBudget : 0;
 
  const ctx = { topHalf: topHalf, faabPct: faabPct, rank: rank };
  let modifier = 0;
  const reasons = [];
  SEASON_GRADE_FACTORS.forEach(factor => {
    const result = factor(ctx);
    if (result) { modifier += result.delta; reasons.push(result.reason); }
  });
 
  const finalScore = Math.max(0, Math.min(100, Math.round(performanceScore + modifier)));
  return { score: finalScore, letter: scoreToLetter_(finalScore), reasons: reasons };
}
 
// performanceScore (0-100) is each manager's totalStandingsPoints
// normalized against the field's min/max this season — the dominant
// driver of the grade. Thin wrapper around buildSeasonGradeGeneric_ for
// the live current-season managers array specifically.
function buildSeasonGrade_(manager, managers, faabByManager) {
  const totalsByManager = {};
  managers.forEach(m => { totalsByManager[m.name] = m.totalStandingsPoints; });
  return buildSeasonGradeGeneric_(manager.name, totalsByManager, faabByManager[manager.name] || 0);
}
 
// Combines App_Dashboard (totals/ranks), Standings (Sleeper Placing raw),
// and FanDuel_Data's season summary (the 4 real FanDuel metrics) into the
// single flat `managers` shape the app expects.
function readManagers_(ss) {
  const dash = ss.getSheetByName('App_Dashboard').getRange(2, 1, 4, 10).getValues();
  const standingsPlacing = ss.getSheetByName('Standings').getRange(2, 14, 4, 1).getValues(); // col N
  const standingsMvpBonus = ss.getSheetByName('Standings').getRange(2, 18, 4, 1).getValues(); // col R
  const fdSummary = ss.getSheetByName('FanDuel_Data').getRange(24, 1, 4, 5).getValues(); // A:E
 
  return dash.map((row, i) => ({
    name: row[0],
    totalStandingsPoints: row[1],
    sleeperPprSeasonPoints: row[3],
    sleeperFinalPlacement: standingsPlacing[i][0],
    pickemTotalCorrect: row[4],
    fdWins: fdSummary[i][4],
    fdTop5Total: fdSummary[i][2],
    fdTop10Total: fdSummary[i][3],
    fdSeasonTotal: fdSummary[i][1],
    playoffBracketScore: row[8],
    mvpBonus: standingsMvpBonus[i][0] || 0,
    overallLeagueRank: row[9],
  }));
}
 
// Reads this season's live W/L off Sleeper_PPR_Data (rows 3-6, updated
// weekly by sleeper_sync.gs) — the in-progress season isn't in League_History
// yet since that tab only gets a row once a season is fully wrapped up.
function readCurrentSeasonRecord_(ss) {
  const sheet = ss.getSheetByName('Sleeper_PPR_Data');
  if (!sheet) return {};
  const rows = sheet.getRange(3, 1, 4, 6).getValues(); // A:F, rows 3-6
  const out = {};
  rows.forEach(r => {
    if (!r[0]) return;
    out[r[0]] = { wins: Number(r[4]) || 0, losses: Number(r[5]) || 0 };
  });
  return out;
}
 
// All-time record shown on the bio front face: every completed season's
// W/L from the manually-kept League_History tab, plus whatever the current
// in-progress season shows on Sleeper_PPR_Data right now.
function buildAllTimeRecord_(manager, memberHistory, currentSeasonRecord) {
  let wins = 0, losses = 0;
  memberHistory.forEach(r => {
    if (r.manager !== manager) return;
    wins += Number(r.wins) || 0;
    losses += Number(r.losses) || 0;
  });
  const current = currentSeasonRecord[manager];
  if (current) { wins += current.wins; losses += current.losses; }
  return `${wins}-${losses}`;
}
 
function readStats_(ss) {
  const sheet = ss.getSheetByName('Stats');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  return rows.filter(r => r[0]).map(r => ({
    manager: r[0],
    favoriteTeam: r[1],
    cumulativeScore: r[2],
    leagueWins: r[3],
    leagueLosses: r[4],
    averagePlace: r[5],
    strength: r[6],
    weakness: r[7],
    punishmentsDone: r[8],
    punishmentIdeas: r[9],
  }));
}
 
// Column-key map matches Playoff_Picks / Playoff_Actual headers exactly.
// If you ever rename a playoff column header, update the matching key here too.
const PLAYOFF_KEY_MAP = {
  'AFC East': 'afcEast', 'AFC North': 'afcNorth', 'AFC South': 'afcSouth', 'AFC West': 'afcWest',
  'NFC East': 'nfcEast', 'NFC North': 'nfcNorth', 'NFC South': 'nfcSouth', 'NFC West': 'nfcWest',
  'AFC WC1': 'afcWc1', 'AFC WC2': 'afcWc2', 'AFC WC3': 'afcWc3',
  'NFC WC1': 'nfcWc1', 'NFC WC2': 'nfcWc2', 'NFC WC3': 'nfcWc3',
  'WC Game 1': 'wcGame1', 'WC Game 2': 'wcGame2', 'WC Game 3': 'wcGame3',
  'WC Game 4': 'wcGame4', 'WC Game 5': 'wcGame5', 'WC Game 6': 'wcGame6',
  'Divisional Game 1': 'divisionalGame1', 'Divisional Game 2': 'divisionalGame2',
  'Divisional Game 3': 'divisionalGame3', 'Divisional Game 4': 'divisionalGame4',
  'AFC Championship': 'afcChampionship', 'NFC Championship': 'nfcChampionship',
  'Super Bowl Winner': 'superBowlWinner',
};
 
// Maps each real pick's point-weight tier to the 5 playoff-screen group labels.
function groupForWeight_(weight) {
  if (weight === 2 || weight === 1) return 'Make the Playoffs'; // division winners (2.0) + wild-card qualifiers (1.0)
  if (weight === 1.25) return 'Wild Card Round';
  if (weight === 1.5) return 'Divisional Round';
  if (weight === 1.75) return 'Conference Championship';
  return 'Super Bowl'; // 2.0 on the Super Bowl Winner pick specifically
}
 
function readPlayoffCategories_(ss) {
  const sheet = ss.getSheetByName('Playoff_Actual');
  const headers = sheet.getRange(1, 2, 1, 27).getValues()[0]; // B:AB — the 27 real scored picks (MVP excluded)
  const weights = sheet.getRange(2, 2, 1, 27).getValues()[0];
  return headers.map((h, i) => ({
    key: PLAYOFF_KEY_MAP[h] || h,
    label: h,
    weight: weights[i] || 0,
    group: i === headers.length - 1 ? 'Super Bowl' : groupForWeight_(weights[i]),
  }));
}
 
function readPlayoffPicks_(ss) {
  const sheet = ss.getSheetByName('Playoff_Picks');
  const headers = sheet.getRange(1, 2, 1, 27).getValues()[0]; // B:AB
  const mvpCol = 29; // AC
  const rows = sheet.getRange(2, 1, 4, 29).getValues();
  return rows.filter(r => r[0]).map(r => {
    const picks = {};
    headers.forEach((h, i) => {
      const key = PLAYOFF_KEY_MAP[h] || h;
      if (r[i + 1]) picks[key] = r[i + 1];
    });
    return { manager: r[0], mvp: r[mvpCol - 1] || '', picks: picks };
  });
}
 
function readPlayoffActual_(ss) {
  const sheet = ss.getSheetByName('Playoff_Actual');
  const headers = sheet.getRange(1, 2, 1, 27).getValues()[0]; // B:AB
  const actualRow = sheet.getRange(3, 2, 1, 27).getValues()[0];
  const actual = {};
  headers.forEach((h, i) => {
    const key = PLAYOFF_KEY_MAP[h] || h;
    if (actualRow[i]) actual[key] = actualRow[i];
  });
  return actual;
}
 
function readActualMvp_(ss) {
  const sheet = ss.getSheetByName('Playoff_Actual');
  return sheet.getRange(3, 29).getValue() || ''; // AC3
}
 
function readHomeContent_(ss) {
  const sheet = ss.getSheetByName('Home_Content');
  // currentSummary (A2) doubles as "the current summary" all season —
  // relabeled and rewritten each period (preseason, post-draft, weekly),
  // with currentWeekLabel (A5) driving what the app's header shows.
  const currentSummary = sheet.getRange('A2').getValue() || '';
  const currentWeekLabel = sheet.getRange('A5').getValue() || '';
  const roastRows = sheet.getRange(9, 1, 4, 2).getValues();
  const weeklyRoasts = roastRows
    .filter(r => r[0] && r[1])
    .map(r => ({ manager: r[0], roast: r[1] }));
  return { currentSummary, currentWeekLabel, weeklyRoasts };
}
 
function readLeagueHistory_(ss) {
  const sheet = ss.getSheetByName('League_History_Summary');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return rows.filter(r => r[0]).map(r => ({
    season: r[0],
    champion: r[1],
    championScore: r[2],
    lastPlace: r[3],
    lastPlaceScore: r[4],
    punishment: r[5],
  }));
}
 
// ============================================================
// GitHub commit — creates or updates data.json via the Contents API
// ============================================================
function commitFileToGithub_(jsonString) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) throw new Error('GITHUB_TOKEN not set — add it in Project Settings > Script Properties.');
 
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE_PATH}`;
  const headers = { Authorization: `token ${token}`, Accept: 'application/vnd.github+json' };
 
  let sha = null;
  const getResp = UrlFetchApp.fetch(`${apiUrl}?ref=${GITHUB_BRANCH}`, { headers: headers, muteHttpExceptions: true });
  if (getResp.getResponseCode() === 200) {
    sha = JSON.parse(getResp.getContentText()).sha;
  }
 
  const body = {
    message: `Update data.json — ${new Date().toISOString()}`,
    content: Utilities.base64Encode(jsonString, Utilities.Charset.UTF_8),
    branch: GITHUB_BRANCH,
  };
  if (sha) body.sha = sha;
 
  const putResp = UrlFetchApp.fetch(apiUrl, {
    method: 'put', headers: headers, contentType: 'application/json',
    payload: JSON.stringify(body), muteHttpExceptions: true,
  });
 
  const code = putResp.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error(`GitHub publish failed (${code}): ${putResp.getContentText()}`);
  }
  Logger.log('Published data.json to GitHub successfully.');
}
 
// ============================================================
// Optional: schedule this on its own, OR (simpler) call publishToGithub()
// at the end of your existing syncPprData() in sleeper_sync.gs so one
// trigger does both jobs on the same hourly cadence.
// ============================================================
function installPublishTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'publishToGithub') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('publishToGithub').timeBased().everyHours(1).create();
}