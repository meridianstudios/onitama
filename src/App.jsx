// Onitama — live online duel. Landing → create/join a room → play.
//
// Identity: anonymous Firebase auth (no accounts). The room code doubles as
// a shareable link: onitama.example.com/#KQ3XVB. Host plays blue, guest
// plays red; the dealt set-aside card decides who moves first.

import { useState, useEffect, useMemo } from "react";
import { ensureAuth } from "./firebase.js";
import {
  CARDS, movesFor, sideHasAnyMove, applyMove,
} from "./lib/engine.js";
import {
  createRoom, joinRoom, watchRoom, persistTurn, resignRoom, voteRematch, deleteRoom,
} from "./lib/rooms.js";
import { Torii, Piece, MoveCard, Board } from "./components.jsx";

const SIDE_COLOR = { blue: "var(--blue)", red: "var(--red)" };

function hashCode() {
  const h = window.location.hash.replace("#", "").trim().toUpperCase();
  return /^[A-Z2-9]{6}$/.test(h) ? h : "";
}

export function App() {
  const [uid, setUid] = useState(null);
  const [authErr, setAuthErr] = useState("");
  const [roomCode, setRoomCode] = useState(null);

  useEffect(() => {
    ensureAuth().then(setUid).catch(e => setAuthErr(e?.message || "Could not connect."));
  }, []);

  // Deep link: #CODE in the URL drops you straight into the join flow.
  useEffect(() => {
    const onHash = () => { const c = hashCode(); if (c) setRoomCode(null); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (!roomCode) {
    return <Landing uid={uid} authErr={authErr}
      onEnter={code => { setRoomCode(code); window.location.hash = code; }} />;
  }
  return <Room uid={uid} code={roomCode}
    onLeave={() => { setRoomCode(null); window.location.hash = ""; }} />;
}

// ── Landing: name + create / join ────────────────────────────────────────
function Landing({ uid, authErr, onEnter }) {
  const [name, setName] = useState(() => localStorage.getItem("oni_name") || "");
  const [code, setCode] = useState(hashCode());
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const lastRoom = localStorage.getItem("oni_room") || "";
  const ready = uid && name.trim().length >= 2;

  function remember() {
    localStorage.setItem("oni_name", name.trim());
  }
  async function doCreate() {
    if (!ready || busy) return;
    remember(); setBusy("create"); setErr("");
    try {
      const c = await createRoom(uid, name.trim());
      localStorage.setItem("oni_room", c);
      onEnter(c);
    } catch (e) { setErr(friendly(e)); }
    setBusy("");
  }
  async function doJoin(target) {
    const c = (target || code).trim().toUpperCase();
    if (!ready || !c || busy) return;
    remember(); setBusy("join"); setErr("");
    try {
      await joinRoom(c, uid, name.trim());
      localStorage.setItem("oni_room", c);
      onEnter(c);
    } catch (e) { setErr(friendly(e)); }
    setBusy("");
  }

  return (
    <div className="landing">
      <span className="torii"><Torii size={54} /></span>
      <h1>Onitama</h1>
      <div className="tag">a duel of five cards</div>
      <div className="panel">
        <input className="field" maxLength={20} placeholder="Your name"
          value={name} onChange={e => setName(e.target.value)} />
        <button className="btn primary" disabled={!ready || !!busy} onClick={doCreate}>
          {busy === "create" ? "Creating…" : "Create a room"}
        </button>
        <div className="divider">or join one</div>
        <div style={{ display: "flex", gap: 9 }}>
          <input className="field code" maxLength={6} placeholder="CODE"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") doJoin(); }} />
          <button className="btn ghost" style={{ flexShrink: 0 }}
            disabled={!ready || code.trim().length !== 6 || !!busy}
            onClick={() => doJoin()}>
            {busy === "join" ? "…" : "Join"}
          </button>
        </div>
        {err && <div className="err">{err}</div>}
        {authErr && <div className="err">{authErr}</div>}
        {lastRoom && !err && (
          <button className="btn ghost" style={{ fontSize: 13 }}
            disabled={!ready} onClick={() => doJoin(lastRoom)}>
            ↩ Return to game {lastRoom}
          </button>
        )}
      </div>
      <div className="footnote">Onitama board game by Shimpei Sato · fan-made online table</div>
    </div>
  );
}

function friendly(e) {
  const m = e?.message || "";
  if (m.includes("permission") || m.includes("insufficient")) {
    return "The server refused — rules not deployed yet?";
  }
  return m || "Something went wrong.";
}

// ── Room: waiting screen or live game ────────────────────────────────────
function Room({ uid, code, onLeave }) {
  const [room, setRoom] = useState(undefined);   // undefined = loading
  useEffect(() => watchRoom(code, setRoom), [code]);

  if (room === undefined) {
    return <div className="waiting"><div className="label">Connecting…</div></div>;
  }
  if (room === null) {
    return (
      <div className="waiting">
        <div className="label">Room not found</div>
        <div className="hint">It may have been deleted after the game ended.</div>
        <button className="btn ghost" onClick={() => { localStorage.removeItem("oni_room"); onLeave(); }}>← Back</button>
      </div>
    );
  }
  if (room.status === "waiting") {
    return <Waiting room={room} uid={uid} onLeave={onLeave} />;
  }
  return <Game room={room} uid={uid} onLeave={onLeave} />;
}

function Waiting({ room, uid, onLeave }) {
  const [copied, setCopied] = useState(false);
  const link = window.location.origin + window.location.pathname + "#" + room.code;
  const isHost = room.hostUid === uid;
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  }
  return (
    <div className="waiting">
      <span style={{ color: "var(--vermillion)", marginBottom: 14 }}><Torii size={40} /></span>
      <div className="label">Room code</div>
      <div className="code">{room.code}</div>
      <div className="hint"><span className="pulse" />waiting for a challenger…</div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn primary" onClick={copy}>{copied ? "Copied ✓" : "Copy invite link"}</button>
        {isHost && <button className="btn ghost" onClick={async () => { await deleteRoom(room.code); localStorage.removeItem("oni_room"); onLeave(); }}>Cancel</button>}
      </div>
    </div>
  );
}

// ── The live game ─────────────────────────────────────────────────────────
function Game({ room, uid, onLeave }) {
  const mySide  = room.hostUid === uid ? "blue" : room.guestUid === uid ? "red" : null;  // null = spectator
  const oppSide = mySide === "red" ? "blue" : "red";
  const nameOf  = side => (side === "blue" ? room.hostName : room.guestName) || "?";
  const board   = room.board || [];
  const myCards  = (mySide === "red" ? room.redCards : room.blueCards) || [];
  const oppCards = (mySide === "red" ? room.blueCards : room.redCards) || [];
  const isMyTurn = mySide && room.status === "active" && room.currentTurn === mySide;

  const [selCard, setSelCard] = useState(null);
  const [selPiece, setSelPiece] = useState(null);
  const [pendingPass, setPendingPass] = useState(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setSelCard(null); setSelPiece(null); setPendingPass(null); }, [room.lastMoveAt, room.status]);

  const stuck = isMyTurn && board.length === 25 && !sideHasAnyMove(board, mySide, myCards);
  const legal = useMemo(
    () => (isMyTurn && selCard && selPiece != null) ? movesFor(board, mySide, selCard, selPiece) : [],
    [board, mySide, selCard, selPiece, isMyTurn],
  );

  function swapCards(played) {
    const kept = myCards.filter(c => c !== played);
    return {
      [mySide + "Cards"]: [...kept, room.nextCard],
      nextCard: played,
      currentTurn: oppSide,
    };
  }
  function doMove(to) {
    const { board: nb, status, winBy } = applyMove(board, mySide, selPiece, to);
    persistTurn(room.code, {
      board: nb, ...swapCards(selCard), status, winBy,
      lastMove: { from: selPiece, to, card: selCard },
    });
  }
  function doPass(cardKey) {
    persistTurn(room.code, {
      ...swapCards(cardKey),
      lastMove: { from: -1, to: -1, card: cardKey },
    });
  }
  function onCardClick(c) {
    if (!isMyTurn) return;
    if (stuck) { setPendingPass(c); return; }
    setSelCard(c === selCard ? null : c);
  }
  function onSquare(idx) {
    if (!isMyTurn || stuck) return;
    const piece = board[idx];
    if (selCard && selPiece != null && legal.includes(idx)) { doMove(idx); return; }
    if (piece && piece[0] === mySide[0]) { setSelPiece(idx === selPiece ? null : idx); return; }
    setSelPiece(null);
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(window.location.origin + window.location.pathname + "#" + room.code);
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  const over = room.status === "blue_wins" || room.status === "red_wins";
  const iWon = over && room.status === mySide + "_wins";
  const myVote = mySide && room.rematch?.[mySide];
  const oppVote = mySide && room.rematch?.[oppSide];
  const votes = (room.rematch?.blue ? 1 : 0) + (room.rematch?.red ? 1 : 0);

  const playerLine = (side, isMe) => (
    <div className="playerline" style={{ transform: side === oppSide && !mySide ? undefined : undefined }}>
      <span className="dot" style={{ background: SIDE_COLOR[side] }} />
      <span>{nameOf(side)}</span>
      {isMe && <span className="you">YOU</span>}
      {room.status === "active" && room.currentTurn === side && <span className="tomove">● to move</span>}
    </div>
  );

  return (
    <div className="game">
      <div className="topbar">
        <span className="brand"><Torii size={22} />Onitama</span>
        <span style={{ flex: 1 }} />
        <button className="chip click" onClick={copyCode} title="Copy invite link">
          {copied ? "COPIED ✓" : room.code}
        </button>
        <button className="chip click" onClick={() => { if (over) localStorage.removeItem("oni_room"); onLeave(); }}>LEAVE</button>
      </div>

      <div className="arena">
        <div className="boardcol">
          {playerLine(oppSide, false)}
          <div className="hand opp">
            {oppCards.map(c => <MoveCard key={c} cardKey={c} small dimmed />)}
          </div>
          <Board board={board} mySide={mySide || "blue"} legal={legal}
            selectedPiece={selPiece} lastMove={room.lastMove}
            disabled={!isMyTurn || stuck} onSquare={onSquare} />
          <div className="hand">
            {myCards.map(c => (
              <MoveCard key={c} cardKey={c}
                selected={selCard === c}
                dimmed={!isMyTurn}
                onClick={mySide ? () => onCardClick(c) : undefined} />
            ))}
          </div>
          {playerLine(mySide || "blue", !!mySide)}
          {stuck && !pendingPass && (
            <div className="banner">No legal moves — pick a card to exchange &amp; pass.</div>
          )}
          {pendingPass && (
            <div className="banner">
              Exchange {CARDS[pendingPass]?.name} and pass?
              <button className="btn primary" onClick={() => doPass(pendingPass)}>Pass</button>
              <button className="btn ghost" onClick={() => setPendingPass(null)}>Cancel</button>
            </div>
          )}
        </div>

        <div className="rail">
          <div className="railbox">
            <div className="k">Status</div>
            <div className="v">
              {!mySide ? "Spectating"
                : room.status === "active" ? (isMyTurn ? "Your move" : "Their move")
                : over ? (iWon ? "Victory" : "Defeat")
                : "—"}
            </div>
            <div className="sub">
              {room.status === "active" && isMyTurn && (selCard ? "Now pick a piece and a square" : "Pick a card")}
              {room.status === "active" && !isMyTurn && "Waiting for " + nameOf(room.currentTurn) + "…"}
              {over && (room.winBy === "stone" ? "Way of the Stone — master captured"
                : room.winBy === "stream" ? "Way of the Stream — temple reached"
                : room.winBy === "resign" ? "By resignation" : "")}
            </div>
          </div>
          <div className="railbox center">
            <div className="k">Next card</div>
            {/* Oriented toward whoever will pick it up: the current mover. */}
            <div style={{ transform: room.currentTurn === (mySide || "blue") ? "none" : "rotate(180deg)" }}>
              {room.nextCard && <MoveCard cardKey={room.nextCard} small />}
            </div>
          </div>
          {room.lastMove?.from === -1 && room.status === "active" && (
            <div className="railbox">
              <div className="sub">Last turn was a forced pass ({CARDS[room.lastMove.card]?.name} exchanged).</div>
            </div>
          )}
          {mySide && room.status === "active" && (
            <button className="btn ghost" onClick={async () => {
              if (window.confirm("Resign this game?")) resignRoom(room.code, mySide);
            }}>Resign</button>
          )}
        </div>
      </div>

      {over && mySide && (
        <div className="overlay">
          <div className="box">
            <span style={{ color: iWon ? "var(--gold)" : "var(--text-faint)" }}><Torii size={40} /></span>
            <h2>{iWon ? "Victory" : nameOf(oppSide) + " wins"}</h2>
            <div className="way">
              {room.winBy === "stone" && "Way of the Stone — the master falls."}
              {room.winBy === "stream" && "Way of the Stream — the temple is taken."}
              {room.winBy === "resign" && "By resignation."}
            </div>
            <div className="row">
              <button className="btn primary" disabled={myVote}
                onClick={() => voteRematch(room.code, mySide, !!oppVote)}>
                {myVote ? "Waiting… (" + votes + "/2)" : "Rematch" + (oppVote ? " (1/2)" : "")}
              </button>
              <button className="btn ghost" onClick={() => { localStorage.removeItem("oni_room"); onLeave(); }}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
