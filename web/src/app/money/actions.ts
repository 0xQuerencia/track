"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { isoDate } from "@/lib/dates";
import { isMonth } from "@/lib/money/format";
import { markRecurringPaid } from "@/lib/money/recurring";
import { transactionCategories } from "@/lib/money/queries";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export type MoneyActionState = { ok: boolean; message: string } | null;

/** Server actions are public endpoints, so each one re-checks the session. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

const refresh = () => revalidatePath("/", "layout");
const MAX_AMOUNT = 100_000_000;

function parseAmount(raw: FormDataEntryValue | null): number | null {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return null;
  // At most two decimals: the form step is 0.01, so anything finer is a typing error.
  const paise = value * 100;
  if (Math.abs(paise - Math.round(paise)) > 1e-6) return null;
  return value;
}

/** Sets or clears the project a transaction belongs to (project earnings). */
export async function setTransactionProjectAction(
  transactionId: number,
  projectId: number | null,
): Promise<MoneyActionState> {
  await requireSession();
  if (!Number.isInteger(transactionId) || transactionId <= 0)
    return { ok: false, message: "Unknown transaction." };
  const db = getDb();
  if (projectId !== null) {
    if (!Number.isInteger(projectId) || projectId <= 0) return { ok: false, message: "Unknown project." };
    const project = db.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId);
    if (!project) return { ok: false, message: "Unknown project." };
  }
  const result = db
    .prepare("UPDATE transactions SET project_id = ? WHERE id = ?")
    .run(projectId, transactionId);
  if (Number(result.changes) === 0) return { ok: false, message: "Transaction not found." };
  refresh();
  return { ok: true, message: projectId === null ? "Project cleared." : "Project saved." };
}

/** Creates or updates the budget for one category in one month. */
export async function setBudgetAction(
  _previous: MoneyActionState,
  formData: FormData,
): Promise<MoneyActionState> {
  await requireSession();
  const month = formData.get("month");
  const category = formData.get("category");
  if (!isMonth(month)) return { ok: false, message: "Choose a valid month." };
  if (typeof category !== "string" || !transactionCategories().includes(category))
    return { ok: false, message: "Choose a category from the list." };
  const amount = parseAmount(formData.get("amount"));
  if (amount === null) return { ok: false, message: "Enter a budget between 0 and 10,00,00,000." };
  getDb()
    .prepare(
      `INSERT INTO budgets (month, category, amount) VALUES (?, ?, ?)
       ON CONFLICT (month, category) DO UPDATE SET amount = excluded.amount`,
    )
    .run(month, category, amount);
  refresh();
  return { ok: true, message: `Budget for ${category} saved.` };
}

/** Records a payment for a recurring item's due date. Repeating it changes nothing. */
export async function markRecurringPaidAction(
  recurringId: number,
  dueDate: string,
): Promise<MoneyActionState> {
  await requireSession();
  if (!isoDate(dueDate)) return { ok: false, message: "The due date is not valid." };
  const result = markRecurringPaid(recurringId, dueDate);
  if (!result.ok) return { ok: false, message: result.reason };
  refresh();
  return {
    ok: true,
    message: result.created ? "Marked paid and added to transactions." : "Already marked paid for this date.",
  };
}
