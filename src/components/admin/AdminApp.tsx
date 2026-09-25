"use client";

import clsx from "clsx";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { weekKey } from "@convex/lib/stats";
import { errorMessage } from "@/lib/errors";
import { Segmented } from "../Segmented";
import { useToast } from "../Toast";
import { Button, Spinner } from "../ui";

const SESSION_KEY = "ttt.admin";

function readSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(value: string | null) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

export function AdminApp() {
  const [session, setSession] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // sessionStorage is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(readSession());
  }, []);

  function signIn(token: string) {
    writeSession(token);
    setSession(token);
  }

  function signOut() {
    writeSession(null);
    setSession(null);
  }

  if (session === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  return session ? <Dashboard session={session} onSignOut={signOut} /> : <Login onSignIn={signIn} />;
}

function Login({ onSignIn }: { onSignIn: (token: string) => void }) {
  const login = useAction(api.admin.login);
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!passcode) return;
    setBusy(true);
    setError(null);
    try {
      onSignIn(await login({ passcode }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 pb-24">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin</h1>
          <p className="mt-1 text-sm text-muted">Enter the admin passcode to manage rooms, players and the leaderboard.</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">Passcode</span>
          <input
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="h-12 rounded-xl border border-line bg-bg px-4 text-base outline-none transition focus:border-focus"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-[var(--seat-1)]">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy || !passcode}>
          {busy && <Spinner />}
          Log in
        </Button>
      </form>
    </main>
  );
}

function Dashboard({ session, onSignOut }: { session: string; onSignOut: () => void }) {
  const overview = useQuery(api.admin.overview, { session });
  const logout = useMutation(api.admin.logout);
  const toast = useToast();

  // The server returns null once the session has expired.
  useEffect(() => {
    if (overview === null) {
      toast("Your admin session has expired. Log in again.");
      onSignOut();
    }
  }, [overview, onSignOut, toast]);

  if (!overview) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 pb-16 pt-2 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Admin</h1>
        <Button
          variant="secondary"
          onClick={() => {
            void logout({ session });
            onSignOut();
          }}
        >
          Log out
        </Button>
      </div>

      <Section title="Overview">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Rooms" value={overview.rooms} />
          <Stat label="Playing now" value={overview.playing} />
          <Stat label="Idle over a day" value={overview.idle} />
          <Stat label="Players" value={overview.players} />
          <Stat label="Games today" value={overview.gamesToday} />
          <Stat label="Games this week" value={overview.gamesThisWeek} />
        </div>
        <p className="mt-3 text-sm text-muted">
          Free-plan usage (function calls, storage) is on your{" "}
          <a
            href="https://dashboard.convex.dev"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink underline underline-offset-2"
          >
            Convex dashboard
          </a>{" "}
          under Settings, Usage.
        </p>
      </Section>

      <RoomsSection session={session} />
      <PlayersSection session={session} />
      <ResetSection session={session} />
    </main>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-2xl font-bold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="font-display text-3xl font-bold tabular-nums">{value.toLocaleString()}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

/** A button that needs a second click within 4 seconds to run. */
function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Click again to confirm",
  disabled,
}: {
  onConfirm: () => Promise<unknown>;
  children: ReactNode;
  confirmLabel?: string;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function click() {
    if (!armed) {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    setArmed(false);
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={disabled || busy}
      className={clsx(
        "inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:opacity-40",
        armed
          ? "bg-[var(--seat-1)] text-white"
          : "border border-line text-[var(--seat-1)] hover:bg-[color-mix(in_srgb,var(--seat-1)_10%,transparent)]",
      )}
    >
      {busy && <Spinner />}
      {armed ? confirmLabel : children}
    </button>
  );
}

function timeAgo(ms: number) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

const STATUS_LABEL = { lobby: "Waiting", playing: "Playing", finished: "Round over" } as const;

function RoomsSection({ session }: { session: string }) {
  const rooms = useQuery(api.admin.rooms, { session });
  const deleteRoom = useMutation(api.admin.deleteRoomById);
  const deleteIdle = useMutation(api.admin.deleteIdleRooms);
  const toast = useToast();
  const [days, setDays] = useState(7);

  return (
    <Section title="Rooms">
      <div className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-4 sm:flex-row sm:items-center">
        <span className="text-sm font-medium">Delete rooms with no activity for more than</span>
        <div className="w-full sm:w-64">
          <Segmented
            id="idle-days"
            label="Days idle"
            size="sm"
            value={days}
            onChange={setDays}
            options={[1, 3, 7, 30].map((d) => ({ value: d, label: `${d} ${d === 1 ? "day" : "days"}` }))}
          />
        </div>
        <ConfirmButton
          onConfirm={() =>
            deleteIdle({ session, days })
              .then((r) =>
                toast(
                  r.deleted === 0
                    ? "No rooms were that old"
                    : `Deleted ${r.deleted} ${r.deleted === 1 ? "room" : "rooms"}${r.more ? ", more are being deleted in the background" : ""}`,
                ),
              )
              .catch((e) => toast(errorMessage(e)))
          }
        >
          Delete old rooms
        </ConfirmButton>
      </div>

      {rooms === undefined ? (
        <Spinner />
      ) : rooms === null || rooms.length === 0 ? (
        <p className="text-muted">No rooms right now.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2 text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Game</th>
                <th className="px-4 py-2.5 font-medium">Players</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Last activity</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rooms.map((r) => (
                <tr key={r._id} className="border-t border-line">
                  <td className="px-4 py-2.5">
                    <Link href={`/r/${r.code}`} className="font-display font-bold tracking-[0.12em] hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {r.settings.size}×{r.settings.size}, {r.settings.maxPlayers} players
                  </td>
                  <td className="px-4 py-2.5">
                    {r.players.length === 0
                      ? <span className="text-muted">Empty</span>
                      : r.players.map((p) => (p.bot ? `${p.name} (computer)` : p.name)).join(", ")}
                  </td>
                  <td className="px-4 py-2.5">{STATUS_LABEL[r.status]}</td>
                  <td className="px-4 py-2.5 text-muted">{timeAgo(r.updatedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <ConfirmButton
                      confirmLabel="Delete?"
                      onConfirm={() =>
                        deleteRoom({ session, roomId: r._id })
                          .then(() => toast(`Deleted room ${r.code}`))
                          .catch((e) => toast(errorMessage(e)))
                      }
                    >
                      Delete
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

function PlayersSection({ session }: { session: string }) {
  const [search, setSearch] = useState("");
  const players = useQuery(api.admin.players, { session, search });
  const rename = useMutation(api.admin.renamePlayer);
  const remove = useMutation(api.admin.removePlayer);
  const toast = useToast();
  const [editing, setEditing] = useState<{ id: Id<"players">; name: string } | null>(null);

  async function saveRename(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await rename({ session, playerId: editing.id, name: editing.name });
      toast("Nickname changed");
      setEditing(null);
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  return (
    <Section
      title="Players"
      action={
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by nickname"
          aria-label="Search players by nickname"
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm outline-none focus:border-focus sm:w-64"
        />
      }
    >
      <p className="-mt-2 text-sm text-muted">
        Renaming updates the leaderboard and any room they&rsquo;re in. Removing deletes their stats, and their browser has to pick
        a new nickname.
      </p>
      {players === undefined ? (
        <Spinner />
      ) : !players || players.length === 0 ? (
        <p className="text-muted">{search ? "No players match that name." : "No players yet."}</p>
      ) : (
        <ul className="flex flex-col rounded-2xl border border-line">
          {players.map((p) => (
            <li key={p._id} className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
              {editing?.id === p._id ? (
                <form onSubmit={saveRename} className="flex flex-1 flex-wrap items-center gap-2">
                  <input
                    autoFocus
                    value={editing.name}
                    maxLength={20}
                    onChange={(e) => setEditing({ id: p._id, name: e.target.value })}
                    aria-label={`New nickname for ${p.name}`}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-focus"
                  />
                  <Button type="submit">Save</Button>
                  <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.wins} {p.wins === 1 ? "win" : "wins"} from {p.games} {p.games === 1 ? "game" : "games"}, joined{" "}
                      {timeAgo(p.joinedAt)}
                    </div>
                  </div>
                  <Button variant="secondary" onClick={() => setEditing({ id: p._id, name: p.name })}>
                    Rename
                  </Button>
                  <ConfirmButton
                    confirmLabel="Remove?"
                    onConfirm={() =>
                      remove({ session, playerId: p._id })
                        .then(() => toast(`Removed ${p.name}`))
                        .catch((e) => toast(errorMessage(e)))
                    }
                  >
                    Remove
                  </ConfirmButton>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ResetSection({ session }: { session: string }) {
  const reset = useMutation(api.admin.resetLeaderboard);
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const ready = typed === "RESET";

  async function run(period: string, label: string) {
    try {
      await reset({ session, period });
      toast(`${label} leaderboard cleared`);
      setTyped("");
    } catch (e) {
      toast(errorMessage(e));
    }
  }

  return (
    <Section title="Leaderboard">
      <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
        <p className="text-sm text-muted">
          Clearing a leaderboard deletes its wins for everyone and can&rsquo;t be undone. Type RESET to enable the buttons.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="RESET"
            aria-label="Type RESET to confirm"
            className="h-9 w-32 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-focus"
          />
          <ConfirmButton disabled={!ready} onConfirm={() => run(weekKey(Date.now()), "This week's")}>
            Clear this week
          </ConfirmButton>
          <ConfirmButton disabled={!ready} onConfirm={() => run("all", "All-time")}>
            Clear all time
          </ConfirmButton>
        </div>
      </div>
    </Section>
  );
}
