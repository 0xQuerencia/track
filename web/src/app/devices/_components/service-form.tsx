"use client";

import { useActionState } from "react";
import { addServiceAction, type DeviceActionState } from "../actions";
import { SERVICE_KINDS } from "@/lib/entities-ext/devices-money-media";

/** Adds a service. Its status starts as Unknown and only changes through a check or a manual choice. */
export function ServiceForm({
  devices,
  projects,
  defaultDeviceId,
}: {
  devices: { id: number; name: string }[];
  projects: { id: number; name: string }[];
  defaultDeviceId?: number;
}) {
  const [state, action, pending] = useActionState<DeviceActionState, FormData>(addServiceAction, null);
  return (
    <form action={action} className="tk-form dev-service-form">
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Service</span>
          <input name="name" type="text" required maxLength={2000} />
        </label>
        <label className="tk-field">
          <span>Kind</span>
          <select name="kind" defaultValue="Service">
            {SERVICE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field" data-wide="true">
          <span>URL (http or https, checked on demand)</span>
          <input name="url" type="url" placeholder="https://" maxLength={2000} />
        </label>
        <label className="tk-field">
          <span>Device</span>
          <select name="device_id" defaultValue={defaultDeviceId ? String(defaultDeviceId) : ""}>
            <option value="">None</option>
            {devices.map((device) => (
              <option key={device.id} value={String(device.id)}>
                {device.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Project</span>
          <select name="project_id" defaultValue="">
            <option value="">None</option>
            {projects.map((project) => (
              <option key={project.id} value={String(project.id)}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field" data-wide="true">
          <span>Notes</span>
          <input name="notes" type="text" maxLength={2000} />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Add service"}
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
