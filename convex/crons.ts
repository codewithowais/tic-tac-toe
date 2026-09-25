import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily("delete idle rooms", { hourUTC: 3, minuteUTC: 0 }, internal.rooms.cleanupIdle);

export default crons;
