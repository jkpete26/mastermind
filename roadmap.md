# Mastermind Web App: Roadmap

A browser-based Mastermind game built with HTML, CSS, and JavaScript only (no frameworks, no build step) for the CS 191 WebApp project. The computer sets a secret code and the player guesses it.

## Game Summary

- **Pegs:** colored circles with a distinct symbol each (red ▲, orange ■, yellow ◆, green ★, blue ●, purple ✚). 6 colors, repeats allowed.
- **Input:** click a color, then click a slot. Keyboard shortcuts: 1-6 place a color, Backspace undoes, Enter submits.
- **Feedback:** black/white pegs plus a short text count (exact vs. color-only matches).
- **Devices:** desktop and phone.
- **Files:** `index.html`, `style.css`, `script.js`.

| Difficulty | Pegs | Guesses | Hints |
|------------|------|---------|-------|
| Easy       | 4    | 10      | 1     |
| Medium     | 6    | 12      | 2     |
| Hard       | 10   | 20      | 3     |

## Assumptions

- The leaderboard is stored in the browser (localStorage): one board per difficulty, top 10, player-entered name (max 12 characters). A shared online board would need a backend and is out of scope.
- Ranking: fewest guesses, then fewest hints used, then fastest time.
- A hint reveals the correct color for one unrevealed position in the current row.
- Stats (played, win rate, average guesses, streak) are tracked per difficulty.

---

## Milestone 0: Prototype (done)

- Secret code generation, guess entry (click plus keyboard), and correct scoring with repeated colors.
- Board, win and lose messages, secret reveal, undo and clear row.
- Saved stats and a responsive layout.

## Milestone 1: Project structure (done)

- Split the single file into `index.html`, `style.css`, and `script.js`.
- Add a `DIFFICULTIES` config: easy {4 pegs, 10 guesses}, medium {6, 12}, hard {10, 20}.
- Separate pure logic (`generateSecret`, `score`) from DOM rendering.
- **Done when:** the game plays exactly as the prototype does, from three files.

## Milestone 2: Difficulty levels (done)

- Add a difficulty selector; changing it starts a new game (confirm if one is in progress).
- Scale slot and feedback-peg sizes by peg count so 10 pegs fit on a phone; the feedback grid becomes 2x5 on Hard.
- Keep the active row visible on tall boards (Hard has 20 rows).
- Track stats per difficulty.
- **Done when:** all three levels play correctly on desktop and at ~375px width.

## Milestone 3: Theme choice (done)

- Add a first-visit welcome screen with Light and Dark; the game shows after a pick.
- Use theme variables keyed on a `data-theme` attribute, including feedback peg colors.
- Add a header toggle to switch later; save the choice in localStorage.
- **Done when:** the choice persists across reloads and both themes are readable.

## Milestone 4: Timer and leaderboard (done)

- Start the timer on the first peg placed; stop it on win or loss.
- On a win, prompt for a name and save name, guesses, hints, time, and date to that difficulty's board.
- Add a leaderboard view with a tab per difficulty, top 10, newest entry highlighted, and a reset with confirmation.
- Render names with `textContent` only; handle localStorage being unavailable.
- Size the guessing area to fit exactly the code length: each row is as wide as its pegs plus the feedback, the board is centered, and the secret row lines up over the guess columns.
- **Done when:** entries sort correctly, stay separate per difficulty, and survive a reload; the board hugs the code length on all three difficulties.

## Milestone 5: Hint button (done)

- Add a hint button that shows hints left (Easy 1, Medium 2, Hard 3).
- A hint fills one correct, unrevealed position in the current row and locks that slot.
- Disable the button at zero hints or when the game ends; record hints used in the leaderboard entry.
- **Done when:** hints are always correct and never reveal the full code.

## Milestone 6: Polish, testing, delivery (built; Safari check and publishing still to do)

- [x] Add a how-to-play dialog, reduced-motion support, focus states, and contrast and symbol checks.
  - Contrast checked against WCAG for both themes (text 4.5:1, peg symbols 4.5:1, outlines 3:1); symbols and outlines were fixed where they failed.
  - Every color has its own symbol; every control shows a visible focus ring.
- [x] Test `score` on known cases (e.g. secret RRBG vs guess RRRB, and 10-peg codes). Run `node tests.js`.
- [x] Check Chrome, desktop and phone width, on all difficulties (automated, both themes, keyboard-only play).
- [ ] Manually check Safari and a real phone (checklist in `README.md`).
- [ ] Publish on GitHub Pages or another static host (steps in `README.md`; check course submission rules).
- **Done when:** there are no known bugs and the live link works.

---

## Open Questions

- Does the course require a particular structure, framework policy, or submission format?
- Do you eventually want a shared online leaderboard (needs a backend)?
