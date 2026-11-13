"use client";

import { useActionState } from "react";
import { loginAction, type ActionState } from "@/app/actions";
import { ActionNotice } from "@/components/motion/action-notice";

export function LoginForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    loginAction,
    null,
  );
  return (
    <form action={action} className="tk-login-form">
      <label className="tk-field">
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          maxLength={200}
        />
      </label>
      <button type="submit" className="tk-button tk-primary" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
      {state && !state.ok ? (
        <ActionNotice tone="error" role="alert">
          {state.message}
        </ActionNotice>
      ) : null}
    </form>
  );
}
