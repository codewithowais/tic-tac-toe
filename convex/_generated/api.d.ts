/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as crons from "../crons.js";
import type * as game from "../game.js";
import type * as leaderboard from "../leaderboard.js";
import type * as lib_admin from "../lib/admin.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_bot from "../lib/bot.js";
import type * as lib_cleanup from "../lib/cleanup.js";
import type * as lib_game from "../lib/game.js";
import type * as lib_merge from "../lib/merge.js";
import type * as lib_players from "../lib/players.js";
import type * as lib_rounds from "../lib/rounds.js";
import type * as lib_stats from "../lib/stats.js";
import type * as players from "../players.js";
import type * as presence from "../presence.js";
import type * as reactions from "../reactions.js";
import type * as rooms from "../rooms.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  crons: typeof crons;
  game: typeof game;
  leaderboard: typeof leaderboard;
  "lib/admin": typeof lib_admin;
  "lib/auth": typeof lib_auth;
  "lib/bot": typeof lib_bot;
  "lib/cleanup": typeof lib_cleanup;
  "lib/game": typeof lib_game;
  "lib/merge": typeof lib_merge;
  "lib/players": typeof lib_players;
  "lib/rounds": typeof lib_rounds;
  "lib/stats": typeof lib_stats;
  players: typeof players;
  presence: typeof presence;
  reactions: typeof reactions;
  rooms: typeof rooms;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
};
