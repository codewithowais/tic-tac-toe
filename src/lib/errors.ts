import { ConvexError } from "convex/values";

/** Turns a thrown Convex error into a message we can show the player. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  return "Something went wrong. Check your connection and try again.";
}
