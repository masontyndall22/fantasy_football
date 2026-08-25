(function () {
  "use strict";

  const DATA_URL = "data.json";
  let DATA = null;

  // ---- config: group preference for the last-place callout tone ----
  // one of: "neutral" | "dry" | "trash"
  const COPY_TONE = "neutral";
  const TONE = {
    neutral: { title: "On Dog Watch", body: n => n + " is currently in last place." },
    dry: { title: "Sweating it", body: n => n + " is keeping the basement warm right now." },
    trash: { title: "Choking already", body: n => n + " is getting cooked and everyone knows it." },
  };

  const PILLARS = [
    { key: "fanduel", label: "FanDuel", categories: [
      { key: "fdWins", label: "Wins", unit: "Wins", valueFn: m => m.fdWins },
      { key: "fdTop5Total", label: "Top 5", unit: "Pts", valueFn: m => m.fdTop5Total },
      { key: "fdTop10Total", label: "Top 10", unit: "Pts", valueFn: m => m.fdTop10Total },
      { key: "fdSeasonTotal", label: "Total", unit: "Pts", valueFn: m => m.fdSeasonTotal },
    ] },
    { key: "sleeper", label: "Sleeper", categories: [
      { key: "sleeperPts", label: "Points", unit: "Pts", valueFn: m => m.sleeperPprSeasonPoints },
      { key: "sleeperPlacement", label: "Final Placement", unit: "Place", valueFn: m => m.sleeperFinalPlacement, higherBetter: false },
    ] },
    { key: "pickem", label: "Pick'em", categories: [
      { key: "pickem", label: "Correct", unit: "Correct", valueFn: m => m.pickemTotalCorrect },
    ] },
    { key: "playoffs", label: "Playoff Pool", categories: [
      { key: "playoffs", label: "Score", unit: "Score", valueFn: m => m.playoffBracketScore },
    ] },
  ];
  const ALL_CATEGORIES = PILLARS.flatMap(p => p.categories.map(c => ({ ...c, pillar: p.label })));
  const GROUP_ORDER = ["Make the Playoffs", "Wild Card Round", "Divisional Round", "Conference Championship", "Super Bowl"];

  let state = {
    screen: "home",
    pillar: "fanduel",
    subCategory: "fdWins",
    playoffMgr: null,
    summaryOpen: true,
  };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function fmt(n) {
    if (n === undefined || n === null || n === "") return "—";
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return Number.isInteger(num) ? String(num) : num.toFixed(1);
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return "";
    return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- tie-aware 4/3/2/1 ranking, ties split the average of tied positions' points ----
  function rankCategory(managers, valueFn, higherBetter) {
    const better = higherBetter !== false;
    const withVal = managers.map(m => ({ name: m.name, value: valueFn(m) }));
    const sorted = [...withVal].sort((a, b) => (better ? b.value - a.value : a.value - b.value));
    const n = sorted.length;
    const out = [];
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && sorted[j + 1].value === sorted[i].value) j++;
      const positions = [];
      for (let k = i; k <= j; k++) positions.push(k);
      const avgPoints = positions.reduce((s, p) => s + (n - p), 0) / positions.length;
      for (let k = i; k <= j; k++) out.push({ name: sorted[k].name, value: sorted[k].value, rank: i + 1, points: avgPoints });
      i = j + 1;
    }
    return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }
  function pointsFor(managers, cat) {
    const rows = rankCategory(managers, cat.valueFn, cat.higherBetter);
    const map = {};
    rows.forEach(r => { map[r.name] = r.points; });
    return map;
  }

  // ---------------- fetch ----------------
  async function loadData(bustCache) {
    const url = bustCache ? `${DATA_URL}?t=${Date.now()}` : DATA_URL;
    const res = await fetch(url, { cache: bustCache ? "no-store" : "default" });
    if (!res.ok) throw new Error(`Failed to load data (${res.status})`);
    return res.json();
  }

  function setLastUpdated(iso, refreshing) {
    const el = $("#lastUpdated");
    if (refreshing) { el.textContent = "Updating…"; return; }
    if (!iso) { el.textContent = "Last updated: unknown"; return; }
    const d = new Date(iso);
    el.textContent = "Updated " + d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " at " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // ---------------- render: home ----------------
  function renderHome(data) {
    renderPreseasonSummary(data);

    const managers = data.managers;
    const ranked = [...managers].sort((a, b) => b.totalStandingsPoints - a.totalStandingsPoints);
    const minPts = Math.min(...managers.map(m => m.totalStandingsPoints));
    const maxPts = Math.max(...managers.map(m => m.totalStandingsPoints));
    const isTied = minPts === maxPts;
    const onNoticeList = managers.filter(m => m.totalStandingsPoints === minPts);
    const leader = ranked[0];

    $("#leaderCard").innerHTML = `
      <div class="leader-card__eyebrow">Leader</div>
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

    $("#homeStandingsList").innerHTML = standingsListHtml(ranked, maxPts);
    renderWeeklyUpdate(data);
  }

  function renderPreseasonSummary(data) {
    const slot = $("#preseasonSlot");
    if (!data.preseasonSummary) { slot.innerHTML = ""; return; }
    slot.innerHTML = `
      <div class="preseason-toggle" id="preseasonToggle">
        <span>Preseason Summary</span>
        <svg class="preseason-toggle__chevron ${state.summaryOpen ? "" : "is-collapsed"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
      </div>
      ${state.summaryOpen ? `<div class="preseason-body">${escapeHtml(data.preseasonSummary)}</div>` : ""}
    `;
    $("#preseasonToggle").addEventListener("click", () => {
      state.summaryOpen = !state.summaryOpen;
      renderPreseasonSummary(data);
    });
  }

  function renderWeeklyUpdate(data) {
    const label = $("#weeklyUpdateLabel");
    const list = $("#weeklyUpdateList");
    const roasts = data.weeklyRoasts || [];
    if (!roasts.length) { label.style.display = "none"; list.innerHTML = ""; return; }
    label.style.display = "";
    label.textContent = "Weekly Update" + (data.currentWeekLabel ? ` — ${data.currentWeekLabel}` : "");
    list.innerHTML = roasts.map(w => `
      <div class="weekly-update-card">
        <div class="weekly-update-card__avatar">${escapeHtml((w.manager || "?").slice(0, 1).toUpperCase())}</div>
        <div>
          <div class="weekly-update-card__name">${escapeHtml(w.manager)}</div>
          <div class="weekly-update-card__roast">${escapeHtml(w.roast)}</div>
        </div>
      </div>
    `).join("");
  }

  function standingsListHtml(ranked, maxPts) {
    return ranked.map((m, i) => {
      const isFirst = i === 0;
      const isLast = i === ranked.length - 1 && ranked.length > 1;
      const isLeaderTie = !isFirst && m.totalStandingsPoints === maxPts;
      const rowClass = isFirst ? "is-first" : isLeaderTie ? "is-leader-tie" : "";
      const badgeClass = isFirst ? "is-first" : isLeaderTie ? "is-leader-tie" : "";
      const badge = isLast ? "🌭" : String(i + 1);
      return `
        <div class="standings-row ${rowClass}">
          <div class="rank-badge ${badgeClass} ${isLast ? "is-hotdog" : ""}">${badge}</div>
          <div class="standings-row__name">${escapeHtml(m.name)}</div>
          <div class="standings-row__pts">${fmt(m.totalStandingsPoints)}</div>
        </div>`;
    }).join("");
  }

  // ---------------- render: bios ----------------
  const TROPHY_SVG = '<svg viewBox="0 0 24 24"><path d="M6 3h12v2h2a1 1 0 0 1 1 1v1a4 4 0 0 1-4 4 5.5 5.5 0 0 1-3.09 2.44c.2 1.13.83 1.83 2.09 2.06.5.09.9.5.9 1.01v.99a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-.99c0-.51.4-.92.9-1.01 1.26-.23 1.89-.93 2.09-2.06A5.5 5.5 0 0 1 8.9 11H8a4 4 0 0 1-4-4V6a1 1 0 0 1 1-1h2V3Zm0 4V7H5a2 2 0 0 0 2 2V7Zm12 0a2 2 0 0 0 2-2h-2v2ZM9 19h6v1a1 1 0 0 1-1 1H10a1 1 0 0 1-1-1v-1Z"></path></svg>';

  function renderBios(data) {
    const reigningChampion = data.leagueHistory && data.leagueHistory.length ? data.leagueHistory[0].champion : null;

    $("#bioList").innerHTML = (data.bios || []).map(b => {
      const isChampion = !!reigningChampion && b.manager === reigningChampion;
      const wins = Number(b.leagueWins) || 0;
      return `
      <div class="bio-card ${isChampion ? "is-champion" : ""}">
        ${isChampion ? `<div class="bio-card__champion-badge">${TROPHY_SVG}Current Champion</div>` : ""}
        <div class="bio-card__head">
          <div class="bio-card__avatar">${escapeHtml((b.manager || "?").slice(0, 1).toUpperCase())}</div>
          <div style="flex:1">
            <div class="bio-card__name">${escapeHtml(b.manager)}</div>
            <div class="bio-card__team">${escapeHtml(b.favoriteTeam || "—")}</div>
          </div>
          ${wins > 0 ? `<div class="bio-card__trophies">${TROPHY_SVG.repeat(wins)}</div>` : ""}
        </div>
        <div class="bio-card__stats">
          <div><div class="bio-card__stat-num">${fmt(b.leagueWins)}</div><div class="bio-card__stat-label">Wins</div></div>
          <div><div class="bio-card__stat-num">${fmt(b.leagueLosses)}</div><div class="bio-card__stat-label">Losses</div></div>
          <div><div class="bio-card__stat-num">${fmt(b.averagePlace)}</div><div class="bio-card__stat-label">Avg Place</div></div>
          <div><div class="bio-card__stat-num is-lifetime">${fmt(b.cumulativeScore)}</div><div class="bio-card__stat-label">Lifetime</div></div>
        </div>
        <div class="bio-card__row"><span class="label">Strength — </span><span class="value">${escapeHtml(b.strength || "—")}</span></div>
        <div class="bio-card__row"><span class="label">Weakness — </span><span class="value">${escapeHtml(b.weakness || "—")}</span></div>
        <div class="bio-card__row"><span class="label">Punishments served — </span><span class="value">${escapeHtml(b.punishmentsDone || "—")}</span></div>
      </div>
    `;
    }).join("") || `<div class="empty-state"><div class="empty-state__title">No bios yet</div><div class="empty-state__body">Add manager info to the Stats tab and it'll show up here.</div></div>`;
  }

  // ---------------- render: scoring ----------------
  function renderScoring(data) {
    const managers = data.managers;
    const ranked = [...managers].sort((a, b) => b.totalStandingsPoints - a.totalStandingsPoints);
    const maxPts = Math.max(...managers.map(m => m.totalStandingsPoints));
    $("#scoringStandingsList").innerHTML = standingsListHtml(ranked, maxPts);

    renderPillarTabs();
    renderSubTabs();
    renderCategoryTable(managers);
    renderBreakdownTable(managers);
  }

  function renderPillarTabs() {
    $("#pillarTabs").innerHTML = PILLARS.map(p =>
      `<button class="pillar-tab ${p.key === state.pillar ? "is-active" : ""}" data-pillar="${p.key}">${p.label}</button>`
    ).join("");
    $$(".pillar-tab", $("#pillarTabs")).forEach(btn => {
      btn.addEventListener("click", () => {
        state.pillar = btn.dataset.pillar;
        state.subCategory = PILLARS.find(p => p.key === state.pillar).categories[0].key;
        renderPillarTabs();
        renderSubTabs();
        renderCategoryTable(DATA.managers);
      });
    });
  }

  function renderSubTabs() {
    const activePillar = PILLARS.find(p => p.key === state.pillar);
    const slot = $("#subTabsSlot");
    if (activePillar.categories.length <= 1) { slot.innerHTML = ""; return; }
    slot.innerHTML = `<div class="sub-tabs">${activePillar.categories.map(c =>
      `<button class="sub-tab ${c.key === state.subCategory ? "is-active" : ""}" data-sub="${c.key}">${c.label}</button>`
    ).join("")}</div>`;
    $$(".sub-tab", slot).forEach(btn => {
      btn.addEventListener("click", () => {
        state.subCategory = btn.dataset.sub;
        renderSubTabs();
        renderCategoryTable(DATA.managers);
      });
    });
  }

  function renderCategoryTable(managers) {
    const activePillar = PILLARS.find(p => p.key === state.pillar);
    const activeDef = activePillar.categories.find(c => c.key === state.subCategory) || activePillar.categories[0];
    const rows = rankCategory(managers, activeDef.valueFn, activeDef.higherBetter);
    $("#categoryTable").innerHTML = `
      <thead><tr><th>Manager</th><th>${escapeHtml(activeDef.unit)}</th><th>Pts</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${escapeHtml(r.name)}</td><td>${fmt(r.value)}</td><td class="pts">${fmt(r.points)}</td></tr>`).join("")}</tbody>
    `;
  }

  function renderBreakdownTable(managers) {
    const names = managers.map(m => m.name);
    const rowsHtml = ALL_CATEGORIES.map(cat => {
      const pts = pointsFor(managers, cat);
      return `<tr><td>${escapeHtml(cat.label)}</td>${names.map(n => `<td>${fmt(pts[n])}</td>`).join("")}</tr>`;
    }).join("");
    const totals = names.map(n => ALL_CATEGORIES.reduce((s, cat) => s + pointsFor(managers, cat)[n], 0));
    $("#breakdownTable").innerHTML = `
      <thead><tr><th>Category</th>${names.map(n => `<th>${escapeHtml(n)}</th>`).join("")}</tr></thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row"><td>Total</td>${totals.map(t => `<td>${fmt(t)}</td>`).join("")}</tr>
      </tbody>
    `;
  }

  // ---------------- render: playoffs ----------------
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

  function renderPlayoffs(data) {
    const picks = data.playoffPicks || [];
    if (!state.playoffMgr && picks.length) state.playoffMgr = picks[0].manager;

    $("#playoffManagerTabs").innerHTML = picks.map(p =>
      `<button class="pillar-tab ${p.manager === state.playoffMgr ? "is-active" : ""}" data-mgr="${escapeHtml(p.manager)}">${escapeHtml(p.manager)}</button>`
    ).join("");
    $$(".pillar-tab", $("#playoffManagerTabs")).forEach(btn => {
      btn.addEventListener("click", () => {
        state.playoffMgr = btn.dataset.mgr;
        renderPlayoffs(DATA);
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
        const ptsBadge = rowState === "partial" ? `<span class="pick-row__pts-badge">+${fmt(pts)}</span>` : "";
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

  // ---------------- render: history ----------------
  function renderHistory(data) {
    const seasons = data.leagueHistory || [];
    $("#historyTimeline").innerHTML = seasons.map(s => `
      <div class="timeline-item">
        <div class="timeline-item__season">${escapeHtml(s.season)}</div>
        <div class="timeline-item__champ">${escapeHtml(s.champion)} <span class="score">— ${fmt(s.championScore)} pts</span></div>
        <div class="timeline-item__meta">Last place: ${escapeHtml(s.lastPlace)} — ${fmt(s.lastPlaceScore)} pts</div>
        <div class="timeline-item__punishment">${escapeHtml(s.punishment)}</div>
      </div>
    `).join("") || `<div class="empty-state"><div class="empty-state__title">No history yet</div><div class="empty-state__body">Past seasons will appear here once they're logged.</div></div>`;
  }

  function renderAll(data) {
    DATA = data;
    setLastUpdated(data.generatedAt, false);
    renderHome(data);
    renderBios(data);
    renderScoring(data);
    renderPlayoffs(data);
    renderHistory(data);
  }

  // ---------------- navigation ----------------
  function initNav() {
    $$(".nav-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        state.screen = btn.dataset.screen;
        $$(".nav-btn").forEach(b => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        $$(".screen").forEach(s => s.classList.remove("is-active"));
        $(`#screen-${btn.dataset.screen}`).classList.add("is-active");
        window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
      });
    });
  }

  // ---------------- refresh ----------------
  function initRefresh() {
    $("#refreshBtn").addEventListener("click", async () => {
      const btn = $("#refreshBtn");
      if (btn.classList.contains("is-spinning")) return;
      btn.classList.add("is-spinning");
      setLastUpdated(null, true);
      try {
        const data = await loadData(true);
        renderAll(data);
      } catch (e) {
        console.error(e);
      } finally {
        setTimeout(() => btn.classList.remove("is-spinning"), 700);
      }
    });
  }

  // ---------------- boot ----------------
  async function boot() {
    initNav();
    initRefresh();
    try {
      const data = await loadData(true);
      renderAll(data);
    } catch (e) {
      console.error(e);
      $("#lastUpdated").textContent = "Couldn't load data — check your connection and try refreshing.";
    }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
