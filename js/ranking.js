// ---- tie-aware 4/3/2/1 ranking, ties split the average of tied positions' points ----
export function rankCategory(managers, valueFn, higherBetter) {
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

export function pointsFor(managers, cat) {
  const rows = rankCategory(managers, cat.valueFn, cat.higherBetter);
  const map = {};
  rows.forEach(r => { map[r.name] = r.points; });
  return map;
}
