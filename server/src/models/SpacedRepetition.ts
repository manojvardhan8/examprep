import mongoose, { Schema, Document } from 'mongoose';

/**
 * SpacedRepetition — one card per (user, question).
 *
 * Scheduling is driven entirely by FSRS (via the `ts-fsrs` library), the same
 * algorithm modern Anki uses. Every field below maps directly onto a `ts-fsrs`
 * `Card`; there is no legacy SM-2 state.
 */
export interface ISpacedRepetition extends Document {
    userId: mongoose.Types.ObjectId;
    questionId: mongoose.Types.ObjectId;

    /** FSRS lifecycle state. Mirrors `ts-fsrs` `State`. */
    state: 'new' | 'learning' | 'review' | 'relearning';

    // ─── FSRS card state (1:1 with ts-fsrs Card) ───
    /** Memory stability, in days. Higher = remembered longer. */
    stability: number;
    /** Item difficulty (1–10). Higher = harder to retain. */
    difficulty: number;
    /** Days elapsed since the previous review at the time it was scheduled. */
    elapsedDays: number;
    /** Days until the next review at the time it was scheduled. */
    scheduledDays: number;
    /** Current index into the (re)learning steps sequence. */
    learningSteps: number;
    /** Number of times the card lapsed (rated "Again" while in review). */
    lapses: number;
    /** Total successful repetitions. Maps to ts-fsrs `Card.reps`. */
    reps: number;

    lastReviewedAt?: Date;
    nextReviewAt: Date;
    createdAt: Date;
    updatedAt: Date;

    /** Append-only review log, used for stats and future FSRS optimization. */
    history: Array<{
        rating: number;        // ts-fsrs Rating: 1=Again 2=Hard 3=Good 4=Easy
        state: string;         // card state BEFORE this review
        reviewedAt: Date;
        elapsedDays: number;
        scheduledDays: number;
        stability: number;
        difficulty: number;
        reviewDuration: number;
    }>;
}

const SpacedRepetitionSchema = new Schema<ISpacedRepetition>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        questionId: { type: Schema.Types.ObjectId, ref: 'ContentBlock', required: true },
        state: {
            type: String,
            enum: ['new', 'learning', 'review', 'relearning'],
            default: 'new'
        },

        // FSRS card state
        stability: { type: Number, default: 0 },
        difficulty: { type: Number, default: 0 },
        elapsedDays: { type: Number, default: 0 },
        scheduledDays: { type: Number, default: 0 },
        learningSteps: { type: Number, default: 0 },
        lapses: { type: Number, default: 0 },
        reps: { type: Number, default: 0, min: 0 },

        lastReviewedAt: { type: Date },
        nextReviewAt: {
            type: Date,
            default: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d; }
        },

        history: [{
            rating: { type: Number, required: true },
            state: { type: String, required: true },
            reviewedAt: { type: Date, default: Date.now },
            elapsedDays: { type: Number, default: 0 },
            scheduledDays: { type: Number, default: 0 },
            stability: { type: Number, default: 0 },
            difficulty: { type: Number, default: 0 },
            reviewDuration: { type: Number, default: 0 }
        }]
    },
    { timestamps: true }
);

// Due-card queries (session build + dashboard/topic aggregations).
SpacedRepetitionSchema.index({ userId: 1, nextReviewAt: 1 });
// Exactly one card per user/question.
SpacedRepetitionSchema.index({ userId: 1, questionId: 1 }, { unique: true });

export default mongoose.model<ISpacedRepetition>('SpacedRepetition', SpacedRepetitionSchema);
