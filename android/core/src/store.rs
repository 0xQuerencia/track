//! SQLite persistence: a JSON row cache of what the server last sent, the
//! habit log, an outbox of changes not yet acknowledged, and a small kv table.

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

pub type Result<T> = std::result::Result<T, rusqlite::Error>;

pub struct Store {
    conn: Connection,
}

pub struct Pending {
    pub seq: i64,
    pub op: Value,
}

impl Store {
    pub fn open(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS rows (
               entity TEXT NOT NULL, id INTEGER NOT NULL, json TEXT NOT NULL,
               PRIMARY KEY (entity, id));
             CREATE TABLE IF NOT EXISTS habit_logs (
               habit_id INTEGER NOT NULL, date TEXT NOT NULL,
               PRIMARY KEY (habit_id, date));
             CREATE TABLE IF NOT EXISTS outbox (
               seq INTEGER PRIMARY KEY AUTOINCREMENT,
               op_id TEXT NOT NULL UNIQUE, json TEXT NOT NULL);
             CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
        )?;
        Ok(Self { conn })
    }

    pub fn transaction<T, E: From<rusqlite::Error>>(
        &mut self,
        f: impl FnOnce(&Self) -> std::result::Result<T, E>,
    ) -> std::result::Result<T, E> {
        self.conn.execute_batch("BEGIN")?;
        match f(self) {
            Ok(v) => {
                self.conn.execute_batch("COMMIT")?;
                Ok(v)
            }
            Err(e) => {
                let _ = self.conn.execute_batch("ROLLBACK");
                Err(e)
            }
        }
    }

    pub fn kv_get(&self, key: &str) -> Result<Option<String>> {
        self.conn
            .query_row("SELECT value FROM kv WHERE key = ?", [key], |r| r.get(0))
            .optional()
    }

    pub fn kv_set(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO kv (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn rows(&self, entity: &str) -> Result<Vec<Value>> {
        let mut stmt = self
            .conn
            .prepare("SELECT json FROM rows WHERE entity = ? ORDER BY id")?;
        let out = stmt
            .query_map([entity], |r| r.get::<_, String>(0))?
            .filter_map(|s| s.ok().and_then(|s| serde_json::from_str(&s).ok()))
            .collect();
        Ok(out)
    }

    pub fn get_row(&self, entity: &str, id: i64) -> Result<Option<Value>> {
        let json: Option<String> = self
            .conn
            .query_row(
                "SELECT json FROM rows WHERE entity = ?1 AND id = ?2",
                params![entity, id],
                |r| r.get(0),
            )
            .optional()?;
        Ok(json.and_then(|s| serde_json::from_str(&s).ok()))
    }

    pub fn put_row(&self, entity: &str, id: i64, row: &Value) -> Result<()> {
        self.conn.execute(
            "INSERT INTO rows (entity, id, json) VALUES (?1, ?2, ?3)
             ON CONFLICT(entity, id) DO UPDATE SET json = excluded.json",
            params![entity, id, row.to_string()],
        )?;
        Ok(())
    }

    pub fn delete_row(&self, entity: &str, id: i64) -> Result<()> {
        self.conn.execute(
            "DELETE FROM rows WHERE entity = ?1 AND id = ?2",
            params![entity, id],
        )?;
        Ok(())
    }

    pub fn clear_entity(&self, entity: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM rows WHERE entity = ?", [entity])?;
        Ok(())
    }

    pub fn habit_logs(&self) -> Result<Vec<(i64, String)>> {
        let mut stmt = self.conn.prepare("SELECT habit_id, date FROM habit_logs")?;
        let out = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
            .collect::<Result<Vec<_>>>()?;
        Ok(out)
    }

    pub fn set_habit_log(&self, habit_id: i64, date: &str, done: bool) -> Result<()> {
        if done {
            self.conn.execute(
                "INSERT OR IGNORE INTO habit_logs (habit_id, date) VALUES (?1, ?2)",
                params![habit_id, date],
            )?;
        } else {
            self.conn.execute(
                "DELETE FROM habit_logs WHERE habit_id = ?1 AND date = ?2",
                params![habit_id, date],
            )?;
        }
        Ok(())
    }

    pub fn clear_habit_logs(&self) -> Result<()> {
        self.conn.execute("DELETE FROM habit_logs", [])?;
        Ok(())
    }

    pub fn enqueue(&self, op_id: &str, op: &Value) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO outbox (op_id, json) VALUES (?1, ?2)",
            params![op_id, op.to_string()],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    pub fn pending(&self, limit: i64) -> Result<Vec<Pending>> {
        let mut stmt = self
            .conn
            .prepare("SELECT seq, json FROM outbox ORDER BY seq LIMIT ?")?;
        let out = stmt
            .query_map([limit], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?))
            })?
            .filter_map(|r| r.ok())
            .filter_map(|(seq, json)| serde_json::from_str(&json).ok().map(|op| Pending { seq, op }))
            .collect();
        Ok(out)
    }

    pub fn pending_count(&self) -> Result<i64> {
        self.conn
            .query_row("SELECT COUNT(*) FROM outbox", [], |r| r.get(0))
    }

    pub fn remove_pending(&self, op_id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM outbox WHERE op_id = ?", [op_id])?;
        Ok(())
    }
}
