// Minimax with alpha-beta from chess POV (chess maximizes, checkers minimizes).

import {
  SIDE_CHESS, SIDE_CHECKERS,
  applyMove, generateLegalMoves, evalBoard,
} from "./game.js";

const WIN = 100000;

export function pickMove(state, depth = 3) {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) return null;
  // Order: captures first, ties broken randomly for variety.
  shuffle(moves);
  moves.sort((a, b) => b.captures.length - a.captures.length);

  let bestMove = moves[0];
  let bestScore = state.turn === SIDE_CHESS ? -Infinity : Infinity;
  let alpha = -Infinity, beta = Infinity;

  for (const m of moves) {
    const next = applyMove(state, m);
    const score = minimax(next, depth - 1, alpha, beta);
    if (state.turn === SIDE_CHESS) {
      if (score > bestScore) { bestScore = score; bestMove = m; }
      alpha = Math.max(alpha, bestScore);
    } else {
      if (score < bestScore) { bestScore = score; bestMove = m; }
      beta = Math.min(beta, bestScore);
    }
    if (beta <= alpha) break;
  }
  return bestMove;
}

function minimax(state, depth, alpha, beta) {
  if (state.winner === SIDE_CHESS) return WIN - (10 - depth);
  if (state.winner === SIDE_CHECKERS) return -WIN + (10 - depth);
  if (depth <= 0) return evalBoard(state.board);

  const moves = generateLegalMoves(state);
  if (moves.length === 0) {
    // Side to move has no moves → loses
    return state.turn === SIDE_CHESS ? -WIN + (10 - depth) : WIN - (10 - depth);
  }
  moves.sort((a, b) => b.captures.length - a.captures.length);

  if (state.turn === SIDE_CHESS) {
    let best = -Infinity;
    for (const m of moves) {
      const next = applyMove(state, m);
      const s = minimax(next, depth - 1, alpha, beta);
      if (s > best) best = s;
      if (best > alpha) alpha = best;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const next = applyMove(state, m);
      const s = minimax(next, depth - 1, alpha, beta);
      if (s < best) best = s;
      if (best < beta) beta = best;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
