/**
 * SLEEPER API SYNC SCRIPT — PPR league only
 *
 * NOTE: Sleeper's public API only covers standard draft-based fantasy leagues
 * (rosters, matchups, drafts, brackets — all keyed by league_id). Pick'em &
 * Survivor Pools are a separate Sleeper product with no public API and no
 * league_id you can point this script at. Sleeper_Pickems_Data in the workbook
 * is manual entry by design — type each week'ss correct-picks count in by hand;
 * everything below that (season totals, weekly wins, rank) is still automatic.
 *
 * Paste into: Extensions > Apps Script
 */

// ==== CONFIG ====
const SLEEPER_PPR_LEAGUE_ID = '1385345660395483136';
const SLEEPER_PPR_SHEET_NAME = 'Sleeper_PPR_Data';
const SLEEPER_PPR_WEEK_CELL = 'B1'; // week number lives in Sleeper_PPR_Data!B1
const HEAD2HEAD_SHEET_NAME = 'Sleeper_Head2Head_Log';
const HEAD2HEAD_LOOKBACK_SEASONS = 2; // how many PAST seasons to pull in the one-time backfill
const SCORE_RECORDS_SHEET_NAME = 'Sleeper_Score_Records';

// Map each person's Sleeper USERNAME (their account handle, not their team name —
// team names get renamed for fun all the time, usernames essentially never do)
// to the manager name used everywhere else in this workbook. Get each username from
// their Sleeper profile (Settings > tap their name at the top) or by asking them —
// it's NOT the same as the display "team name" shown on the league standings page.
const SLEEPER_USERNAME_TO_MANAGER = {
  'bmelto14': 'Ben',
  'cgarde11': 'Caleb',
  'kylerobi3': 'Kyle',
  'masontyndall': 'Mason',
};

// Row each manager is locked to on Sleeper_PPR_Data, so the sheet always lines up
// with Standings / FanDuel_Data / Playoff_Picks regardless of what order Sleeper's
// API happens to return teams in.
const SLEEPER_MANAGER_ROW = { 'Ben': 3, 'Caleb': 4, 'Kyle': 5, 'Mason': 6 };

// ============================================================
function syncPprData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SLEEPER_PPR_SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SLEEPER_PPR_SHEET_NAME}" not found`);

  const week = sheet.getRange(SLEEPER_PPR_WEEK_CELL).getValue() || getCurrentNflWeek_();

  const league = fetchJson_(`https://api.sleeper.app/v1/league/${SLEEPER_PPR_LEAGUE_ID}`);
  const users = fetchJson_(`https://api.sleeper.app/v1/league/${SLEEPER_PPR_LEAGUE_ID}/users`);
  const rosters = fetchJson_(`https://api.sleeper.app/v1/league/${SLEEPER_PPR_LEAGUE_ID}/rosters`);
  const matchups = fetchJson_(`https://api.sleeper.app/v1/league/${SLEEPER_PPR_LEAGUE_ID}/matchups/${week}`);

  // roster_id -> manager name, resolved through Sleeper USERNAME (not team_name/display_name)
  const rosterIdToManager = {};
  const unmatched = [];
  Logger.log(rosters.length)
  rosters.forEach(r => {
    const userDetails = fetchJson_(`https://api.sleeper.app/v1/user/${r.owner_id}`)
    const manager = userDetails ? SLEEPER_USERNAME_TO_MANAGER[userDetails.username] : undefined;
    Logger.log(manager)
    if (manager) {
      rosterIdToManager[r.roster_id] = manager;
    } else {
      unmatched.push(userDetails ? userDetails.username : `roster ${r.roster_id}`);
    }
  });
  if (unmatched.length > 0) {
    Logger.log('WARNING: no manager mapping found for Sleeper username(s): ' + unmatched.join(', ') +
      '. Check SLEEPER_USERNAME_TO_MANAGER at the top of the script — these rows were skipped.');
  }

  const seasonTotals = {};
  rosters.forEach(r => {
    seasonTotals[r.roster_id] = {
      wins: r.settings.wins,
      losses: r.settings.losses,
      fpts: r.settings.fpts + (r.settings.fpts_decimal || 0) / 100,
      fpts_against: r.settings.fpts_against + (r.settings.fpts_against_decimal || 0) / 100
    };
  });

  // Header row (row 2) — left as-is; only the 4 fixed manager rows (3-6) get overwritten
  sheet.getRange(2, 1, 1, 8).setValues([[
    'Manager', 'Matchup ID', 'Week Points', 'Opponent Points',
    'Season Wins', 'Season Losses', 'Season Points For', 'Season Points Against'
  ]]);

  matchups.forEach(m => {
    const manager = rosterIdToManager[m.roster_id];
    if (!manager) return; // unmatched roster — skipped, see log
    const targetRow = SLEEPER_MANAGER_ROW[manager];
    if (!targetRow) return;

    const opponent = matchups.find(o => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id);
    const totals = seasonTotals[m.roster_id] || {};

    sheet.getRange(targetRow, 1, 1, 8).setValues([[
      manager,
      m.matchup_id,
      m.points || 0,
      opponent ? (opponent.points || 0) : 0,
      totals.wins || 0,
      totals.losses || 0,
      totals.fpts || 0,
      totals.fpts_against || 0
    ]]);
  });

  sheet.getRange('J1').setValue('Last synced:');
  sheet.getRange('K1').setValue(new Date());

  logHeadToHeadMatchups_(ss, league.season, week, matchups, rosterIdToManager);
  updateScoreRecords_(ss, league.season, week, matchups, rosterIdToManager);
}

function getOrCreateScoreRecordsSheet_(ss) {
  let sheet = ss.getSheetByName(SCORE_RECORDS_SHEET_NAME);
  if (sheet) return sheet;
  sheet = ss.insertSheet(SCORE_RECORDS_SHEET_NAME);
  sheet.getRange(1, 1).setValue(
    'ALL-TIME SLEEPER SCORE RECORDS — highest and lowest single-week score ever, per manager. ' +
    'Seeded by backfillHeadToHead() (which already sees every historical week while walking past ' +
    'seasons), then kept current by a simple beat-the-record check each regular sync — no need to ' +
    'log every single week.'
  );
  sheet.getRange(2, 1, 1, 7).setValues([[
    'Manager', 'Highest Score', 'Highest Season', 'Highest Week', 'Lowest Score', 'Lowest Season', 'Lowest Week'
  ]]);
  Object.keys(SLEEPER_MANAGER_ROW).forEach(manager => {
    sheet.getRange(SLEEPER_MANAGER_ROW[manager], 1).setValue(manager);
  });
  return sheet;
}

// Called from syncPprData() every regular sync. Just compares this week's
// real score against whatever's already stored and replaces it if it's a
// new high or new low — no full weekly history kept, just the 2 extremes.
function updateScoreRecords_(ss, season, week, matchups, rosterIdToManager) {
  const sheet = getOrCreateScoreRecordsSheet_(ss);

  matchups.forEach(m => {
    const manager = rosterIdToManager[m.roster_id];
    if (!manager || !SLEEPER_MANAGER_ROW[manager]) return;
    const score = m.points || 0;
    if (!score) return; // week hasn't happened yet — nothing to compare

    const row = SLEEPER_MANAGER_ROW[manager];
    const existingHigh = sheet.getRange(row, 2).getValue();
    const existingLow = sheet.getRange(row, 5).getValue();

    if (existingHigh === '' || existingHigh == null || score > existingHigh) {
      sheet.getRange(row, 2, 1, 3).setValues([[score, season, week]]);
    }
    if (existingLow === '' || existingLow == null || score < existingLow) {
      sheet.getRange(row, 5, 1, 3).setValues([[score, season, week]]);
    }
  });
}

// Appends (or updates, if re-run mid-week) this week's real head-to-head
// results into Sleeper_Head2Head_Log. Each Sleeper "matchup_id" pairs exactly
// 2 rosters together — this turns that into one readable row per matchup.
function logHeadToHeadMatchups_(ss, season, week, matchups, rosterIdToManager) {
  let sheet = ss.getSheetByName(HEAD2HEAD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HEAD2HEAD_SHEET_NAME);
    writeHead2HeadHeaders_(sheet);
  }

  // Remove any existing rows for this exact season+week first, so re-running
  // mid-week (scores still updating) replaces rather than duplicates them.
  const existing = sheet.getDataRange().getValues();
  for (let r = existing.length - 1; r >= 2; r--) {
    if (String(existing[r][0]) === String(season) && Number(existing[r][1]) === Number(week)) {
      sheet.deleteRow(r + 1);
    }
  }

  const byMatchupId = {};
  matchups.forEach(m => {
    if (!byMatchupId[m.matchup_id]) byMatchupId[m.matchup_id] = [];
    byMatchupId[m.matchup_id].push(m);
  });

  const rows = [];
  Object.values(byMatchupId).forEach(pair => {
    if (pair.length !== 2) return; // bye week or malformed pairing — skip
    const [m1, m2] = pair;
    const mgr1 = rosterIdToManager[m1.roster_id];
    const mgr2 = rosterIdToManager[m2.roster_id];
    if (!mgr1 || !mgr2) return;
    const score1 = m1.points || 0, score2 = m2.points || 0;
    const winner = score1 === score2 ? 'Tie' : (score1 > score2 ? mgr1 : mgr2);
    rows.push([season, week, mgr1, score1, mgr2, score2, winner]);
  });

  if (rows.length) {
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, 7).setValues(rows);
  }
}

/**
 * ONE-TIME (or re-run anytime): rebuilds the ENTIRE head-to-head log from
 * scratch — this season's matchups so far, plus up to HEAD2HEAD_LOOKBACK_SEASONS
 * previous seasons, walked backward through Sleeper's previous_league_id chain.
 *
 * Only works as far back as your Sleeper league was actually renewed year to
 * year (not recreated fresh) — if there's no previous_league_id, the chain
 * just stops there and you get however many seasons ARE linked. Safe to
 * re-run; it clears and rebuilds rather than appending duplicates.
 */
function backfillHeadToHead() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(HEAD2HEAD_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(HEAD2HEAD_SHEET_NAME);
    writeHead2HeadHeaders_(sheet);
  }

  const seasonChain = [];
  let leagueId = SLEEPER_PPR_LEAGUE_ID;
  for (let i = 0; i <= HEAD2HEAD_LOOKBACK_SEASONS && leagueId; i++) {
    const league = fetchJson_(`https://api.sleeper.app/v1/league/${leagueId}`);
    seasonChain.push({ leagueId: leagueId, season: league.season });
    leagueId = league.previous_league_id || null;
  }
  Logger.log(`Found ${seasonChain.length} linked season(s): ` +
    seasonChain.map(s => s.season).join(', '));

  // Only clear out rows for the seasons Sleeper is actually going to
  // re-provide below. Rows for any other season (e.g. pre-Sleeper league
  // history you've entered by hand in this same tab) are left completely
  // untouched, so this is safe to re-run without wiping manual entries.
  const sleeperSeasons = new Set(seasonChain.map(s => String(s.season)));
  const existingRows = sheet.getLastRow() > 2
    ? sheet.getRange(3, 1, sheet.getLastRow() - 2, 7).getValues()
    : [];
  for (let r = existingRows.length - 1; r >= 0; r--) {
    if (sleeperSeasons.has(String(existingRows[r][0]))) sheet.deleteRow(r + 3);
  }

  // Tracks each manager's best/worst single-week score seen anywhere across
  // every season in the chain — since we're already reading every historical
  // week's real scores here, this gets us TRUE all-time records for free,
  // rather than only being able to track "from now on."
  const scoreRecords = {};
  function trackScore(manager, value, season, week) {
    if (!value) return; // 0 = didn't play that week, not a real record
    if (!scoreRecords[manager]) {
      scoreRecords[manager] = { highest: { value, season, week }, lowest: { value, season, week } };
      return;
    }
    if (value > scoreRecords[manager].highest.value) scoreRecords[manager].highest = { value, season, week };
    if (value < scoreRecords[manager].lowest.value) scoreRecords[manager].lowest = { value, season, week };
  }

  // Appends after whatever's already in the sheet (manual rows included)
  // rather than assuming the sheet starts empty at row 3.
  let outRow = sheet.getLastRow() + 1;
  seasonChain.forEach(({ leagueId, season }) => {
    const rosters = fetchJson_(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
    const rosterIdToManager = {};
    rosters.forEach(r => {
      const userDetails = fetchJson_(`https://api.sleeper.app/v1/user/${r.owner_id}`)
      const manager = userDetails ? SLEEPER_USERNAME_TO_MANAGER[userDetails.username] : undefined;
      Logger.log(manager)
      if (manager) rosterIdToManager[r.roster_id] = manager;
    });

    for (let week = 1; week <= 18; week++) {
      let matchups;
      try {
        matchups = fetchJson_(`https://api.sleeper.app/v1/league/${leagueId}/matchups/${week}`);
      } catch (e) {
        continue; // that week doesn't exist for this league — skip it
      }
      if (!matchups || !matchups.length) continue;

      // Track every individual score toward the all-time high/low, completely
      // independent of head-to-head pairing — a bye week or a malformed
      // matchup_id grouping should never cause a real score to be skipped.
      matchups.forEach(m => {
        const manager = rosterIdToManager[m.roster_id];
        if (!manager) return;
        trackScore(manager, m.points || 0, season, week);
      });

      const byMatchupId = {};
      matchups.forEach(m => {
        if (!byMatchupId[m.matchup_id]) byMatchupId[m.matchup_id] = [];
        byMatchupId[m.matchup_id].push(m);
      });

      Object.values(byMatchupId).forEach(pair => {
        if (pair.length !== 2) return;
        const [m1, m2] = pair;
        const mgr1 = rosterIdToManager[m1.roster_id];
        const mgr2 = rosterIdToManager[m2.roster_id];
        if (!mgr1 || !mgr2) return;
        const score1 = m1.points || 0, score2 = m2.points || 0;
        if (score1 === 0 && score2 === 0) return; // week hasn't happened yet
        const winner = score1 === score2 ? 'Tie' : (score1 > score2 ? mgr1 : mgr2);
        sheet.getRange(outRow, 1, 1, 7).setValues([[season, week, mgr1, score1, mgr2, score2, winner]]);
        outRow++;
      });
    }
  });

  Logger.log(`Head-to-head backfill complete: ${outRow - sheet.getLastRow() - 1 + (outRow - 3)} rows written for Sleeper seasons.`);

  const scoreSheet = getOrCreateScoreRecordsSheet_(ss);
  Object.entries(scoreRecords).forEach(([manager, rec]) => {
    const row = SLEEPER_MANAGER_ROW[manager];
    if (!row) return;
    scoreSheet.getRange(row, 1, 1, 7).setValues([[
      manager, rec.highest.value, rec.highest.season, rec.highest.week,
      rec.lowest.value, rec.lowest.season, rec.lowest.week,
    ]]);
  });
  Logger.log('Score records seeded from backfilled history: ' + JSON.stringify(scoreRecords));
}

function writeHead2HeadHeaders_(sheet) {
  sheet.getRange(1, 1).setValue(
    'REAL HEAD-TO-HEAD MATCHUPS — auto-filled by the Apps Script. Run backfillHeadToHead() ' +
    'once to pull in past seasons; ongoing weeks get appended automatically by the regular sync.'
  );
  sheet.getRange(2, 1, 1, 7).setValues([[
    'Season', 'Week', 'Manager A', 'Score A', 'Manager B', 'Score B', 'Winner'
  ]]);
}

function fetchJson_(url) {
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error(`Sleeper API error ${resp.getResponseCode()} for ${url}`);
  }
  return JSON.parse(resp.getContentText());
}

function getCurrentNflWeek_() {
  const seasonStart = new Date(new Date().getFullYear(), 8, 5); // ~Sept 5
  const now = new Date();
  const diffWeeks = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, Math.min(18, diffWeeks));
}

/**
 * ONE-TIME SETUP: run this once (select installTrigger in the editor toolbar, click Run)
 * to schedule syncPprData automatically.
 */
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncPprData') ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('syncPprData')
    .timeBased()
    .everyHours(1)
    .create();
}