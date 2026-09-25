import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type RoomState = NonNullable<FunctionReturnType<typeof api.rooms.get>>;
