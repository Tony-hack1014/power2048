// =========================
// Config & Game State
// =========================

const GRID_SIZE = 4;
let BASE = 3; // current base (2–5)

// target tiles per base
const TARGET_TILE_BY_BASE = {
  2: 2048,
  3: 6561,   // 3^8
  4: 65536,
  5: 78125,
};

// max exponent for each base
const MAX_EXP_BY_BASE = {
  2: 11, // 2^11 = 2048
  3: 8,  // 3^8 = 6561
  4: 8,  // 4^6 = 4096
  5: 7,  // 5^6 = 15625
};

let TARGET_TILE = TARGET_TILE_BY_BASE[BASE];

let board = [];
let score = 0;
let gameOver = false;
let hasWon = false;
let lastSpawn = null;       // { row, col } of the tile spawned after a move
let mergedCells = [];       // [{ row, col }] tiles that were created by merges in the last move
// Touch handling for mobile
let touchStartX = null;
let touchStartY = null;
let touchEndX = null;
let touchEndY = null;

let currentHighScore = 0;
// mode & timer
let currentMode = "classic"; // "classic", "30", "60", "300"
let timeRemaining = null;    // in seconds for timed modes
let timerIntervalId = null;




// =========================
// DOM References
// =========================

const gridElement = document.getElementById("grid");
const statusElement = document.getElementById("status");
const scoreElement = document.getElementById("score-value");
const restartButton = document.getElementById("restart-button");
const baseButtons = document.querySelectorAll(".base-btn");
const bestElement = document.getElementById("best-value");
const timeElement = document.getElementById("time-value");
const modeButtons = document.querySelectorAll(".mode-btn");








// =========================
// Board Creation & Rendering
// =========================

// Create an empty GRID_SIZE x GRID_SIZE board filled with 0s
function createEmptyBoard() {
  const newBoard = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    const rowArray = [];
    for (let col = 0; col < GRID_SIZE; col++) {
      rowArray.push(0);
    }
    newBoard.push(rowArray);
  }
  return newBoard;
}


function getHighScoreKey() {
  if (currentMode === "classic") {
    // keep old keys so your existing high scores still work
    return `power2048_highscore_base_${BASE}`;
  } else {
    // separate key for each (base, time mode)
    return `power2048_highscore_base_${BASE}_time_${currentMode}`;
  }
}


function loadHighScore() {
  const key = getHighScoreKey();
  const stored = localStorage.getItem(key);
  const value = stored ? parseInt(stored, 10) : 0;
  currentHighScore = Number.isNaN(value) ? 0 : value;
  bestElement.textContent = currentHighScore;
}

function saveHighScoreIfNeeded() {
  if (score > currentHighScore) {
    currentHighScore = score;
    bestElement.textContent = currentHighScore;
    const key = getHighScoreKey();
    localStorage.setItem(key, String(currentHighScore));
  }
}

function clearTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function formatTime(seconds) {
  const s = Math.max(0, seconds);
  if (s < 60) {
    return s + "s";
  }
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

function updateTimeDisplay() {
  if (currentMode === "classic") {
    timeElement.textContent = "∞";
  } else {
    timeElement.textContent = formatTime(timeRemaining ?? 0);
  }
}

function startTimerIfNeeded() {
  clearTimer();

  if (currentMode === "classic") {
    timeRemaining = null;
    updateTimeDisplay();
    return;
  }

  // currentMode is "30", "60", or "300"
  timeRemaining = Number(currentMode);
  updateTimeDisplay();

  timerIntervalId = setInterval(() => {
    if (timeRemaining === null) return;

    timeRemaining -= 1;
    if (timeRemaining <= 0) {
      timeRemaining = 0;
      updateTimeDisplay();
      clearTimer();

      // end the game because time is up
      gameOver = true;
      statusElement.textContent = `Time's up! Final score: ${score}`;
      saveHighScoreIfNeeded();
      return;
    }

    updateTimeDisplay();
  }, 1000);
}

function setMode(newMode) {
  currentMode = newMode;

  // update active button styling
  modeButtons.forEach((btn) => {
    const btnMode = btn.getAttribute("data-mode");
    if (btnMode === currentMode) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // reset game in this mode (timer + board + high score)
  startGame();
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const newMode = btn.getAttribute("data-mode"); // "classic", "30", "60", "300"
    if (newMode !== currentMode) {
      setMode(newMode);
    }
  });
});


// Render the board array to the HTML grid
function drawBoard() {
  gridElement.innerHTML = "";

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const tile = document.createElement("div");
      tile.classList.add("tile");

      const value = board[row][col];
      if (value !== 0) {
        tile.textContent = value;
        const tileClass = getTileClass(value);
        if (tileClass) {
          tile.classList.add(tileClass);
        }

        // NEW: mark new tile
        if (lastSpawn && lastSpawn.row === row && lastSpawn.col === col) {
          tile.classList.add("tile-new");
        }

        // NEW: mark merged tiles for pop animation
        if (mergedCells.some((c) => c.row === row && c.col === col)) {
          tile.classList.add("tile-merged");
        }
      }

      gridElement.appendChild(tile);
    }
  }
}


function updateScoreDisplay() {
  scoreElement.textContent = score;
}

function getTileClass(value) {
  if (value === 0) return "";

  const maxExp = MAX_EXP_BY_BASE[BASE];
  if (!maxExp) return "";

  // 1) figure out exponent k such that value = BASE^k
  let exp = 1;
  let current = BASE;

  while (exp <= maxExp && current < value) {
    current *= BASE;
    exp++;
  }

  if (current !== value) {
    // value is not an exact power of BASE (shouldn't really happen)
    return "";
  }

  // 2) Special handling for BASE = 2:
  //    give each exponent its own color level (1–11)
  if (BASE === 2) {
    // exp goes from 1..11, and we have tile-exp-1..tile-exp-11
    const level = Math.min(exp, 11);
    return `tile-exp-${level}`;
  }

  // 3) For BASE = 3, 4, 5:
  //    use the exponent directly (1..maxExp) so every exponent gets its own color.
  let level = exp;

  // clamp between 1 and 11 (you have 11 total classes available)
  if (level < 1) level = 1;
  if (level > 11) level = 11;

  return `tile-exp-${level}`;

}



// Return a list of all empty cells as { row, col }
function getEmptyCells() {
  const emptyCells = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (board[row][col] === 0) {
        emptyCells.push({ row, col });
      }
    }
  }
  return emptyCells;
}

// Check if there are no empty cells left
function isBoardFull() {
  return getEmptyCells().length === 0;
}

// Spawn a new tile with value BASE in a random empty cell
function spawnTile() {
  const emptyCells = getEmptyCells();
  if (emptyCells.length === 0) return;

  const randomIndex = Math.floor(Math.random() * emptyCells.length);
  const { row, col } = emptyCells[randomIndex];

  board[row][col] = BASE;
  lastSpawn = { row, col };
}


// =========================
// Win / Game Over Checks
// =========================

// Check if any moves are possible (either empty cells or merges)
function canMove() {
  if (!isBoardFull()) {
    return true; // still empty space somewhere
  }

  // check for possible merges horizontally
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE - 1; col++) {
      if (board[row][col] === board[row][col + 1]) {
        return true;
      }
    }
  }

  // check for possible merges vertically
  for (let col = 0; col < GRID_SIZE; col++) {
    for (let row = 0; row < GRID_SIZE - 1; row++) {
      if (board[row][col] === board[row + 1][col]) {
        return true;
      }
    }
  }

  // no moves left
  return false;
}

// Called after a move, if player hasn't already won
function checkGameOver() {
  if (!canMove()) {
    gameOver = true;
    saveHighScoreIfNeeded();
    statusElement.textContent = "Game Over! No more moves.";
  }
}



// Check if the player has reached the target tile (e.g. 6561)
function checkWin() {
  if (hasWon) return;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (board[row][col] >= TARGET_TILE) {
        hasWon = true;
        gameOver = true;

        saveHighScoreIfNeeded();
        statusElement.textContent = "You reached the target tile!";

        return;
      }
    }
  }
}


// =========================
// Row / Column Utilities
// =========================

// Slide and merge a single row to the LEFT according to 2048 rules
function slideAndMergeRowLeft(row) {
  // 1) remove zeros
  const nonZero = row.filter((v) => v !== 0);

  const newRow = [];
  let gainedScore = 0;
  const mergedPositions = []; // indices in newRow where a merge happened

  // 2) merge equal neighbors from left to right
  for (let i = 0; i < nonZero.length; i++) {
    if (i < nonZero.length - 1 && nonZero[i] === nonZero[i + 1]) {
      const mergedValue = nonZero[i] * BASE; // next power of base
      const idx = newRow.length;             // index where this merged tile will land
      newRow.push(mergedValue);
      mergedPositions.push(idx);
      gainedScore += mergedValue;
      i++; // skip the next one (already merged)
    } else {
      newRow.push(nonZero[i]);
    }
  }

  // 3) pad with zeros to fixed length
  while (newRow.length < GRID_SIZE) {
    newRow.push(0);
  }

  return { newRow, gainedScore, mergedPositions };
}


function reverseRow(row) {
  return [...row].reverse();
}

function getColumn(boardRef, colIndex) {
  return boardRef.map((row) => row[colIndex]);
}

function setColumn(boardRef, colIndex, newCol) {
  for (let r = 0; r < GRID_SIZE; r++) {
    boardRef[r][colIndex] = newCol[r];
  }
}

// =========================
// Move Functions (Left/Right/Up/Down)
// =========================

function moveLeft() {
  let moved = false;
  let totalGained = 0;
  mergedCells = [];    // reset for this move

  for (let row = 0; row < GRID_SIZE; row++) {
    const currentRow = board[row];
    const { newRow, gainedScore, mergedPositions } = slideAndMergeRowLeft(currentRow);

    if (JSON.stringify(newRow) !== JSON.stringify(currentRow)) {
      moved = true;
      board[row] = newRow;
      totalGained += gainedScore;

      // record merged cells for animation
      mergedPositions.forEach((colIndex) => {
        mergedCells.push({ row, col: colIndex });
      });
    }
  }

  if (moved) {
    score += totalGained;
    updateScoreDisplay();
    saveHighScoreIfNeeded();
    spawnTile();
    drawBoard();
    checkWin();
    if (!gameOver) {
      checkGameOver();
    }
  }

}


function moveRight() {
  let moved = false;
  let totalGained = 0;
  mergedCells = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    const currentRow = board[row];
    let reversed = reverseRow(currentRow);
    const { newRow, gainedScore, mergedPositions } = slideAndMergeRowLeft(reversed);
    newRow.reverse(); // flip back

    if (JSON.stringify(newRow) !== JSON.stringify(currentRow)) {
      moved = true;
      board[row] = newRow;
      totalGained += gainedScore;

      mergedPositions.forEach((revIndex) => {
        const colIndex = GRID_SIZE - 1 - revIndex;
        mergedCells.push({ row, col: colIndex });
      });
    }
  }

  if (moved) {
    score += totalGained;
    updateScoreDisplay();
    saveHighScoreIfNeeded();
    spawnTile();
    drawBoard();
    checkWin();
    if (!gameOver) {
      checkGameOver();
    }
  }

}


function moveUp() {
  let moved = false;
  let totalGained = 0;
  mergedCells = [];

  for (let col = 0; col < GRID_SIZE; col++) {
    const column = getColumn(board, col);
    const { newRow, gainedScore, mergedPositions } = slideAndMergeRowLeft(column);

    if (JSON.stringify(newRow) !== JSON.stringify(column)) {
      moved = true;
      setColumn(board, col, newRow);
      totalGained += gainedScore;

      mergedPositions.forEach((rowIndex) => {
        mergedCells.push({ row: rowIndex, col });
      });
    }
  }

  if (moved) {
    score += totalGained;
    updateScoreDisplay();
    saveHighScoreIfNeeded();
    spawnTile();
    drawBoard();
    checkWin();
    if (!gameOver) {
      checkGameOver();
    }
  }

}


function moveDown() {
  let moved = false;
  let totalGained = 0;
  mergedCells = [];

  for (let col = 0; col < GRID_SIZE; col++) {
    const column = getColumn(board, col);
    let reversed = reverseRow(column);
    const { newRow, gainedScore, mergedPositions } = slideAndMergeRowLeft(reversed);
    newRow.reverse();

    if (JSON.stringify(newRow) !== JSON.stringify(column)) {
      moved = true;
      setColumn(board, col, newRow);
      totalGained += gainedScore;

      mergedPositions.forEach((revIndex) => {
        const rowIndex = GRID_SIZE - 1 - revIndex;
        mergedCells.push({ row: rowIndex, col });
      });
    }
  }

  if (moved) {
    score += totalGained;
    updateScoreDisplay();
    saveHighScoreIfNeeded();
    spawnTile();
    drawBoard();
    checkWin();
    if (!gameOver) {
      checkGameOver();
    }
  }

}


// =========================
// Game Setup & Input
// =========================

function startGame() {
  clearTimer();

  board = createEmptyBoard();
  score = 0;
  gameOver = false;
  hasWon = false;
  lastSpawn = null;
  mergedCells = [];
  statusElement.textContent = "";

  updateScoreDisplay();
  loadHighScore();
  startTimerIfNeeded();

  spawnTile();
  spawnTile();
  drawBoard();
}



function triggerSlideAnimation(direction) {
  // Remove any previous slide classes
  gridElement.classList.remove("slide-left", "slide-right", "slide-up", "slide-down");

  if (!direction) return;

  const className = `slide-${direction}`;
  gridElement.classList.add(className);

  // Remove class after animation finishes (about 150ms)
  setTimeout(() => {
    gridElement.classList.remove(className);
  }, 180);
}


function setBase(newBase) {
  BASE = newBase;
  TARGET_TILE = TARGET_TILE_BY_BASE[BASE];

  // Reset game with new base
  startGame();

  // Update active button styling
  baseButtons.forEach((btn) => {
    const btnBase = Number(btn.getAttribute("data-base"));
    if (btnBase === BASE) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });
}

function handleTouchStart(e) {
  e.preventDefault();  // ⬅ stop mobile scrolling
  if (!e.touches || e.touches.length === 0) return;

  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}

function handleTouchMove(e) {
  e.preventDefault(); // just block scrolling
}


function handleTouchEnd(e) {
  e.preventDefault();
  if (touchStartX === null || touchStartY === null) return;

  // On touchend, use changedTouches if available
  let x, y;
  if (e.changedTouches && e.changedTouches.length > 0) {
    x = e.changedTouches[0].clientX;
    y = e.changedTouches[0].clientY;
  } else {
    // fallback (rare)
    x = touchStartX;
    y = touchStartY;
  }

  touchEndX = x;
  touchEndY = y;

  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;

  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  const SWIPE_THRESHOLD = 30; // pixels

  if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
    // too small, ignore
    touchStartX = touchStartY = touchEndX = touchEndY = null;
    return;
  }

  if (absDx > absDy) {
    // horizontal swipe
    if (dx > 0) {
      // swipe right
      moveRight();
    } else {
      // swipe left
      moveLeft();
    }
  } else {
    // vertical swipe
    if (dy > 0) {
      // swipe down
      moveDown();
    } else {
      // swipe up
      moveUp();
    }
  }

  // reset
  touchStartX = touchStartY = touchEndX = touchEndY = null;
}


// Keyboard input for WASD + Arrow keys
window.addEventListener("keydown", (event) => {
  if (gameOver) {
    return; // ignore input when game is over (win or lose)
  }

  const key = event.key;

  if (key === "ArrowLeft" || key === "a" || key === "A") {
    event.preventDefault();
    moveLeft();
  } else if (key === "ArrowRight" || key === "d" || key === "D") {
    event.preventDefault();
    moveRight();
  } else if (key === "ArrowUp" || key === "w" || key === "W") {
    event.preventDefault();
    moveUp();
  } else if (key === "ArrowDown" || key === "s" || key === "S") {
    event.preventDefault();
    moveDown();
  }
});

restartButton.addEventListener("click", () => {
  startGame();
});


baseButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const newBase = Number(btn.getAttribute("data-base"));
    if (newBase !== BASE) {
      setBase(newBase);
    }
  });
});

// Attach touch listeners to the grid so swipes work on mobile
gridElement.addEventListener("touchstart", handleTouchStart, { passive: false });
gridElement.addEventListener("touchmove", handleTouchMove, { passive: false });
gridElement.addEventListener("touchend", handleTouchEnd, { passive: false });



// Start on load
startGame();
