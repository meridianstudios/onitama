// Presentational pieces: torii mark, shrine-pawn pieces, move cards, board.

import { CARDS, RED_TEMPLE, BLUE_TEMPLE } from "./lib/engine.js";

const SIDE = {
  blue: { main: "var(--blue)", deep: "var(--blue-deep)", line: "#0e2f52" },
  red:  { main: "var(--red)",  deep: "var(--red-deep)",  line: "#4a120c" },
};

export function Torii({ size = 28 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: "block" }}>
      <g fill="currentColor">
        <path d="M4 8.6 Q16 5.8 28 8.6 L27.2 11.6 Q16 9.2 4.8 11.6 Z" />
        <rect x="7.5" y="13.8" width="17" height="2.3" rx="0.7" />
        <rect x="9.6" y="10.4" width="2.8" height="16" rx="1" />
        <rect x="19.6" y="10.4" width="2.8" height="16" rx="1" />
        <rect x="15.1" y="8.4" width="1.8" height="5.6" />
      </g>
    </svg>
  );
}

/** Shrine-pawn piece. The master is taller and crowned. */
export function Piece({ code }) {
  const side = code[0] === "b" ? "blue" : "red";
  const master = code[1] === "m";
  const C = SIDE[side];
  return (
    <svg viewBox="0 0 40 44" width={master ? "84%" : "70%"} height={master ? "84%" : "70%"}
      style={{ display: "block", overflow: "visible", filter: "drop-shadow(0 2px 2.5px rgba(0,0,0,0.35))", pointerEvents: "none" }}>
      <g fill={C.main} stroke={C.line} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        {master && <path d="M12.5 12 L14.8 6.5 L18 10 L20 5 L22 10 L25.2 6.5 L27.5 12 Z" fill={C.deep} />}
        <circle cx="20" cy={master ? 17.5 : 14.5} r={master ? 6 : 6.5} />
        <path d={master
          ? "M14.5 22 C11.5 26 10.5 32 10.5 37 H29.5 C29.5 32 28.5 26 25.5 22 Z"
          : "M14.5 19 C12 23 11 28.5 11 34 H29 C29 28.5 28 23 25.5 19 Z"} />
        <rect x={master ? 8.5 : 9.5} y={master ? 37 : 34} width={master ? 23 : 21} height="5" rx="2" fill={C.deep} />
      </g>
    </svg>
  );
}

/**
 * A move card: name + mini 5×5 pattern grid + stamp dot.
 * `flipped` rotates the pattern 180° (how the opponent's cards read to you).
 */
export function MoveCard({ cardKey, flipped, selected, dimmed, small, onClick }) {
  const card = CARDS[cardKey];
  if (!card) return null;
  const cell = small ? 8 : 12;
  const pat = new Set(card.moves.map(([dx, dy]) => (flipped ? `${-dx},${-dy}` : `${dx},${dy}`)));
  const cls = "card" + (selected ? " sel" : "") + (dimmed ? " dim" : "") + (small ? " small" : "");
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={cls} onClick={onClick} style={onClick ? undefined : { userSelect: "none" }}>
      <span className="head">
        <span className="stamp" style={{ background: SIDE[card.stamp].main }} />
        <span className="name">{card.name}</span>
      </span>
      <span className="cgrid" style={{ gridTemplateColumns: `repeat(5, ${cell}px)`, gridTemplateRows: `repeat(5, ${cell}px)` }}>
        {[2, 1, 0, -1, -2].map(dy => [-2, -1, 0, 1, 2].map(dx => {
          const isCenter = dx === 0 && dy === 0;
          const isMove = pat.has(`${dx},${dy}`);
          return (
            <div key={dx + "," + dy} style={{
              background: isCenter ? "#3a2f1c"
                        : isMove ? (selected ? "var(--vermillion)" : "#8a7346")
                        : "rgba(90,70,40,0.16)",
            }} />
          );
        }))}
      </span>
    </Tag>
  );
}

/**
 * The 5×5 board. Red sees it rotated 180° so their pieces sit at the bottom.
 */
export function Board({ board, mySide, legal, selectedPiece, lastMove, disabled, onSquare }) {
  const flipped = mySide === "red";
  const last = lastMove && lastMove.from >= 0 ? lastMove : null;
  const cells = [];
  for (let vi = 0; vi < 25; vi++) {
    const idx = flipped ? 24 - vi : vi;
    const r = Math.floor(idx / 5), c = idx % 5;
    const piece = board[idx];
    const isLight = (r + c) % 2 === 0;
    const isSel = selectedPiece === idx;
    const isLegal = legal.includes(idx);
    const isLast = last && (last.from === idx || last.to === idx);
    const temple = idx === RED_TEMPLE ? "red" : idx === BLUE_TEMPLE ? "blue" : null;
    let bg = isLight ? "var(--paper)" : "var(--paper-2)";
    if (isLast) bg = isLight ? "#f2e28e" : "#e6d478";
    if (isSel)  bg = "#f4e87e";
    cells.push(
      <div key={idx} onClick={() => onSquare && onSquare(idx)}
        className={"sq" + (!disabled ? " clickable" : "")}
        style={{
          background: bg,
          boxShadow: temple
            ? `inset 0 0 0 2px ${temple === "red" ? "rgba(176,52,40,0.55)" : "rgba(29,95,168,0.55)"}`
            : "inset 0 0 0 0.5px rgba(90,70,40,0.18)",
        }}>
        {temple && !piece && (
          <span style={{ width: "44%", height: "44%", opacity: 0.45, color: temple === "red" ? "var(--red-deep)" : "var(--blue-deep)" }}>
            <Torii size="100%" />
          </span>
        )}
        {piece && <Piece code={piece} />}
        {isLegal && !piece && <span className="dotmove" />}
        {isLegal && piece && <span className="ring" />}
      </div>
    );
  }
  return <div className="board">{cells}</div>;
}
