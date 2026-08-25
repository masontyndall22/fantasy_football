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
const GITHUB_OWNER = '--';
const GITHUB_REPO = '--';
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
  return {
    generatedAt: new Date().toISOString(),
    managers: readManagers_(ss),
    bios: readStats_(ss),
    playoffCategories: readPlayoffCategories_(ss),
    playoffPicks: readPlayoffPicks_(ss),
    playoffActual: readPlayoffActual_(ss),
    actualMvp: readActualMvp_(ss),
    leagueHistory: readLeagueHistory_(ss),
    preseasonSummary: homeContent.preseasonSummary,
    currentWeekLabel: homeContent.currentWeekLabel,
    weeklyRoasts: homeContent.weeklyRoasts,
  };
}

// Combines App_Dashboard (totals/ranks), Standings (Sleeper Placing raw),
// and FanDuel_Data's season summary (the 4 real FanDuel metrics) into the
// single flat `managers` shape the app expects.
function readManagers_(ss) {
  const dash = ss.getSheetByName('App_Dashboard').getRange(2, 1, 4, 10).getValues();
  const standingsPlacing = ss.getSheetByName('Standings').getRange(2, 14, 4, 1).getValues(); // col N
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
    overallLeagueRank: row[9],
  }));
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
  'AFC WC Game 1': 'afcWcGame1', 'AFC WC Game 2': 'afcWcGame2', 'AFC WC Game 3': 'afcWcGame3',
  'NFC WC Game 1': 'nfcWcGame4', 'NFC WC Game 2': 'nfcWcGame2', 'NFC WC Game 3': 'nfcWcGame3',
  'AFC Divisional Game 1': 'afcDivisionalGame1', 'AFC Divisional Game 2': 'afcDivisionalGame2',
  'NFC Divisional Game 1': 'nfcDivisionalGame1', 'NFC Divisional Game 2': 'nfcDivisionalGame4',
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
  const preseasonSummary = sheet.getRange('A2').getValue() || '';
  const currentWeekLabel = sheet.getRange('A5').getValue() || '';
  const roastRows = sheet.getRange(9, 1, 4, 2).getValues();
  const weeklyRoasts = roastRows
    .filter(r => r[0] && r[1])
    .map(r => ({ manager: r[0], roast: r[1] }));
  return { preseasonSummary, currentWeekLabel, weeklyRoasts };
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
