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
  const cursor = options.cursor ? Number(options.cursor) : null;
  const direction = options.direction || 'next';
  const key = options.key || 'id';

  let filtered = items;

  if (cursor != null && !isNaN(cursor)) {
    if (direction === 'next') {
      filtered = items.filter(item => Number(item[key]) > cursor);
    } else {
      filtered = items.filter(item => Number(item[key]) < cursor);
    }
  }

  const pageItems = filtered.slice(0, limit);
  const hasMore = filtered.length > limit;

  let nextCursor = null;
  let prevCursor = null;

  if (pageItems.length > 0) {
    nextCursor = String(pageItems[pageItems.length - 1][key]);
    prevCursor = String(pageItems[0][key]);
  }

  return {
    data: pageItems,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: hasMore ? nextCursor : null,
      prev_cursor: cursor ? prevCursor : null,
      count: pageItems.length,
      total: items.length
    }
  };
}

module.exports = {
  parsePaginationParams,
  paginateArray
};
