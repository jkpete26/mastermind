"use strict";

/*
 * Tests for the pure game logic in script.js (no browser, no installs).
 * Run with:  node tests.js
 * Exits with an error code if anything fails.
 */

const assert = require("assert");
const {
  COLORS, DIFFICULTIES, generateSecret, score,
  countFeedbackPegs, feedbackMatches,
  compareEntries, insertEntry, formatTime, cleanName, sanitizeEntries,
  pickHintSlot, freshRow
} = require("./script.js");

/* ---------- tiny test runner ---------- */

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok   " + name);
  } catch (err) {
    failures.push(name);
    console.log("  FAIL " + name + "\n       " + String(err.message).split("\n")[0]);
  }
}

/* Letters make codes easy to read: R O Y G B P map to the six colors. */
const LETTER = { R: 0, O: 1, Y: 2, G: 3, B: 4, P: 5 };
function code(text) {
  return Array.from(text).map(function (ch) { return LETTER[ch]; });
}
function check(secret, guess, exact, colorOnly) {
  assert.deepStrictEqual(score(code(secret), code(guess)), { exact: exact, colorOnly: colorOnly },
    "secret " + secret + " vs guess " + guess);
}

/* ---------- score: known cases ---------- */

console.log("score: known cases");

test("roadmap example: secret RRBG vs guess RRRB", function () { check("RRBG", "RRRB", 2, 1); });
test("perfect guess", function () { check("RGBY", "RGBY", 4, 0); });
test("nothing in common", function () { check("RRRR", "GGGG", 0, 0); });
test("every color present but all in the wrong place", function () { check("RGBY", "GBYR", 0, 4); });
test("guess repeats a color the secret has once", function () { check("RGBY", "RRRR", 1, 0); });
test("secret repeats a color, guess has it once", function () { check("RRRR", "RGGG", 1, 0); });
test("repeats are only counted as often as the secret has them", function () { check("RGGG", "GRRR", 0, 2); });
test("mix of exact and color-only with repeats", function () { check("RRGB", "GRRR", 1, 2); });

console.log("two-player feedback checks");

test("manual black and white pegs match a guess with repeated colors", function () {
  const secret = code("RRBG");
  const guess = code("RRRB");
  const feedback = ["exact", "exact", "color", null];
  assert.deepStrictEqual(countFeedbackPegs(feedback), { exact: 2, colorOnly: 1 });
  assert.strictEqual(feedbackMatches(secret, guess, feedback), true);
});

test("manual feedback accepts all-white pegs when every color is in the wrong slot", function () {
  assert.strictEqual(feedbackMatches(code("RGBY"), code("GBYR"), ["color", "color", "color", "color"]), true);
});

test("manual feedback rejects incorrect black and white counts", function () {
  assert.strictEqual(feedbackMatches(code("RRBG"), code("RRRB"), ["exact", "color", "color", null]), false);
});

test("manual feedback rejects too many pegs and invalid peg values", function () {
  const secret = code("RGBY");
  const guess = code("RGBY");
  assert.strictEqual(feedbackMatches(secret, guess, ["exact", "exact", "exact"]), false);
  assert.strictEqual(feedbackMatches(secret, guess, ["exact", "exact", "exact", "blue"]), false);
});

console.log("score: 6 and 10 peg codes");

test("6 pegs, all swapped halves", function () { check("RRRGGG", "GGGRRR", 0, 6); });
test("10 pegs, perfect guess", function () { check("RRGGBBYYOO", "RRGGBBYYOO", 10, 0); });
test("10 pegs, reversed code", function () { check("RRGGBBYYOO", "OOYYBBGGRR", 2, 8); });
test("10 pegs, one color repeated in the guess", function () { check("RGBYOPRGBY", "RRRRRRRRRR", 2, 0); });
test("10 pegs, no overlap", function () { check("RRRRRGGGGG", "BBBBBYYYYY", 0, 0); });

console.log("score: cross-check against an independent method");

test("20,000 random codes (4, 6 and 10 pegs) match a second implementation", function () {
  // Reference: exact = same-slot matches; total matches = sum over colors of
  // min(count in secret, count in guess); color-only = total - exact.
  function reference(secret, guess) {
    let exact = 0;
    const s = new Array(6).fill(0);
    const g = new Array(6).fill(0);
    for (let i = 0; i < secret.length; i++) {
      if (secret[i] === guess[i]) exact++;
      s[secret[i]]++;
      g[guess[i]]++;
    }
    let total = 0;
    for (let c = 0; c < 6; c++) total += Math.min(s[c], g[c]);
    return { exact: exact, colorOnly: total - exact };
  }
  const sizes = [4, 6, 10];
  for (let n = 0; n < 20000; n++) {
    const pegs = sizes[n % 3];
    const secret = generateSecret(pegs);
    const guess = generateSecret(pegs);
    const got = score(secret, guess);
    assert.deepStrictEqual(got, reference(secret, guess), secret + " vs " + guess);
    assert.ok(got.exact + got.colorOnly <= pegs, "can't score more pegs than exist");
    assert.deepStrictEqual(score(secret, secret), { exact: pegs, colorOnly: 0 });
  }
});

test("scoring is symmetric in the total number of matching colors", function () {
  for (let n = 0; n < 2000; n++) {
    const a = generateSecret(10);
    const b = generateSecret(10);
    const ab = score(a, b);
    const ba = score(b, a);
    assert.strictEqual(ab.exact, ba.exact);
    assert.strictEqual(ab.colorOnly, ba.colorOnly);
  }
});

/* ---------- config and secret generation ---------- */

console.log("config and secret generation");

test("the six colors have distinct ids, names and symbols", function () {
  assert.strictEqual(COLORS.length, 6);
  ["id", "name", "symbol"].forEach(function (key) {
    assert.strictEqual(new Set(COLORS.map(function (c) { return c[key]; })).size, 6, key + " must be unique");
  });
});

test("difficulties match the roadmap table", function () {
  assert.deepStrictEqual(
    Object.keys(DIFFICULTIES).map(function (k) {
      const d = DIFFICULTIES[k];
      return [k, d.pegs, d.guesses, d.hints];
    }),
    [["easy", 4, 10, 1], ["medium", 6, 12, 2], ["hard", 10, 20, 3]]
  );
});

test("every difficulty has fewer hints than pegs (a hint can't reveal the whole code)", function () {
  Object.keys(DIFFICULTIES).forEach(function (k) {
    assert.ok(DIFFICULTIES[k].hints < DIFFICULTIES[k].pegs, k);
  });
});

test("generateSecret: right length, valid colors, repeats allowed", function () {
  [4, 6, 10].forEach(function (pegs) {
    const secret = generateSecret(pegs);
    assert.strictEqual(secret.length, pegs);
    secret.forEach(function (c) { assert.ok(Number.isInteger(c) && c >= 0 && c < COLORS.length); });
  });
  assert.deepStrictEqual(generateSecret(4, function () { return 0; }), [0, 0, 0, 0]);
  assert.deepStrictEqual(generateSecret(3, function () { return 0.999; }), [5, 5, 5]);
});

/* ---------- hints ---------- */

console.log("hints");

test("hints are always correct, never repeat a slot and never reveal the full code", function () {
  Object.keys(DIFFICULTIES).forEach(function (key) {
    const pegs = DIFFICULTIES[key].pegs;
    const hints = DIFFICULTIES[key].hints;
    for (let trial = 0; trial < 3000; trial++) {
      const secret = generateSecret(pegs);
      const locked = new Array(pegs).fill(false);
      for (let h = 0; h < hints; h++) {
        // The player's row: a random mix of empty, right and wrong pegs.
        const row = freshRow(secret, locked).map(function (c, i) {
          if (locked[i]) return c;
          return [null, secret[i], (secret[i] + 1) % 6][Math.floor(Math.random() * 3)];
        });
        const i = pickHintSlot(secret, row, locked);
        assert.ok(i >= 0 && i < pegs);
        assert.strictEqual(locked[i], false, "slot " + i + " was already revealed");
        locked[i] = true;
      }
      const revealed = locked.filter(Boolean).length;
      assert.strictEqual(revealed, hints);
      assert.ok(revealed < pegs, "whole code revealed");
    }
  });
});

test("a hint prefers slots the player has wrong", function () {
  for (let k = 0; k < 200; k++) {
    const i = pickHintSlot([0, 1, 2, 3], [0, 1, 9, 9], [false, false, false, false]);
    assert.ok(i === 2 || i === 3);
  }
});

test("a hint still works when the whole row is already right", function () {
  assert.ok(pickHintSlot([0, 1, 2, 3], [0, 1, 2, 3], [false, false, false, false]) >= 0);
});

test("no hint is given when only one slot would stay hidden", function () {
  assert.strictEqual(pickHintSlot([0, 1, 2, 3], [null, null, null, null], [true, true, true, false]), -1);
});

test("freshRow carries over only the revealed pegs", function () {
  assert.deepStrictEqual(freshRow([5, 4, 3, 2], [false, true, false, true]), [null, 4, null, 2]);
});

/* ---------- timer formatting, names, leaderboard ---------- */

console.log("time, names and leaderboard");

test("formatTime", function () {
  assert.strictEqual(formatTime(0), "0:00");
  assert.strictEqual(formatTime(65432), "1:05");
  assert.strictEqual(formatTime(65432, true), "1:05.4");
  assert.strictEqual(formatTime(600000), "10:00");
  assert.strictEqual(formatTime(-5), "0:00");
});

test("cleanName trims, collapses spaces, caps at 12 characters, defaults to Anonymous", function () {
  assert.strictEqual(cleanName("  Al   ice  "), "Al ice");
  assert.strictEqual(cleanName(""), "Anonymous");
  assert.strictEqual(cleanName(null), "Anonymous");
  assert.strictEqual(cleanName("abcdefghijklmnop"), "abcdefghijkl");
  assert.strictEqual(cleanName("😀".repeat(14)), "😀".repeat(12));
});

function entry(guesses, hints, ms, date) {
  return { name: "x", guesses: guesses, hints: hints, ms: ms, date: date };
}

test("ranking: fewest guesses, then fewest hints, then fastest, then earliest", function () {
  const sorted = [entry(5, 0, 9000, 1), entry(4, 2, 9000, 2), entry(4, 1, 20000, 3), entry(4, 1, 10000, 4)]
    .sort(compareEntries);
  assert.deepStrictEqual(sorted.map(function (e) { return e.date; }), [4, 3, 2, 1]);
  assert.ok(compareEntries(entry(3, 0, 5, 1), entry(3, 0, 5, 2)) < 0);
});

test("insertEntry keeps the top 10 and reports whether the new entry made it", function () {
  let list = [];
  for (let i = 0; i < 10; i++) list = insertEntry(list, entry(5, 0, 1000 + i, i)).list;
  let r = insertEntry(list, entry(9, 0, 1, 99));
  assert.strictEqual(r.kept, false);
  assert.strictEqual(r.list.length, 10);
  r = insertEntry(list, entry(2, 0, 1, 100));
  assert.strictEqual(r.kept, true);
  assert.strictEqual(r.list[0].guesses, 2);
  assert.strictEqual(r.list.length, 10);
});

test("sanitizeEntries drops junk from storage", function () {
  assert.strictEqual(sanitizeEntries("nope").length, 0);
  assert.strictEqual(sanitizeEntries([null, { name: 1 }, entry(3, 0, 5, 1)]).length, 1);
});

/* ---------- summary ---------- */

console.log("\n" + passed + " passed, " + failures.length + " failed");
if (failures.length > 0) {
  console.log("Failed: " + failures.join("; "));
  process.exitCode = 1;
}
