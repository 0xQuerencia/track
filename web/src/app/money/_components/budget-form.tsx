"use client";

import { useActionState } from "react";
import { setBudgetAction, type MoneyActionState } from "../actions";

/** Sets the budget for one category in the month shown. */
export function BudgetForm({
  month,
  categories,
}: {
  month: string;
  categories: readonly string[];
}) {
  const [state, action, pending] = useActionState<MoneyActionState, FormData>(setBudgetAction, null);
  return (
    <form action={action} className="tk-form money-budget-form">
      <input type="hidden" name="month" value={month} />
      <div className="tk-form-grid">
        <label className="tk-field">
          <span>Category</span>
          <select name="category" required defaultValue={categories[0]}>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="tk-field">
          <span>Budget (INR)</span>
          <input name="amount" type="number" inputMode="decimal" min={0} step={0.01} required />
        </label>
      </div>
      <div className="tk-form-actions">
        <button type="submit" className="tk-button tk-primary" disabled={pending}>
          {pending ? "Saving…" : "Save budget"}
        </button>
        {state ? (
          <p role={state.ok ? "status" : "alert"} className="money-form-note">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
