import api from '@/lib/api';
import type { ContentBlock } from '@/types/domain';

export type SpacedRepetitionRating = 'Again' | 'Hard' | 'Good' | 'Easy';

export interface NextIntervals {
    Again: string;
    Hard: string;
    Good: string;
    Easy: string;
}

export interface SpacedRepetitionSessionItem {
    _id: string | null; // null for brand-new cards (no record yet)
    userId: string;
    questionId: ContentBlock; // populated
    isNew?: boolean;

    // FSRS card state
    state?: number | string; // 0=New 1=Learning 2=Review 3=Relearning OR the string form
    stability?: number;
    difficulty?: number;
    elapsedDays?: number;
    scheduledDays?: number;
    learningSteps?: number;
    lapses?: number;
    reps?: number;

    nextReviewAt?: string;
    lastReviewedAt?: string;

    // Local session queue management
    isRetry?: boolean;
    showAfter?: number;

    // Backend-calculated interval previews
    nextIntervals?: NextIntervals;

    // Card type for visual highlighting
    cardType?: 'new' | 'learning' | 'review';
}

interface SessionResponse {
    learningItems: SpacedRepetitionSessionItem[];
    reviewItems: SpacedRepetitionSessionItem[];
    newItems: SpacedRepetitionSessionItem[];
    total: number;
}

export const SpacedRepetitionService = {
    getSession: async (context: { spaceId?: string; subjectId?: string; topicId?: string; limit?: number }) => {
        const params = new URLSearchParams();
        if (context.spaceId) params.append('spaceId', context.spaceId);
        if (context.subjectId) params.append('subjectId', context.subjectId);
        if (context.topicId) params.append('topicId', context.topicId);
        if (context.limit) params.append('limit', context.limit.toString());

        const response = await api.get<SessionResponse>(`/spaced-repetition/session?${params.toString()}`);
        return response.data;
    },

    submitReview: async (questionId: string, rating: SpacedRepetitionRating) => {
        const response = await api.post('/spaced-repetition/review', { questionId, rating });
        return response.data as SpacedRepetitionSessionItem;
    }
};
