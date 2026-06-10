import Subject, { type ISubject } from '@/models/Subject.ts';
import Space from '@/models/Space.ts';
import { SpaceService } from '@/services/space.service.ts';
import { Types } from 'mongoose';
import { generateIconForSubject } from '@/utils/common.ts';

export class SubjectService {

  static async create(userId: string, data: Partial<ISubject>): Promise<ISubject> {
    if (!data.spaceId) {
      throw new Error('Space ID is required');
    }

    // Resolve space slug to ID if necessary
    let spaceId = data.spaceId.toString();
    if (!Types.ObjectId.isValid(spaceId)) {
      const space = await SpaceService.findOne(userId, spaceId);
      if (!space) throw new Error('Space not found');
      spaceId = (space._id as any).toString();
    }

    const hasAccess = await SpaceService.checkOwnership(userId, spaceId);
    if (!hasAccess) {
      throw new Error('Access denied to space');
    }

    if (data.position === undefined) {
      const count = await Subject.countDocuments({ spaceId: spaceId });
      data.position = count;
    }

    if (!data.icon && data.title) {
      data.icon = await generateIconForSubject(data.title);
    }

    const subject = new Subject({ ...data, spaceId: spaceId });
    const savedSubject = await subject.save();

    await Space.findByIdAndUpdate(spaceId, { $inc: { subjectCount: 1 } });

    return savedSubject;
  }

  static async findAll(userId: string, spaceIdentifier: string): Promise<any[]> {
    const space = await SpaceService.findOne(userId, spaceIdentifier);
    if (!space) {
      throw new Error('Access denied or Space not found');
    }

    const subjects = await Subject.find({ spaceId: space._id }, '_id title spaceId position slug topicCount questionCount icon').sort({ position: 1, createdAt: 1 });
    
    // Aggregation to get real-time Topic Counts
    const subjectIds = subjects.map(s => s._id);
    const Topic = (await import('@/models/Topic.ts')).default; // Dynamic import to avoid circular dependency if any
    
    const agg = await Topic.aggregate([
        { $match: { subjectId: { $in: subjectIds } } },
        { $group: { _id: '$subjectId', total: { $sum: 1 } } }
    ]);

    const countMap = new Map(agg.map((a: any) => [a._id.toString(), a.total]));

    return subjects.map(s => ({
        ...s.toObject(),
        topicCount: countMap.get((s._id as any).toString()) || 0 // Override stored count
    }));
  }

  static async findOne(userId: string, identifier: string): Promise<ISubject | null> {
    const query = Types.ObjectId.isValid(identifier)
      ? { _id: identifier }
      : { slug: identifier };

    const subject = await Subject.findOne(query);
    if (!subject) return null;

    const hasAccess = await SpaceService.checkOwnership(userId, subject.spaceId.toString());
    if (!hasAccess) {
      throw new Error('Access denied');
    }
    return subject;
  }

  static async update(userId: string, subjectId: string, data: Partial<ISubject>): Promise<ISubject | null> {
    const subject = await Subject.findById(subjectId);
    if (!subject) return null;

    const hasAccess = await SpaceService.checkOwnership(userId, subject.spaceId.toString());
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    return await Subject.findByIdAndUpdate(subjectId, data, { new: true });
  }

  static async delete(userId: string, subjectId: string): Promise<ISubject | null> {
    const subject = await Subject.findById(subjectId);
    if (!subject) return null;

    const hasAccess = await SpaceService.checkOwnership(userId, subject.spaceId.toString());
    if (!hasAccess) {
      throw new Error('Access denied');
    }

    // CASCADE DELETE: Import necessary models
    const Topic = (await import('@/models/Topic.ts')).default;
    const ContentBlock = (await import('@/models/ContentBlock.ts')).default;
    const Anki = (await import('@/models/SpacedRepetition.ts')).default;

    // Find all topics in this subject
    const topics = await Topic.find({ subjectId: subjectId });
    const topicIds = topics.map(t => t._id);

    if (topicIds.length > 0) {
      // Find all questions for these topics
      const questions = await ContentBlock.find({ topicId: { $in: topicIds } });
      const questionIds = questions.map(q => q._id);

      // Delete Anki records
      if (questionIds.length > 0) {
        await Anki.deleteMany({ questionId: { $in: questionIds } });
      }

      // Delete all questions
      await ContentBlock.deleteMany({ topicId: { $in: topicIds } });

      // Delete all topics
      await Topic.deleteMany({ subjectId: subjectId });
    }

    // Delete the subject
    const deletedSubject = await Subject.findByIdAndDelete(subjectId);
    
    // Update space's subjectCount
    if (deletedSubject) {
      await Space.findByIdAndUpdate(deletedSubject.spaceId, { $inc: { subjectCount: -1 } });
    }

    return deletedSubject;
  }

  static async checkOwnership(userId: string, identifier: string): Promise<boolean> {
    const query = Types.ObjectId.isValid(identifier)
      ? { _id: identifier }
      : { slug: identifier };
    const subject = await Subject.findOne(query);
    if (!subject) return false;
    return await SpaceService.checkOwnership(userId, subject.spaceId.toString());
  }
}
