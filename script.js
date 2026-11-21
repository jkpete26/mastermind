"use strict";

/* ==========================================================
   Config
   ========================================================== */

// Each color has a distinct symbol so the game is playable without color vision.
const COLORS = [
  { id: "red",    name: "Red",    symbol: "\u25B2" }, // ▲
  { id: "orange", name: "Orange", symbol: "\u25A0" }, // ■
  { id: "yellow", name: "Yellow", symbol: "\u25C6" }, // ◆
  { id: "green",  name: "Green",  symbol: "\u2605" }, // ★
  { id: "blue",   name: "Blue",   symbol: "\u25CF" }, // ●
  { id: "purple", name: "Purple", symbol: "\u271A" }  // ✚
];

const DIFFICULTIES = {
  easy:   { label: "Easy",   pegs: 4,  guesses: 10, hints: 1 },
  medium: { label: "Medium", pegs: 6,  guesses: 12, hints: 2 },
  hard:   { label: "Hard",   pegs: 10, guesses: 20, hints: 3 }
};

const DEFAULT_DIFFICULTY = "easy";

const STATS_KEY = "mastermind.stats.v1";
const DIFFICULTY_KEY = "mastermind.difficulty.v1";
const THEME_KEY = "mastermind.theme.v1"; // also read by the inline script in index.html
const THEMES = ["light", "dark"];
const LEADERBOARD_KEY = "mastermind.leaderboard.v1";
const NAME_KEY = "mastermind.name.v1";
const LEADERBOARD_SIZE = 10; // entries kept per difficulty
const NAME_MAX = 12;

/* ==========================================================
   Pure game logic (no DOM)
   ========================================================== */

/** Returns an array of `pegs` color indices (0..COLORS.length-1); repeats allowed. */
function generateSecret(pegs, rng = Math.random) {
  return Array.from({ length: pegs }, () => Math.floor(rng() * COLORS.length));
}

/**
 * Scores a guess against the secret.
 * exact = right color, right slot; colorOnly = right color, wrong slot.
 * Handles repeated colors correctly.
 */
function score(secret, guess) {
  let exact = 0;
  const secretCounts = new Array(COLORS.length).fill(0);
  const guessCounts = new Array(COLORS.length).fill(0);

  for (let i = 0; i < secret.length; i++) {
    if (secret[i] === guess[i]) {
      exact++;
    } else {
      secretCounts[secret[i]]++;
      guessCounts[guess[i]]++;
    }
  }

  let colorOnly = 0;
  for (let c = 0; c < COLORS.length; c++) {
    colorOnly += Math.min(secretCounts[c], guessCounts[c]);
  }
  return { exact, colorOnly };
}

/** Counts manually entered feedback pegs: exact = black, color = white. */
function countFeedbackPegs(feedbackPegs) {
  return {
    exact: feedbackPegs.filter(function (peg) { return peg === "exact"; }).length,
    colorOnly: feedbackPegs.filter(function (peg) { return peg === "color"; }).length
  };
}

/** Checks that Player 1's black and white peg counts match the secret and guess. */
function feedbackMatches(secret, guess, feedbackPegs) {
  if (!Array.isArray(secret) || !Array.isArray(guess) || !Array.isArray(feedbackPegs) ||
      secret.length !== guess.length || secret.length !== feedbackPegs.length ||
      feedbackPegs.some(function (peg) { return peg !== null && peg !== "exact" && peg !== "color"; })) {
    return false;
  }
  const entered = countFeedbackPegs(feedbackPegs);
  const expected = score(secret, guess);
  return entered.exact === expected.exact && entered.colorOnly === expected.colorOnly;
}

/**
 * Leaderboard order: fewest guesses, then fewest hints, then fastest time.
 * If everything ties, the earlier entry stays ahead.
 */
function compareEntries(a, b) {
  return (a.guesses - b.guesses) || (a.hints - b.hints) || (a.ms - b.ms) || (a.date - b.date);
}

/**
 * Adds an entry to a list, sorts it, and keeps only the top `limit`.
 * Returns { list, kept }; kept is false if the new entry didn't make the cut.
 */
function insertEntry(list, entry, limit = LEADERBOARD_SIZE) {
  const top = list.concat([entry]).sort(compareEntries).slice(0, limit);
  return { list: top, kept: top.includes(entry) };
}

/** Formats milliseconds as m:ss (or m:ss.t with tenths of a second). */
function formatTime(ms, tenths) {
  const total = Math.max(0, ms);
  const secs = Math.floor(total / 1000);
  const s = secs % 60;
  let out = Math.floor(secs / 60) + ":" + (s < 10 ? "0" : "") + s;
  if (tenths) out += "." + Math.floor((total % 1000) / 100);
  return out;
}

/** Trims, collapses spaces, limits to NAME_MAX characters; blank becomes "Anonymous". */
function cleanName(raw) {
  const text = String(raw === null || raw === undefined ? "" : raw).replace(/\s+/g, " ").trim();
  const name = Array.from(text).slice(0, NAME_MAX).join("");
  return name || "Anonymous";
}

/** Keeps only well-formed entries (storage can be edited or corrupted), sorted and capped. */
function sanitizeEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(function (e) {
      return e && typeof e.name === "string" && Number.isFinite(e.guesses) &&
        Number.isFinite(e.hints) && Number.isFinite(e.ms) && Number.isFinite(e.date);
    })
    .map(function (e) {
      return { name: cleanName(e.name), guesses: e.guesses, hints: e.hints, ms: e.ms, date: e.date };
    })
    .sort(compareEntries)
    .slice(0, LEADERBOARD_SIZE);
}

/**
 * Picks which slot a hint should reveal, or -1 if no hint can be given.
 * - Only slots that aren't already revealed are eligible.
 * - Slots where the player's current peg is already right are skipped, so a hint
 *   isn't wasted (if every open slot is already right, any open slot is used so
 *   the hint never tells the player their row is correct).
 * - At least one slot always stays hidden, so a hint can never reveal the whole code.
 */
function pickHintSlot(secret, current, locked, rng = Math.random) {
  if (locked.filter(Boolean).length >= secret.length - 1) return -1;
  const open = [];
  const any = [];
  for (let i = 0; i < secret.length; i++) {
    if (locked[i]) continue;
    any.push(i);
    if (current[i] !== secret[i]) open.push(i);
  }
  const pool = open.length > 0 ? open : any;
  return pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : -1;
}

/** A new empty guess row; slots revealed by hints come pre-filled with the right color. */
function freshRow(secret, locked) {
  return secret.map(function (color, i) { return locked[i] ? color : null; });
}

/* ==========================================================
   Stats storage (per difficulty)
   ========================================================== */

function emptyStats() {
  return { played: 0, wins: 0, winGuesses: 0, streak: 0, bestStreak: 0 };
}

function loadAllStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveAllStats(all) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(all));
  } catch (e) {
    /* storage unavailable: stats just won't persist */
  }
}

function recordResult(difficulty, won, guessCount) {
  const all = loadAllStats();
  const s = Object.assign(emptyStats(), all[difficulty]);
  s.played++;
  if (won) {
    s.wins++;
    s.winGuesses += guessCount;
    s.streak++;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
  } else {
    s.streak = 0;
  }
  all[difficulty] = s;
  saveAllStats(all);
}

/* ==========================================================
   Difficulty preference storage
   ========================================================== */

function loadDifficulty() {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    if (saved && Object.prototype.hasOwnProperty.call(DIFFICULTIES, saved)) return saved;
  } catch (e) {
    /* storage unavailable: fall back to the default */
  }
  return DEFAULT_DIFFICULTY;
}

function saveDifficulty(key) {
  try {
    localStorage.setItem(DIFFICULTY_KEY, key);
  } catch (e) {
    /* storage unavailable: the choice just won't persist */
  }
}

/* ==========================================================
   Theme preference storage
   ========================================================== */

/** Returns the saved theme, or null on a first visit (or if storage is unavailable). */
function loadTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) return saved;
  } catch (e) {
    /* storage unavailable: treat as no saved choice */
  }
  return null;
}

function saveTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    /* storage unavailable: the choice applies for this visit only */
  }
}

/* ==========================================================
   Leaderboard storage (one board per difficulty)
   ========================================================== */

// If localStorage is blocked, scores live here so the board still works until the page closes.
let memoryBoards = null;

/** Returns { easy: [...], medium: [...], hard: [...] }, always well-formed. */
function loadBoards() {
  let source = memoryBoards;
  if (!source) {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      if (raw) source = JSON.parse(raw);
    } catch (e) {
      /* unavailable or corrupt: start with empty boards */
    }
  }
  const boards = {};
  Object.keys(DIFFICULTIES).forEach(function (key) {
    boards[key] = sanitizeEntries(source && source[key]);
  });
  return boards;
}

/** Returns true if the boards were saved to localStorage. */
function saveBoards(boards) {
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(boards));
    memoryBoards = null;
    return true;
  } catch (e) {
    memoryBoards = boards;
    return false;
  }
}

/** Saves an entry to a difficulty's board. Returns { kept, saved }. */
function addScore(difficulty, entry) {
  const boards = loadBoards();
  const result = insertEntry(boards[difficulty], entry);
  boards[difficulty] = result.list;
  return { kept: result.kept, saved: saveBoards(boards) };
}

function loadName() {
  try {
    const saved = localStorage.getItem(NAME_KEY) || "";
    return Array.from(saved.trim()).slice(0, NAME_MAX).join("");
  } catch (e) {
    return "";
  }
}

function saveName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    /* storage unavailable: the name just won't be remembered */
  }
}

/* ==========================================================
   Game state
   ========================================================== */

const state = {
  theme: null,      // "light" | "dark" | null until chosen
  startTime: null,  // ms timestamp of the first peg placed; null until then
  finishedMs: null, // total time once the game ends
  hintsUsed: 0,     // hints spent this game; saved with a leaderboard score
  locked: [],       // locked[i] is true once a hint has revealed slot i (kept for later rows)
  notice: "",       // short message after a hint, announced to screen readers
  mode: "computer", // "computer" | "two-player"
  phase: "playing", // "setup" | "handoff" | "playing" | "feedback-handoff" | "feedback"
  difficulty: DEFAULT_DIFFICULTY,
  secret: [],
  guesses: [],      // [{ pegs: [...], exact, colorOnly }]
  pendingGuess: null,
  feedbackPegs: [],
  feedbackError: "",
  current: [],      // array of color index or null, length = pegs
  selected: null,   // selected palette color index
  status: "playing" // "playing" | "won" | "lost"
};

function config() {
  return DIFFICULTIES[state.difficulty];
}

/** A game counts as in progress once setup starts or the first guess is submitted. */
function gameInProgress() {
  return state.status === "playing" &&
    (state.guesses.length > 0 || state.phase === "handoff" ||
      (state.mode === "two-player" && (state.phase === "playing" || state.secret.some(function (color) { return color !== null; }))));
}

/* Timer: starts on the first peg placed, stops on a win or loss. It stores
   timestamps (not a tick count) so it stays accurate in background tabs. */
let timerId = null;

function elapsedMs() {
  if (state.finishedMs !== null) return state.finishedMs;
  if (state.startTime !== null) return Date.now() - state.startTime;
  return 0;
}

function renderTimer() {
  el.timer.textContent = formatTime(elapsedMs());
}

function startTimer() {
  if (state.startTime !== null) return; // already running
  state.startTime = Date.now();
  timerId = setInterval(renderTimer, 250);
  renderTimer();
}

function stopTimer() {
  clearInterval(timerId);
  timerId = null;
  state.finishedMs = state.startTime === null ? 0 : Date.now() - state.startTime;
  renderTimer();
}

function resetTimer() {
  clearInterval(timerId);
  timerId = null;
  state.startTime = null;
  state.finishedMs = null;
  renderTimer();
}

function newGame() {
  const cfg = config();
  if (el.handoffDialog && el.handoffDialog.open) el.handoffDialog.close();
  if (el.feedbackHandoffDialog && el.feedbackHandoffDialog.open) el.feedbackHandoffDialog.close();
  if (el.feedbackDialog && el.feedbackDialog.open) el.feedbackDialog.close();
  resetTimer();
  state.hintsUsed = 0;
  state.phase = state.mode === "two-player" ? "setup" : "playing";
  state.secret = state.mode === "two-player" ? new Array(cfg.pegs).fill(null) : generateSecret(cfg.pegs);
  state.guesses = [];
  state.pendingGuess = null;
  state.feedbackPegs = [];
  state.feedbackError = "";
  state.locked = new Array(cfg.pegs).fill(false);
  state.notice = "";
  state.current = state.phase === "setup" ? new Array(cfg.pegs).fill(null) : freshRow(state.secret, state.locked);
  state.selected = null;
  state.status = "playing";
  render();
}

function placeColor(slotIndex, colorIndex) {
  if (state.status !== "playing") return;
  if (state.locked[slotIndex]) return; // revealed by a hint: can't be changed
  if (colorIndex !== null) startTimer(); // emptying a slot doesn't start the clock
  state.notice = "";
  state.current[slotIndex] = colorIndex;
  render();
}

function placeInFirstEmpty(colorIndex) {
  if (state.phase === "setup") {
    const i = state.secret.indexOf(null);
    if (i !== -1) {
      state.secret[i] = colorIndex;
      render();
    }
    return;
  }
  const i = state.current.indexOf(null);
  if (i !== -1) placeColor(i, colorIndex);
}

function undo() {
  if (state.status !== "playing") return;
  state.notice = "";
  if (state.phase === "setup") {
    for (let i = state.secret.length - 1; i >= 0; i--) {
      if (state.secret[i] !== null) {
        state.secret[i] = null;
        break;
      }
    }
    render();
    return;
  }
  for (let i = state.current.length - 1; i >= 0; i--) {
    if (state.current[i] !== null && !state.locked[i]) {
      state.current[i] = null;
      break;
    }
  }
  render();
}

function clearRow() {
  if (state.status !== "playing") return;
  state.notice = "";
  if (state.phase === "setup") {
    state.secret = new Array(config().pegs).fill(null);
    render();
    return;
  }
  state.current = freshRow(state.secret, state.locked); // keeps hint-revealed pegs
  render();
}

function hintsLeft() {
  return config().hints - state.hintsUsed;
}

/** Spends a hint: reveals and locks one correct slot in the current row. */
function useHint() {
  if (state.status !== "playing" || state.phase !== "playing" || hintsLeft() <= 0) return;
  const i = pickHintSlot(state.secret, state.current, state.locked);
  if (i === -1) return;
  startTimer(); // a hint places a peg, so it starts the clock like any other
  state.locked[i] = true;
  state.current[i] = state.secret[i];
  state.hintsUsed++;
  state.notice = "Hint: slot " + (i + 1) + " is " + COLORS[state.secret[i]].name + ".";
  render();
}

function submit() {
  if (state.status !== "playing") return;
  if (state.phase === "setup") {
    if (state.secret.includes(null)) return;
    state.phase = "handoff";
    state.notice = "";
    render();
    el.handoffDialog.showModal();
    return;
  }
  if (state.phase !== "playing") return;
  if (state.current.includes(null)) return;

  const pegs = state.current.slice();
  if (state.mode === "two-player") {
    state.pendingGuess = pegs;
    state.feedbackPegs = new Array(config().pegs).fill(null);
    state.feedbackError = "";
    state.phase = "feedback-handoff";
    render();
    el.feedbackHandoffDialog.showModal();
    return;
  }
  completeGuess(pegs, score(state.secret, pegs));
}

/** Adds an accepted guess and applies the normal win/loss rules. */
function completeGuess(pegs, result) {
  state.guesses.push({ pegs, exact: result.exact, colorOnly: result.colorOnly });

  const cfg = config();
  if (result.exact === cfg.pegs) {
    state.status = "won";
    stopTimer();
    recordResult(state.difficulty, true, state.guesses.length);
  } else if (state.guesses.length >= cfg.guesses) {
    state.status = "lost";
    stopTimer();
    recordResult(state.difficulty, false, state.guesses.length);
  } else {
    state.current = freshRow(state.secret, state.locked); // hint-revealed pegs carry over
  }
  state.notice = "";
  render();
  if (state.status !== "playing") {
    // On tall boards the result message may be scrolled out of view.
    el.message.scrollIntoView({ block: "start" });
  }
  if (state.status === "won") openNameDialog();
}

function updateFeedbackCount() {
  const counts = countFeedbackPegs(state.feedbackPegs);
  el.feedbackCount.textContent = counts.exact + " black, " + counts.colorOnly + " white";
}

function renderFeedbackEntry() {
  el.feedbackSecret.textContent = "";
  el.feedbackGuess.textContent = "";
  if (state.phase === "feedback") {
    state.secret.forEach(function (color) { el.feedbackSecret.appendChild(makePeg(color)); });
    state.pendingGuess.forEach(function (color) { el.feedbackGuess.appendChild(makePeg(color)); });
  }
  el.feedbackError.textContent = state.feedbackError;
  el.feedbackEntry.textContent = "";
  state.feedbackPegs.forEach(function (kind, i) {
    const peg = document.createElement("button");
    peg.type = "button";
    peg.className = "fb fb-button";
    if (kind) peg.classList.add(kind);
    peg.setAttribute("aria-pressed", String(kind !== null));
    peg.setAttribute("aria-label", "Feedback peg " + (i + 1) + ": " + (kind === "exact" ? "black" : kind === "color" ? "white" : "empty") + ". Click to change.");
    peg.title = kind === "exact" ? "Black peg" : kind === "color" ? "White peg" : "Empty";
    peg.addEventListener("click", function () {
      state.feedbackPegs[i] = kind === null ? "exact" : kind === "exact" ? "color" : null;
      renderFeedbackEntry();
      updateFeedbackCount();
      el.feedbackEntry.children[i].focus();
    });
    el.feedbackEntry.appendChild(peg);
  });
  updateFeedbackCount();
}

function startFeedbackEntry() {
  if (state.phase !== "feedback-handoff") return;
  el.feedbackHandoffDialog.close();
  state.phase = "feedback";
  state.feedbackError = "";
  render();
  el.feedbackDialog.showModal();
}

function checkFeedback() {
  if (state.phase !== "feedback" || !state.pendingGuess) return;
  if (!feedbackMatches(state.secret, state.pendingGuess, state.feedbackPegs)) {
    state.feedbackError = "That feedback doesn’t match the secret code. Correct it and check again.";
    el.feedbackError.textContent = state.feedbackError;
    return;
  }

  const entered = countFeedbackPegs(state.feedbackPegs);
  const guess = state.pendingGuess;
  state.pendingGuess = null;
  state.feedbackPegs = [];
  state.feedbackError = "";
  el.feedbackDialog.close();
  state.phase = "playing";
  completeGuess(guess, entered);
}

/* ==========================================================
   Rendering
   ========================================================== */

// In Node (tests) there is no document, so el stays empty and nothing touches the DOM.
const el = typeof document === "undefined" ? {} : {
  board: document.getElementById("board"),
  palette: document.getElementById("palette"),
  secret: document.getElementById("secret"),
  message: document.getElementById("message"),
  stats: document.getElementById("stats"),
  undo: document.getElementById("undo"),
  clear: document.getElementById("clear"),
  hint: document.getElementById("hint"),
  submit: document.getElementById("submit"),
  newGame: document.getElementById("new-game"),
  controls: document.getElementById("controls"),
  difficulty: document.getElementById("difficulty"),
  difficultyInfo: document.getElementById("difficulty-info"),
  app: document.getElementById("app"),
  welcome: document.getElementById("welcome"),
  themeToggle: document.getElementById("theme-toggle"),
  timer: document.getElementById("timer"),
  openLeaderboard: document.getElementById("open-leaderboard"),
  openHelp: document.getElementById("open-help"),
  helpDialog: document.getElementById("help-dialog"),
  helpClose: document.getElementById("help-close"),
  helpColors: document.getElementById("help-colors"),
  helpLevels: document.getElementById("help-levels"),
  nameDialog: document.getElementById("name-dialog"),
  nameTitle: document.getElementById("name-title"),
  nameForm: document.getElementById("name-form"),
  nameSummary: document.getElementById("name-summary"),
  nameInput: document.getElementById("player-name"),
  nameSkip: document.getElementById("name-skip"),
  lbDialog: document.getElementById("leaderboard-dialog"),
  lbTabs: document.getElementById("lb-tabs"),
  lbNote: document.getElementById("lb-note"),
  lbScroll: document.getElementById("lb-scroll"),
  lbBody: document.getElementById("lb-body"),
  lbEmpty: document.getElementById("lb-empty"),
  lbReset: document.getElementById("lb-reset"),
  lbClose: document.getElementById("lb-close"),
  gameMode: document.getElementById("game-mode"),
  handoffDialog: document.getElementById("handoff-dialog"),
  startPlayerTwo: document.getElementById("start-player-two"),
  feedbackHandoffDialog: document.getElementById("feedback-handoff-dialog"),
  enterFeedback: document.getElementById("enter-feedback"),
  feedbackDialog: document.getElementById("feedback-dialog"),
  feedbackSecret: document.getElementById("feedback-secret"),
  feedbackGuess: document.getElementById("feedback-guess"),
  feedbackEntry: document.getElementById("feedback-entry"),
  feedbackCount: document.getElementById("feedback-count"),
  feedbackError: document.getElementById("feedback-error"),
  checkFeedback: document.getElementById("check-feedback")
};

function makePeg(colorIndex, tag) {
  const peg = document.createElement(tag || "span");
  peg.className = "slot";
  if (colorIndex === null || colorIndex === undefined) {
    peg.setAttribute("aria-label", "Empty");
  } else {
    const c = COLORS[colorIndex];
    peg.classList.add("filled", "color-" + c.id);
    peg.textContent = c.symbol;
    peg.setAttribute("aria-label", c.name);
  }
  return peg;
}

function makeFeedback(exact, colorOnly, pegs) {
  const wrap = document.createElement("div");
  wrap.className = "feedback";
  wrap.style.gridTemplateRows = "repeat(" + Math.ceil(pegs / 2) + ", var(--fb-size))";
  for (let i = 0; i < pegs; i++) {
    const dot = document.createElement("span");
    dot.className = "fb";
    if (i < exact) dot.classList.add("exact");
    else if (i < exact + colorOnly) dot.classList.add("color");
    wrap.appendChild(dot);
  }
  return wrap;
}

function renderBoard() {
  const cfg = config();
  el.board.textContent = "";
  el.board.style.setProperty("--pegs", cfg.pegs);

  for (let r = 0; r < cfg.guesses; r++) {
    const row = document.createElement("div");
    row.className = "row";
    const slots = document.createElement("div");
    slots.className = "slots";
    row.appendChild(slots);

    const past = state.guesses[r];
    const isActive = state.status === "playing" && r === state.guesses.length;

    if (past) {
      past.pegs.forEach(function (c) { slots.appendChild(makePeg(c)); });
      row.appendChild(makeFeedback(past.exact, past.colorOnly, cfg.pegs));
      const text = document.createElement("span");
      text.className = "fb-text";
      text.textContent = past.exact + " exact, " + past.colorOnly + " color";
      row.appendChild(text);
    } else if (isActive) {
      row.classList.add("active");
      row.setAttribute("aria-current", "true");
      state.current.forEach(function (c, i) {
        if (state.locked[i]) {
          // Revealed by a hint: a plain, non-clickable peg with an extra ring.
          const fixed = makePeg(c);
          fixed.classList.add("locked");
          fixed.setAttribute("aria-label", COLORS[c].name + " (revealed by hint)");
          fixed.title = "Revealed by a hint";
          slots.appendChild(fixed);
          return;
        }
        const slot = makePeg(c, "button");
        slot.type = "button";
        slot.addEventListener("click", function () { onSlotClick(i); });
        slots.appendChild(slot);
      });
      row.appendChild(makeFeedback(0, 0, cfg.pegs));
      const text = document.createElement("span");
      text.className = "fb-text";
      row.appendChild(text);
    } else {
      for (let i = 0; i < cfg.pegs; i++) slots.appendChild(makePeg(null));
      row.appendChild(makeFeedback(0, 0, cfg.pegs));
      const text = document.createElement("span");
      text.className = "fb-text";
      row.appendChild(text);
    }
    el.board.appendChild(row);
  }
}

function renderPalette() {
  el.palette.textContent = "";
  COLORS.forEach(function (c, i) {
    const btn = makePeg(i, "button");
    btn.type = "button";
    btn.classList.add("palette-peg");
    if (state.selected === i) btn.classList.add("selected");
    btn.setAttribute("aria-pressed", String(state.selected === i));
    btn.setAttribute("aria-label", c.name + " (key " + (i + 1) + ")");
    const hint = document.createElement("span");
    hint.className = "key-hint";
    hint.textContent = String(i + 1);
    btn.appendChild(hint);
    btn.addEventListener("click", function () {
      state.selected = state.selected === i ? null : i;
      renderPalette();
    });
    el.palette.appendChild(btn);
  });
}

function renderSecret() {
  const cfg = config();
  el.secret.textContent = "";
  const setup = state.phase === "setup";
  const reveal = state.status !== "playing";
  for (let i = 0; i < cfg.pegs; i++) {
    if (setup) {
      const slot = makePeg(state.secret[i], "button");
      slot.type = "button";
      slot.setAttribute("aria-label", (state.secret[i] === null ? "Empty" : COLORS[state.secret[i]].name) + ", code slot " + (i + 1));
      slot.addEventListener("click", function () { onSlotClick(i); });
      el.secret.appendChild(slot);
    } else if (reveal) {
      el.secret.appendChild(makePeg(state.secret[i]));
    } else {
      const hidden = makePeg(null);
      hidden.classList.add("hidden-secret");
      hidden.textContent = "?";
      hidden.setAttribute("aria-label", "Hidden");
      el.secret.appendChild(hidden);
    }
  }
}

function renderMessage() {
  const cfg = config();
  if (state.phase === "setup") {
    el.message.textContent = "Player 1: choose a secret code, then pass the device to Player 2.";
    return;
  }
  if (state.phase === "handoff") {
    el.message.textContent = "Secret code set. Pass the device to Player 2.";
    return;
  }
  if (state.phase === "feedback-handoff" || state.phase === "feedback") {
    el.message.textContent = "Pass the device to Player 1 to enter feedback.";
    return;
  }
  if (state.status === "won") {
    el.message.textContent = (state.mode === "two-player" ? "Player 2 cracked the code in " : "You cracked the code in ") + state.guesses.length +
      (state.guesses.length === 1 ? " guess!" : " guesses!");
  } else if (state.status === "lost") {
    el.message.textContent = (state.mode === "two-player" ? "Player 2 ran out of guesses. " : "Out of guesses. ") + "The secret code is revealed above.";
  } else {
    const left = cfg.guesses - state.guesses.length;
    el.message.textContent = (state.notice ? state.notice + " " : "") +
      "Guess " + (state.guesses.length + 1) + " of " + cfg.guesses +
      " (" + left + " left). Pick a color, then a slot.";
  }
}

function renderStats() {
  const s = Object.assign(emptyStats(), loadAllStats()[state.difficulty]);
  const winRate = s.played ? Math.round((s.wins / s.played) * 100) + "%" : "-";
  const avg = s.wins ? (s.winGuesses / s.wins).toFixed(1) : "-";
  const rows = [
    ["Played", s.played],
    ["Win rate", winRate],
    ["Avg guesses (wins)", avg],
    ["Current streak", s.streak],
    ["Best streak", s.bestStreak]
  ];
  el.stats.textContent = "";
  rows.forEach(function (r) {
    const dt = document.createElement("dt");
    dt.textContent = r[0];
    const dd = document.createElement("dd");
    dd.textContent = String(r[1]);
    el.stats.appendChild(dt);
    el.stats.appendChild(dd);
  });
}

function renderControls() {
  const playing = state.status === "playing";
  const setup = state.phase === "setup";
  const notGuessing = state.phase !== "playing" && !setup;
  // Hint-revealed pegs are locked, so only the player's own pegs count here.
  const hasAny = state.current.some(function (c, i) { return c !== null && !state.locked[i]; });
  const hasSetupCode = state.secret.some(function (c) { return c !== null; });
  el.controls.hidden = notGuessing;
  el.board.hidden = setup || notGuessing;
  el.undo.disabled = !playing || (setup ? !hasSetupCode : !hasAny);
  el.clear.disabled = !playing || (setup ? !hasSetupCode : !hasAny);
  el.submit.disabled = !playing || (setup ? state.secret.includes(null) : state.current.includes(null));
  el.submit.firstChild.nodeValue = setup ? "Set code & pass to Player 2" : "Submit";

  const left = hintsLeft();
  el.hint.textContent = "Hint (" + left + ")";
  el.hint.setAttribute("aria-label", "Hint, " + left + (left === 1 ? " hint" : " hints") + " left");
  el.hint.hidden = setup;
  el.hint.disabled = !playing || setup || left <= 0;
}

function buildDifficultyOptions() {
  el.difficulty.textContent = "";
  Object.keys(DIFFICULTIES).forEach(function (key) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = DIFFICULTIES[key].label;
    el.difficulty.appendChild(opt);
  });
}

function renderDifficulty() {
  const cfg = config();
  document.body.dataset.difficulty = state.difficulty; // drives size variables in CSS
  el.difficulty.value = state.difficulty;
  el.difficultyInfo.textContent = cfg.pegs + " pegs \u00B7 " + cfg.guesses + " guesses";
  el.gameMode.value = state.mode;
}

/** Keeps the sticky controls from covering the active row (see scroll-margin in CSS). */
function updateControlsHeight() {
  document.documentElement.style.setProperty("--controls-h", el.controls.offsetHeight + "px");
}

/** Scrolls the board only if the active row is off screen. */
function scrollActiveRowIntoView() {
  const row = el.board.querySelector(".row.active");
  if (row) row.scrollIntoView({ block: "nearest" });
}

/** Sets the theme on <html> and updates the header toggle to offer the other one. */
function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.dataset.theme = theme;
  const other = theme === "dark" ? "light" : "dark";
  const label = other === "dark" ? "Dark" : "Light";
  el.themeToggle.textContent = (other === "dark" ? "\u263E " : "\u2600 ") + label;
  el.themeToggle.setAttribute("aria-label", "Switch to " + other + " theme");
}

function showWelcome() {
  el.app.hidden = true;
  el.welcome.hidden = false;
  const first = el.welcome.querySelector("button");
  if (first) first.focus();
}

function showApp() {
  el.welcome.hidden = true;
  el.app.hidden = false;
  // The layout was hidden during render(), so measure and scroll now.
  updateControlsHeight();
  scrollActiveRowIntoView();
}

/* ==========================================================
   How-to-play dialog
   ========================================================== */

/** Fills the color and difficulty lists from COLORS / DIFFICULTIES so the help never goes stale. */
function buildHelp() {
  el.helpColors.textContent = "";
  COLORS.forEach(function (c, i) {
    const li = document.createElement("li");
    const peg = makePeg(i);
    peg.setAttribute("aria-hidden", "true"); // the text beside it says the same thing
    li.appendChild(peg);
    li.appendChild(document.createTextNode(c.name + " " + c.symbol + " (key " + (i + 1) + ")"));
    el.helpColors.appendChild(li);
  });

  el.helpLevels.textContent = "";
  Object.keys(DIFFICULTIES).forEach(function (key) {
    const d = DIFFICULTIES[key];
    const li = document.createElement("li");
    const label = document.createElement("strong");
    label.textContent = d.label + ": ";
    li.appendChild(label);
    li.appendChild(document.createTextNode(
      d.pegs + " pegs, " + d.guesses + " guesses, " + d.hints + (d.hints === 1 ? " hint" : " hints")));
    el.helpLevels.appendChild(li);
  });
}

/* ==========================================================
   Name prompt and leaderboard dialogs
   ========================================================== */

let pendingEntry = null;       // the win waiting for a name
let lbDifficulty = DEFAULT_DIFFICULTY; // which board tab is showing

function openNameDialog() {
  pendingEntry = {
    difficulty: state.difficulty,
    guesses: state.guesses.length,
    hints: state.hintsUsed,
    ms: state.finishedMs
  };
  let summary = pendingEntry.guesses + (pendingEntry.guesses === 1 ? " guess" : " guesses") +
    " in " + formatTime(pendingEntry.ms, true);
  if (pendingEntry.hints > 0) {
    summary += " with " + pendingEntry.hints + (pendingEntry.hints === 1 ? " hint" : " hints");
  }
  el.nameSummary.textContent = summary + ".";
  el.nameTitle.textContent = state.mode === "two-player" ? "Player 2 cracked the code!" : "You cracked the code!";
  el.nameInput.value = loadName();
  el.nameDialog.showModal();
  el.nameInput.focus();
  el.nameInput.select();
}

function makeCell(tag, text) {
  const cell = document.createElement(tag);
  cell.textContent = text; // textContent only, so player names can never inject HTML
  return cell;
}

function renderLeaderboard() {
  // Tabs
  el.lbTabs.textContent = "";
  Object.keys(DIFFICULTIES).forEach(function (key) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = DIFFICULTIES[key].label;
    btn.setAttribute("aria-pressed", String(key === lbDifficulty));
    btn.addEventListener("click", function () {
      lbDifficulty = key;
      el.lbNote.textContent = "";
      renderLeaderboard();
    });
    el.lbTabs.appendChild(btn);
  });

  // Rows
  const list = loadBoards()[lbDifficulty];
  let newest = null;
  list.forEach(function (e) {
    if (newest === null || e.date > newest.date) newest = e;
  });

  el.lbBody.textContent = "";
  list.forEach(function (e, i) {
    const tr = document.createElement("tr");
    if (e === newest) tr.className = "newest";
    tr.appendChild(makeCell("td", String(i + 1)));
    const nameCell = makeCell("td", e.name);
    if (e === newest) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "New";
      nameCell.appendChild(badge);
    }
    tr.appendChild(nameCell);
    tr.appendChild(makeCell("td", String(e.guesses)));
    tr.appendChild(makeCell("td", String(e.hints)));
    tr.appendChild(makeCell("td", formatTime(e.ms, true)));
    const dateCell = makeCell("td", new Date(e.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    dateCell.className = "col-date"; // hidden on phones so Time stays visible
    tr.appendChild(dateCell);
    el.lbBody.appendChild(tr);
  });

  el.lbScroll.hidden = list.length === 0;
  el.lbEmpty.hidden = list.length !== 0;
  el.lbReset.disabled = list.length === 0;
}

/** Opens the leaderboard; `result` (from addScore) adds a note about the score just saved. */
function openLeaderboard(difficulty, result) {
  lbDifficulty = difficulty || state.difficulty;
  const notes = [];
  if (result && !result.kept) notes.push("That score didn't make the top " + LEADERBOARD_SIZE + " this time.");
  if (result && !result.saved) notes.push("Your browser blocked saving, so scores last only until you close this page.");
  el.lbNote.textContent = notes.join(" ");
  renderLeaderboard();
  if (!el.lbDialog.open) el.lbDialog.showModal();
}

function render() {
  renderDifficulty();
  renderBoard();
  renderPalette();
  renderSecret();
  renderMessage();
  renderStats();
  renderControls();
  renderFeedbackEntry();
  updateControlsHeight();
  scrollActiveRowIntoView();
}

/* ==========================================================
   Events
   ========================================================== */

function onSlotClick(slotIndex) {
  if (state.status !== "playing") return;
  if (state.phase === "setup") {
    if (state.selected !== null) state.secret[slotIndex] = state.selected;
    else state.secret[slotIndex] = null;
    render();
    return;
  }
  if (state.phase !== "playing") return;
  if (state.locked[slotIndex]) return;
  if (state.selected !== null) {
    placeColor(slotIndex, state.selected);
  } else if (state.current[slotIndex] !== null) {
    placeColor(slotIndex, null); // clicking a filled slot with no color selected empties it
  }
}

/** Attaches every event listener. Called once at startup, and only in a browser. */
function bindEvents() {
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // No game shortcuts while the welcome screen or a dialog is showing
    // (otherwise Backspace would be blocked while typing a name).
    if (el.app.hidden) return;
    if (document.querySelector("dialog[open]")) return;
    // Don't hijack keys while a select menu has focus.
    if (document.activeElement === el.difficulty || document.activeElement === el.gameMode) return;
    if (e.key >= "1" && e.key <= String(COLORS.length)) {
      placeInFirstEmpty(Number(e.key) - 1);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      undo();
    } else if (e.key === "Enter") {
      // Let a focused button handle its own Enter press.
      if (document.activeElement && document.activeElement.tagName === "BUTTON") return;
      // preventDefault stops this same Enter press from also hitting the name form
      // that opens when the guess wins.
      e.preventDefault();
      submit();
    }
  });

  el.undo.addEventListener("click", undo);
  el.clear.addEventListener("click", clearRow);
  el.hint.addEventListener("click", useHint);
  el.submit.addEventListener("click", submit);
  el.newGame.addEventListener("click", function () {
    if (gameInProgress()) {
      if (!window.confirm("Abandon the current game and start a new one?")) return;
    }
    newGame();
  });

  el.difficulty.addEventListener("change", function () {
    const next = el.difficulty.value;
    if (next === state.difficulty) return;
    if (gameInProgress()) {
      const msg = "Switch to " + DIFFICULTIES[next].label + "? Your current game will be abandoned.";
      if (!window.confirm(msg)) {
        el.difficulty.value = state.difficulty; // revert the dropdown
        return;
      }
    }
    state.difficulty = next;
    saveDifficulty(next);
    newGame();
    el.difficulty.blur(); // so the 1-6 / Enter shortcuts work right away
  });

  el.gameMode.addEventListener("change", function () {
    const next = el.gameMode.value;
    if (next === state.mode) return;
    if (gameInProgress() && !window.confirm("Switch modes? Your current game will be abandoned.")) {
      el.gameMode.value = state.mode;
      return;
    }
    state.mode = next;
    newGame();
  });

  el.startPlayerTwo.addEventListener("click", function () {
    if (state.phase !== "handoff") return;
    el.handoffDialog.close();
    state.phase = "playing";
    state.current = freshRow(state.secret, state.locked);
    state.selected = null;
    render();
  });
  el.handoffDialog.addEventListener("cancel", function (e) { e.preventDefault(); });
  el.enterFeedback.addEventListener("click", startFeedbackEntry);
  el.feedbackHandoffDialog.addEventListener("cancel", function (e) { e.preventDefault(); });
  el.checkFeedback.addEventListener("click", checkFeedback);
  el.feedbackDialog.addEventListener("cancel", function (e) { e.preventDefault(); });

  el.welcome.querySelectorAll("[data-theme-choice]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const theme = btn.getAttribute("data-theme-choice");
      if (!THEMES.includes(theme)) return;
      applyTheme(theme);
      saveTheme(theme);
      showApp();
    });
  });

  el.themeToggle.addEventListener("click", function () {
    const next = state.theme === "dark" ? "light" : "dark";
    applyTheme(next);
    saveTheme(next);
  });

  el.openHelp.addEventListener("click", function () { el.helpDialog.showModal(); });
  el.helpClose.addEventListener("click", function () { el.helpDialog.close(); });

  el.openLeaderboard.addEventListener("click", function () { openLeaderboard(state.difficulty); });
  el.lbClose.addEventListener("click", function () { el.lbDialog.close(); });

  el.lbReset.addEventListener("click", function () {
    const label = DIFFICULTIES[lbDifficulty].label;
    if (!window.confirm("Reset the " + label + " leaderboard? This can't be undone.")) return;
    const boards = loadBoards();
    boards[lbDifficulty] = [];
    saveBoards(boards);
    el.lbNote.textContent = "";
    renderLeaderboard();
  });

  el.nameForm.addEventListener("submit", function (e) {
    e.preventDefault();
    const win = pendingEntry;
    if (!win) return;
    const name = cleanName(el.nameInput.value);
    saveName(name);
    const result = addScore(win.difficulty, {
      name: name,
      guesses: win.guesses,
      hints: win.hints,
      ms: win.ms,
      date: Date.now()
    });
    el.nameDialog.close();
    openLeaderboard(win.difficulty, result);
  });

  el.nameSkip.addEventListener("click", function () { el.nameDialog.close(); });
  // Covers Skip, Escape and a finished save: nothing is left waiting.
  el.nameDialog.addEventListener("close", function () { pendingEntry = null; });

  window.addEventListener("resize", updateControlsHeight);
}

/* ==========================================================
   Start
   ========================================================== */

// Lets tests.js load the pure logic from Node (`node tests.js`).
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    COLORS, DIFFICULTIES, generateSecret, score,
    countFeedbackPegs, feedbackMatches,
    compareEntries, insertEntry, formatTime, cleanName, sanitizeEntries,
    pickHintSlot, freshRow
  };
}

if (typeof document !== "undefined") {
  bindEvents();
  buildDifficultyOptions();
  buildHelp();
  state.difficulty = loadDifficulty();
  newGame();

  const savedTheme = loadTheme();
  if (savedTheme) {
    applyTheme(savedTheme);
    showApp();
  } else {
    // First visit: show the welcome screen and wait for a Light/Dark pick.
    document.documentElement.removeAttribute("data-theme");
    showWelcome();
  }
}
