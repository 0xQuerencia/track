//! The phone-side brain: caches what Track sent, queues changes made offline,
//! and builds the home-screen view. It does no networking; the Android shell
//! moves JSON between the server and `apply_pull` / `pending_ops` / `ack`.

use std::sync::{Arc, Mutex, MutexGuard};

use serde_json::{json, Map, Value};

use crate::dates;
use crate::store::Store;

#[derive(Debug, thiserror::Error, uniffi::Error)]
#[uniffi(flat_error)]
pub enum CoreError {
    #[error("storage error: {0}")]
    Storage(String),
    #[error("invalid input: {0}")]
    Invalid(String),
    #[error("bad payload: {0}")]
    Payload(String),
}

impl From<rusqlite::Error> for CoreError {
    fn from(e: rusqlite::Error) -> Self {
        CoreError::Storage(e.to_string())
    }
}

type Res<T> = Result<T, CoreError>;

const PULLED: [&str; 5] = ["tasks", "chapters", "exams", "lectures", "habits"];
const PRIORITIES: [&str; 3] = ["High", "Medium", "Low"];
const STATUSES: [&str; 3] = ["To do", "Doing", "Done"];
const SUBJECTS: [&str; 6] = [
    "Physics", "Chemistry", "Mathematics", "English", "Gujarati", "Physical Education",
];
const SCREEN: [&str; 6] = ["Study", "Coding", "Media", "Social", "Games", "Other"];
/// A rejected op is dropped; this error means "try again later" and is kept.
const RETRYABLE: &str = "Server error.";

#[derive(uniffi::Record)]
pub struct TaskItem {
    pub id: i64,
    pub title: String,
    pub priority: String,
    pub due: Option<String>,
    pub status: String,
    pub area: Option<String>,
    pub overdue: bool,
    /// Created on this phone and not yet confirmed by the server.
    pub unsynced: bool,
}

#[derive(uniffi::Record)]
pub struct ExamItem {
    pub name: String,
    pub date: String,
    pub days_left: i64,
    pub target_pct: Option<f64>,
}

#[derive(uniffi::Record)]
pub struct HabitItem {
    pub id: i64,
    pub name: String,
    pub done_today: bool,
    pub streak: u32,
}

#[derive(uniffi::Record)]
pub struct ChapterItem {
    pub id: i64,
    pub subject: String,
    pub name: String,
    pub mastery: f64,
    pub priority: String,
    pub covered: bool,
}

#[derive(uniffi::Record)]
pub struct TodayView {
    pub greeting: String,
    pub name: Option<String>,
    pub date_label: String,
    pub open_tasks: u32,
    pub overdue_tasks: u32,
    pub due_today: u32,
    pub top_tasks: Vec<TaskItem>,
    pub next_exam: Option<ExamItem>,
    pub habits: Vec<HabitItem>,
    pub habits_done: u32,
    pub focus_minutes: u32,
    pub study_chapter: Option<ChapterItem>,
    pub pending_ops: u32,
    pub last_sync: Option<String>,
}

#[derive(uniffi::Record)]
pub struct AckSummary {
    pub applied: u32,
    pub rejected: u32,
    pub will_retry: u32,
}

#[derive(uniffi::Object)]
pub struct Engine {
    store: Mutex<Store>,
}

// ---- JSON field helpers ---------------------------------------------------

fn text(row: &Value, key: &str) -> Option<String> {
    row.get(key)?.as_str().map(str::to_owned).filter(|s| !s.is_empty())
}
fn num(row: &Value, key: &str) -> Option<f64> {
    row.get(key)?.as_f64()
}
fn int(row: &Value, key: &str) -> i64 {
    row.get(key).and_then(Value::as_i64).unwrap_or(0)
}
fn flag(row: &Value, key: &str) -> bool {
    row.get(key).is_some_and(|v| v.as_i64() == Some(1) || v.as_bool() == Some(true))
}
fn rank(priority: &str) -> u8 {
    match priority {
        "High" => 0,
        "Medium" => 1,
        _ => 2,
    }
}

fn task_item(row: &Value, today: &str) -> TaskItem {
    let due = text(row, "due");
    let status = text(row, "status").unwrap_or_else(|| "To do".into());
    TaskItem {
        id: int(row, "id"),
        title: text(row, "title").unwrap_or_default(),
        priority: text(row, "priority").unwrap_or_else(|| "Medium".into()),
        overdue: status != "Done" && due.as_deref().is_some_and(|d| d < today),
        due,
        status,
        area: text(row, "area"),
        unsynced: int(row, "id") < 0,
    }
}

fn chapter_item(row: &Value) -> ChapterItem {
    ChapterItem {
        id: int(row, "id"),
        subject: text(row, "subject").unwrap_or_default(),
        name: text(row, "name").unwrap_or_default(),
        mastery: num(row, "mastery").unwrap_or(0.0),
        priority: text(row, "priority").unwrap_or_else(|| "Medium".into()),
        covered: flag(row, "done"),
    }
}

/// Applies one operation to the local cache. Used both when a change is first
/// made and when pending changes are re-laid over a fresh server snapshot, so
/// the two can never disagree.
fn apply_local(store: &Store, op: &Value, seq: i64) -> Res<()> {
    let entity = op["entity"].as_str().unwrap_or_default();
    match op["op"].as_str().unwrap_or_default() {
        "create" if entity == "tasks" => {
            let mut row: Map<String, Value> = op["values"].as_object().cloned().unwrap_or_default();
            row.entry("status").or_insert(json!("To do"));
            row.entry("priority").or_insert(json!("Medium"));
            row.insert("id".into(), json!(-seq));
            store.put_row("tasks", -seq, &Value::Object(row))?;
        }
        "set" => {
            let id = op["id"].as_i64().unwrap_or(0);
            if let (Some(mut row), Some(field)) = (store.get_row(entity, id)?, op["field"].as_str())
            {
                row[field] = op["value"].clone();
                store.put_row(entity, id, &row)?;
            }
        }
        "delete" => store.delete_row(entity, op["id"].as_i64().unwrap_or(0))?,
        "habit" => store.set_habit_log(
            op["habitId"].as_i64().unwrap_or(0),
            op["date"].as_str().unwrap_or_default(),
            op["done"].as_bool().unwrap_or(true),
        )?,
        _ => {}
    }
    Ok(())
}

fn invalid(msg: &str) -> CoreError {
    CoreError::Invalid(msg.into())
}

fn check_date(date: &str) -> Res<()> {
    dates::is_valid(date).then_some(()).ok_or_else(|| invalid("Date must be YYYY-MM-DD."))
}

fn check_choice(value: &str, options: &[&str], what: &str) -> Res<()> {
    options
        .contains(&value)
        .then_some(())
        .ok_or_else(|| CoreError::Invalid(format!("Unknown {what}.")))
}

fn check_minutes(minutes: u32) -> Res<()> {
    (1..=1440).contains(&minutes).then_some(()).ok_or_else(|| invalid("Minutes must be 1-1440."))
}

impl Engine {
    fn lock(&self) -> MutexGuard<'_, Store> {
        self.store.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn new_op_id(store: &Store) -> Res<String> {
        let device = match store.kv_get("device")? {
            Some(d) => d,
            None => {
                let nanos = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map_or(0, |d| d.as_nanos());
                let d = format!("d{nanos:x}");
                store.kv_set("device", &d)?;
                d
            }
        };
        let n = store.kv_get("opctr")?.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0) + 1;
        store.kv_set("opctr", &n.to_string())?;
        Ok(format!("{device}-{n}"))
    }

    /// Queues a change for the server and applies it to the local cache.
    fn submit(&self, mut op: Value) -> Res<()> {
        let mut store = self.lock();
        store.transaction::<(), CoreError>(|s| {
            let op_id = Self::new_op_id(s)?;
            op["opId"] = json!(op_id);
            let seq = s.enqueue(&op_id, &op)?;
            apply_local(s, &op, seq)
        })
    }
}

#[uniffi::export]
impl Engine {
    #[uniffi::constructor]
    pub fn open(path: String) -> Res<Arc<Self>> {
        Ok(Arc::new(Self { store: Mutex::new(Store::open(&path)?) }))
    }

    // ---- sync ---------------------------------------------------------

    /// Replaces the cache with a server snapshot, then re-applies any changes
    /// the server hasn't confirmed yet so nothing made offline disappears.
    pub fn apply_pull(&self, json: String) -> Res<()> {
        let body: Value = serde_json::from_str(&json).map_err(|e| CoreError::Payload(e.to_string()))?;
        let data = body.get("data").ok_or_else(|| CoreError::Payload("missing data".into()))?;
        let mut store = self.lock();
        store.transaction::<(), CoreError>(|s| {
            for entity in PULLED {
                s.clear_entity(entity)?;
                for row in data[entity].as_array().into_iter().flatten() {
                    s.put_row(entity, int(row, "id"), row)?;
                }
            }
            s.clear_habit_logs()?;
            for log in data["habitLogs"].as_array().into_iter().flatten() {
                if let Some(date) = log["date"].as_str() {
                    s.set_habit_log(int(log, "habitId"), date, true)?;
                }
            }
            if let Some(name) = body["name"].as_str() {
                s.kv_set("name", name)?;
            }
            if let Some(t) = body["serverTime"].as_str() {
                s.kv_set("last_sync", t)?;
            }
            if let Some(date) = body["today"].as_str() {
                let minutes = body["focusToday"]["minutes"].as_f64().unwrap_or(0.0);
                s.kv_set("server_focus", &json!({"date": date, "minutes": minutes}).to_string())?;
            }
            for p in s.pending(10_000)? {
                apply_local(s, &p.op, p.seq)?;
            }
            Ok(())
        })?;
        Ok(())
    }

    /// The next batch of queued changes as a ready-to-POST JSON body.
    pub fn pending_ops(&self, limit: u32) -> Res<String> {
        let ops: Vec<Value> = self.lock().pending(i64::from(limit.clamp(1, 200)))?.into_iter().map(|p| p.op).collect();
        Ok(json!({ "ops": ops }).to_string())
    }

    /// Reads the server's reply to a push: confirmed and rejected changes
    /// leave the queue; ones that hit a transient server error stay.
    pub fn ack(&self, response_json: String) -> Res<AckSummary> {
        let body: Value =
            serde_json::from_str(&response_json).map_err(|e| CoreError::Payload(e.to_string()))?;
        let results = body["results"].as_array().ok_or_else(|| CoreError::Payload("missing results".into()))?;
        let mut summary = AckSummary { applied: 0, rejected: 0, will_retry: 0 };
        let store = self.lock();
        for r in results {
            let Some(op_id) = r["opId"].as_str() else { continue };
            if r["ok"].as_bool() == Some(true) {
                store.remove_pending(op_id)?;
                summary.applied += 1;
            } else if r["error"].as_str() == Some(RETRYABLE) {
                summary.will_retry += 1;
            } else {
                store.remove_pending(op_id)?;
                summary.rejected += 1;
            }
        }
        Ok(summary)
    }

    pub fn pending_count(&self) -> Res<u32> {
        Ok(self.lock().pending_count()? as u32)
    }

    // ---- reads --------------------------------------------------------

    pub fn today(&self, date: String, hour: u32) -> Res<TodayView> {
        check_date(&date)?;
        let store = self.lock();
        let open: Vec<Value> = store.rows("tasks")?.into_iter().filter(|t| text(t, "status").as_deref() != Some("Done")).collect();

        let overdue = open.iter().filter(|t| text(t, "due").is_some_and(|d| d < date)).count() as u32;
        let due_today = open.iter().filter(|t| text(t, "due").as_deref() == Some(date.as_str())).count() as u32;

        let mut sorted: Vec<&Value> = open.iter().collect();
        sorted.sort_by(|a, b| {
            let key = |t: &Value| (rank(&text(t, "priority").unwrap_or_default()), text(t, "due").is_none(), text(t, "due"), int(t, "id"));
            key(a).cmp(&key(b))
        });
        let top_tasks = sorted.iter().take(5).map(|t| task_item(t, &date)).collect();

        let next_exam = store
            .rows("exams")?
            .into_iter()
            .filter_map(|e| Some((text(&e, "date").filter(|d| *d >= date)?, e)))
            .min_by(|a, b| a.0.cmp(&b.0))
            .map(|(d, e)| ExamItem {
                name: text(&e, "name").unwrap_or_default(),
                days_left: dates::days_between(&date, &d).unwrap_or(0),
                target_pct: num(&e, "target_pct"),
                date: d,
            });

        let logs = store.habit_logs()?;
        let done_on = |id: i64, d: &str| logs.iter().any(|(h, ld)| *h == id && ld == d);
        let yesterday = dates::add_days(&date, -1).unwrap_or_default();
        let habits: Vec<HabitItem> = store
            .rows("habits")?
            .iter()
            .map(|h| {
                let id = int(h, "id");
                let done_today = done_on(id, &date);
                let mut day = if done_today { date.clone() } else { yesterday.clone() };
                let mut streak = 0;
                while done_on(id, &day) {
                    streak += 1;
                    day = dates::add_days(&day, -1).unwrap_or_default();
                }
                HabitItem { id, name: text(h, "name").unwrap_or_default(), done_today, streak }
            })
            .collect();
        let habits_done = habits.iter().filter(|h| h.done_today).count() as u32;

        let mut chapters: Vec<Value> = store.rows("chapters")?.into_iter().filter(|c| !flag(c, "done")).collect();
        chapters.sort_by(|a, b| {
            let key = |c: &Value| (rank(&text(c, "priority").unwrap_or_default()), num(c, "mastery").unwrap_or(0.0) as i64, int(c, "id"));
            key(a).cmp(&key(b))
        });

        // Minutes the server knew about at the last pull, plus anything
        // logged since that it hasn't acknowledged yet.
        let server_minutes = store
            .kv_get("server_focus")?
            .and_then(|s| serde_json::from_str::<Value>(&s).ok())
            .filter(|v| v["date"].as_str() == Some(date.as_str()))
            .and_then(|v| v["minutes"].as_f64())
            .unwrap_or(0.0) as u32;
        let queued_minutes: u32 = store
            .pending(10_000)?
            .iter()
            .filter(|p| p.op["op"] == "create" && p.op["entity"] == "focus_sessions" && p.op["values"]["date"].as_str() == Some(date.as_str()))
            .map(|p| p.op["values"]["minutes"].as_u64().unwrap_or(0) as u32)
            .sum();

        Ok(TodayView {
            greeting: dates::greeting(hour).to_string(),
            name: store.kv_get("name")?,
            date_label: dates::long_label(&date),
            open_tasks: open.len() as u32,
            overdue_tasks: overdue,
            due_today,
            top_tasks,
            next_exam,
            habits,
            habits_done,
            focus_minutes: server_minutes + queued_minutes,
            study_chapter: chapters.first().map(chapter_item),
            pending_ops: store.pending_count()? as u32,
            last_sync: store.kv_get("last_sync")?,
        })
    }

    /// Every task, open first, for the full task list.
    pub fn tasks(&self, date: String, include_done: bool) -> Res<Vec<TaskItem>> {
        check_date(&date)?;
        let mut rows = self.lock().rows("tasks")?;
        rows.retain(|t| include_done || text(t, "status").as_deref() != Some("Done"));
        rows.sort_by_key(|t| (text(t, "status").as_deref() == Some("Done"), rank(&text(t, "priority").unwrap_or_default()), text(t, "due").is_none(), text(t, "due"), int(t, "id")));
        Ok(rows.iter().map(|t| task_item(t, &date)).collect())
    }

    /// All chapters in study order, for Study HQ.
    pub fn chapters(&self) -> Res<Vec<ChapterItem>> {
        let mut rows = self.lock().rows("chapters")?;
        rows.sort_by_key(|c| (text(c, "subject"), int(c, "id")));
        Ok(rows.iter().map(chapter_item).collect())
    }

    // ---- changes ------------------------------------------------------

    pub fn add_task(&self, title: String, priority: String, due: Option<String>, area: Option<String>) -> Res<()> {
        let title = title.trim().to_string();
        if title.is_empty() || title.chars().count() > 200 {
            return Err(invalid("Task title must be 1-200 characters."));
        }
        check_choice(&priority, &PRIORITIES, "priority")?;
        if let Some(d) = &due { check_date(d)?; }
        let mut values = json!({"title": title, "priority": priority, "status": "To do"});
        if let Some(d) = due { values["due"] = json!(d); }
        if let Some(a) = area { values["area"] = json!(a); }
        self.submit(json!({"op": "create", "entity": "tasks", "values": values}))
    }

    pub fn set_task_status(&self, id: i64, status: String) -> Res<()> {
        check_choice(&status, &STATUSES, "status")?;
        self.submit(json!({"op": "set", "entity": "tasks", "id": id, "field": "status", "value": status}))
    }

    pub fn delete_task(&self, id: i64) -> Res<()> {
        self.submit(json!({"op": "delete", "entity": "tasks", "id": id}))
    }

    pub fn toggle_habit(&self, habit_id: i64, date: String) -> Res<()> {
        check_date(&date)?;
        let done_now = self.lock().habit_logs()?.iter().any(|(h, d)| *h == habit_id && *d == date);
        self.submit(json!({"op": "habit", "habitId": habit_id, "date": date, "done": !done_now}))
    }

    pub fn log_focus(&self, date: String, label: Option<String>, minutes: u32, distractions: u32) -> Res<()> {
        check_date(&date)?;
        check_minutes(minutes)?;
        let mut values = json!({"date": date, "minutes": minutes, "distractions": distractions.min(500)});
        if let Some(l) = label.filter(|l| !l.trim().is_empty()) { values["label"] = json!(l.trim()); }
        self.submit(json!({"op": "create", "entity": "focus_sessions", "values": values}))
    }

    pub fn log_study(&self, date: String, subject: String, minutes: u32, questions: u32, correct: u32, notes: Option<String>) -> Res<()> {
        check_date(&date)?;
        check_minutes(minutes)?;
        check_choice(&subject, &SUBJECTS, "subject")?;
        if correct > questions { return Err(invalid("Correct can't exceed questions.")); }
        let mut values = json!({"date": date, "subject": subject, "minutes": minutes, "questions": questions, "correct": correct});
        if let Some(n) = notes.filter(|n| !n.trim().is_empty()) { values["notes"] = json!(n.trim()); }
        self.submit(json!({"op": "create", "entity": "study_sessions", "values": values}))
    }

    pub fn log_screen(&self, date: String, category: String, minutes: u32) -> Res<()> {
        check_date(&date)?;
        check_minutes(minutes)?;
        check_choice(&category, &SCREEN, "category")?;
        self.submit(json!({"op": "create", "entity": "screen_logs", "values": {"date": date, "category": category, "minutes": minutes}}))
    }

    pub fn set_chapter_mastery(&self, id: i64, mastery: f64) -> Res<()> {
        if !(0.0..=100.0).contains(&mastery) { return Err(invalid("Mastery must be 0-100.")); }
        self.submit(json!({"op": "set", "entity": "chapters", "id": id, "field": "mastery", "value": mastery}))
    }

    pub fn set_chapter_covered(&self, id: i64, covered: bool) -> Res<()> {
        self.submit(json!({"op": "set", "entity": "chapters", "id": id, "field": "done", "value": i32::from(covered)}))
    }
}
