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
  doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase.js";
import { startingBoard, deal } from "./engine.js";

const COLL = "onitama_rooms";

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
  await setDoc(doc(db, COLL, code), {
    hostUid: myUid, hostName: myName,
    guestUid: null, guestName: null,
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
  await updateDoc(ref, {
    guestUid: myUid, guestName: myName,
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
export async function voteRematch(code, mySide, otherAlreadyVoted) {
  const ref = doc(db, COLL, code);
  if (!otherAlreadyVoted) {
    await updateDoc(ref, { ["rematch." + mySide]: true });
    return;
  }
  const hand = deal();
  await updateDoc(ref, {
    board: startingBoard(),
    blueCards: hand.blueCards,
    redCards:  hand.redCards,
    nextCard:  hand.nextCard,
    currentTurn: hand.firstTurn,
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
