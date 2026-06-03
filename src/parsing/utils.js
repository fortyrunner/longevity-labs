/* ============================================================================
   PARSING UTILITIES
   Shared helpers used by both the ZIP and CSV parsers.
   ============================================================================ */

function parseHmsToSec(s) {
  if (!s || s === '--') return 0;
  const parts = String(s).split(':').map(Number);
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return parseFloat(s) || 0;
}

function parseMmssToSec(s) {
  if (!s || s === '--') return null;
  const parts = String(s).split(':').map(Number);
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return null;
}

function stripCommas(s) { return s ? String(s).replace(/,/g, '') : ''; }

function numOrNull(v) {
  if (v === undefined || v === null || v === '--' || v === '') return null;
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function humanSize(b) {
  if (b > 1e6) return (b/1e6).toFixed(1) + ' MB';
  if (b > 1e3) return (b/1e3).toFixed(1) + ' KB';
  return b + ' B';
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

function yieldFrame() { return new Promise(r => setTimeout(r, 0)); }
