import Topic, { type ITopic } from '@/models/Topic.ts';
import Subject from '@/models/Subject.ts';
import ContentBlock from '@/models/ContentBlock.ts';
import Anki from '@/models/SpacedRepetition.ts';
import { SubjectService } from '@/services/subject.service.ts';
import { Types } from 'mongoose';
import { generateIconForSubject } from '@/utils/common.ts';

export class TopicService {

  static async create(userId: string, data: Partial<ITopic>): Promise<ITopic> {
    if (!data.subjectId) {
      throw new Error('Subject ID is required');
    }

    // Resolve subject slug to ID if necessary
    let subjectId = data.subjectId.toString();
    if (!Types.ObjectId.isValid(subjectId)) {
      const subject = await SubjectService.findOne(userId, subjectId);
      if (!subject) throw new Error('Subject not found');
      subjectId = (subject._id as any).toString();
    }

    const hasAccess = await SubjectService.checkOwnership(userId, subjectId);
    if (!hasAccess) {
      throw new Error('Access denied to subject');
    }

    if (data.position === undefined) {
      const count = await Topic.countDocuments({ subjectId: subjectId });
      data.position = count;
    }

    if (!data.icon && data.title) {
      data.icon = await generateIconForSubject(data.title);
    }

    const topic = new Topic({ ...data, subjectId: subjectId });
    const savedTopic = await topic.save();
    await Subject.findByIdAndUpdate(subjectId, { $inc: { topicCount: 1 } });
    return savedTopic;
  }

  static async findAll(userId: string, subjectIdentifier: string): Promise<any[]> {
    const subject = await SubjectService.findOne(userId, subjectIdentifier);
    if (!subject) {
      throw new Error('Access denied or Subject not found');
    }
    const topics = await Topic.find({ subjectId: subject._id }, '_id title subjectId position slug icon').sort({ position: 1, createdAt: 1 });

    // Aggregate question counts for these topics
    const topicIds = topics.map(s => s._id);
    const agg = await ContentBlock.aggregate([
      {
        $match: {
          topicId: { $in: topicIds },
          kind: { $in: ['single_select_mcq', 'multi_select_mcq', 'descriptive', 'fill_in_the_blank'] }
        }
      },
      { $group: { _id: '$topicId', total: { $sum: 1 } } }
    ]);

    // Aggregate DUE counts from Anki (SpacedRepetition)
    const now = new Date();

    const ankiAgg = await Anki.aggregate([
      {
        $match: {
          userId: new Types.ObjectId(userId)
        }
      },
      {
        $lookup: {
          from: 'contentblocks',
          localField: 'questionId',
          foreignField: '_id',
          as: 'block'
        }
      },
      { $unwind: '$block' },
      {
        $match: {
          'block.topicId': { $in: topicIds }
        }
      },
      { 
        $group: { 
          _id: '$block.topicId', 
          learningCount: { 
            $sum: { 
              $cond: [{ $in: ['$state', ['learning', 'relearning']] }, 1, 0] 
            } 
          },
          reviewDueCount: { 
            $sum: { 
              $cond: [
                { $and: [
                    { $eq: ['$state', 'review'] },
                    { $lte: ['$nextReviewAt', now] } 
                  ] 
                }, 1, 0] 
            } 
          },
          startedCount: { $sum: 1 } // Total cards that have an SR record
        } 
      }
    ]);

    const countMap = new Map(agg.map((a: any) => [a._id.toString(), a.total]));
    const ankiMap = new Map(ankiAgg.map((a: any) => [a._id.toString(), a]));

    return topics.map(t => {
      const tId = (t._id as any).toString();
      const totalQuestions = countMap.get(tId) || 0;
      const ankiData = ankiMap.get(tId) || { learningCount: 0, reviewDueCount: 0, startedCount: 0 };
      
      const newCount = Math.max(0, totalQuestions - ankiData.startedCount);

      return {
        ...t.toObject(),
        questionCount: totalQuestions,
        // Anki Dashboard Counts
        newCount,
        learningCount: ankiData.learningCount,
        reviewCount: ankiData.reviewDueCount
      };
    });
  }

  static async findOne(userId: string, identifier: string): Promise<ITopic | null> {
    const query = Types.ObjectId.isValid(identifier)
      ? { _id: identifier }
      : { slug: identifier };
    const topic = await Topic.findOne(query);
    if (!topic) return null;

    const hasAccess = await SubjectService.checkOwnership(userId, topic.subjectId.toString());
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    return topic;
  }

  static async update(userId: string, topicId: string, data: Partial<ITopic>): Promise<ITopic | null> {
    const topic = await Topic.findById(topicId);
    if (!topic) return null;

    const hasAccess = await SubjectService.checkOwnership(userId, topic.subjectId.toString());
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return await Topic.findByIdAndUpdate(topicId, data, { new: true });
  }

  static async delete(userId: string, topicId: string): Promise<ITopic | null> {
    const topic = await Topic.findById(topicId);
    if (!topic) return null;

    const hasAccess = await SubjectService.checkOwnership(userId, topic.subjectId.toString());
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // CASCADE DELETE: Find all questions for this topic
    const questions = await ContentBlock.find({ topicId: topicId });
    const questionIds = questions.map(q => q._id);

    // Delete Anki records for these questions
    if (questionIds.length > 0) {
      await Anki.deleteMany({ questionId: { $in: questionIds } });
    }

    // Delete all questions
    await ContentBlock.deleteMany({ topicId: topicId });

    // Delete the topic
    const deletedTopic = await Topic.findByIdAndDelete(topicId);
    
    // Update subject's topicCount
    if (deletedTopic) {
      await Subject.findByIdAndUpdate(deletedTopic.subjectId, { $inc: { topicCount: -1 } });
    }

    return deletedTopic;
  }

  static async checkOwnership(userId: string, topicId: string): Promise<boolean> {
    const topic = await Topic.findOne({ _id: topicId });
    if (!topic) return false;
    return await SubjectService.checkOwnership(userId, topic.subjectId.toString());
  }
}
