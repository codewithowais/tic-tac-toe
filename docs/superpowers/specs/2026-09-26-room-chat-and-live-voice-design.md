# Room Chat and Live Voice — Design

**Date:** 2026-09-26 · **Status:** Approved (voice messages dropped; admin stays passcode-only)

Both stay on free plans: chat is a Convex table; live voice is peer-to-peer WebRTC with Google's free public STUN
servers, and Convex only carries the small connection-setup messages.

## Text chat

- Everyone in a room (players and spectators) can chat. Messages are 1–200 characters, one per second per person.
- `messages` table: `roomId`, `playerId`, `name`, `text`, `createdAt`; indexes by room+time and room+player+time.
  `chat.send` validates and rate-limits; `chat.list` returns the latest 50. Deleted with the room.
- UI: a panel beside the board on wide screens; on phones a 💬 button with an unread badge opens a bottom sheet.
  Own messages right-aligned, names in the sender's seat colour, relative times.

## Live voice

- "Join voice" in the room; up to 4 people at once (players or spectators). Mute toggle; a ring on the player card
  (and in the voice bar) shows who's talking. Joining without a microphone (or with permission denied) joins as a listener.
- Mesh: each member connects directly to each other member. The newer member sends the offer, so there's never a clash.
- `voiceMembers` table: `roomId`, `playerId`, `name`, `muted`, `joinedAt`. `voice.join`, `voice.leave`, `voice.setMuted`.
  Members whose presence goes offline are ignored by clients; leaving the room or closing the tab calls `voice.leave`
  (sendBeacon on unload).
- `voiceSignals` table: `roomId`, `from`, `to`, `kind` (offer / answer / ice), `payload`, `createdAt`.
  `voice.signal` sends one; `voice.inbox` (by recipient token) streams them; `voice.ack` deletes handled ones.
  Leftover signals are deleted with the room and by the daily cleanup.
- If a connection fails (a network blocking direct connections), that peer shows "Can't connect". A TURN relay
  (Cloudflare free tier) can be added later without changing the design.

## Testing

`convex-test` for chat validation, rate limit, ordering, room cleanup; voice join/leave/limit, signal routing
(only the recipient can read and ack), cleanup. Live site: chat end-to-end; voice join/listener flow and signalling.
Two-person audio needs two real devices, so the owner confirms that with a friend.
