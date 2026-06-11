import mongoose from 'mongoose';
import SpacedRepetition from '@/models/SpacedRepetition.js';

export class DashboardService {
    /**
     * Get tests/topics that are due for review today or overdue
     */
    async getTestsDueToday(
        userId: string,
        filters: {
            spaceIds?: string[];
            subjectIds?: string[];
            topicIds?: string[];
        } = {},
        pagination: {
            page: number;
            limit: number;
        } = { page: 1, limit: 50 }
    ) {
        const today = new Date();
        today.setHours(23, 59, 59, 999);

        const { spaceIds, subjectIds, topicIds } = filters;
        const { page, limit } = pagination;
        const skip = (page - 1) * limit;

        const pipeline: any[] = [
            // 1. Match SpacedRepetition items for this user that are due
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    nextReviewAt: { $lte: today }
                }
            },
            // 2. Join ContentBlock to get topicId
            {
                $lookup: {
                    from: 'contentblocks',
                    localField: 'questionId',
                    foreignField: '_id',
                    as: 'contentBlock'
                }
            },
            { $unwind: '$contentBlock' },
            // OPTIONAL: Filter by Topic ID early if possible
            ...(topicIds && topicIds.length > 0 ? [{
                $match: {
                    'contentBlock.topicId': { $in: topicIds.map(id => new mongoose.Types.ObjectId(id)) }
                }
            }] : []),

            // 3. Join Topic
            {
                $lookup: {
                    from: 'topics',
                    localField: 'contentBlock.topicId',
                    foreignField: '_id',
                    as: 'topic'
                }
            },
            { $unwind: '$topic' },

            // 4. Join Subject
            {
                $lookup: {
                    from: 'subjects',
                    localField: 'topic.subjectId',
                    foreignField: '_id',
                    as: 'subject'
                }
            },
            { $unwind: '$subject' },
            // OPTIONAL: Filter by Subject ID
            ...(subjectIds && subjectIds.length > 0 ? [{
                $match: {
                    'subject._id': { $in: subjectIds.map(id => new mongoose.Types.ObjectId(id)) }
                }
            }] : []),

            // 5. Join Space
            {
                $lookup: {
                    from: 'spaces',
                    localField: 'subject.spaceId',
                    foreignField: '_id',
                    as: 'space'
                }
            },
            { $unwind: '$space' },
            // OPTIONAL: Filter by Space ID
            ...(spaceIds && spaceIds.length > 0 ? [{
                $match: {
                    'space._id': { $in: spaceIds.map(id => new mongoose.Types.ObjectId(id)) }
                }
            }] : []),

            // 6. Group by Test Unit (Space + Subject + Topic)
            {
                $group: {
                    _id: {
                        spaceId: '$space._id',
                        subjectId: '$subject._id',
                        topicId: '$topic._id',
                        spaceName: '$space.name',
                        spaceSlug: '$space.slug',
                        subjectTitle: '$subject.title',
                        subjectSlug: '$subject.slug',
                        topicTitle: '$topic.title',
                        topicSlug: '$topic.slug'
                    },
                    dueQuestions: { $sum: 1 },
                    firstDueItemDate: { $min: '$nextReviewAt' } // Useful for sorting
                }
            },
            // 7. Lookup total questions for the topic
            {
                $lookup: {
                    from: 'contentblocks',
                    let: { topicId: '$_id.topicId' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$topicId', '$$topicId'] } } },
                        { $count: 'total' }
                    ],
                    as: 'totalCounts'
                }
            },
            // 8. Format Output
            {
                $project: {
                    _id: 0,
                    space: {
                        _id: '$_id.spaceId',
                        name: '$_id.spaceName',
                        slug: '$_id.spaceSlug'
                    },
                    subject: {
                        _id: '$_id.subjectId',
                        name: '$_id.subjectTitle',
                        slug: '$_id.subjectSlug'
                    },
                    topic: {
                        _id: '$_id.topicId',
                        name: '$_id.topicTitle',
                        slug: '$_id.topicSlug'
                    },
                    dueQuestions: 1,
                    totalQuestions: { $ifNull: [{ $arrayElemAt: ['$totalCounts.total', 0] }, 0] },
                    status: {
                        $cond: {
                            if: { $lt: ['$firstDueItemDate', new Date().setHours(0, 0, 0, 0)] }, // Any item due before today (strictly) is overdue
                            then: 'OVERDUE',
                            else: 'READY'
                        }
                    }
                }
            },
            // 9. Sort by most due questions or overdue status
            {
                $sort: { dueQuestions: -1 }
            },
            // 10. Pagination with Facet
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    data: [{ $skip: skip }, { $limit: limit }]
                }
            }
        ];

        const results = await SpacedRepetition.aggregate(pipeline);

        const total = results[0].metadata[0]?.total || 0;
        const data = results[0].data || [];

        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        };
    }
}

export default new DashboardService();
