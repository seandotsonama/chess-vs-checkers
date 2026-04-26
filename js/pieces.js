// SVG renderers for pieces. Chess uses Cburnett-style outlined glyphs via Unicode in SVG;
// checkers are simple geometric SVGs.

const CHESS_GLYPHS = {
  K: "\u2654", // ♔
  Q: "\u2655",
  R: "\u2656",
  B: "\u2657",
  N: "\u2658",
  P: "\u2659",
};

export function chessPieceSVG(type) {
  const glyph = CHESS_GLYPHS[type] || "?";
  return `
    <svg class="piece-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <text x="50" y="78" text-anchor="middle"
            font-family="'Segoe UI Symbol','Apple Color Emoji','Noto Sans Symbols2',serif"
            font-size="86"
            fill="#111"
            stroke="#fafafa"
            stroke-width="1.5"
            paint-order="stroke">${glyph}</text>
    </svg>`;
}

export function checkerPieceSVG(isKing) {
  const crown = isKing
    ? `<path d="M 28 56 L 35 38 L 50 50 L 65 38 L 72 56 Z"
              fill="#f5d33a" stroke="#7a5d00" stroke-width="2.5" stroke-linejoin="round"/>
       <circle cx="35" cy="38" r="3.5" fill="#7a5d00"/>
       <circle cx="50" cy="48" r="3.5" fill="#7a5d00"/>
       <circle cx="65" cy="38" r="3.5" fill="#7a5d00"/>`
    : "";
  return `
    <svg class="piece-icon" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="52" r="38" fill="#1c1c1c" stroke="#000" stroke-width="2"/>
      <circle cx="50" cy="49" r="38" fill="#c0392b" stroke="#5a1308" stroke-width="2"/>
      <circle cx="50" cy="49" r="32" fill="none" stroke="#7d2018" stroke-width="2" stroke-dasharray="3 3"/>
      ${crown}
    </svg>`;
}

export function pieceSVG(piece) {
  if (!piece) return "";
  if (piece.side === "chess") return chessPieceSVG(piece.type);
  return checkerPieceSVG(piece.type === "K");
}
