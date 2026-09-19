/**
 * Redis is CACHE ONLY. Never authority.
 * Configured Redis down ⇒ throw REDIS_UNAVAILABLE (503).
 */
'use strict';

const redis = require('../../redis');

function mustFailClosed() {
  return !!(process.env.REDIS_URL || process.env.NODE_ENV === 'production' || process.env.PAYESH_ENV === 'production');
}

function gone() {
  const err = new Error('REDIS_UNAVAILABLE');
  err.code = 'REDIS_UNAVAILABLE';
  err.status = 503;
  return err;
}

async function get(key) {
  if (mustFailClosed() && typeof redis.isRedis === 'function' && !redis.isRedis()) throw gone();
  try {
    return await redis.get(key);
  } catch (e) {
    if (mustFailClosed()) throw gone();
    return null;
  }
}

async function set(key, value, ttlSeconds) {
  if (mustFailClosed() && typeof redis.isRedis === 'function' && !redis.isRedis()) throw gone();
  try {
    if (ttlSeconds) return await redis.set(key, value, 'EX', ttlSeconds);
    return await redis.set(key, value);
  } catch (e) {
    if (mustFailClosed()) throw gone();
    return false;
  }
}

async function del(key) {
  try {
    return await redis.del(key);
  } catch (e) {
    if (mustFailClosed()) throw gone();
    return 0;
  }
}

module.exports = { get, set, del, mustFailClosed };
