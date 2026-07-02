// Room lifecycle over Firestore. One doc per game in onitama_rooms/<CODE>.
//
// The 6-character room code IS the doc id — create a room, share the code
// (or link), the other player joins by typing it. Identity is the anonymous
// Firebase auth uid; host always plays blue, guest always plays red, but the
// dealt set-aside card decides who moves first (authentic Onitama).
//
// Doc shape:
//   {
//     hostUid, hostName, guestUid: null|uid, guestName: null|name,
//     board: string[25],
//     blueCards: [k,k], redCards: [k,k], nextCard: k,
//     currentTurn: "blue"|"red",
//     status: "waiting" | "active" | "blue_wins" | "red_wins",
//     winBy: "" | "stone" | "stream" | "resign",
//     lastMove: null | { from, to, card },   // from/to = -1 for a forced pass
//     rematch: { blue: bool, red: bool },
//     createdAt, lastMoveAt,
//   }

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, increment,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { startingBoard, deal, eloDelta } from "./engine.js";

const COLL = "onitama_rooms";
const PLAYERS = "onitama_players";

// ── Elo ratings ──────────────────────────────────────────────────────────
// One doc per anonymous uid: { name, rating, wins, losses, updatedAt }.
// Both players' ratings are SNAPSHOTTED into the room when they sit down,
// so both clients compute the identical symmetric delta at game end; each
// player writes only their own doc (rules enforce that), and room.ratedBy
// keeps a finished game from being counted twice.

export async function getPlayer(uid) {
  if (!uid) return null;
  const s = await getDoc(doc(db, PLAYERS, uid));
  return s.exists() ? s.data() : null;
}

/** Fetch (or lazily create at 1000) my rating doc; keeps name current. */
async function ensurePlayer(uid, name) {
  const p = await getPlayer(uid);
  if (p) {
    if (p.name !== name) updateDoc(doc(db, PLAYERS, uid), { name }).catch(() => {});
    return { rating: p.rating ?? 1000, wins: p.wins || 0, losses: p.losses || 0 };
  }
  const fresh = { name, rating: 1000, wins: 0, losses: 0, updatedAt: Date.now() };
  await setDoc(doc(db, PLAYERS, uid), fresh);
  return fresh;
}

/**
 * Apply the finished game to MY rating (idempotent via room.ratedBy).
 * Returns my signed delta, or null if there was nothing to rate.
 */
export async function applyMyRating(room, mySide, myUid) {
  const over = room?.status === "blue_wins" || room?.status === "red_wins";
  if (!over || !mySide || !myUid) return null;
  if (room.blueRating == null || room.redRating == null) return null;  // pre-Elo game
  if (room.ratedBy?.[mySide]) return null;
  const iWon   = room.status === mySide + "_wins";
  const myPre  = mySide === "blue" ? room.blueRating : room.redRating;
  const oppPre = mySide === "blue" ? room.redRating  : room.blueRating;
  const d = eloDelta(iWon ? myPre : oppPre, iWon ? oppPre : myPre);
  const delta = iWon ? d : -d;
  await updateDoc(doc(db, COLL, room.code), { ["ratedBy." + mySide]: true });
  await setDoc(doc(db, PLAYERS, myUid), {
    name: mySide === "blue" ? room.hostName : room.guestName,
    rating: Math.max(100, myPre + delta),
    wins:   increment(iWon ? 1 : 0),
    losses: increment(iWon ? 0 : 1),
    updatedAt: Date.now(),
  }, { merge: true });
  return delta;
}

// No 0/O/1/I — codes get read aloud across a desk.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return c;
}

/** Create a room. Returns its code. */
export async function createRoom(myUid, myName) {
  const code = genCode();
  const hand = deal();
  const me = await ensurePlayer(myUid, myName);
  await setDoc(doc(db, COLL, code), {
    hostUid: myUid, hostName: myName,
    guestUid: null, guestName: null,
    blueRating: me.rating, redRating: null,
    ratedBy: { blue: false, red: false },
    board: startingBoard(),
    blueCards: hand.blueCards,
    redCards:  hand.redCards,
    nextCard:  hand.nextCard,
    currentTurn: hand.firstTurn,
    status: "waiting",
    winBy: "",
    lastMove: null,
    rematch: { blue: false, red: false },
    createdAt:  Date.now(),
    lastMoveAt: Date.now(),
  });
  return code;
}

/** Join a room by code. Throws with a friendly message on failure. */
export async function joinRoom(code, myUid, myName) {
  const ref = doc(db, COLL, code);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("No room with that code.");
  const room = snap.data();
  if (room.hostUid === myUid) return code;            // I'm the host — re-enter
  if (room.guestUid === myUid) return code;           // already joined — re-enter
  if (room.guestUid) throw new Error("That room is already full.");
  const me = await ensurePlayer(myUid, myName);
  await updateDoc(ref, {
    guestUid: myUid, guestName: myName,
    redRating: me.rating,
    status: "active",
    lastMoveAt: Date.now(),
  });
  return code;
}

/** Watch a room in real time. */
export function watchRoom(code, cb) {
  if (!code) return () => {};
  return onSnapshot(doc(db, COLL, code),
    snap => cb(snap.exists() ? { code: snap.id, ...snap.data() } : null),
    () => cb(null),
  );
}

/** Persist a completed turn (move or forced pass). Pre-validated by caller. */
export async function persistTurn(code, fields) {
  await updateDoc(doc(db, COLL, code), { ...fields, lastMoveAt: Date.now() });
}

/** Resign — the other side wins. */
export async function resignRoom(code, mySide) {
  await updateDoc(doc(db, COLL, code), {
    status: (mySide === "blue" ? "red" : "blue") + "_wins",
    winBy: "resign",
    lastMoveAt: Date.now(),
  });
}

/**
 * Vote for a rematch. When the second player votes, the same write performs
 * the redeal so the new game starts atomically.
 */
export async function voteRematch(code, mySide, otherAlreadyVoted, room) {
  const ref = doc(db, COLL, code);
  if (!otherAlreadyVoted) {
    await updateDoc(ref, { ["rematch." + mySide]: true });
    return;
  }
  // Second voter performs the redeal — re-snapshot both ratings so the new
  // game is rated from the post-game numbers.
  const [hp, gp] = await Promise.all([getPlayer(room?.hostUid), getPlayer(room?.guestUid)]);
  const hand = deal();
  await updateDoc(ref, {
    board: startingBoard(),
    blueCards: hand.blueCards,
    redCards:  hand.redCards,
    nextCard:  hand.nextCard,
    currentTurn: hand.firstTurn,
    blueRating: hp?.rating ?? 1000,
    redRating:  gp?.rating ?? 1000,
    ratedBy: { blue: false, red: false },
    status: "active",
    winBy: "",
    lastMove: null,
    rematch: { blue: false, red: false },
    lastMoveAt: Date.now(),
  });
}

/** Delete a room (either player, after the game ends). */
export async function deleteRoom(code) {
  await deleteDoc(doc(db, COLL, code));
}
