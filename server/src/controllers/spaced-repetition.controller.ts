import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { SpacedRepetitionService } from '@/services/spaced-repetition.service.ts';
import type { ReviewRating } from '@/services/spaced-repetition.service.ts';

export class SpacedRepetitionController {
    /** GET /session — build a study session for the requested scope. */
    static async getSession(req: Request, res: Response) {
        try {
            const user = req.user;
            if (!user) throw new Error('User not found');

            const { spaceId, subjectId, topicId, limit = 20 } = req.query;
            if (!topicId && !subjectId && !spaceId) {
                return res.status(400).json({ message: 'Context required (topicId, subjectId, or spaceId)' });
            }

            const session = await SpacedRepetitionService.buildSession({
                userId: user._id as mongoose.Types.ObjectId,
                scope: {
                    topicId: topicId ? String(topicId) : undefined,
                    subjectId: subjectId ? String(subjectId) : undefined,
                    spaceId: spaceId ? String(spaceId) : undefined
                },
                limit: Number(limit)
            });

            return res.json(session);
        } catch (error) {
            console.error('SpacedRepetition Session Error:', error);
            return res.status(500).json({ message: 'Failed to fetch session' });
        }
    }

    /** POST /review — apply a rating to a card and return its updated state. */
    static async submitReview(req: Request, res: Response) {
        try {
            const user = req.user;
            if (!user) throw new Error('User not found');

            const { questionId, rating } = req.body as { questionId?: string; rating?: ReviewRating };
            if (!questionId || !rating) {
                return res.status(400).json({ message: 'Missing questionId or rating' });
            }

            const { doc, nextIntervals } = await SpacedRepetitionService.reviewCard(
                user._id as mongoose.Types.ObjectId,
                questionId,
                rating
            );

            return res.status(200).json({ ...doc.toObject(), nextIntervals });
        } catch (error) {
            console.error('SpacedRepetition Review Error:', error);
            return res.status(500).json({ message: 'Failed to submit review' });
        }
    }
}

export default SpacedRepetitionController;
