"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ActionNotice } from "@/components/motion/action-notice";
import { deleteEventAction, saveEventAction, type EventActionState } from "../actions";
import {
  EVENT_CATEGORIES,
  RECURRENCES,
  REMINDER_OPTIONS,
  type EventFormValues,
} from "@/lib/calendar/model";

/** Create or edit one event. A failed save keeps what was typed. */
export function EventForm({
  values,
  eventId,
  returnTo,
  cancelHref,
}: {
  values: EventFormValues;
  eventId: number | null;
  returnTo: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState<EventActionState, FormData>(saveEventAction, null);
  const current = state && !state.ok && state.values ? state.values : values;

  return (
    <section className="cal-form-panel" aria-labelledby="cal-form-title">
      <h2 id="cal-form-title">{eventId === null ? "New event" : "Edit event"}</h2>
      {state && !state.ok ? (
        <ActionNotice tone="error" role="alert">
          {state.message}
        </ActionNotice>
      ) : null}
      <form action={formAction} className="tk-form cal-form">
        <EventFields key={state && !state.ok ? (state.nonce ?? 0) : 0} values={current} />
        <input type="hidden" name="id" value={eventId ?? ""} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div className="tk-form-actions cal-form-actions">
          <button type="submit" className="tk-button tk-primary" disabled={pending}>
            {pending ? "Saving" : eventId === null ? "Add event" : "Save changes"}
          </button>
          <Link href={cancelHref} className="tk-button tk-ghost" prefetch={false}>
            Cancel
          </Link>
        </div>
      </form>
      {eventId !== null ? <DeleteEventForm id={eventId} returnTo={returnTo} /> : null}
    </section>
  );
}

function EventFields({ values }: { values: EventFormValues }) {
  const [allDay, setAllDay] = useState(values.all_day);
  const [repeat, setRepeat] = useState(values.recurrence);

  return (
    <div className="tk-form-grid">
      <label className="tk-field" data-wide>
        <span>Title</span>
        <input name="title" required maxLength={200} defaultValue={values.title} autoFocus />
      </label>
      <label className="tk-field">
        <span>Date</span>
        <input name="date" type="date" required defaultValue={values.date} />
      </label>
      <label className="tk-field" data-type="boolean">
        <input
          name="all_day"
          type="checkbox"
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
        />
        <span>All day</span>
      </label>
      <label className="tk-field">
        <span>Start time</span>
        <input name="start_time" type="time" defaultValue={values.start_time} disabled={allDay} />
      </label>
      <label className="tk-field">
        <span>End time</span>
        <input name="end_time" type="time" defaultValue={values.end_time} disabled={allDay} />
      </label>
      <label className="tk-field">
        <span>Ends on (optional)</span>
        <input name="end_date" type="date" defaultValue={values.end_date} />
      </label>
      <label className="tk-field">
        <span>Category</span>
        <select name="category" defaultValue={values.category}>
          {EVENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Repeats</span>
        <select
          name="recurrence"
          defaultValue={values.recurrence}
          onChange={(event) => setRepeat(event.target.value as EventFormValues["recurrence"])}
        >
          {RECURRENCES.map((option) => (
            <option key={option} value={option}>
              {option === "None" ? "Does not repeat" : option}
            </option>
          ))}
        </select>
      </label>
      {repeat !== "None" ? (
        <label className="tk-field">
          <span>Repeat until (optional)</span>
          <input name="recurrence_until" type="date" defaultValue={values.recurrence_until} />
        </label>
      ) : null}
      <label className="tk-field">
        <span>Reminder</span>
        <select name="reminder_minutes" defaultValue={values.reminder_minutes}>
          <option value="">No reminder</option>
          {REMINDER_OPTIONS.map((option) => (
            <option key={option.minutes} value={String(option.minutes)}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="tk-field">
        <span>Location</span>
        <input name="location" maxLength={200} defaultValue={values.location} />
      </label>
      <label className="tk-field" data-wide>
        <span>Notes</span>
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={values.notes} />
      </label>
      {repeat !== "None" ? (
        <p className="cal-hint" data-wide>
          Changes apply to every occurrence of this repeating event.
        </p>
      ) : null}
    </div>
  );
}

function DeleteEventForm({ id, returnTo }: { id: number; returnTo: string }) {
  return (
    <form
      action={deleteEventAction}
      className="cal-delete"
      onSubmit={(event) => {
        if (!window.confirm("Delete this event? This cannot be undone.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button type="submit" className="tk-button tk-danger">
        Delete event
      </button>
    </form>
  );
}
