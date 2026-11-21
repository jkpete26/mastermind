# Mastermind

A browser-based Mastermind game for the CS 191 WebApp project. Plain HTML, CSS and JavaScript: no frameworks, no build step, no dependencies.

## Run it

Open `index.html` in a browser. That's it.

## Files

| File | What it is |
|------|------------|
| `index.html` | Page structure, dialogs |
| `style.css` | Layout, light and dark themes |
| `script.js` | Game logic, rendering, saving |
| `tests.js` | Tests for the game logic |
| `roadmap.md` | Plan and milestone status |

## Features

- Three difficulties: Easy (4 pegs), Medium (6), Hard (10), with a separate leaderboard and stats for each
- Play against the computer or choose Two players, where Player 1 sets the code and enters feedback that the computer checks after each Player 2 guess
- Click a color then a slot, or use keys 1-6, Backspace (undo) and Enter (submit)
- Black and white feedback pegs, plus the same counts written out
- Hints that reveal and lock one correct peg (Easy 1, Medium 2, Hard 3)
- Timer, name prompt after a win, and a top-10 leaderboard per difficulty
- Light and dark themes, chosen on first visit and saved
- Every color has its own symbol, so color isn't the only cue
- Works on desktop and phones

Everything is saved in the browser (`localStorage`): theme, difficulty, stats and leaderboards. They stay on that browser and device only.

## Run the tests

Requires [Node.js](https://nodejs.org). No packages to install.

```
node tests.js
```

It checks scoring (including the `RRBG` vs `RRRB` example, repeated colors, and 6 and 10 peg codes), hints, time formatting, names and leaderboard ranking.

## Publish on GitHub Pages

1. Create a new public repository on GitHub.
2. Upload `index.html`, `style.css` and `script.js`. The other files are optional. Keep `index.html` at the top level of the repository, not in a folder.
3. Go to **Settings > Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the `main` branch and the `/ (root)` folder, and save.
4. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/REPOSITORY-NAME/`.
5. Open that link on a computer and on a phone, and play one game to be sure it works.

Check your course's submission rules before publishing, since some courses require a particular host or format.

## Manual check before you submit

Automated checks cover Chrome only. Safari needs a quick look by hand. The game needs Safari 15.4 or newer (iOS 15.4 or newer) for the `dialog` element and focus styling.

For each of **Chrome** and **Safari**, on **desktop** and **phone**, on **Easy, Medium and Hard**:

- [ ] The welcome screen appears on a first visit, and the choice survives a reload
- [ ] The Light/Dark toggle works and both themes are readable
- [ ] Placing pegs, Undo, Clear row, Submit and Hint all work
- [ ] On Hard, the current row stays visible and the buttons stay reachable without sideways scrolling
- [ ] Winning asks for a name and shows the leaderboard with the new entry marked
- [ ] The leaderboard keeps each difficulty separate and survives a reload
- [ ] How to play opens and closes
- [ ] In a private window, where saving may be blocked, the game still plays and says so

## Known limits

- Leaderboards are per browser. A shared online board would need a server.
- Private browsing may block saving. The game still works, but scores last only until the page closes.
