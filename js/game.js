// Chess vs Checkers — rules engine.
//
// Coordinates: row 0 = bottom (chess back rank), row 7 = top (checker back rank).
// Dark squares: (r + c) % 2 === 0  (a1 is dark in standard chess).
// Chess pieces use all squares; checkers only occupy dark squares.

export const SIDE_CHESS = "chess";
export const SIDE_CHECKERS = "checkers";

export function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

export function isDark(r, c) {
  return (r + c) % 2 === 0;
}

export function createInitialState() {
  const board = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ["R", "N", "B", "Q", "K", "B", "N", "R"];
  for (let c = 0; c < 8; c++) {
    board[0][c] = { side: SIDE_CHESS, type: back[c], moved: false };
    board[1][c] = { side: SIDE_CHESS, type: "P", moved: false };
  }
  for (const r of [5, 6, 7]) {
    for (let c = 0; c < 8; c++) {
      if (isDark(r, c)) board[r][c] = { side: SIDE_CHECKERS, type: "M" };
    }
  }
  return {
    board,
    turn: SIDE_CHESS,
    winner: null,
    lastMove: null,
    moveCount: 0,
  };
}

// ---------- Apply moves ----------

function cloneBoard(board) {
  return board.map((row) => row.slice());
}

function applyMoveToBoard(board, move) {
  const nb = cloneBoard(board);
  for (const [cr, cc] of move.captures) nb[cr][cc] = null;
  const piece = nb[move.from[0]][move.from[1]];
  nb[move.from[0]][move.from[1]] = null;
  const newPiece = { ...piece, moved: true };
  if (move.promotion) newPiece.type = move.promotion;
  if (move.promoteToKing) newPiece.type = "K";
  nb[move.to[0]][move.to[1]] = newPiece;
  if (move.castling === "K") {
    const rook = nb[0][7];
    nb[0][7] = null;
    nb[0][5] = { ...rook, moved: true };
  } else if (move.castling === "Q") {
    const rook = nb[0][0];
    nb[0][0] = null;
    nb[0][3] = { ...rook, moved: true };
  }
  return nb;
}

export function applyMove(state, move) {
  const board = applyMoveToBoard(state.board, move);
  const next = {
    board,
    turn: state.turn === SIDE_CHESS ? SIDE_CHECKERS : SIDE_CHESS,
    lastMove: move,
    winner: null,
    moveCount: state.moveCount + 1,
  };
  next.winner = computeWinner(next);
  return next;
}

// ---------- Check detection ----------

function findKing(board) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.side === SIDE_CHESS && p.type === "K") return [r, c];
    }
  return null;
}

export function isInCheck(board) {
  const king = findKing(board);
  if (!king) return true;
  // Generate all checker captures and see if any captures the king.
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.side !== SIDE_CHECKERS) continue;
      if (checkerCanReachCapture(board, r, c, king)) return true;
    }
  }
  return false;
}

function checkerDirs(piece) {
  if (piece.type === "K") return [[-1,-1],[-1,1],[1,-1],[1,1]];
  // man: moves toward row 0 (chess back rank)
  return [[-1,-1],[-1,1]];
}

// Recursive scan to see if any chain of captures starting at (r,c) captures `target`.
function checkerCanReachCapture(board, r, c, target) {
  const piece = board[r][c];
  const seen = new Set();
  function dfs(curR, curC, captured, virtualBoard) {
    const dirs = checkerDirs(piece);
    for (const [dr, dc] of dirs) {
      const jr = curR + dr, jc = curC + dc;
      const lr = curR + 2 * dr, lc = curC + 2 * dc;
      if (!inBounds(lr, lc)) continue;
      const jumped = virtualBoard[jr][jc];
      if (!jumped || jumped.side !== SIDE_CHESS) continue;
      const key = jr + "," + jc;
      if (captured.has(key)) continue;
      if (virtualBoard[lr][lc]) continue;
      if (jr === target[0] && jc === target[1]) return true;
      // recurse
      const nextBoard = cloneBoard(virtualBoard);
      nextBoard[jr][jc] = null;
      const newCaptured = new Set(captured);
      newCaptured.add(key);
      // man kings on reaching row 0 — but this is a check-test, so we keep going either way for safety
      if (dfs(lr, lc, newCaptured, nextBoard)) return true;
    }
    return false;
  }
  // Start with origin emptied (the checker is conceptually at its starting square)
  const virtual = cloneBoard(board);
  virtual[r][c] = null;
  return dfs(r, c, new Set(), virtual);
}

// ---------- Chess move generation ----------

function pseudoMovesFor(board, r, c) {
  const p = board[r][c];
  switch (p.type) {
    case "P": return pawnMoves(board, r, c);
    case "N": return knightMoves(board, r, c);
    case "B": return sliderMoves(board, r, c, [[1,1],[1,-1],[-1,1],[-1,-1]]);
    case "R": return sliderMoves(board, r, c, [[1,0],[-1,0],[0,1],[0,-1]]);
    case "Q": return sliderMoves(board, r, c, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
    case "K": return kingMoves(board, r, c);
  }
  return [];
}

function pawnMoves(board, r, c) {
  const moves = [];
  const fwd = 1; // chess always moves +row in our setup
  const startRow = 1;
  const promoRow = 7;
  const fr = r + fwd;
  if (inBounds(fr, c) && !board[fr][c]) {
    pushPawn(moves, r, c, fr, c, null, promoRow);
    if (r === startRow && !board[r + 2 * fwd][c]) {
      moves.push({ from: [r, c], to: [r + 2 * fwd, c], captures: [] });
    }
  }
  for (const dc of [-1, 1]) {
    const nr = r + fwd, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const t = board[nr][nc];
    if (t && t.side === SIDE_CHECKERS) {
      pushPawn(moves, r, c, nr, nc, [nr, nc], promoRow);
    }
  }
  return moves;
}

function pushPawn(moves, r, c, nr, nc, capSq, promoRow) {
  const captures = capSq ? [capSq] : [];
  if (nr === promoRow) {
    for (const promo of ["Q", "R", "B", "N"]) {
      moves.push({ from: [r, c], to: [nr, nc], captures, promotion: promo });
    }
  } else {
    moves.push({ from: [r, c], to: [nr, nc], captures });
  }
}

function knightMoves(board, r, c) {
  const out = [];
  const offs = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of offs) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const t = board[nr][nc];
    if (!t) out.push({ from: [r, c], to: [nr, nc], captures: [] });
    else if (t.side === SIDE_CHECKERS) out.push({ from: [r, c], to: [nr, nc], captures: [[nr, nc]] });
  }
  return out;
}

function sliderMoves(board, r, c, dirs) {
  const out = [];
  for (const [dr, dc] of dirs) {
    let nr = r + dr, nc = c + dc;
    while (inBounds(nr, nc)) {
      const t = board[nr][nc];
      if (!t) {
        out.push({ from: [r, c], to: [nr, nc], captures: [] });
      } else {
        if (t.side === SIDE_CHECKERS) out.push({ from: [r, c], to: [nr, nc], captures: [[nr, nc]] });
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return out;
}

function kingMoves(board, r, c) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (!inBounds(nr, nc)) continue;
      const t = board[nr][nc];
      if (!t) out.push({ from: [r, c], to: [nr, nc], captures: [] });
      else if (t.side === SIDE_CHECKERS) out.push({ from: [r, c], to: [nr, nc], captures: [[nr, nc]] });
    }
  }
  // Castling
  const king = board[r][c];
  if (!king.moved && r === 0 && c === 4) {
    const kr = board[0][7];
    if (kr && kr.side === SIDE_CHESS && kr.type === "R" && !kr.moved &&
        !board[0][5] && !board[0][6]) {
      out.push({ from: [r, c], to: [0, 6], captures: [], castling: "K" });
    }
    const qr = board[0][0];
    if (qr && qr.side === SIDE_CHESS && qr.type === "R" && !qr.moved &&
        !board[0][1] && !board[0][2] && !board[0][3]) {
      out.push({ from: [r, c], to: [0, 2], captures: [], castling: "Q" });
    }
  }
  return out;
}

export function generateChessMoves(state) {
  const board = state.board;
  const pseudo = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.side === SIDE_CHESS) pseudo.push(...pseudoMovesFor(board, r, c));
  }
  const legal = [];
  const inCheckNow = isInCheck(board);
  for (const m of pseudo) {
    if (m.castling) {
      if (inCheckNow) continue;
      const interCol = m.castling === "K" ? 5 : 3;
      const interBoard = applyMoveToBoard(board, { from: m.from, to: [0, interCol], captures: [] });
      if (isInCheck(interBoard)) continue;
    }
    const after = applyMoveToBoard(board, m);
    if (!isInCheck(after)) legal.push(m);
  }
  return legal;
}

// ---------- Checker move generation ----------

export function generateCheckerMoves(state) {
  const board = state.board;
  const moves = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.side === SIDE_CHECKERS) moves.push(...checkerMovesFor(board, r, c));
  }
  return moves;
}

function checkerMovesFor(board, r, c) {
  const piece = board[r][c];
  const dirs = checkerDirs(piece);
  const out = [];
  // Simple moves
  for (const [dr, dc] of dirs) {
    const nr = r + dr, nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    if (board[nr][nc]) continue;
    const m = { from: [r, c], to: [nr, nc], captures: [], path: [[nr, nc]] };
    if (piece.type === "M" && nr === 0) m.promoteToKing = true;
    out.push(m);
  }
  // Capture chains (no forced, can stop at any landing)
  const virtual = cloneBoard(board);
  virtual[r][c] = null;
  expandCaptures(virtual, piece, [r, c], r, c, [], [], out);
  // Tag promote-to-king on any chain that ends at row 0 (for men)
  for (const m of out) {
    if (piece.type === "M" && m.to[0] === 0) m.promoteToKing = true;
  }
  return out;
}

function expandCaptures(board, piece, origin, curR, curC, captured, path, out) {
  const dirs = checkerDirs(piece);
  for (const [dr, dc] of dirs) {
    const jr = curR + dr, jc = curC + dc;
    const lr = curR + 2 * dr, lc = curC + 2 * dc;
    if (!inBounds(lr, lc)) continue;
    const jumped = board[jr][jc];
    if (!jumped || jumped.side !== SIDE_CHESS) continue;
    if (captured.some(([cr, cc]) => cr === jr && cc === jc)) continue;
    if (board[lr][lc]) continue;
    const newCaptured = [...captured, [jr, jc]];
    const newPath = [...path, [lr, lc]];
    out.push({
      from: origin,
      to: [lr, lc],
      captures: newCaptured,
      path: newPath,
    });
    // Kinging stops the chain for men
    if (piece.type === "M" && lr === 0) continue;
    // Recurse on virtual board with jumped piece removed
    const next = cloneBoard(board);
    next[jr][jc] = null;
    expandCaptures(next, piece, origin, lr, lc, newCaptured, newPath, out);
  }
}

// ---------- Aggregate ----------

export function generateLegalMoves(state) {
  if (state.winner) return [];
  return state.turn === SIDE_CHESS ? generateChessMoves(state) : generateCheckerMoves(state);
}

export function movesFromSquare(state, r, c) {
  const all = generateLegalMoves(state);
  return all.filter((m) => m.from[0] === r && m.from[1] === c);
}

// ---------- Win detection ----------

export function countCheckers(board) {
  let n = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p && p.side === SIDE_CHECKERS) n++;
  }
  return n;
}

function computeWinner(state) {
  if (countCheckers(state.board) === 0) return SIDE_CHESS;
  if (!findKing(state.board)) return SIDE_CHECKERS;
  // No legal moves for current side → that side loses.
  const movesNow = generateLegalMoves(state);
  if (movesNow.length === 0) {
    return state.turn === SIDE_CHESS ? SIDE_CHECKERS : SIDE_CHESS;
  }
  return null;
}

// ---------- Eval helpers (used by AI) ----------

const CHESS_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

export function evalBoard(board) {
  // Positive favors chess; negative favors checkers.
  let chessMat = 0, checkMat = 0;
  let kingAlive = false;
  let checkerCount = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    if (p.side === SIDE_CHESS) {
      if (p.type === "K") kingAlive = true;
      chessMat += CHESS_VALUE[p.type];
    } else {
      checkerCount++;
      checkMat += p.type === "K" ? 5 : 3;
    }
  }
  if (!kingAlive) return -100000;
  if (checkerCount === 0) return 100000;
  return chessMat - checkMat;
}
