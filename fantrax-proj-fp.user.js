// ==UserScript==
// @name         Fantrax Projected FP (Roster)
// @namespace    https://github.com/micah-hesketh
// @version      0.3.0
// @description  Adds "Proj. FP" = FP/G × number of scheduled games in visible day columns
// @author       micah-hesketh
// @match        https://www.fantrax.com/fantasy/league/*/team/roster*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const DEBUG = true;
  const DECIMALS = 2;
  const HEADER_TEXT = 'Proj. FP';
  const DAY_HEADER_RE = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/i;
  const FP_HEADER_RE = /^FP\/G$/i;

  const ATTR = 'data-tm-projfp';

  const log = (...args) => DEBUG && console.log('[TM ProjFP]', ...args);
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const isDash = (s) => {
    const t = clean(s);
    return t === '' || t === '-' || t === '–' || t === '—';
  };

  // Fantrax markup (confirmed from DOM diagnostics):
  //   .i-table > .i-table__row.i-table__header > .i-table__cell
  // Body rows are assumed to be .i-table__row (without .i-table__header)
  // containing direct-child .i-table__cell elements.
  const cellsOf = (row) =>
    Array.from(row.children).filter((c) => c.classList.contains('i-table__cell'));
  const originalCellsOf = (row) => cellsOf(row).filter((c) => !c.hasAttribute(ATTR));

  function getHeaderRow(tableEl) {
    return tableEl.querySelector('.i-table__row.i-table__header');
  }

  function getBodyRows(tableEl) {
    return Array.from(tableEl.querySelectorAll('.i-table__row')).filter(
      (r) => !r.classList.contains('i-table__header')
    );
  }

  function getRosterTables() {
    return Array.from(document.querySelectorAll('league-team-roster-tables .i-table')).filter((t) => {
      const h = getHeaderRow(t);
      return h && originalCellsOf(h).some((c) => FP_HEADER_RE.test(clean(c.textContent)));
    });
  }

  function processTable(tableEl) {
    const headerRow = getHeaderRow(tableEl);
    const headerCells = originalCellsOf(headerRow);

    const fpIdx = headerCells.findIndex((c) => FP_HEADER_RE.test(clean(c.textContent)));
    if (fpIdx < 0) return;

    const dayIdxs = headerCells
      .map((c, i) => (DAY_HEADER_RE.test(clean(c.textContent)) ? i : -1))
      .filter((i) => i >= 0);
    if (!dayIdxs.length) {
      log('no day columns found; headers:', headerCells.map((c) => clean(c.textContent)));
      return;
    }

    // Header cell (add once)
    if (!headerRow.querySelector(`[${ATTR}="header"]`)) {
      const h = headerCells[fpIdx].cloneNode(false);
      h.setAttribute(ATTR, 'header');
      h.textContent = HEADER_TEXT;
      headerCells[fpIdx].insertAdjacentElement('afterend', h);
    }

    const rows = getBodyRows(tableEl);
    let updated = 0;
    rows.forEach((row) => {
      const cells = originalCellsOf(row);
      if (cells.length !== headerCells.length) return; // not a player row

      const fpg = Number.parseFloat(clean(cells[fpIdx].textContent).replace(/[^\d.-]/g, ''));
      if (!Number.isFinite(fpg)) return;

      const games = dayIdxs.reduce((n, i) => n + (isDash(cells[i].textContent) ? 0 : 1), 0);

      let projCell = row.querySelector(`:scope > [${ATTR}="cell"]`);
      if (!projCell) {
        projCell = cells[fpIdx].cloneNode(false);
        projCell.setAttribute(ATTR, 'cell');
        cells[fpIdx].insertAdjacentElement('afterend', projCell);
      }
      projCell.textContent = (games * fpg).toFixed(DECIMALS);
      updated++;
    });

    log('processed table', { bodyRows: rows.length, updated, dayCols: dayIdxs.length });
  }

  function run() {
    const tables = getRosterTables();
    log('tables found:', tables.length);
    // Pause the observer so our own DOM edits don't retrigger it
    observer.disconnect();
    try {
      tables.forEach(processTable);
    } catch (e) {
      console.error('[TM ProjFP]', e);
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  let t = null;
  const debouncedRun = () => {
    clearTimeout(t);
    t = setTimeout(run, 250);
  };

  const observer = new MutationObserver(debouncedRun);
  run();
})();
