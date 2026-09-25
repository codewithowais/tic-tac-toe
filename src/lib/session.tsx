"use client";

import { useMutation } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type Session = {
  /** False until localStorage has been read, so we don't flash the wrong UI. */
  loaded: boolean;
  token: string;
  name: string;
  playerId: Id<"players"> | null;
  /** Milliseconds to add to Date.now() to get the server's clock. */
  clockOffset: number;
  saveName: (name: string) => Promise<Id<"players">>;
};

const SessionContext = createContext<Session | null>(null);

const TOKEN_KEY = "ttt.token";
const NAME_KEY = "ttt.name";

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode: the session lasts for this tab only.
  }
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const ensure = useMutation(api.players.ensure);
  const [loaded, setLoaded] = useState(false);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");
  const [playerId, setPlayerId] = useState<Id<"players"> | null>(null);
  const [clockOffset, setClockOffset] = useState(0);

  const register = useCallback(
    async (token: string, name: string) => {
      const sentAt = Date.now();
      const result = await ensure({ token, name });
      const receivedAt = Date.now();
      setClockOffset(result.now - (sentAt + receivedAt) / 2);
      setPlayerId(result.playerId);
      setName(result.name);
      return result.playerId;
    },
    [ensure],
  );

  useEffect(() => {
    let stored = readStorage(TOKEN_KEY);
    if (!stored) {
      stored = newToken();
      writeStorage(TOKEN_KEY, stored);
    }
    const storedName = readStorage(NAME_KEY) ?? "";
    // Reading localStorage has to happen after hydration, so this runs in an effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(stored);
    setName(storedName);
    setLoaded(true);
    if (storedName) register(stored, storedName).catch(() => {});
  }, [register]);

  const saveName = useCallback(
    async (next: string) => {
      const id = await register(token, next);
      writeStorage(NAME_KEY, next.trim());
      return id;
    },
    [register, token],
  );

  const value = useMemo(
    () => ({ loaded, token, name, playerId, clockOffset, saveName }),
    [loaded, token, name, playerId, clockOffset, saveName],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside SessionProvider");
  return session;
}
