/**
 * Telemetry — write performance metrics to claudio-telemetry.db.
 * All writes are fire-and-forget (setImmediate) to keep the bot event loop clear.
 * DB path: TELEMETRY_DB_PATH env var, or /home/claudio/claudio-telemetry.db
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.TELEMETRY_DB_PATH || '/home/claudio/claudio-telemetry.db'

let _db = null

function getDb() {
  if (_db) return _db
  try {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
    _db = new Database(DB_PATH)
    _db.pragma('journal_mode = WAL')
    _db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id  TEXT PRIMARY KEY,
        start_time  TEXT NOT NULL,
        end_time    TEXT,
        player_name TEXT
      );
      CREATE TABLE IF NOT EXISTS navigate_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id  TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        start_pos   TEXT NOT NULL,
        goal_pos    TEXT NOT NULL,
        result      TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        distance    REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS follow_events (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id       TEXT NOT NULL,
        timestamp        TEXT NOT NULL,
        event_type       TEXT NOT NULL,
        pos              TEXT NOT NULL,
        duration_before_ms INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS combat_events (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id    TEXT NOT NULL,
        timestamp     TEXT NOT NULL,
        entity_count  INTEGER NOT NULL,
        duration_ms   INTEGER NOT NULL,
        kills         INTEGER NOT NULL,
        health_before REAL,
        health_after  REAL
      );
      CREATE TABLE IF NOT EXISTS chat_events (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id        TEXT NOT NULL,
        timestamp         TEXT NOT NULL,
        result_type       TEXT NOT NULL,
        duration_ms       INTEGER NOT NULL,
        idle_timeout_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS context_refresh_events (
        id                 INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id         TEXT NOT NULL,
        timestamp          TEXT NOT NULL,
        idle_timeout_count INTEGER NOT NULL DEFAULT 0,
        session_duration_ms INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS health_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT NOT NULL,
        timestamp    TEXT NOT NULL,
        health_value REAL NOT NULL,
        food_value   REAL NOT NULL,
        event_type   TEXT NOT NULL
      );
    `)
    console.error(`[telemetry] DB ready: ${DB_PATH}`)
  } catch (err) {
    console.error('[telemetry] DB init error:', err.message)
    _db = null
  }
  return _db
}

// Wrap a synchronous DB write in setImmediate — caller returns, write happens next tick
function write(fn) {
  setImmediate(() => {
    try {
      const conn = getDb()
      if (conn) fn(conn)
    } catch (err) {
      console.error('[telemetry] write error:', err.message)
    }
  })
}

export function initSession(sessionId, playerName) {
  write(conn => conn.prepare(
    'INSERT OR REPLACE INTO sessions (session_id, start_time, player_name) VALUES (?, ?, ?)'
  ).run(sessionId, new Date().toISOString(), playerName || null))
}

export function endSession(sessionId) {
  if (!sessionId) return
  write(conn => conn.prepare(
    'UPDATE sessions SET end_time = ? WHERE session_id = ?'
  ).run(new Date().toISOString(), sessionId))
}

export function writeNavigateEvent({ sessionId, startPos, goalPos, result, durationMs, distance }) {
  write(conn => conn.prepare(
    'INSERT INTO navigate_events (session_id, timestamp, start_pos, goal_pos, result, duration_ms, distance) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    sessionId,
    new Date().toISOString(),
    JSON.stringify(startPos),
    JSON.stringify(goalPos),
    result,
    durationMs,
    distance
  ))
}

export function writeFollowEvent({ sessionId, eventType, pos, durationBeforeMs }) {
  write(conn => conn.prepare(
    'INSERT INTO follow_events (session_id, timestamp, event_type, pos, duration_before_ms) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, new Date().toISOString(), eventType, JSON.stringify(pos), durationBeforeMs))
}

export function writeCombatEvent({ sessionId, entityCount, durationMs, kills, healthBefore, healthAfter }) {
  write(conn => conn.prepare(
    'INSERT INTO combat_events (session_id, timestamp, entity_count, duration_ms, kills, health_before, health_after) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    sessionId,
    new Date().toISOString(),
    entityCount,
    durationMs,
    kills,
    healthBefore ?? null,
    healthAfter ?? null
  ))
}

export function writeChatEvent({ sessionId, resultType, durationMs, idleTimeoutCount = 0 }) {
  write(conn => conn.prepare(
    'INSERT INTO chat_events (session_id, timestamp, result_type, duration_ms, idle_timeout_count) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, new Date().toISOString(), resultType, durationMs, idleTimeoutCount))
}

export function writeContextRefreshEvent({ sessionId, idleTimeoutCount = 0, sessionDurationMs = 0 }) {
  write(conn => conn.prepare(
    'INSERT INTO context_refresh_events (session_id, timestamp, idle_timeout_count, session_duration_ms) VALUES (?, ?, ?, ?)'
  ).run(sessionId, new Date().toISOString(), idleTimeoutCount, sessionDurationMs))
}

export function writeHealthEvent({ sessionId, healthValue, foodValue, eventType }) {
  write(conn => conn.prepare(
    'INSERT INTO health_events (session_id, timestamp, health_value, food_value, event_type) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionId, new Date().toISOString(), healthValue, foodValue, eventType))
}
