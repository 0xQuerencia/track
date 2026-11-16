"use client";

import { useState, useTransition } from "react";
import { setDeviceConnectivityAction } from "../actions";

const STATES = ["Online", "Offline", "Unknown"] as const;

/** Sets a device's connectivity by hand. The choice is saved and labelled as manual. */
export function ConnectivityControl({
  deviceId,
  current,
}: {
  deviceId: number;
  current: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  return (
    <div className="dev-connectivity">
      <div role="group" aria-label="Set connectivity by hand" className="dev-segments">
        {STATES.map((state) => (
          <button
            key={state}
            type="button"
            className="tk-button tk-ghost"
            aria-pressed={current === state}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setDeviceConnectivityAction(deviceId, state);
                setFailed(!result?.ok);
                setMessage(result?.message ?? null);
              })
            }
          >
            {state}
          </button>
        ))}
      </div>
      <p className="dev-hint">
        Track cannot see your devices yet, so this is set by hand. It shows as manual and is never presented as measured.
      </p>
      {message ? (
        <p role={failed ? "alert" : "status"} className="dev-note">
          {message}
        </p>
      ) : null}
    </div>
  );
}
