# Spaced Repetition

ExamPrep's spaced-repetition feature turns existing questions (MCQ, multi-select,
fill-in-the-blank) into review cards scheduled with **FSRS** — the same algorithm modern
Anki uses, via the open-source [`ts-fsrs`](https://www.npmjs.com/package/ts-fsrs)
library. There is **one** scheduler: both the review board and test grading feed the same
engine, so a card's memory state is always consistent.

---

## Architecture

```
CLIENT (React 19)                          SERVER (Express 5 + Mongoose)
SpacedRepetitionBoard.tsx                  routes/spaced-repetition.routes.ts
  └─ useSpacedRepetitionSession.ts            GET  /api/spaced-repetition/session
       └─ services/SpacedRepetitionService     POST /api/spaced-repetition/review
            ⇅ /api/spaced-repetition/*           └─ controllers/spaced-repetition.controller.ts  (thin)
                                                      └─ services/spaced-repetition.service.ts   (FSRS logic)
test grading ─────────────────────────────────────────┘ (test.service.ts calls reviewCard)
                                                      └─ models/SpacedRepetition.ts
                                                      └─ config/fsrs-config.ts  (one global config)
```

**Dependency direction:** controllers and `test.service` both depend on
`SpacedRepetitionService`. No service depends on a controller.

### Key files
| File | Role |
|------|------|
| `server/src/services/spaced-repetition.service.ts` | All FSRS logic: `reviewCard`, `buildSession`, interval helpers |
| `server/src/controllers/spaced-repetition.controller.ts` | Thin HTTP layer (`getSession`, `submitReview`) |
| `server/src/models/SpacedRepetition.ts` | One card per `(userId, questionId)` |
| `server/src/config/fsrs-config.ts` | Single global FSRS config |
| `server/src/services/test.service.ts` | Calls `reviewCard` per graded question |
| `client/src/pages/SpacedRepetitionBoard.tsx` | Review screen |
| `client/src/hooks/useSpacedRepetitionSession.ts` | In-memory session queue |
| `client/src/components/spaced-repetition/SpacedRepetitionCardView.tsx` | Card UI + keyboard shortcuts |
| `client/src/services/SpacedRepetitionService.ts` | API client + types |

---

## How FSRS works here

Each card carries FSRS state: `stability` (days a memory lasts), `difficulty` (1–10),
plus `state` (`new → learning → review`, with `relearning` on a lapse). On every review,
`ts-fsrs` takes the card + the rating and returns the next `due` date and updated state.

Ratings map 1:1 to FSRS grades: **Again (1), Hard (2), Good (3), Easy (4)**.

Scheduling is governed by one global config (`getFSRSParams()`):
- `request_retention` — target recall probability. Default **0.9**; override with the
  `FSRS_REQUEST_RETENTION` env var. Lower = longer intervals/less workload.
- `maximum_interval` — 36500 days (100 years).
- `enable_fuzz` — randomizes intervals slightly to avoid review pile-ups.
- `enable_short_term` — standard FSRS learning/relearning step handling.
- Learning steps `[1, 10]` min; relearning steps `[10]` min.

> There are no per-deck/per-user presets — a single tuned config is used everywhere.

---

## API

### `GET /api/spaced-repetition/session`
Build a study session. Query params (one scope required): `topicId`, `subjectId`,
`spaceId`, and optional `limit` (default 20).

Response:
```jsonc
{
  "learningItems": [ /* due learning/relearning cards (bypass limits) */ ],
  "reviewItems":   [ /* due review cards, capped at limit */ ],
  "newItems":      [ /* candidates with no card record yet, capped at limit */ ],
  "total": 42
}
```
Each item is annotated with `cardType` and `nextIntervals` (Again/Hard/Good/Easy preview
labels computed by the backend).

### `POST /api/spaced-repetition/review`
Body: `{ "questionId": "<id>", "rating": "Again|Hard|Good|Easy" }`.
Applies the rating, persists the new FSRS state, appends to the card's `history[]`, and
returns the updated card plus fresh `nextIntervals`. New cards are seeded atomically
(upsert) to respect the unique `(userId, questionId)` index under concurrent first reviews.

---

## Client session queue

The hook fetches a batch (~50) and sequences cards locally to mirror Anki:

- Three queues — **new**, **review**, **learning** — plus a min-heap
  (`learningDueHeap`) for learning cards with a future `showAfter` time.
- Priority: **learning → (2 review : 1 new mix) → heap reappearance**.
- **Learn-ahead window: 20 min.** After a rating, if the card's next due time is within
  20 minutes it re-queues into the heap and reappears this session; otherwise it's done
  for the session.
- Counters: blue = new, red = learning, green = review (the current card counts in its
  own bucket until answered).

**Keyboard shortcuts:** `Space`/`Enter` reveal the answer; `1`=Again `2`=Hard `3`=Good
`4`=Easy. A rating that fails to save shows a toast and keeps the card on screen (it is
not silently lost), and rapid double-taps are ignored while a submit is in flight.

---

## Test integration

When a test is submitted, `test.service.submitTest` grades each question and feeds the
result into the same scheduler: **correct → Good, wrong → Again**, via
`SpacedRepetitionService.reviewCard(userId, questionId, rating, reviewedAt)`. All updates
share one timestamp and run in a `Promise.all`; ratings are de-duplicated per question.

---

## Tuning retention

Set `FSRS_REQUEST_RETENTION` in the server environment (e.g. `0.85` for fewer reviews,
`0.95` for stronger retention). No code change or migration needed — it's read by
`getFSRSParams()` at runtime.

---

## Data reset

The card schema is FSRS-only (no legacy SM-2 fields). If upgrading from the old mixed
schema, **drop the `spacedrepetitions` collection** so stale `easeFactor`/`intervalDays`
documents don't linger; cards rebuild themselves on first review.
