"use client";

import { useState, useTransition } from "react";
import { checkServiceAction, setServiceStatusAction } from "../actions";

/** Runs a health check on a service's URL, or sets its status by hand. */
export function ServiceActions({ serviceId, hasUrl }: { serviceId: number; hasUrl: boolean }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const run = (action: () => Promise<{ ok: boolean; message: string } | null>) =>
    startTransition(async () => {
      const result = await action();
      setFailed(!result?.ok);
      setMessage(result?.message ?? null);
    });

  return (
    <div className="dev-service-actions">
      <button
        type="button"
        className="tk-button tk-ghost"
        disabled={pending || !hasUrl}
        title={hasUrl ? "Make one request to the URL and store only Up or Down" : "Add a URL to check"}
        aria-label={`Check now: service ${serviceId}`}
        onClick={() => run(() => checkServiceAction(serviceId))}
      >
        {pending ? "Checking…" : "Check now"}
      </button>
      <button
        type="button"
        className="tk-button tk-ghost"
        disabled={pending}
        aria-label={`Mark service ${serviceId} up by hand`}
        onClick={() => run(() => setServiceStatusAction(serviceId, "Up"))}
      >
        Mark up
      </button>
      <button
        type="button"
        className="tk-button tk-ghost"
        disabled={pending}
        aria-label={`Mark service ${serviceId} down by hand`}
        onClick={() => run(() => setServiceStatusAction(serviceId, "Down"))}
      >
        Mark down
      </button>
      {message ? (
        <small role={failed ? "alert" : "status"} className="dev-note">
          {message}
        </small>
      ) : null}
    </div>
  );
}
