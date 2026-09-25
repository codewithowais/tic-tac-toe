// Admin session helpers.
import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

export const SESSION_MS = 12 * 60 * 60 * 1000;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
export const LOCKOUT_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 5;

export async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares two equal-length strings without exiting early, so timing doesn't leak how much matched. */
export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** True if `session` is a live admin session token. */
export async function isAdmin(ctx: QueryCtx, session: string) {
  if (!session) return false;
  const tokenHash = await sha256Hex(session);
  const row = await ctx.db
    .query("adminSessions")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  return row !== null && row.expiresAt > Date.now();
}

export async function requireAdmin(ctx: QueryCtx, session: string) {
  if (!(await isAdmin(ctx, session))) throw new ConvexError("Your admin session has expired. Log in again.");
}
