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

// For freeform summary text (preseason summary, weekly summary) that a
// person or an AI prompt might write with light formatting in mind.
// Escapes first for safety (this can come from an LLM, so never trust it
// as raw HTML), then supports just two things: **bold** (markdown-style)
// and line breaks — deliberately not full Markdown, just the two things
// people naturally reach for when writing a short summary.
export function formatRichText(str) {
  if (str === undefined || str === null) return "";
  let escaped = escapeHtml(str);
  escaped = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  escaped = escaped.replace(/\n/g, "<br>");
  return escaped;
}