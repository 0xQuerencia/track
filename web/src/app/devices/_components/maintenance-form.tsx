"use client";

import { useActionState } from "react";
import { addMaintenanceAction, type DeviceActionState } from "../actions";

/** Adds a dated maintenance note to one device. */
export function MaintenanceForm({ deviceId, today }: { deviceId: number; today: string }) {
  const [state, action, pending] = useActionState<DeviceActionState, FormData>(addMaintenanceAction, null);
  return (
    <form action={action} className="tk-form dev-maintenance-form">
      <input type="hidden" name="device_id" value={String(deviceId)} />
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Date</span>
          <input name="date" type="date" defaultValue={today} required />
        </label>
        <label className="tk-field" data-wide="true">
          <span>What was done</span>
          <textarea name="note" rows={2} maxLength={2000} required />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Add maintenance entry"}
        </button>
        {state ? (
          <p role={state.ok ? "status" : "alert"} className="dev-note">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
