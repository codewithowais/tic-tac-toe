"use client";

import { useEffect, useRef } from "react";
import { useSession } from "./session";
import { buzz, sounds } from "./sound";
import { speak, turnPhrase } from "./speech";

const HURRY_SECONDS = 5;

/**
 * A chime, a buzz on phones and a spoken "Owais, it's your turn" when the turn
 * passes to you, plus a soft tick for each of your last 5 seconds.
 * Nothing plays for the state a page opens in.
 */
export function useTurnAlerts(myTurn: boolean, turnEndsAt: number | null) {
  const { clockOffset, name } = useSession();
  const wasMyTurn = useRef(myTurn);

  useEffect(() => {
    const becameMine = myTurn && !wasMyTurn.current;
    wasMyTurn.current = myTurn;
    if (!becameMine) return;
    // Wait for the opponent's move sound to finish so the two don't overlap,
    // then say the player's name once the chime has rung out.
    const chime = setTimeout(() => {
      sounds.yourTurn();
      buzz([40, 60, 40]);
    }, 180);
    const voice = setTimeout(() => speak(turnPhrase(name)), 600);
    return () => {
      clearTimeout(chime);
      clearTimeout(voice);
    };
    // `name` is read when the turn changes; renaming mid-turn shouldn't re-announce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);

  useEffect(() => {
    if (!myTurn || !turnEndsAt) return;
    // One timer per tick (at 5, 4, 3, 2 and 1 seconds left) rather than polling,
    // because browsers slow down intervals in background tabs.
    const now = Date.now() + clockOffset;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let left = HURRY_SECONDS; left >= 1; left--) {
      const delay = turnEndsAt - left * 1000 - now;
      if (delay < -250) continue; // already past this tick
      const urgency = (HURRY_SECONDS - left) / (HURRY_SECONDS - 1);
      timers.push(setTimeout(() => sounds.tick(urgency), Math.max(0, delay)));
    }
    return () => timers.forEach(clearTimeout);
  }, [myTurn, turnEndsAt, clockOffset]);
}
