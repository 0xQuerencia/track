"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";
import { verifyOriginHeaders } from "@/lib/security/origin";
import { importInventory, type ImportReport } from "@/lib/projects/import";
import { MAX_INVENTORY_BYTES } from "@/lib/projects/import-schema";
import { createMilestone, deleteMilestone, moveMilestone, setMilestoneStatus } from "@/lib/projects/milestones";
import { createResource, deleteResource, updateResource } from "@/lib/projects/resources";
import { createTask, deleteTask, moveTask } from "@/lib/projects/tasks";
import { createProject, removeProject, setArchived, setPinned, updateProject } from "@/lib/projects/write";
import {
  field,
  firstIssue,
  milestoneFormSchema,
  milestoneStatusSchema,
  projectFormSchema,
  projectIdSchema,
  resourceFormSchema,
  taskFormSchema,
  taskStatusSchema,
} from "@/lib/projects/schemas";

export type ActionState = { ok: boolean; message: string } | null;
export type ImportActionState = { ok: boolean; message: string; report?: ImportReport } | null;

/** Server actions are public endpoints, so each one re-checks the session and the Origin. */
async function requireSession(): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySessionToken(token))) redirect("/login");
}

async function originRejected(): Promise<boolean> {
  return !verifyOriginHeaders(await headers()).ok;
}

const REJECTED: ActionState = { ok: false, message: "Request was rejected." };

function refreshProject(id?: number): void {
  revalidatePath("/projects", "page");
  if (id !== undefined) revalidatePath(`/projects/${id}`, "page");
  revalidatePath("/", "layout");
}

function parseId(value: number): number | null {
  const parsed = projectIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/* ---- projects ---- */

export async function createProjectAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const parsed = projectFormSchema.safeParse({
    name: field(formData, "name"),
    status: field(formData, "status") || "Active",
    category: field(formData, "category"),
    repo: field(formData, "repo"),
    local_path: field(formData, "local_path"),
    description: field(formData, "description"),
    tags: field(formData, "tags"),
    tech_stack: field(formData, "tech_stack"),
    milestone_date: field(formData, "milestone_date"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const id = createProject(
    {
      ...parsed.data,
      category: parsed.data.category ?? null,
      repo: parsed.data.repo ?? null,
      local_path: parsed.data.local_path ?? null,
      description: parsed.data.description ?? null,
      tags: parsed.data.tags ?? [],
      tech_stack: parsed.data.tech_stack ?? [],
      milestone_date: parsed.data.milestone_date ?? null,
      notes: parsed.data.notes ?? null,
    },
    formData.get("pinned") === "on",
  );
  refreshProject();
  redirect(`/projects/${id}`);
}

export async function updateProjectAction(
  projectId: number,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null) return { ok: false, message: "Unknown project." };
  const parsed = projectFormSchema.safeParse({
    name: field(formData, "name"),
    status: field(formData, "status"),
    category: field(formData, "category"),
    repo: field(formData, "repo"),
    local_path: field(formData, "local_path"),
    description: field(formData, "description"),
    tags: field(formData, "tags"),
    tech_stack: field(formData, "tech_stack"),
    milestone_date: field(formData, "milestone_date"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const values = parsed.data;
  const updated = updateProject(id, {
    name: values.name,
    status: values.status,
    category: values.category ?? null,
    repo: values.repo ?? null,
    local_path: values.local_path ?? null,
    description: values.description ?? null,
    tags: values.tags ?? [],
    tech_stack: values.tech_stack ?? [],
    milestone_date: values.milestone_date ?? null,
    notes: values.notes ?? null,
  });
  if (!updated) return { ok: false, message: "Project not found." };
  refreshProject(id);
  return { ok: true, message: "Saved." };
}

export async function setArchivedAction(projectId: number, archived: boolean): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null || !setArchived(id, archived)) return { ok: false, message: "Project not found." };
  refreshProject(id);
  return { ok: true, message: archived ? "Archived." : "Restored." };
}

export async function setPinnedAction(projectId: number, pinned: boolean): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null || !setPinned(id, pinned)) return { ok: false, message: "Project not found." };
  refreshProject(id);
  return { ok: true, message: pinned ? "Pinned." : "Unpinned." };
}

export async function deleteProjectAction(projectId: number): Promise<void> {
  await requireSession();
  if (await originRejected()) return;
  const id = parseId(projectId);
  if (id === null) return;
  removeProject(id);
  refreshProject();
  redirect("/projects");
}

/* ---- backlog items ---- */

export async function createTaskAction(projectId: number, _previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null) return { ok: false, message: "Unknown project." };
  const parsed = taskFormSchema.safeParse({
    title: field(formData, "title"),
    kind: field(formData, "kind") || "Feature",
    priority: field(formData, "priority") || "Medium",
    status: field(formData, "status") || "Backlog",
    due_date: field(formData, "due_date"),
    description: field(formData, "description"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const created = createTask(id, {
    ...parsed.data,
    due_date: parsed.data.due_date ?? null,
    description: parsed.data.description ?? null,
  });
  if (created === null) return { ok: false, message: "Project not found." };
  refreshProject(id);
  return { ok: true, message: "Item added." };
}

export async function moveTaskAction(taskId: number, projectId: number, status: string): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  const parsed = taskStatusSchema.safeParse(status);
  if (id === null || !parsed.success || !moveTask(taskId, id, parsed.data))
    return { ok: false, message: "Item not found." };
  refreshProject(id);
  return { ok: true, message: "Moved." };
}

export async function deleteTaskAction(taskId: number, projectId: number): Promise<void> {
  await requireSession();
  if (await originRejected()) return;
  const id = parseId(projectId);
  if (id === null) return;
  deleteTask(taskId, id);
  refreshProject(id);
}

/* ---- roadmap ---- */

export async function createMilestoneAction(projectId: number, _previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null) return { ok: false, message: "Unknown project." };
  const parsed = milestoneFormSchema.safeParse({
    title: field(formData, "title"),
    due_date: field(formData, "due_date"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  if (createMilestone(id, parsed.data.title, parsed.data.due_date ?? null) === null)
    return { ok: false, message: "Project not found." };
  refreshProject(id);
  return { ok: true, message: "Milestone added." };
}

export async function setMilestoneStatusAction(milestoneId: number, projectId: number, status: string): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  const parsed = milestoneStatusSchema.safeParse(status);
  if (id === null || !parsed.success || !setMilestoneStatus(milestoneId, id, parsed.data))
    return { ok: false, message: "Milestone not found." };
  refreshProject(id);
  return { ok: true, message: "Saved." };
}

export async function moveMilestoneAction(milestoneId: number, projectId: number, direction: number): Promise<void> {
  await requireSession();
  if (await originRejected()) return;
  const id = parseId(projectId);
  if (id === null || (direction !== -1 && direction !== 1)) return;
  moveMilestone(milestoneId, id, direction);
  refreshProject(id);
}

export async function deleteMilestoneAction(milestoneId: number, projectId: number): Promise<void> {
  await requireSession();
  if (await originRejected()) return;
  const id = parseId(projectId);
  if (id === null) return;
  deleteMilestone(milestoneId, id);
  refreshProject(id);
}

/* ---- resources ---- */

export async function createResourceAction(projectId: number, _previous: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null) return { ok: false, message: "Unknown project." };
  const parsed = resourceFormSchema.safeParse({
    kind: field(formData, "kind") || "Link",
    title: field(formData, "title"),
    url_or_ref: field(formData, "url_or_ref"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const created = createResource(id, {
    kind: parsed.data.kind,
    title: parsed.data.title,
    url_or_ref: parsed.data.url_or_ref ?? null,
    notes: parsed.data.notes ?? null,
  });
  if (created === null) return { ok: false, message: "Project not found." };
  refreshProject(id);
  return { ok: true, message: "Resource added." };
}

export async function updateResourceAction(
  resourceId: number,
  projectId: number,
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();
  if (await originRejected()) return REJECTED;
  const id = parseId(projectId);
  if (id === null) return { ok: false, message: "Unknown project." };
  const parsed = resourceFormSchema.safeParse({
    kind: field(formData, "kind"),
    title: field(formData, "title"),
    url_or_ref: field(formData, "url_or_ref"),
    notes: field(formData, "notes"),
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const updated = updateResource(resourceId, id, {
    kind: parsed.data.kind,
    title: parsed.data.title,
    url_or_ref: parsed.data.url_or_ref ?? null,
    notes: parsed.data.notes ?? null,
  });
  if (!updated) return { ok: false, message: "Resource not found." };
  refreshProject(id);
  return { ok: true, message: "Saved." };
}

export async function deleteResourceAction(resourceId: number, projectId: number): Promise<void> {
  await requireSession();
  if (await originRejected()) return;
  const id = parseId(projectId);
  if (id === null) return;
  deleteResource(resourceId, id);
  refreshProject(id);
}

/* ---- inventory import ---- */

export async function importInventoryAction(_previous: ImportActionState, formData: FormData): Promise<ImportActionState> {
  await requireSession();
  if (await originRejected()) return { ok: false, message: "Request was rejected." };
  const payload = field(formData, "payload");
  if (!payload.trim()) return { ok: false, message: "Choose an inventory file or paste its JSON first." };
  if (Buffer.byteLength(payload, "utf8") > MAX_INVENTORY_BYTES)
    return { ok: false, message: "The inventory is larger than 2 MB." };
  const report = importInventory(payload);
  refreshProject();
  const failed = report.errors.length;
  const summary = `Created ${report.created}, updated ${report.updated}, unchanged or skipped ${report.skipped}, ${failed} ${failed === 1 ? "problem" : "problems"}.`;
  return { ok: failed === 0, message: summary, report };
}
