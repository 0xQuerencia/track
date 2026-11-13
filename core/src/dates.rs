//! Calendar-date helpers on `YYYY-MM-DD` strings. The app passes "today" in, so
//! the core needs no time-zone database.

fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let y = i64::from(if m <= 2 { y - 1 } else { y });
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = y - era * 400;
    let mp = i64::from((m + 9) % 12);
    let doy = (153 * mp + 2) / 5 + i64::from(d) - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    ((y + i64::from(m <= 2)) as i32, m, d)
}

pub fn parse(date: &str) -> Option<(i32, u32, u32)> {
    let mut parts = date.split('-');
    let y: i32 = parts.next()?.parse().ok()?;
    let m: u32 = parts.next()?.parse().ok()?;
    let d: u32 = parts.next()?.parse().ok()?;
    if parts.next().is_some() || !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // Reject 31 Feb and friends by round-tripping.
    let (ry, rm, rd) = civil_from_days(days_from_civil(y, m, d));
    (ry == y && rm == m && rd == d).then_some((y, m, d))
}

pub fn is_valid(date: &str) -> bool {
    parse(date).is_some()
}

fn ordinal(date: &str) -> Option<i64> {
    parse(date).map(|(y, m, d)| days_from_civil(y, m, d))
}

/// Whole days from `from` to `to` (negative when `to` is earlier).
pub fn days_between(from: &str, to: &str) -> Option<i64> {
    Some(ordinal(to)? - ordinal(from)?)
}

pub fn add_days(date: &str, n: i64) -> Option<String> {
    let (y, m, d) = civil_from_days(ordinal(date)? + n);
    Some(format!("{y:04}-{m:02}-{d:02}"))
}

const MONTHS: [&str; 12] = [
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December",
];
const WEEKDAYS: [&str; 7] = [
    "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday", "Wednesday",
];

/// "Saturday, November 14", matching the web dashboard.
pub fn long_label(date: &str) -> String {
    match (parse(date), ordinal(date)) {
        (Some((_, m, d)), Some(o)) => format!(
            "{}, {} {}",
            WEEKDAYS[o.rem_euclid(7) as usize],
            MONTHS[(m - 1) as usize],
            d
        ),
        _ => date.to_string(),
    }
}

/// Same bands as the web app's greeting.
pub fn greeting(hour: u32) -> &'static str {
    match hour {
        0..=4 => "Late night",
        5..=11 => "Good morning",
        12..=16 => "Good afternoon",
        17..=21 => "Good evening",
        _ => "Late night",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_math() {
        assert_eq!(days_between("2026-11-14", "2026-11-20"), Some(6));
        assert_eq!(days_between("2026-11-20", "2026-11-14"), Some(-6));
        assert_eq!(add_days("2026-12-31", 1).as_deref(), Some("2027-01-01"));
        assert_eq!(add_days("2028-02-28", 1).as_deref(), Some("2028-02-29"));
    }

    #[test]
    fn labels_and_validation() {
        assert_eq!(long_label("2026-11-14"), "Saturday, November 14");
        assert!(!is_valid("2026-02-31"));
        assert!(!is_valid("nope"));
        assert_eq!(greeting(3), "Late night");
        assert_eq!(greeting(9), "Good morning");
        assert_eq!(greeting(22), "Late night");
    }
}
