import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const submit = mutation({
  args: {
    name: v.string(),
    email: v.string(),
    organization: v.optional(v.string()),
    message: v.optional(v.string()),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const submittedAt = Date.now();
    
    const messageId = await ctx.db.insert("contactMessages", {
      name: args.name,
      email: args.email.toLowerCase().trim(),
      organization: args.organization,
      message: args.message,
      source: args.source,
      submittedAt,
      status: "new",
    });

    return { id: messageId, submittedAt };
  },
});

export const list = query({
  args: {
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    
    let query = ctx.db.query("contactMessages");
    
    if (args.status) {
      query = query.withIndex("by_status", (q) => q.eq("status", args.status));
    } else {
      query = query.withIndex("by_submitted");
    }
    
    const messages = await query
      .order("desc")
      .take(limit);
    
    return messages;
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("contactMessages"),
    status: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      status: args.status,
      notes: args.notes,
    });
    
    return { success: true };
  },
});

export const getByEmail = query({
  args: {
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("contactMessages")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase().trim()))
      .collect();
    
    return messages;
  },
});
