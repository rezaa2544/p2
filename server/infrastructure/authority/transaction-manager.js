'use strict';

const db = require('../../db');

async function withTransaction(fn) {
  if (typeof db.transaction !== 'function') {
    return fn(null);
  }
  return db.transaction(fn);
}

module.exports = { withTransaction };
