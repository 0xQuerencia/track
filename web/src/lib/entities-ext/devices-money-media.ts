import type { Entity } from "../entities";

/*
 * Record types for devices, money and media. Tables are created by migration
 * m090 (keep the field names here in step with its columns). Only type
 * imports from entities.ts, so entities.ts stays cycle-free.
 */

export const DEVICE_KINDS = [
  "Linux desktop",
  "Laptop",
  "Phone",
  "Home server",
  "VPS",
  "Storage",
  "Other",
] as const;

export const SERVICE_KINDS = ["Website", "API", "Database", "Deployment", "Service"] as const;

export const CONNECTIVITY_STATES = ["Unknown", "Online", "Offline"] as const;

export const SERVICE_STATES = ["Unknown", "Up", "Down"] as const;

export const INCOME_KINDS = ["Salary", "Allowance", "Freelance", "Project", "Other"] as const;

export const CADENCES = ["Weekly", "Monthly", "Quarterly", "Yearly"] as const;

export const ENTITIES: readonly Entity[] = [
  {
    key: "devices",
    singular: "Device",
    plural: "Devices",
    href: "/devices",
    orderBy: "name, id",
    titleField: "name",
    searchable: ["name", "location", "notes"],
    fields: [
      { name: "name", label: "Device", type: "text", required: true },
      { name: "kind", label: "Kind", type: "select", options: DEVICE_KINDS, default: "Other" },
      { name: "os", label: "OS", type: "text" },
      { name: "location", label: "Location", type: "text" },
      { name: "storage_total_gb", label: "Storage total (GB)", type: "number", min: 0, max: 1000000, step: 0.1 },
      { name: "storage_used_gb", label: "Storage used (GB)", type: "number", min: 0, max: 1000000, step: 0.1 },
      // Set only through the connectivity action, never the add form.
      { name: "last_seen_at", label: "Last seen", type: "text" },
      { name: "connectivity", label: "Connectivity", type: "select", options: CONNECTIVITY_STATES, default: "Unknown" },
      { name: "verified_at", label: "Verified at", type: "text" },
      { name: "verified_by", label: "Verified by", type: "text" },
      { name: "maintenance_notes", label: "Maintenance notes", type: "textarea" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "services",
    singular: "Service",
    plural: "Services",
    href: "/devices",
    orderBy: "name, id",
    titleField: "name",
    searchable: ["name", "notes"],
    fields: [
      { name: "name", label: "Service", type: "text", required: true },
      { name: "kind", label: "Kind", type: "select", options: SERVICE_KINDS, default: "Service" },
      { name: "url", label: "URL", type: "url" },
      { name: "device_id", label: "Device", type: "number", min: 1, max: 100000000 },
      { name: "project_id", label: "Project", type: "number", min: 1, max: 100000000 },
      // Set only by the check action or the manual status action.
      { name: "status", label: "Status", type: "select", options: SERVICE_STATES, default: "Unknown" },
      { name: "status_source", label: "Status source", type: "text" },
      { name: "last_checked_at", label: "Last checked", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  {
    key: "maintenance_logs",
    singular: "Maintenance entry",
    plural: "Maintenance log",
    href: "/devices",
    orderBy: "date DESC, id DESC",
    titleField: "note",
    searchable: ["note"],
    fields: [
      { name: "device_id", label: "Device", type: "number", required: true, min: 1, max: 100000000 },
      { name: "date", label: "Date", type: "date", default: "today" },
      { name: "note", label: "What was done", type: "textarea", required: true },
    ],
  },
  {
    key: "budgets",
    singular: "Budget",
    plural: "Budgets",
    href: "/money",
    orderBy: "month DESC, category, id",
    titleField: "category",
    searchable: [],
    fields: [
      { name: "month", label: "Month (YYYY-MM)", type: "text", required: true },
      { name: "category", label: "Category", type: "text", required: true },
      { name: "amount", label: "Budget (INR)", type: "number", required: true, min: 0, max: 100000000, step: 0.01 },
    ],
  },
  {
    key: "income_sources",
    singular: "Income source",
    plural: "Income sources",
    href: "/money",
    orderBy: "active DESC, id",
    titleField: "name",
    searchable: ["name"],
    fields: [
      { name: "name", label: "Source", type: "text", required: true },
      { name: "kind", label: "Kind", type: "select", options: INCOME_KINDS, default: "Other" },
      { name: "expected_monthly", label: "Expected per month (INR)", type: "number", min: 0, max: 100000000, step: 0.01 },
      { name: "active", label: "Active", type: "boolean", default: 1 },
    ],
  },
  {
    key: "recurring_expenses",
    singular: "Recurring expense",
    plural: "Recurring & subscriptions",
    href: "/money",
    orderBy: "active DESC, next_due, id",
    titleField: "name",
    searchable: ["name", "notes"],
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "category", label: "Category", type: "text" },
      { name: "amount", label: "Amount (INR)", type: "number", required: true, min: 0, max: 100000000, step: 0.01 },
      { name: "cadence", label: "Cadence", type: "select", options: CADENCES, default: "Monthly" },
      { name: "next_due", label: "Next due", type: "date", required: true },
      { name: "active", label: "Active", type: "boolean", default: 1 },
      { name: "is_subscription", label: "Subscription", type: "boolean" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
];
