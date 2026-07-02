// Onitama rules engine — pure functions, no Firebase, fully unit-testable.
//
// Board: flat 5x5 array, index = row*5 + col. Row 0 is RED's home row (top),
// row 4 is BLUE's home row (bottom). Cell codes: "" | "bm" | "bs" | "rm" | "rs".
// Temple arches sit at the center of each home row.

export const RED_TEMPLE  = 2;   // blue's target
export const BLUE_TEMPLE = 22;  // red's target

// ── The classic 16-card deck ─────────────────────────────────────────────
// Patterns are [dx, dy] from the OWNER's perspective: dy +1 = toward the
// opponent, dx +1 = to the owner's right. Blue applies them as printed;
// red sees the board rotated 180°, so both axes flip.
// `stamp` is the color printed on the card — when a card is dealt as the
// set-aside fifth card, its stamp decides who moves first.
export const CARDS = {
  tiger:    { name: "Tiger",    stamp: "blue", moves: [[0, 2], [0, -1]] },
  dragon:   { name: "Dragon",   stamp: "red",  moves: [[-2, 1], [2, 1], [-1, -1], [1, -1]] },
  frog:     { name: "Frog",     stamp: "red",  moves: [[-2, 0], [-1, 1], [1, -1]] },
  rabbit:   { name: "Rabbit",   stamp: "blue", moves: [[2, 0], [1, 1], [-1, -1]] },
  crab:     { name: "Crab",     stamp: "blue", moves: [[0, 1], [-2, 0], [2, 0]] },
  elephant: { name: "Elephant", stamp: "red",  moves: [[-1, 1], [1, 1], [-1, 0], [1, 0]] },
  goose:    { name: "Goose",    stamp: "blue", moves: [[-1, 1], [-1, 0], [1, 0], [1, -1]] },
  rooster:  { name: "Rooster",  stamp: "red",  moves: [[1, 1], [1, 0], [-1, 0], [-1, -1]] },
  monkey:   { name: "Monkey",   stamp: "blue", moves: [[-1, 1], [1, 1], [-1, -1], [1, -1]] },
  mantis:   { name: "Mantis",   stamp: "red",  moves: [[-1, 1], [1, 1], [0, -1]] },
  horse:    { name: "Horse",    stamp: "red",  moves: [[-1, 0], [0, 1], [0, -1]] },
  ox:       { name: "Ox",       stamp: "blue", moves: [[1, 0], [0, 1], [0, -1]] },
  crane:    { name: "Crane",    stamp: "blue", moves: [[0, 1], [-1, -1], [1, -1]] },
  boar:     { name: "Boar",     stamp: "red",  moves: [[0, 1], [-1, 0], [1, 0]] },
  eel:      { name: "Eel",      stamp: "blue", moves: [[-1, 1], [-1, -1], [1, 0]] },
  cobra:    { name: "Cobra",    stamp: "red",  moves: [[-1, 0], [1, 1], [1, -1]] },
};

/**
 * Chess-style Elo: rating points the winner takes off the loser (symmetric,
 * so the pair's total is conserved). K=32, minimum 1 point per game.
 */
export function eloDelta(winnerRating, loserRating, k = 32) {
  const expected = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  return Math.max(1, Math.round(k * (1 - expected)));
}

/** Fresh board: 4 students flanking a master on each home row. */
export function startingBoard() {
  const b = Array(25).fill("");
  ["rs", "rs", "rm", "rs", "rs"].forEach((p, i) => { b[i] = p; });
  ["bs", "bs", "bm", "bs", "bs"].forEach((p, i) => { b[20 + i] = p; });
  return b;
}

/** Shuffle the deck and deal a fresh hand: 2 blue, 2 red, 1 set aside. */
export function deal() {
  const deck = Object.keys(CARDS);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const [b1, b2, r1, r2, side] = deck;
  return {
    blueCards: [b1, b2],
    redCards:  [r1, r2],
    nextCard:  side,
    firstTurn: CARDS[side].stamp,   // set-aside card's stamp moves first
  };
}

/**
 * All legal destination squares for `side` moving the piece at `from`
 * using `cardKey`. Off-board and own-piece squares are excluded;
 * landing on an enemy piece is a capture and is legal.
 */
export function movesFor(board, side, cardKey, from) {
  const card = CARDS[cardKey];
  if (!card || !board[from] || board[from][0] !== side[0]) return [];
  const r = Math.floor(from / 5), c = from % 5;
  const out = [];
  for (const [dx, dy] of card.moves) {
    const nr = side === "blue" ? r - dy : r + dy;
    const nc = side === "blue" ? c + dx : c - dx;
    if (nr < 0 || nr > 4 || nc < 0 || nc > 4) continue;
    const to = nr * 5 + nc;
    if (board[to] && board[to][0] === side[0]) continue;
    out.push(to);
  }
  return out;
}

/** True if `side` has at least one legal move with either held card. */
export function sideHasAnyMove(board, side, cardKeys) {
  for (let i = 0; i < 25; i++) {
    if (!board[i] || board[i][0] !== side[0]) continue;
    for (const ck of cardKeys) {
      if (movesFor(board, side, ck, i).length) return true;
    }
  }
  return false;
}

/**
 * Execute a (pre-validated) move. Returns { board, status, winBy }:
 *   - capture the enemy master        → win by the Way of the Stone
 *   - master reaches the enemy temple → win by the Way of the Stream
 */
export function applyMove(board, side, from, to) {
  const next = board.slice();
  const moved = next[from];
  const captured = next[to];
  next[to] = moved;
  next[from] = "";

  const enemyMaster = side === "blue" ? "rm" : "bm";
  const enemyTemple = side === "blue" ? RED_TEMPLE : BLUE_TEMPLE;
  let status = "active", winBy = "";
  if (captured === enemyMaster)                    { status = side + "_wins"; winBy = "stone"; }
  else if (moved[1] === "m" && to === enemyTemple) { status = side + "_wins"; winBy = "stream"; }
  return { board: next, status, winBy };
}
