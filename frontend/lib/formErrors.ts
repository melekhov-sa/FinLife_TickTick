/**
 * Shared form validation utilities.
 * Used across all Create*Modal components for consistent error handling.
 *
 * Two layers:
 *  1. Zod schema validation (from api.generated.ts) — catches type/required mismatches
 *  2. Custom business rules — contextual validation (e.g., end_date >= start_date)
 */

import type { z } from "zod";

export type FieldErrors = Record<string, string>;

// ── Russian error labels for common Zod issues ──────────────────────────────

const ZOD_CODE_RU: Record<string, string> = {
  invalid_type: "Обязательное поле",
  too_small: "Слишком короткое значение",
  too_big: "Слишком длинное значение",
  invalid_string: "Некорректное значение",
};

// ── Zod schema validation ───────────────────────────────────────────────────

/**
 * Validate form data against a Zod schema.
 * Returns FieldErrors (empty object if valid).
 *
 * Usage:
 *   const errs = validateWithSchema(CreateTaskRequestSchema, formData);
 *   if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
 */
export function validateWithSchema<T extends z.ZodType>(
  schema: T,
  data: unknown,
): FieldErrors {
  const result = schema.safeParse(data);
  if (result.success) return {};

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (field != null && !errors[String(field)]) {
      errors[String(field)] = issue.message in ZOD_CODE_RU
        ? ZOD_CODE_RU[issue.message]
        : issue.message;
    }
  }
  return errors;
}

/**
 * Merge Zod validation errors with custom business rule errors.
 * Custom errors override Zod errors for the same field.
 */
export function mergeErrors(zodErrors: FieldErrors, custom: FieldErrors): FieldErrors {
  return { ...zodErrors, ...custom };
}

// ── Backend error parsing ───────────────────────────────────────────────────

/**
 * Parse backend response into field-level or general error.
 * FastAPI 422 returns { detail: [{ loc: [...], msg, type }] }.
 * Regular errors return { detail: "string" }.
 */
export function parseBackendErrors(
  status: number,
  data: unknown,
): { fieldErrors?: FieldErrors; message?: string } {
  const obj = data as Record<string, unknown> | null;

  // FastAPI 422 validation
  if (status === 422 && Array.isArray(obj?.detail)) {
    const fieldErrors: FieldErrors = {};
    for (const err of obj.detail as { loc?: string[]; msg?: string }[]) {
      const field = err.loc?.[err.loc.length - 1];
      if (field && err.msg) fieldErrors[field] = err.msg;
    }
    if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
    const first = (obj.detail as { msg?: string }[])[0];
    return { message: first?.msg ?? "Ошибка валидации" };
  }

  // Regular { detail: "..." }
  if (typeof obj?.detail === "string") return { message: obj.detail };

  return { message: "Произошла ошибка" };
}

// ── UI helpers ──────────────────────────────────────────────────────────────

/** Tailwind class appended to inputs with validation errors */
export const inputErrorBorder = "!border-red-500/50";

/** CSS class for inline error text below fields */
export const errTextCls = "text-[11px] text-red-400 mt-1";
