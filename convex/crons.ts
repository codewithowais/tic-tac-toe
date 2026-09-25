import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("delete idle rooms", { hourUTC: 3, minuteUTC: 0 }, internal.rooms.cleanupIdle);
crons.daily("prune old leaderboard weeks and admin sessions", { hourUTC: 3, minuteUTC: 15 }, internal.leaderboard.prune);

export default crons;
