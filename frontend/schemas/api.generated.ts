/**
 * AUTO-GENERATED from Pydantic models — 2026-03-18 19:32
 * Do not edit manually. Regenerate with:
 *   pnpm gen:api   (or: .venv/Scripts/python.exe scripts/gen_frontend_schemas.py)
 */

import { z } from "zod";

export const CreateTaskRequestSchema = z.object({
  title: z.string(),
  note: z.string().nullish(),
  due_kind: z.string().default("NONE"),
  due_date: z.string().nullish(),
  due_time: z.string().nullish(),
  category_id: z.number().int().nullish(),
});

export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;

export const CreateTaskRequestRequired: readonly string[] = ["title"] as const;

export const UpdateTaskRequestSchema = z.object({
  title: z.string().nullish(),
  note: z.string().nullish(),
  due_date: z.string().nullish(),
  category_id: z.number().int().nullish(),
});

export type UpdateTaskRequest = z.infer<typeof UpdateTaskRequestSchema>;

export const UpdateTaskRequestRequired: readonly string[] = [] as const;

export const CreateTransactionRequestSchema = z.object({
  operation_type: z.string(),
  amount: z.string(),
  description: z.string().default(""),
  wallet_id: z.number().int().nullish(),
  category_id: z.number().int().nullish(),
  from_wallet_id: z.number().int().nullish(),
  to_wallet_id: z.number().int().nullish(),
});

export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;

export const CreateTransactionRequestRequired: readonly string[] = ["amount", "operation_type"] as const;

export const CreateHabitRequestSchema = z.object({
  title: z.string(),
  freq: z.string().default("DAILY"),
  interval: z.number().int().default(1),
  start_date: z.string().nullish(),
  by_weekday: z.string().nullish(),
  by_monthday: z.number().int().nullish(),
  level: z.number().int().default(1),
  category_id: z.number().int().nullish(),
  note: z.string().nullish(),
  reminder_time: z.string().nullish(),
});

export type CreateHabitRequest = z.infer<typeof CreateHabitRequestSchema>;

export const CreateHabitRequestRequired: readonly string[] = ["title"] as const;

export const UpdateHabitRequestSchema = z.object({
  title: z.string().nullish(),
  note: z.string().nullish(),
  level: z.number().int().nullish(),
  category_id: z.number().int().nullish(),
  reminder_time: z.string().nullish(),
});

export type UpdateHabitRequest = z.infer<typeof UpdateHabitRequestSchema>;

export const UpdateHabitRequestRequired: readonly string[] = [] as const;

export const CreateEventRequestSchema = z.object({
  title: z.string(),
  start_date: z.string(),
  start_time: z.string().nullish(),
  end_date: z.string().nullish(),
  end_time: z.string().nullish(),
  description: z.string().nullish(),
  category_id: z.number().int().nullish(),
  freq: z.string().nullish(),
  start_date_rule: z.string().nullish(),
  reminder_offset: z.number().int().nullish(),
});

export type CreateEventRequest = z.infer<typeof CreateEventRequestSchema>;

export const CreateEventRequestRequired: readonly string[] = ["start_date", "title"] as const;

export const UpdateOccurrenceRequestSchema = z.object({
  title: z.string().nullish(),
  description: z.string().nullish(),
  start_date: z.string().nullish(),
  start_time: z.string().nullish(),
  end_date: z.string().nullish(),
  category_id: z.number().int().nullish(),
});

export type UpdateOccurrenceRequest = z.infer<typeof UpdateOccurrenceRequestSchema>;

export const UpdateOccurrenceRequestRequired: readonly string[] = [] as const;

/** Registry of all schemas for programmatic access */
export const API_SCHEMAS = {
  CreateTaskRequest: { schema: CreateTaskRequestSchema, required: CreateTaskRequestRequired },
  UpdateTaskRequest: { schema: UpdateTaskRequestSchema, required: UpdateTaskRequestRequired },
  CreateTransactionRequest: { schema: CreateTransactionRequestSchema, required: CreateTransactionRequestRequired },
  CreateHabitRequest: { schema: CreateHabitRequestSchema, required: CreateHabitRequestRequired },
  UpdateHabitRequest: { schema: UpdateHabitRequestSchema, required: UpdateHabitRequestRequired },
  CreateEventRequest: { schema: CreateEventRequestSchema, required: CreateEventRequestRequired },
  UpdateOccurrenceRequest: { schema: UpdateOccurrenceRequestSchema, required: UpdateOccurrenceRequestRequired }
} as const;
