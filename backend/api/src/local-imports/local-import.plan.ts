import { ApiException } from "../api/api-exception.js";

export const LOCAL_IMPORT_PLAN_VERSION = "aha_local_import_plan_v1" as const;
export const LOCAL_IMPORT_SOURCE_KIND = "aha_local_backup" as const;
export const LOCAL_IMPORT_SOURCE_VERSION = "v1" as const;

export const PLAN_ARRAY_KEYS = Object.freeze([
  "conversations",
  "messages",
  "sourceEvents",
  "insights",
  "conceptLists",
  "conceptListItems",
  "knowledgePaths",
  "knowledgePathSteps",
  "articles",
  "articleReferences"
] as const);

export type PlanArrayKey = (typeof PLAN_ARRAY_KEYS)[number];
export type LocalImportCounts = Record<PlanArrayKey | "total", number>;

const ROOT_KEYS = new Set<string>([
  "version",
  "sourceKind",
  "sourceVersion",
  ...PLAN_ARRAY_KEYS
]);

export function validateLocalImportPlan(plan: Record<string, unknown>, maxObjects: number): LocalImportCounts {
  const extra = Object.keys(plan).filter((key) => !ROOT_KEYS.has(key));
  if (extra.length) throw invalidPlan(`Unsupported plan keys: ${extra.join(",")}`);
  if (plan.version !== LOCAL_IMPORT_PLAN_VERSION) throw invalidPlan("Unsupported import plan version");
  if (plan.sourceKind !== LOCAL_IMPORT_SOURCE_KIND || plan.sourceVersion !== LOCAL_IMPORT_SOURCE_VERSION) {
    throw invalidPlan("Unsupported local import source");
  }

  const counts = {} as LocalImportCounts;
  let total = 0;
  for (const key of PLAN_ARRAY_KEYS) {
    const rows = plan[key];
    if (!Array.isArray(rows)) throw invalidPlan(`${key} must be an array`);
    if (rows.length > maxObjects) throw invalidPlan(`${key} exceeds the import object limit`);
    counts[key] = rows.length;
    total += rows.length;
    for (const row of rows) validateRow(key, row);
  }
  if (total > maxObjects) throw invalidPlan("Import plan exceeds the total object limit");
  counts.total = total;
  return Object.freeze({ ...counts });
}

function validateRow(key: PlanArrayKey, value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidPlan(`${key} contains an invalid row`);
  const row = value as Record<string, unknown>;
  requireId(row.id, `${key}.id`);
  if (key === "messages") requireId(row.conversationId, "messages.conversationId");
  if (key === "conceptListItems") requireId(row.listId, "conceptListItems.listId");
  if (key === "knowledgePathSteps") requireId(row.pathId, "knowledgePathSteps.pathId");
  if (key === "articleReferences") requireId(row.articleId, "articleReferences.articleId");

  for (const field of ["title", "content", "sourceText", "insightText", "body"] as const) {
    if (typeof row[field] === "string" && row[field].length > 2_000_000) throw invalidPlan(`${key}.${field} is too large`);
  }
}

function requireId(value: unknown, label: string): void {
  const id = String(value ?? "").trim();
  if (!id || id.length > 240) throw invalidPlan(`${label} is required and must be at most 240 characters`);
}

function invalidPlan(detail: string): ApiException {
  return new ApiException(400, "IMPORT_PLAN_INVALID", "The local import plan is invalid", { detail });
}
