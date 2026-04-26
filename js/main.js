import {
  createInitialState, applyMove, generateLegalMoves, movesFromSquare,
  isInCheck, SIDE_CHESS, SIDE_CHECKERS,
} from "./game.js";
import { pickMove } from "./ai.js";
import { pieceSVG } from "./pieces.js";

const AI_DEPTH = 3;

const $ = (sel) => document.querySelector(sel);
const menu = $("#menu");
const game = $("#game");
const boardEl = $("#board");
const statusEl = $("#status");
const aiControls = $("#ai-controls");
const speedSlider = $("#speed");
const speedLabel = $("#speed-label");
const pauseBtn = $("#pause-btn");
const banner = $("#banner");
const bannerTitle = $("#banner-title");
const bannerSub = $("#banner-sub");
const promotion = $("#promotion");
const capturedByChess = $("#captured-by-chess");
const capturedByCheckers = $("#captured-by-checkers");

let state = null;
let mode = null;             // 'human-human' | 'human-chess' | 'human-checkers' | 'ai-ai'
let humanSide = null;        // SIDE_CHESS | SIDE_CHECKERS | 'both' | null (ai-ai)
let selected = null;         // { r, c, moves: [...] }
let busy = false;            // blocks input while animating / AI thinking
let aiPaused = false;
let pendingPromotion = null; // { move, resolve }
let captured = { byChess: [], byCheckers: [] };

// ---------- Mode selection ----------
document.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => startGame(btn.dataset.mode));
});
$("#back-btn").addEventListener("click", goToMenu);
$("#restart-btn").addEventListener("click", () => startGame(mode));
$("#banner-again").addEventListener("click", () => { hideBanner(); startGame(mode); });
$("#banner-menu").addEventListener("click", () => { hideBanner(); goToMenu(); });

speedSlider.addEventListener("input", () => {
  speedLabel.textContent = speedSlider.value + " ms";
});
pauseBtn.addEventListener("click", () => {
  aiPaused = !aiPaused;
  pauseBtn.textContent = aiPaused ? "Resume" : "Pause";
  if (!aiPaused) tickAI();
});

document.querySelectorAll("#promotion .promo-choices button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const choice = btn.dataset.promo;
    if (pendingPromotion) {
      const { resolve } = pendingPromotion;
      pendingPromotion = null;
      promotion.classList.add("hidden");
      resolve(choice);
    }
  });
});

function goToMenu() {
  menu.classList.remove("hidden");
  game.classList.add("hidden");
  hideBanner();
  promotion.classList.add("hidden");
  state = null;
  mode = null;
  busy = false;
}

function startGame(m) {
  mode = m;
  state = createInitialState();
  selected = null;
  busy = false;
  aiPaused = false;
  pauseBtn.textContent = "Pause";
  captured = { byChess: [], byCheckers: [] };
  renderCaptured();

  if (m === "human-human") humanSide = "both";
  else if (m === "human-chess") humanSide = SIDE_CHESS;
  else if (m === "human-checkers") humanSide = SIDE_CHECKERS;
  else humanSide = null;

  aiControls.classList.toggle("hidden", m !== "ai-ai");

  menu.classList.add("hidden");
  game.classList.remove("hidden");
  hideBanner();

  buildBoard();
  render();
  maybeTriggerAI();
}

// ---------- Board build & render ----------
function buildBoard() {
  boardEl.innerHTML = "";
  // Render row 7 at top down to row 0 at bottom
  for (let visualRow = 0; visualRow < 8; visualRow++) {
    const r = 7 - visualRow;
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement("div");
      sq.className = "square " + ((r + c) % 2 === 0 ? "dark" : "light");
      sq.dataset.r = r;
      sq.dataset.c = c;
      sq.addEventListener("click", () => onSquareClick(r, c));
      boardEl.appendChild(sq);
    }
  }
}

function squareEl(r, c) {
  return boardEl.querySelector(`.square[data-r="${r}"][data-c="${c}"]`);
}

function render() {
  // Clear all squares
  for (const sq of boardEl.querySelectorAll(".square")) {
    sq.innerHTML = "";
    sq.classList.remove("selected", "last-from", "last-to", "capture-target", "in-check");
  }
  // Place pieces
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = state.board[r][c];
    if (!p) continue;
    squareEl(r, c).innerHTML = pieceSVG(p);
  }
  // Last move highlight
  if (state.lastMove) {
    const lm = state.lastMove;
    squareEl(lm.from[0], lm.from[1])?.classList.add("last-from");
    squareEl(lm.to[0], lm.to[1])?.classList.add("last-to");
  }
  // Selection / move dots
  if (selected) {
    squareEl(selected.r, selected.c)?.classList.add("selected");
    for (const m of selected.moves) {
      const el = squareEl(m.to[0], m.to[1]);
      if (!el) continue;
      if (m.captures.length > 0) {
        el.classList.add("capture-target");
      } else {
        const dot = document.createElement("div");
        dot.className = "move-dot";
        el.appendChild(dot);
      }
    }
  }
  // Check indicator
  if (isInCheck(state.board)) {
    let kingSq = null;
    for (let r = 0; r < 8 && !kingSq; r++) for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (p && p.side === SIDE_CHESS && p.type === "K") { kingSq = [r, c]; break; }
    }
    if (kingSq) squareEl(kingSq[0], kingSq[1])?.classList.add("in-check");
  }
  // Status
  updateStatus();
}

function updateStatus() {
  if (state.winner) {
    statusEl.textContent = state.winner === SIDE_CHESS ? "Chess wins!" : "Checkers wins!";
    statusEl.classList.remove("check");
    return;
  }
  const inCheck = state.turn === SIDE_CHESS && isInCheck(state.board);
  const who = state.turn === SIDE_CHESS ? "Chess" : "Checkers";
  statusEl.textContent = inCheck ? `${who} to move — check!` : `${who} to move`;
  statusEl.classList.toggle("check", inCheck);
}

function renderCaptured() {
  capturedByChess.innerHTML = captured.byChess.map((p) => pieceSVG(p)).join("");
  capturedByCheckers.innerHTML = captured.byCheckers.map((p) => pieceSVG(p)).join("");
}

// ---------- Click handling ----------
function onSquareClick(r, c) {
  if (busy || state.winner) return;
  if (mode === "ai-ai") return;
  if (humanSide !== "both" && state.turn !== humanSide) return;

  const piece = state.board[r][c];

  // Re-select own piece
  if (piece && piece.side === state.turn) {
    const moves = movesFromSquare(state, r, c);
    selected = { r, c, moves };
    render();
    return;
  }

  // Try to play a move from selection
  if (selected) {
    const candidates = selected.moves.filter((m) => m.to[0] === r && m.to[1] === c);
    if (candidates.length > 0) {
      playMove(candidates);
      return;
    }
  }
  // Otherwise deselect
  selected = null;
  render();
}

async function playMove(candidates) {
  // If multiple candidates differ only by promotion, prompt.
  let move = candidates[0];
  if (candidates.length > 1 && candidates.every((m) => m.promotion)) {
    const choice = await askPromotion();
    move = candidates.find((m) => m.promotion === choice) || candidates[0];
  }
  await commitMove(move);
}

function askPromotion() {
  return new Promise((resolve) => {
    pendingPromotion = { resolve };
    promotion.classList.remove("hidden");
  });
}

// ---------- Commit moves with animation ----------
async function commitMove(move) {
  busy = true;
  selected = null;

  // Track captures for the side panels
  const turn = state.turn;
  for (const [cr, cc] of move.captures) {
    const cap = state.board[cr][cc];
    if (!cap) continue;
    if (turn === SIDE_CHESS) captured.byChess.push(cap);
    else captured.byCheckers.push(cap);
  }

  await animateMove(move);
  state = applyMove(state, move);
  render();
  renderCaptured();
  busy = false;

  if (state.winner) {
    showBanner(state.winner);
    return;
  }
  maybeTriggerAI();
}

async function animateMove(move) {
  const fromEl = squareEl(move.from[0], move.from[1]);
  const pieceEl = fromEl?.querySelector(".piece-icon");
  if (!pieceEl) return;

  // Clear captured pieces' DOM so they don't visually linger or conflict
  // with the moving piece when it lands.
  for (const [cr, cc] of move.captures) {
    const cel = squareEl(cr, cc);
    if (cel) cel.innerHTML = "";
  }

  const path = move.path && move.path.length ? move.path : [move.to];
  let current = move.from;
  for (const step of path) {
    const targetEl = squareEl(step[0], step[1]);
    const dxPx = (step[1] - current[1]) * 72;
    const dyPx = (current[0] - step[0]) * 72; // row 0 sits at the bottom visually
    pieceEl.style.transition = "transform 0.2s ease";
    pieceEl.style.transform = `translate(${dxPx}px, ${dyPx}px)`;
    await sleep(220);
    pieceEl.style.transition = "none";
    pieceEl.style.transform = "";
    if (targetEl) {
      targetEl.innerHTML = "";
      targetEl.appendChild(pieceEl);
    }
    current = step;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- AI driving ----------
function maybeTriggerAI() {
  if (state.winner) return;
  if (mode === "human-human") return;
  if (mode === "ai-ai") {
    if (!aiPaused) tickAI();
    return;
  }
  // human-vs-AI: trigger if it's AI's turn
  if (state.turn !== humanSide) tickAI();
}

async function tickAI() {
  if (busy || state.winner || aiPaused) return;
  if (mode !== "ai-ai" && state.turn === humanSide) return;
  busy = true;
  const delay = mode === "ai-ai" ? parseInt(speedSlider.value, 10) : 220;
  await sleep(Math.max(50, delay - 220));
  if (aiPaused || state.winner) { busy = false; return; }
  const move = pickMove(state, AI_DEPTH);
  busy = false;
  if (!move) {
    // Shouldn't happen — winner already computed — but guard anyway
    return;
  }
  await commitMove(move);
}

// ---------- Banner ----------
function showBanner(winner) {
  bannerTitle.textContent = winner === SIDE_CHESS ? "Chess wins" : "Checkers wins";
  bannerSub.textContent = winner === SIDE_CHESS
    ? "Every checker has been captured."
    : "The king has fallen.";
  banner.classList.remove("hidden");
}
function hideBanner() { banner.classList.add("hidden"); }

// Keyboard: Esc deselects
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    selected = null;
    if (state) render();
  }
});
