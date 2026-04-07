import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  registrations: defineTable({
    email: v.string(),
    normalizedEmail: v.string(),
    registeredAt: v.number(),
    source: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  }).index("by_normalized_email", ["normalizedEmail"]),

  contactMessages: defineTable({
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    message: v.optional(v.string()),
    source: v.string(),
    submittedAt: v.number(),
    status: v.optional(v.string()), // 'new', 'contacted', 'qualified', 'closed'
    notes: v.optional(v.string()),
  })
    .index("by_email", ["email"])
    .index("by_submitted", ["submittedAt"])
    .index("by_status", ["status"]),
});
