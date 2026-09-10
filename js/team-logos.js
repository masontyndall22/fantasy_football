// Maps the team nicknames used in Playoff_Picks/Playoff_Actual (e.g.
// "Cowboys", "49ers") to ESPN's team abbreviation, which is all their public
// logo CDN needs. These are transparent-background PNGs — no hosting or
// cropping required on our end, and no change to sw.js since fetches for
// these just go through the normal network-first handler like any other
// external asset.
const TEAM_ABBR = {
  Cardinals: "ari",
  Falcons: "atl",
  Ravens: "bal",
  Bills: "buf",
  Panthers: "car",
  Bears: "chi",
  Bengals: "cin",
  Browns: "cle",
  Cowboys: "dal",
  Broncos: "den",
  Lions: "det",
  Packers: "gb",
  Texans: "hou",
  Colts: "ind",
  Jaguars: "jax",
  Chiefs: "kc",
  Raiders: "lv",
  Chargers: "lac",
  Rams: "lar",
  Dolphins: "mia",
  Vikings: "min",
  Patriots: "ne",
  Saints: "no",
  Giants: "nyg",
  Jets: "nyj",
  Eagles: "phi",
  Steelers: "pit",
  "49ers": "sf",
  Seahawks: "sea",
  Buccaneers: "tb",
  Titans: "ten",
  Commanders: "wsh",
  Washington: "wsh",
};

const LOGO_BASE = "https://a.espncdn.com/i/teamlogos/nfl/500";

// Returns an <img> tag for the given team nickname, or "" if we don't
// recognize it (e.g. a pick hasn't been made yet, or a typo in the sheet) —
// callers can drop this straight into a template string. onerror hides a
// broken image instead of showing the little broken-icon placeholder, in
// case ESPN ever renames/moves an asset.
export function teamLogoImg(teamName) {
  const abbr = TEAM_ABBR[teamName];
  if (!abbr) return "";
  return `<img class="pick-row__logo" src="${LOGO_BASE}/${abbr}.png" alt="" onerror="this.style.display='none'">`;
}