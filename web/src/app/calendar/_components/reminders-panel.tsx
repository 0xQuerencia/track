import Link from "next/link";
import type { UpcomingReminder } from "@/lib/calendar/reminders";
import { REMINDER_WINDOW_HOURS } from "@/lib/calendar/model";

/** In-app reminders only. Shown when at least one reminder is due in the window. */
export function RemindersPanel({ reminders }: { reminders: UpcomingReminder[] }) {
  if (!reminders.length) return null;
  return (
    <section className="cal-reminders" aria-labelledby="cal-reminders-title">
      <h2 id="cal-reminders-title">Reminders</h2>
      <p className="cal-hint">Events not yet started with a reminder in the next {REMINDER_WINDOW_HOURS} hours. Shown here only; nothing is pushed to your phone.</p>
      <ul className="cal-list">
        {reminders.map((reminder) => (
          <li key={reminder.id} className="cal-item cal-reminder">
            <Link href={reminder.href} className="cal-item-link" prefetch={false}>
              <span className="cal-item-when">Reminder {reminder.remindLabel}</span>
              <span className="cal-item-body">
                <span className="cal-item-title">{reminder.title}</span>
                <span className="cal-item-meta">
                  <span>Starts {reminder.startsLabel}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {reminder.minutesBefore === 0 ? "at start" : `${reminder.minutesBefore} min before`}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
