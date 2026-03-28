#!/usr/bin/env node
/**
 * Standalone schema initializer for claudio-telemetry.db
 * Run once to create the DB and tables, or to apply schema on a new machine.
 *
 * Usage:
 *   node scripts/init-telemetry-db.js
 *   TELEMETRY_DB_PATH=/custom/path.db node scripts/init-telemetry-db.js
 */

import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.TELEMETRY_DB_PATH || '/home/claudio/claudio-telemetry.db'

console.log(`Initializing telemetry DB at: ${DB_PATH}`)

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')

db.exec(`
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
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         TEXT NOT NULL,
    timestamp          TEXT NOT NULL,
    event_type         TEXT NOT NULL,
    pos                TEXT NOT NULL,
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
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         TEXT NOT NULL,
    timestamp          TEXT NOT NULL,
    result_type        TEXT NOT NULL,
    duration_ms        INTEGER NOT NULL,
    idle_timeout_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS context_refresh_events (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          TEXT NOT NULL,
    timestamp           TEXT NOT NULL,
    idle_timeout_count  INTEGER NOT NULL DEFAULT 0,
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

db.close()

// Verify
const verify = new Database(DB_PATH, { readonly: true })
const tables = verify.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
verify.close()

console.log('Tables created:')
tables.forEach(t => console.log(`  - ${t.name}`))
console.log(`\nDone. DB ready at: ${DB_PATH}`)
