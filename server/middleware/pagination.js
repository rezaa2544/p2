/* ═══════════════════════════════════════════════════════════════════
   server/middleware/pagination.js — Keyset & Cursor-Based Pagination
   -------------------------------------------------------------------
   Phase 3: Backend Production API
   - High-performance Keyset Pagination avoiding OFFSET/LIMIT degradation.
   - Generates stable next_cursor and prev_cursor metadata.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

/**
 * Parses pagination parameters from request URL
 * @param {URLSearchParams|Object} params 
 * @returns {Object} { limit, cursor, direction }
 */
function parsePaginationParams(params) {
  const get = (k) => (typeof params.get === 'function' ? params.get(k) : params[k]);
  
  let limit = parseInt(get('limit'), 10);
  if (isNaN(limit) || limit <= 0) limit = 50;
  if (limit > 200) limit = 200; // Hard max cap

  const cursor = get('cursor') || null;
  const direction = (get('direction') === 'prev') ? 'prev' : 'next';

  return { limit, cursor, direction };
}

/**
 * Applies cursor-based pagination to an array of sorted items
 * @param {Array} items - Full list of filtered items (sorted by id ascending)
 * @param {Object} options - { limit, cursor, direction, key }
 * @returns {Object} { data, pagination: { limit, has_more, next_cursor, prev_cursor, total } }
 */
function paginateArray(items, options = {}) {
  const limit = options.limit || 50;
  const cursorRaw = options.cursor != null ? String(options.cursor) : null;
  const direction = options.direction || 'next';
  const key = options.key || 'id';
  const order = options.order === 'desc' ? 'desc' : 'asc';
  const composite = !!options.composite;

  let filtered = items;

  if (cursorRaw != null && cursorRaw !== '') {
    if (composite) {
      /* composite keyset "date|id" — ORDER BY date DESC, id ASC */
      const pipe = cursorRaw.indexOf('|');
      if (pipe !== -1) {
        const cd = cursorRaw.slice(0, pipe);
        const ci = Number(cursorRaw.slice(pipe + 1));
        if (!isNaN(ci)) {
          if (direction === 'next') {
            filtered = items.filter(item => (String(item.date || '') < cd) || (String(item.date || '') === cd && Number(item[key]) > ci));
          } else {
            filtered = items.filter(item => (String(item.date || '') > cd) || (String(item.date || '') === cd && Number(item[key]) < ci));
          }
        }
      }
    } else if (!isNaN(Number(cursorRaw))) {
      const c = Number(cursorRaw);
      if (direction === 'next') {
        filtered = order === 'desc' ? items.filter(item => Number(item[key]) < c) : items.filter(item => Number(item[key]) > c);
      } else {
        filtered = order === 'desc' ? items.filter(item => Number(item[key]) > c) : items.filter(item => Number(item[key]) < c);
      }
    }
  }

  const pageItems = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  let nextCursor = null;
  let prevCursor = null;

  if (pageItems.length > 0) {
    const last = pageItems[pageItems.length - 1];
    const first = pageItems[0];
    if (composite) {
      nextCursor = String(last.date || '') + '|' + String(last[key]);
      prevCursor = String(first.date || '') + '|' + String(first[key]);
    } else {
      nextCursor = String(last[key]);
      prevCursor = String(first[key]);
    }
  }

  return {
    data: pageItems,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore ? nextCursor : null,
      prev_cursor: cursorRaw ? prevCursor : null,
      count: pageItems.length,
      total: items.length
    }
  };
}

module.exports = {
  parsePaginationParams,
  paginateArray
};
