import { z } from "zod";

export const CalendarRepeatFrequencyEnum = z.enum([
  "NONE",
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
]);

export const CalendarRecipientInputSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  reminderEnabled: z.boolean().default(true),
  reminderOffsetMins: z.number().int().min(0).max(10080).default(0), // max 7 days in minutes
});

const eventFields = {
  name: z.string().trim().min(1, "Event title is required").max(200, "Title is too long (max 200)"),
  detail: z.string().trim().max(2000, "Detail is too long (max 2000)").optional().nullable(),
  departmentId: z.string().min(1, "Department is required"),
  allDay: z.boolean().default(false),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1).max(100).default("Asia/Bangkok").refine((value) => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true; } catch { return false; }
  }, "Invalid timezone"),
  repeatFrequency: CalendarRepeatFrequencyEnum.default("NONE"),
  repeatUntil: z.string().datetime({ offset: true }).optional().nullable(),
  tagIds: z.array(z.string().min(1)).max(20).default([]),
  recipients: z.array(CalendarRecipientInputSchema).max(100).default([]),
};

function validateEventDates(
  data: { startAt: string; endAt: string; repeatUntil?: string | null; tagIds: string[]; recipients: Array<{ userId: string; reminderEnabled: boolean; reminderOffsetMins: number }> },
  ctx: z.RefinementCtx
) {
  const start = Date.parse(data.startAt);
  const end = Date.parse(data.endAt);
  if (end <= start) ctx.addIssue({ code: "custom", message: "End time must be after start time", path: ["endAt"] });
  if (data.repeatUntil && Date.parse(data.repeatUntil) < start) {
    ctx.addIssue({ code: "custom", message: "Repeat end must not be before start", path: ["repeatUntil"] });
  }
  if (new Set(data.tagIds).size !== data.tagIds.length) ctx.addIssue({ code: "custom", message: "Duplicate tags are not allowed", path: ["tagIds"] });
  const userIds = data.recipients.map((recipient) => recipient.userId);
  if (new Set(userIds).size !== userIds.length) ctx.addIssue({ code: "custom", message: "Duplicate recipients are not allowed", path: ["recipients"] });
  const reminderSchedules = new Set(data.recipients.map((recipient) => `${recipient.reminderEnabled}:${recipient.reminderOffsetMins}`));
  if (reminderSchedules.size > 1) ctx.addIssue({ code: "custom", message: "All recipients must use the same event reminder", path: ["recipients"] });
}

export const createCalendarEventSchema = z.object({
    ...eventFields,
    idempotencyKey: z.string().min(1, "Idempotency key is required").max(128),
  }).superRefine(validateEventDates);

export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;

export const updateCalendarEventSchema = z.object({
    id: z.string().min(1, "Event ID is required"),
    expectedRevision: z.number().int().min(1, "Expected revision is required"),
    ...eventFields,
    mutationId: z.string().min(1).max(128).optional(),
  }).superRefine(validateEventDates);

export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;

export const deleteCalendarEventSchema = z.object({
  id: z.string().min(1, "Event ID is required"),
  expectedRevision: z.number().int().min(1).optional(),
  mutationId: z.string().min(1).max(128).optional(),
});

export type DeleteCalendarEventInput = z.infer<typeof deleteCalendarEventSchema>;

export const createCalendarTagSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required").max(50, "Tag name is too long"),
  color: z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a valid hex color code"),
  departmentId: z.string().min(1, "Department ID is required"),
});

export type CreateCalendarTagInput = z.infer<typeof createCalendarTagSchema>;
