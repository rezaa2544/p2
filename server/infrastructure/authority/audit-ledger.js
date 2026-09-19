'use strict';

const authority = require('./postgres-authority');

async function record({ actor, reason, action, before, after }) {
  if (!authority.attached()) {
    if (process.env.DATABASE_URL) throw authority.unavailable();
    return null;
  }
  const res = await authority.query(
    `INSERT INTO system_audit (actor, reason, action, before, after, timestamp)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())
     RETURNING id;`,
    [
      String(actor || 'system'),
      reason != null ? String(reason) : null,
      String(action || 'UNKNOWN'),
      before != null ? JSON.stringify(before) : null,
      after != null ? JSON.stringify(after) : null
    ]
  );
  return res && res.rows && res.rows[0] ? res.rows[0].id : null;
}

module.exports = { record };
