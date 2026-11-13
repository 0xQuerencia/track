use serde_json::json;

use crate::Engine;

const TODAY: &str = "2026-11-14";

fn engine() -> std::sync::Arc<Engine> {
    Engine::open(":memory:".into()).unwrap()
}

fn snapshot() -> String {
    json!({
        "serverTime": "2026-11-14T08:00:00Z",
        "today": TODAY,
        "name": "Ricky",
        "focusToday": {"minutes": 30.0},
        "data": {
            "tasks": [
                {"id": 1, "title": "Low later", "priority": "Low", "status": "To do", "due": "2026-11-30"},
                {"id": 2, "title": "High overdue", "priority": "High", "status": "To do", "due": "2026-11-10"},
                {"id": 3, "title": "Done already", "priority": "High", "status": "Done", "due": null},
                {"id": 4, "title": "Medium today", "priority": "Medium", "status": "Doing", "due": "2026-11-14"}
            ],
            "chapters": [
                {"id": 10, "subject": "Physics", "name": "Optics", "priority": "Medium", "mastery": 40, "done": 0},
                {"id": 11, "subject": "Physics", "name": "Waves", "priority": "High", "mastery": 60, "done": 0},
                {"id": 12, "subject": "Physics", "name": "Motion", "priority": "High", "mastery": 10, "done": 1}
            ],
            "exams": [
                {"id": 1, "name": "Old", "date": "2026-10-01", "target_pct": 80},
                {"id": 2, "name": "Preboards", "date": "2026-11-20", "target_pct": 80}
            ],
            "lectures": [],
            "habits": [{"id": 5, "name": "Read"}],
            "habitLogs": [
                {"habitId": 5, "date": "2026-11-13"},
                {"habitId": 5, "date": "2026-11-12"}
            ]
        }
    })
    .to_string()
}

#[test]
fn today_view_from_snapshot() {
    let e = engine();
    e.apply_pull(snapshot()).unwrap();
    let v = e.today(TODAY.into(), 9).unwrap();
    assert_eq!(v.greeting, "Good morning");
    assert_eq!(v.name.as_deref(), Some("Ricky"));
    assert_eq!(v.date_label, "Saturday, November 14");
    assert_eq!((v.open_tasks, v.overdue_tasks, v.due_today), (3, 1, 1));
    // High before Medium before Low.
    let order: Vec<_> = v.top_tasks.iter().map(|t| t.id).collect();
    assert_eq!(order, vec![2, 4, 1]);
    assert!(v.top_tasks[0].overdue);
    let exam = v.next_exam.unwrap();
    assert_eq!((exam.name.as_str(), exam.days_left), ("Preboards", 6));
    // Not covered, highest priority, lowest mastery first.
    assert_eq!(v.study_chapter.unwrap().name, "Waves");
    assert_eq!(v.focus_minutes, 30);
}

#[test]
fn habit_streak_counts_back_from_yesterday_until_done_today() {
    let e = engine();
    e.apply_pull(snapshot()).unwrap();
    let h = &e.today(TODAY.into(), 9).unwrap().habits[0];
    assert!(!h.done_today);
    assert_eq!(h.streak, 2);

    e.toggle_habit(5, TODAY.into()).unwrap();
    let v = e.today(TODAY.into(), 9).unwrap();
    assert!(v.habits[0].done_today);
    assert_eq!((v.habits[0].streak, v.habits_done), (3, 1));

    e.toggle_habit(5, TODAY.into()).unwrap();
    assert!(!e.today(TODAY.into(), 9).unwrap().habits[0].done_today);
}

#[test]
fn offline_changes_survive_a_fresh_pull() {
    let e = engine();
    e.apply_pull(snapshot()).unwrap();
    e.add_task("Offline task".into(), "High".into(), Some(TODAY.into()), None).unwrap();
    e.set_task_status(1, "Done".into()).unwrap();
    e.log_focus(TODAY.into(), Some("Optics".into()), 25, 1).unwrap();
    assert_eq!(e.pending_count().unwrap(), 3);

    // The server hasn't seen any of it yet; re-pulling must not lose it.
    e.apply_pull(snapshot()).unwrap();
    let v = e.today(TODAY.into(), 9).unwrap();
    assert!(v.top_tasks.iter().any(|t| t.title == "Offline task" && t.unsynced));
    assert_eq!(v.open_tasks, 3); // +1 new, -1 marked done
    assert_eq!(v.focus_minutes, 55); // 30 on server + 25 queued
    assert_eq!(v.pending_ops, 3);
}

#[test]
fn ack_clears_confirmed_and_rejected_but_keeps_retryable() {
    let e = engine();
    e.apply_pull(snapshot()).unwrap();
    e.set_task_status(1, "Doing".into()).unwrap();
    e.set_task_status(2, "Doing".into()).unwrap();
    e.set_task_status(4, "Done".into()).unwrap();

    let pending: serde_json::Value = serde_json::from_str(&e.pending_ops(50).unwrap()).unwrap();
    let ids: Vec<String> = pending["ops"].as_array().unwrap().iter().map(|o| o["opId"].as_str().unwrap().to_string()).collect();
    assert_eq!(ids.len(), 3);
    assert!(ids.iter().all(|i| i.len() >= 8));

    let reply = json!({"results": [
        {"opId": ids[0], "ok": true},
        {"opId": ids[1], "ok": false, "error": "Not allowed."},
        {"opId": ids[2], "ok": false, "error": "Server error."}
    ]});
    let s = e.ack(reply.to_string()).unwrap();
    assert_eq!((s.applied, s.rejected, s.will_retry), (1, 1, 1));
    assert_eq!(e.pending_count().unwrap(), 1);
}

#[test]
fn queued_focus_isnt_double_counted_after_confirmation() {
    let e = engine();
    e.apply_pull(snapshot()).unwrap();
    e.log_focus(TODAY.into(), None, 20, 0).unwrap();
    let id = serde_json::from_str::<serde_json::Value>(&e.pending_ops(5).unwrap()).unwrap()["ops"][0]["opId"].as_str().unwrap().to_string();
    e.ack(json!({"results": [{"opId": id, "ok": true}]}).to_string()).unwrap();

    // The next pull reports the server's updated total.
    let mut snap: serde_json::Value = serde_json::from_str(&snapshot()).unwrap();
    snap["focusToday"]["minutes"] = json!(50.0);
    e.apply_pull(snap.to_string()).unwrap();
    assert_eq!(e.today(TODAY.into(), 9).unwrap().focus_minutes, 50);
}

#[test]
fn rejects_bad_input() {
    let e = engine();
    assert!(e.add_task("   ".into(), "High".into(), None, None).is_err());
    assert!(e.add_task("x".into(), "Urgent".into(), None, None).is_err());
    assert!(e.add_task("x".into(), "Low".into(), Some("2026-02-31".into()), None).is_err());
    assert!(e.log_focus(TODAY.into(), None, 0, 0).is_err());
    assert!(e.log_study(TODAY.into(), "Physics".into(), 30, 5, 9, None).is_err());
    assert!(e.set_chapter_mastery(1, 101.0).is_err());
    assert!(e.apply_pull("not json".into()).is_err());
    assert_eq!(e.pending_count().unwrap(), 0);
}

#[test]
fn state_persists_across_reopen() {
    let dir = std::env::temp_dir().join(format!("track-core-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("t.db").to_string_lossy().to_string();
    {
        let e = Engine::open(path.clone()).unwrap();
        e.apply_pull(snapshot()).unwrap();
        e.add_task("Kept".into(), "Low".into(), None, None).unwrap();
    }
    let e = Engine::open(path).unwrap();
    assert_eq!(e.pending_count().unwrap(), 1);
    assert!(e.tasks(TODAY.into(), false).unwrap().iter().any(|t| t.title == "Kept"));
    std::fs::remove_dir_all(dir).ok();
}

#[test]
fn insights_round_trip_and_default_empty() {
    let e = engine();
    assert!(e.insights().unwrap().focus.is_empty());

    let mut snap: serde_json::Value = serde_json::from_str(&snapshot()).unwrap();
    snap["insights"] = json!({
        "focus": [{"date": "2026-11-13", "value": 25}, {"date": "2026-11-14", "value": 40}],
        "study": [{"date": "2026-11-14", "value": 90}],
        "mastery": [{"name": "Physics", "value": 42.5}]
    });
    e.apply_pull(snap.to_string()).unwrap();
    let i = e.insights().unwrap();
    assert_eq!((i.focus.len(), i.study.len()), (2, 1));
    assert_eq!((i.mastery[0].label.as_str(), i.mastery[0].value), ("Physics", 42.5));
}
