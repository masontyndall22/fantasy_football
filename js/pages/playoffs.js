import { $, $$ } from "../dom.js";
import { fmt, escapeHtml } from "../format.js";
import { state, store, GROUP_ORDER } from "../state.js";

function conferenceOf_(label) {
  const m = label.match(/^(AFC|NFC)\b/);
  return m ? m[1] : null;
}

// Sorts AFC picks together, then NFC picks together, by game number within
// each — e.g. AFC WC Game 1, AFC WC Game 2, AFC WC Game 3, NFC WC Game 1...
// Anything without an AFC/NFC prefix in its label keeps its original order.
function conferenceThenNumberSort_(a, b) {
  const parse = c => {
    const m = c.label.match(/^(AFC|NFC)\b.*?(\d+)?$/);
    return { conf: m ? m[1] : "", num: m && m[2] ? Number(m[2]) : 0 };
  };
  const pa = parse(a), pb = parse(b);
  if (pa.conf !== pb.conf) return pa.conf.localeCompare(pb.conf); // "AFC" < "NFC"
  return pa.num - pb.num;
}

function pickIcon(state3) {
  if (state3 === "correct") return `<div class="pick-row__icon is-correct"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"></path></svg></div>`;
  if (state3 === "correct-division") return `<div class="pick-row__icon is-correct-division"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"></path></svg></div>`;
  if (state3 === "partial") return `<div class="pick-row__icon is-partial"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4 10-10"></path></svg></div>`;
  if (state3 === "wrong") return `<div class="pick-row__icon is-wrong"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></div>`;
  return `<div class="pick-row__icon is-pending"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 12h12"></path></svg></div>`;
}

export function renderPlayoffs(data) {
  const picks = data.playoffPicks || [];
  if (!state.playoffMgr && picks.length) state.playoffMgr = picks[0].manager;

  $("#playoffManagerTabs").innerHTML = picks.map(p =>
    `<button class="pillar-tab ${p.manager === state.playoffMgr ? "is-active" : ""}" data-mgr="${escapeHtml(p.manager)}">${escapeHtml(p.manager)}</button>`
  ).join("");
  $$(".pillar-tab", $("#playoffManagerTabs")).forEach(btn => {
    btn.addEventListener("click", () => {
      state.playoffMgr = btn.dataset.mgr;
      renderPlayoffs(store.data);
    });
  });

  const current = picks.find(p => p.manager === state.playoffMgr);
  const cats = data.playoffCategories || [];
  const actual = data.playoffActual || {};
  const hasPicks = !!(current && cats.length && current.picks && Object.keys(current.picks).length);

  if (!hasPicks) {
    $("#playoffContent").innerHTML = `<div class="empty-state"><div class="empty-state__title">No picks yet</div><div class="empty-state__body">Once picks are entered in the sheet, they'll show up here.</div></div>`;
    $("#playoffScoreLabel").innerHTML = "";
    return;
  }

  let score = 0;
  const mvpPick = current.mvp;
  const actualMvp = data.actualMvp;
  const mvpState = !mvpPick || !actualMvp ? "pending" : mvpPick === actualMvp ? "correct" : "wrong";

  const mvpHtml = `
    <div class="playoff-group-label">MVP Pick</div>
    <div class="playoff-card">
      <div class="pick-row">
        <div class="pick-row__label">NFL MVP</div>
        <div class="pick-row__right">
          <div class="pick-row__value">${escapeHtml(mvpPick || "—")}</div>
          ${pickIcon(mvpState)}
        </div>
      </div>
    </div>`;

  // Categories where the specific game/slot number doesn't matter — matching
  // is done against the whole conference's actual set instead of same-slot.
  // Conference Championship (1.75, already only one game per conference) and
  // Super Bowl (2.0, no conference pairing) stay exact-slot as-is.
  const SET_MATCH_WEIGHTS = [1, 1.25, 1.5]; // WC qualifiers, WC Round winners, Divisional winners
  const DIVISION_WINNER_WEIGHT = 2;
  const WILDCARD_TIER_WEIGHT = 1; // partial-credit value for "made the playoffs, wrong division"

  const groupsHtml = GROUP_ORDER.map(group => {
    const groupCats = cats.filter(c => c.group === group).sort(conferenceThenNumberSort_);

    const setCatsByConf = { AFC: [], NFC: [] };
    const fullFieldCatsByConf = { AFC: [], NFC: [] }; // every "make the playoffs" cat per conference, any weight
    groupCats.forEach(c => {
      const conf = conferenceOf_(c.label);
      if (conf) fullFieldCatsByConf[conf].push(c);
      if (SET_MATCH_WEIGHTS.includes(c.weight) && conf) setCatsByConf[conf].push(c);
    });
    const setActualByConf = {}, setCompleteByConf = {};
    const fullFieldActualByConf = {}, fullFieldCompleteByConf = {};
    ["AFC", "NFC"].forEach(conf => {
      const actuals = setCatsByConf[conf].map(c => actual[c.key]).filter(Boolean);
      setActualByConf[conf] = actuals;
      setCompleteByConf[conf] = setCatsByConf[conf].length > 0 && actuals.length === setCatsByConf[conf].length;

      const fullActuals = fullFieldCatsByConf[conf].map(c => actual[c.key]).filter(Boolean);
      fullFieldActualByConf[conf] = fullActuals;
      fullFieldCompleteByConf[conf] = fullFieldCatsByConf[conf].length > 0 && fullActuals.length === fullFieldCatsByConf[conf].length;
    });

    const rowsHtml = groupCats.map(c => {
      const pickVal = current.picks[c.key];
      const actualVal = actual[c.key];
      const conf = conferenceOf_(c.label);
      let rowState, pts = 0;

      if (SET_MATCH_WEIGHTS.includes(c.weight)) {
        const complete = conf && setCompleteByConf[conf];
        const actualSet = conf ? setActualByConf[conf] : [];
        if (!pickVal || !complete) rowState = "pending";
        else if (actualSet.includes(pickVal)) { rowState = "correct"; pts = c.weight; }
        else rowState = "wrong";
      } else if (c.weight === DIVISION_WINNER_WEIGHT && conf) {
        // Division winner: full credit for the exact division, partial
        // credit (wildcard-tier value) if the team still made the
        // playoffs some other way, zero if they missed the field entirely.
        const complete = fullFieldCompleteByConf[conf];
        if (!pickVal || (!complete && pickVal !== actualVal)) {
          rowState = "pending";
        } else if (pickVal === actualVal) {
          rowState = "correct-division"; pts = c.weight;
        } else if (fullFieldActualByConf[conf].includes(pickVal)) {
          rowState = "partial"; pts = WILDCARD_TIER_WEIGHT;
        } else {
          rowState = "wrong";
        }
      } else {
        rowState = !pickVal || !actualVal ? "pending" : pickVal === actualVal ? "correct" : "wrong";
        if (rowState === "correct") pts = c.weight;
      }

      score += pts || 0;
      const ptsBadge = rowState === "correct-division" ? `<span class="pick-row__pts-badge is-gold">+1</span>`
        : "";
      return `
        <div class="pick-row">
          <div class="pick-row__label">${escapeHtml(c.label)}</div>
          <div class="pick-row__right">
            <div class="pick-row__value">${escapeHtml(pickVal || "—")}</div>
            ${ptsBadge}
            ${pickIcon(rowState)}
          </div>
        </div>`;
    }).join("");
    return `<div class="playoff-group-label">${escapeHtml(group)}</div><div class="playoff-card">${rowsHtml}</div>`;
  }).join("");

  $("#playoffContent").innerHTML = mvpHtml + groupsHtml;
  $("#playoffScoreLabel").innerHTML = `<b>${fmt(score)}</b> pts so far`;
}
