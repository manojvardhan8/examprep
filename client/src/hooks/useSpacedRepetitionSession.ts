import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { SpacedRepetitionService } from '@/services/SpacedRepetitionService';
import type { SpacedRepetitionSessionItem, SpacedRepetitionRating } from '@/services/SpacedRepetitionService';

interface UseSpacedRepetitionSessionProps {
    spaceId?: string;
    subjectId?: string;
    topicId?: string;
}

// Learning cards due within this window are pulled into the current session.
const LEARN_AHEAD_LIMIT_MINS = 20;

type Item = SpacedRepetitionSessionItem;

// ─── Heap helpers (min-heap by showAfter) ───
function heapInsert(heap: Item[], item: Item): Item[] {
    const dueTime = item.showAfter || 0;
    const next = [...heap];
    let insertIdx = next.length;
    for (let i = 0; i < next.length; i++) {
        if (dueTime < (next[i].showAfter || 0)) {
            insertIdx = i;
            break;
        }
    }
    next.splice(insertIdx, 0, item);
    return next;
}

// ─── Stats helpers ───
// blue = new remaining, red = learning remaining, green = review remaining.
// The current card counts in its own bucket until it's answered (Anki behavior).
function computeStats(
    nQueue: Item[],
    rQueue: Item[],
    lQueue: Item[],
    heap: Item[],
    currentCard: Item | null,
    answeredCount: number
) {
    let newCount = nQueue.length;
    let learningCount = lQueue.length + heap.length;
    let reviewCount = rQueue.length;

    if (currentCard) {
        const ct = currentCard.cardType;
        if (ct === 'learning') learningCount++;
        else if (ct === 'review') reviewCount++;
        else newCount++;
    }

    return { newCount, learningCount, reviewCount, reviewedCount: answeredCount };
}

export function useSpacedRepetitionSession({ spaceId, subjectId, topicId }: UseSpacedRepetitionSessionProps) {
    const [newQueue, setNewQueue] = useState<Item[]>([]);
    const [reviewQueue, setReviewQueue] = useState<Item[]>([]);
    const [learningQueue, setLearningQueue] = useState<Item[]>([]);
    // Learning cards with future due times (sorted ascending by showAfter).
    const [learningDueHeap, setLearningDueHeap] = useState<Item[]>([]);

    const [currentItem, setCurrentItem] = useState<Item | null>(null);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFinished, setIsFinished] = useState(false);

    // Single source of truth for how many cards have been answered.
    const answeredRef = useRef(0);
    // Prevents a double rating submission while one is in flight.
    const submittingRef = useRef(false);
    // Tracks the review:new mix (2 reviews : 1 new).
    const reviewsSinceNewRef = useRef(0);

    const [sessionStats, setSessionStats] = useState({
        totalReview: 0,
        totalNew: 0,
        reviewedCount: 0,
        total: 0,
        newCount: 0,
        learningCount: 0,
        reviewCount: 0
    });

    // ─── Get next card ───
    // 1. Move due learning cards from heap → learningQueue
    // 2. learningQueue (immediate priority)
    // 3. mix reviewQueue and newQueue (2:1)
    // 4. otherwise pull from the heap (immediate reappearance)
    const getNextCard = useCallback((
        lQueue: Item[],
        rQueue: Item[],
        nQueue: Item[],
        heap: Item[]
    ): {
        card: Item | null;
        lQueue: Item[];
        rQueue: Item[];
        nQueue: Item[];
        heap: Item[];
        finished: boolean;
    } => {
        const now = Date.now();
        const updatedHeap = [...heap];
        const updatedLQueue = [...lQueue];

        while (updatedHeap.length > 0) {
            const top = updatedHeap[0];
            if (top.showAfter && top.showAfter <= now) {
                updatedLQueue.push(updatedHeap.shift()!);
            } else {
                break; // sorted, so the rest aren't due either
            }
        }

        if (updatedLQueue.length > 0) {
            const card = updatedLQueue.shift()!;
            return { card, lQueue: updatedLQueue, rQueue: [...rQueue], nQueue: [...nQueue], heap: updatedHeap, finished: false };
        }

        let nextCard: Item | null = null;
        const nextRQueue = [...rQueue];
        const nextNQueue = [...nQueue];

        if (nextRQueue.length > 0 && nextNQueue.length > 0) {
            if (reviewsSinceNewRef.current < 2) {
                nextCard = nextRQueue.shift()!;
                reviewsSinceNewRef.current += 1;
            } else {
                nextCard = nextNQueue.shift()!;
                reviewsSinceNewRef.current = 0;
            }
        } else if (nextRQueue.length > 0) {
            nextCard = nextRQueue.shift()!;
        } else if (nextNQueue.length > 0) {
            nextCard = nextNQueue.shift()!;
        }

        if (nextCard) {
            return { card: nextCard, lQueue: updatedLQueue, rQueue: nextRQueue, nQueue: nextNQueue, heap: updatedHeap, finished: false };
        }

        if (updatedHeap.length > 0) {
            const card = updatedHeap.shift()!;
            return { card, lQueue: updatedLQueue, rQueue: [...rQueue], nQueue: [...nQueue], heap: updatedHeap, finished: false };
        }

        return { card: null, lQueue: [], rQueue: [], nQueue: [], heap: [], finished: true };
    }, []);

    const applyResult = useCallback((
        result: ReturnType<typeof getNextCard>,
        answered: number
    ) => {
        setLearningQueue(result.lQueue);
        setReviewQueue(result.rQueue);
        setNewQueue(result.nQueue);
        setLearningDueHeap(result.heap);
        setCurrentItem(result.card);

        if (result.finished) setIsFinished(true);

        const stats = computeStats(result.nQueue, result.rQueue, result.lQueue, result.heap, result.card, answered);
        setSessionStats(prev => ({ ...prev, ...stats }));
    }, []);

    const fetchSession = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setIsFinished(false);
        try {
            const data = await SpacedRepetitionService.getSession({ spaceId, subjectId, topicId, limit: 50 });

            const learning = data.learningItems || [];
            const review = data.reviewItems || [];
            const newCards = data.newItems || [];

            answeredRef.current = 0;
            reviewsSinceNewRef.current = 0;

            setSessionStats(prev => ({
                ...prev,
                totalReview: review.length,
                totalNew: newCards.length,
                total: data.total
            }));

            const result = getNextCard(learning, review, newCards, []);
            applyResult(result, 0);
        } catch (err) {
            console.error(err);
            setError('Failed to load session');
        } finally {
            setIsLoading(false);
        }
    }, [spaceId, subjectId, topicId, getNextCard, applyResult]);

    useEffect(() => {
        fetchSession();
    }, [fetchSession]);

    const handleRating = async (rating: SpacedRepetitionRating) => {
        if (!currentItem || !currentItem.questionId?._id) return;
        if (submittingRef.current) return; // ignore rapid double-taps
        submittingRef.current = true;

        try {
            const updatedItem = await SpacedRepetitionService.submitReview(currentItem.questionId._id, rating);

            answeredRef.current += 1;

            const now = Date.now();
            const nextReview = updatedItem.nextReviewAt ? new Date(updatedItem.nextReviewAt).getTime() : 0;
            const diffMins = (nextReview - now) / 60000;

            const nextLQueue = [...learningQueue];
            const nextRQueue = [...reviewQueue];
            const nextNQueue = [...newQueue];
            let nextHeap = [...learningDueHeap];

            if (updatedItem.nextReviewAt && diffMins <= LEARN_AHEAD_LIMIT_MINS) {
                // Re-queue this session: the card reappears once showAfter passes.
                let newCardType: 'new' | 'learning' | 'review' = 'learning';
                if (updatedItem.state === 'review' || updatedItem.state === 2) {
                    newCardType = 'review';
                }

                const itemToRequeue: Item = {
                    ...updatedItem,
                    questionId: currentItem.questionId, // keep the populated question
                    isRetry: true,
                    isNew: false,
                    cardType: newCardType,
                    showAfter: nextReview,
                    nextIntervals: updatedItem.nextIntervals || currentItem.nextIntervals
                };

                nextHeap = heapInsert(nextHeap, itemToRequeue);
            }
            // Interval > 20 min (or ≤ 0): the card won't reappear this session.

            const result = getNextCard(nextLQueue, nextRQueue, nextNQueue, nextHeap);
            applyResult(result, answeredRef.current);
        } catch (err) {
            // Keep the current card on screen so the rating isn't silently lost.
            console.error('Failed to submit review', err);
            toast.error('Could not save your answer. Please try again.');
        } finally {
            submittingRef.current = false;
        }
    };

    // All remaining cards, including the one currently shown.
    const questionsRemaining = newQueue.length + reviewQueue.length + learningQueue.length + learningDueHeap.length + (currentItem ? 1 : 0);

    return {
        currentItem,
        queueLength: questionsRemaining,
        currentIndex: answeredRef.current,
        isLoading,
        error,
        isFinished,
        handleRating,
        refresh: fetchSession,
        stats: sessionStats
    };
}
