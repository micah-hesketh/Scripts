// ==UserScript==
// @name         Fantrax Projected FP (Roster)
// @namespace    https://github.com/micah-hesketh
// @version      0.2.0
// @description  Adds "Proj. FP" = FP/G × number of scheduled games in visible day columns
// @author       micah-hesketh
// @match        https://www.fantrax.com/fantasy/league/*/team/roster*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = false;
  const HEADER_TEXT = 'Proj. FP';
  const DAY_HEADER_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;
  const FP_HEADER_RE = /^FP\/G$/i;

  const ATTR_HEADER = 'data-tm-projfp-header';
  const ATTR_CELL = 'data-tm-projfp-cell';

  const log = (...args) => DEBUG && console.log('[TM ProjFP]', ...args);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const isDash = (s) => {
    const t = clean(s);
    return t === '' || t === '-' || t === '–' || t === '—';
  };

  // Find roster-like tables rendered as div grids
  function getRosterTables() {
    return Array.from(document.querySelectorAll('league-team-roster-tables .i-table')).filter(t => {
      const headerCells = t.querySelectorAll('.i-table-header .i-table-cell');
      return Array.from(headerCells).some(c => FP_HEADER_RE.test(clean(c.textContent)));
    });
  }

  function getHeaderCells(tableEl) {
    // Most Fantrax tables use .i-table-header > .i-table-row > .i-table-cell
    const row = tableEl.querySelector('.i-table-header .i-table-row') || tableEl.querySelector('.i-table-header');
    if (!row) return [];
    return Array.from(row.querySelectorAll(':scope > .i-table-cell, :scope > div.i-table-cell'));
  }

  function getBodyRows(tableEl) {
    return Array.from(tableEl.querySelectorAll('.i-table-body .i-table-row'));
  }

  function parseGridTemplateColumns(el) {
    const gtc = getComputedStyle(el).gridTemplateColumns;
    if (!gtc) return null;
    // naive split works for typical Fantrax tracks
    const cols = gtc.split(/\s+/).filter(Boolean);
    return { raw: gtc, cols };
  }

  function setGridTemplateColumns(el, cols) {
    if (!el || !cols || !cols.length) return;
    el.style.gridTemplateColumns = cols.join(' ');
  }

  function ensureHeaderCell(tableEl, fpIdx) {
    const headerRow = tableEl.querySelector('.i-table-header .i-table-row') || tableEl.querySelector('.i-table-header');
    if (!headerRow) return { projIdx: -1, inserted: false };

    const existing = headerRow.querySelector(`[${ATTR_HEADER}="1"]`);
    if (existing) {
      const cells = getHeaderCells(tableEl);
      return { projIdx: cells.indexOf(existing), inserted: false };
    }

    const cells = getHeaderCells(tableEl);
    if (fpIdx < 0 || fpIdx >= cells.length) return { projIdx: -1, inserted: false };

    const fpCell = cells[fpIdx];
    const newCell = fpCell.cloneNode(false);
    newCell.setAttribute(ATTR_HEADER, '1');
    newCell.textContent = HEADER_TEXT;
    fpCell.insertAdjacentElement('afterend', newCell);

    // Expand grid columns by duplicating FP/G column width
    const grid = parseGridTemplateColumns(headerRow);
    if (grid && grid.cols.length >= cells.length) {
      const insertedTrack = grid.cols[Math.min(fpIdx, grid.cols.length - 1)] || 'minmax(64px,1fr)';
      const next = [...grid.cols];
      next.splice(fpIdx + 1, 0, insertedTrack);
      setGridTemplateColumns(headerRow, next);
    }

    return { projIdx: fpIdx + 1, inserted: true };
  }

  function ensureRowCell(row, fpIdx) {
    const cells = Array.from(row.querySelectorAll(':scope > .i-table-cell, :scope > div.i-table-cell'));
    if (fpIdx < 0 || fpIdx >= cells.length) return null;

    let proj = row.querySelector(`[${ATTR_CELL}="1"]`);
    if (proj) return proj;

    const fpCell = cells[fpIdx];
    proj = fpCell.cloneNode(false);
    proj.setAttribute(ATTR_CELL, '1');
    proj.textContent = '-';
    fpCell.insertAdjacentElement('afterend', proj);

    const grid = parseGridTemplateColumns(row);
    if (grid && grid.cols.length >= cells.length) {
      const insertedTrack = grid.cols[Math.min(fpIdx, grid.cols.length - 1)] || 'minmax(64px,1fr)';
      const next = [...grid.cols];
      next.splice(fpIdx + 1, 0, insertedTrack);
      setGridTemplateColumns(row, next);
    }
    return proj;
  }

  function processTable(tableEl) {
    const headerCells = getHeaderCells(tableEl);
    if (!headerCells.length) return;

    const fpIdx = headerCells.findIndex(c => FP_HEADER_RE.test(clean(c.textContent)));
    if (fpIdx < 0) return;

    const dayIdxs = headerCells
      .map((c, i) => DAY_HEADER_RE.test(clean(c.textContent)) ? i : -1)
      .filter(i => i >= 0);

    if (!dayIdxs.length) return;

    const { projIdx, inserted } = ensureHeaderCell(tableEl, fpIdx);
    if (projIdx < 0) return;

    const shiftedDayIdxs = inserted
      ? dayIdxs.map(i => (i > fpIdx ? i + 1 : i))
      : dayIdxs;

    const rows = getBodyRows(tableEl);
    rows.forEach(row => {
      const cells = Array.from(row.querySelectorAll(':scope > .i-table-cell, :scope > div.i-table-cell'));
      if (!cells.length) return;

      const fpCell = cells[fpIdx];
      if (!fpCell) return;

      const fpRaw = clean(fpCell.textContent).replace(/[^\d.-]/g, '');
      const fpg = Number.parseFloat(fpRaw);
      if (!Number.isFinite(fpg)) return;

      let games = 0;
      shiftedDayIdxs.forEach(idx => {
        const cell = cells[idx];
        if (!cell) return;
        if (!isDash(cell.textContent)) games += 1;
      });

      const proj = (games * fpg).toFixed(1);
      const projCell = ensureRowCell(row, fpIdx);
      if (projCell) projCell.textContent = proj;
    });

    log('processed table', { rows: rows.length, dayCols: shiftedDayIdxs.length });
  }

  function run() {
    getRosterTables().forEach(processTable);
  }

  let t = null;
  const debouncedRun = () => {
    clearTimeout(t);
    t = setTimeout(run, 250);
  };

  const observer = new MutationObserver(debouncedRun);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  run();
})();
