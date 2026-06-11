import mongoose from 'mongoose';
import { createEmptyCard, FSRS, Rating, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import SpacedRepetition from '@/models/SpacedRepetition.ts';
import type { ISpacedRepetition } from '@/models/SpacedRepetition.ts';
import ContentBlock, { ContentBlockType } from '@/models/ContentBlock.ts';
import Topic from '@/models/Topic.ts';
import { getFSRSParams } from '@/config/fsrs-config.ts';

export type ReviewRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface NextIntervals {
    Again: string;
    Hard: string;
    Good: string;
    Easy: string;
}

export interface SessionScope {
    topicId?: string | undefined;
    subjectId?: string | undefined;
    spaceId?: string | undefined;
}

// Anki's default "learn ahead" window: learning cards due within this window
// are pulled into the current session.
const LEARN_AHEAD_MS = 20 * 60 * 1000;

const RATING_MAP: Record<ReviewRating, Grade> = {
    Again: Rating.Again,
    Hard: Rating.Hard,
    Good: Rating.Good,
    Easy: Rating.Easy
};

/**
 * Single source of truth for spaced-repetition scheduling.
 *
 * Both the review board (controller) and test grading (test.service) call
 * `reviewCard`, so a card's FSRS state stays consistent no matter which surface
 * the user reviewed it from.
 */
export class SpacedRepetitionService {
    // ─── Interval formatting ───

    /** Format a duration in ms to an Anki-style label ("<1m", "10m", "3d", "2mo"). */
    static formatMs(ms: number): string {
        if (!Number.isFinite(ms) || ms <= 0) return '<1m';
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(ms / 3600000);
        const days = Math.floor(ms / 86400000);
        const months = Math.floor(days / 30);

        if (minutes < 1) return '<1m';
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        if (days < 31) return `${days}d`;
        return `${months}mo`;
    }

    /**
     * Compute the four rating-interval previews for a card as of `now`.
     * Ensures "Easy" reads as strictly longer than "Good" when both are in days.
     */
    static calculateNextIntervals(card: Card, fsrs: FSRS, now: Date): NextIntervals {
        try {
            const scheduling = fsrs.repeat(card, now);
            const times = {
                Again: scheduling[Rating.Again].card.due.getTime() - now.getTime(),
                Hard: scheduling[Rating.Hard].card.due.getTime() - now.getTime(),
                Good: scheduling[Rating.Good].card.due.getTime() - now.getTime(),
                Easy: scheduling[Rating.Easy].card.due.getTime() - now.getTime()
            };

            const goodDays = Math.floor(times.Good / 86400000);
            const easyDays = Math.floor(times.Easy / 86400000);
            if (goodDays >= 1 && easyDays <= goodDays) {
                times.Easy = (goodDays + 1) * 86400000;
            }

            return {
                Again: this.formatMs(times.Again),
                Hard: this.formatMs(times.Hard),
                Good: this.formatMs(times.Good),
                Easy: this.formatMs(times.Easy)
            };
        } catch (err) {
            console.warn('FSRS interval calc failed, using fallback:', err);
            return { Again: '1m', Hard: '6m', Good: '10m', Easy: '2d' };
        }
    }

    // ─── State mapping (string ↔ ts-fsrs State) ───

    private static stringToState(s: ISpacedRepetition['state']): State {
        switch (s) {
            case 'learning': return State.Learning;
            case 'review': return State.Review;
            case 'relearning': return State.Relearning;
            default: return State.New;
        }
    }

    private static stateToString(s: State): ISpacedRepetition['state'] {
        switch (s) {
            case State.Learning: return 'learning';
            case State.Review: return 'review';
            case State.Relearning: return 'relearning';
            default: return 'new';
        }
    }

    /** Reconstruct a ts-fsrs Card from a stored SpacedRepetition document. */
    private static toFsrsCard(sr: ISpacedRepetition, now: Date): Card {
        const card = createEmptyCard(now);
        card.due = sr.nextReviewAt;
        if (sr.lastReviewedAt) card.last_review = sr.lastReviewedAt;
        card.reps = sr.reps || 0;
        card.stability = sr.stability || 0;
        card.difficulty = sr.difficulty || 0;
        card.elapsed_days = sr.elapsedDays || 0;
        card.scheduled_days = sr.scheduledDays || 0;
        card.learning_steps = sr.learningSteps || 0;
        card.lapses = sr.lapses || 0;
        card.state = this.stringToState(sr.state);
        return card;
    }

    // ─── Core: apply a review ───

    /**
     * Apply a rating to a card and persist the new FSRS state.
     *
     * Seeds the card atomically (upsert) so concurrent first-reviews of the same
     * (user, question) can't violate the unique index. Returns the updated
     * document plus the interval previews for re-displaying the card immediately.
     */
    static async reviewCard(
        userId: string | mongoose.Types.ObjectId,
        questionId: string | mongoose.Types.ObjectId,
        rating: ReviewRating,
        now: Date = new Date()
    ): Promise<{ doc: ISpacedRepetition; nextIntervals: NextIntervals }> {
        // Seed-or-fetch atomically to avoid E11000 under concurrent first reviews.
        const sr = await SpacedRepetition.findOneAndUpdate(
            { userId, questionId },
            { $setOnInsert: { state: 'new', createdAt: now } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        const fsrs = new FSRS(getFSRSParams());
        const card = this.toFsrsCard(sr, now);

        // Record the pre-review state for the history log.
        const stateBefore = this.stateToString(card.state);

        const fsrsRating = RATING_MAP[rating] ?? Rating.Good;
        const newCard = fsrs.repeat(card, now)[fsrsRating].card;

        sr.nextReviewAt = newCard.due;
        sr.lastReviewedAt = newCard.last_review || now;
        sr.reps = newCard.reps;
        sr.stability = newCard.stability;
        sr.difficulty = newCard.difficulty;
        sr.elapsedDays = newCard.elapsed_days;
        sr.scheduledDays = newCard.scheduled_days;
        sr.learningSteps = newCard.learning_steps;
        sr.lapses = newCard.lapses;
        sr.state = this.stateToString(newCard.state);

        if (!sr.history) sr.history = [];
        sr.history.push({
            rating: fsrsRating,
            state: stateBefore,
            reviewedAt: now,
            elapsedDays: card.elapsed_days,
            scheduledDays: card.scheduled_days,
            stability: newCard.stability,
            difficulty: newCard.difficulty,
            reviewDuration: 0
        });

        await sr.save();

        // Preview intervals for the *updated* card (for immediate re-queue in-session).
        const nextIntervals = this.calculateNextIntervals(this.toFsrsCard(sr, now), fsrs, now);
        return { doc: sr, nextIntervals };
    }

    // ─── Core: build a study session ───

    /**
     * Build a review session for the given scope: separate learning / review /
     * new buckets, each annotated with interval previews. New cards are those
     * that have no SpacedRepetition record yet.
     */
    static async buildSession(params: { userId: mongoose.Types.ObjectId; scope: SessionScope; limit: number }) {
        const { userId, scope, limit } = params;
        const now = new Date();

        // 1. Resolve scope → topic IDs.
        let topicIds: mongoose.Types.ObjectId[] = [];
        if (scope.topicId) {
            topicIds = [new mongoose.Types.ObjectId(String(scope.topicId))];
        } else if (scope.subjectId) {
            const topics = await Topic.find({ subjectId: scope.subjectId }).select('_id').lean();
            topicIds = topics.map(t => t._id as mongoose.Types.ObjectId);
        }
        // (space-level scope intentionally yields no topics for now)

        const validTypes = [
            ContentBlockType.SINGLE_SELECT_MCQ,
            ContentBlockType.MULTI_SELECT_MCQ,
            ContentBlockType.FILL_IN_THE_BLANK
        ];

        // 2. Candidate questions in scope.
        const candidateQuestions = await ContentBlock.find({
            topicId: { $in: topicIds },
            kind: { $in: validTypes }
        }).select('_id kind question options blankAnswers topicId explanation hints').lean();

        const candidateIds = candidateQuestions.map(c => c._id);

        // 3. Due cards (including learn-ahead window).
        const cutoff = new Date(now.getTime() + LEARN_AHEAD_MS);
        const dueReviews = await SpacedRepetition.find({
            userId,
            questionId: { $in: candidateIds },
            nextReviewAt: { $lte: cutoff }
        })
            .sort({ nextReviewAt: 1 })
            .populate('questionId')
            .lean();

        // 4. New cards = candidates with no record yet.
        const existing = await SpacedRepetition.find({
            userId,
            questionId: { $in: candidateIds }
        }).select('questionId').lean();
        const reviewedIds = new Set(existing.map((r: any) => r.questionId.toString()));

        const newItemsMapped = candidateQuestions
            .filter(q => !reviewedIds.has(q._id.toString()))
            .map(q => ({
                _id: null,
                userId,
                questionId: q,
                isNew: true,
                state: 0, // State.New
                stability: 0,
                difficulty: 0,
                elapsedDays: 0,
                scheduledDays: 0,
                learningSteps: 0,
                lapses: 0,
                reps: 0
            }));

        // 5. Split due cards; learning cards bypass limits (Anki behavior).
        const learningCards = dueReviews.filter((r: any) => r.state === 'learning' || r.state === 'relearning');
        const reviewCards = dueReviews.filter((r: any) => r.state === 'review');

        const remainingReviewCards = reviewCards.slice(0, limit);
        const remainingNewCards = newItemsMapped.slice(0, limit);

        // 6. Annotate every card with its rating-interval previews.
        const fsrs = new FSRS(getFSRSParams());
        const previewFor = (item: any): NextIntervals => {
            const card = createEmptyCard(now);
            card.due = now; // interval preview is always relative to "now"
            if (item.lastReviewedAt) card.last_review = new Date(item.lastReviewedAt);
            card.reps = item.reps || 0;
            card.stability = item.stability || 0;
            card.difficulty = item.difficulty || 0;
            card.elapsed_days = item.elapsedDays || 0;
            card.scheduled_days = item.scheduledDays || 0;
            card.learning_steps = item.learningSteps || 0;
            card.lapses = item.lapses || 0;
            card.state = this.stringToState(
                typeof item.state === 'string' ? item.state : 'new'
            );
            return this.calculateNextIntervals(card, fsrs, now);
        };

        const annotate = (items: any[], cardType: 'new' | 'learning' | 'review') =>
            items.map(item => ({ ...item, nextIntervals: previewFor(item), cardType }));

        const total = learningCards.length + reviewCards.length + newItemsMapped.length;

        return {
            learningItems: annotate(learningCards, 'learning'),
            reviewItems: annotate(remainingReviewCards, 'review'),
            newItems: annotate(remainingNewCards, 'new'),
            total
        };
    }
}

export default SpacedRepetitionService;
