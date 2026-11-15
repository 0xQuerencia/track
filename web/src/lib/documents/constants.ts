/* Client-safe constants for the document vault. */

export const DOCUMENT_CATEGORIES = [
  "Identity",
  "Academic",
  "Finance",
  "Health",
  "Career",
  "Certificates",
  "Receipts",
  "Other",
] as const;

/** Documents expiring within this many days get an attention badge. */
export const EXPIRY_ATTENTION_DAYS = 60;
