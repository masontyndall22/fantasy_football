export function fmt(n) {
  if (n === undefined || n === null || n === "") return "—";
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

export function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
