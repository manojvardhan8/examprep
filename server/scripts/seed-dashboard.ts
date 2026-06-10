import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import User from '@/models/User.ts';
import Space from '@/models/Space.ts';
import Subject from '@/models/Subject.ts';
import Topic from '@/models/Topic.ts';
import ContentBlock, { ContentBlockType } from '@/models/ContentBlock.ts';
import SpacedRepetition from '@/models/SpacedRepetition.ts';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const TARGET_USER_ID = '6947a4a4fb83f332d3314cb8';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/examprep');
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error: any) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

const getRandomInt = (min: number, max: number) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const seedDashboardData = async () => {
    await connectDB();

    console.log(`Seeding expanded dashboard data for user: ${TARGET_USER_ID}`);

    let user = await User.findById(TARGET_USER_ID);

    if (!user) {
        console.log(`Target user ${TARGET_USER_ID} not found. Checking for any user...`);
        user = await User.findOne();
    }

    if (!user) {
        console.log('No users found. Creating a default user...');
        try {
            user = await User.create({
                _id: new mongoose.Types.ObjectId(TARGET_USER_ID),
                email: 'demo@example.com',
                password: 'password123',
                name: 'Demo User'
            });
        } catch (e) {
            console.log('Failed to create user with specific ID, creating generic user');
            user = await User.create({
                email: 'demo-' + Date.now() + '@example.com',
                password: 'password123',
                name: 'Demo User'
            });
        }
    }

    if (!user) {
        console.error('Failed to find or create a user.');
        process.exit(1);
    }

    console.log(`Using user: ${user.email}`);

    // Config for ~100 Topics
    const NUM_SPACES = 4;
    const SUBJECTS_PER_SPACE = 5;
    const TOPICS_PER_SUBJECT = 5;

    // Spaces names
    const spaceNames = ['General Studies', 'Optional Subject', 'Current Affairs', 'Aptitude & CSAT'];

    for (let sIdx = 0; sIdx < NUM_SPACES; sIdx++) {
        const spaceName = spaceNames[sIdx] || `Space ${sIdx + 1}`;
        console.log(`Creating Space: ${spaceName}...`);

        const space = await Space.create({
            name: spaceName,
            description: `Generated space for ${spaceName}`,
            userId: user._id,
            slug: `space-${sIdx}-${Date.now()}`
        });

        for (let subIdx = 0; subIdx < SUBJECTS_PER_SPACE; subIdx++) {
            const subjectTitle = `${spaceName} - Module ${subIdx + 1}`;
            const subject = await Subject.create({
                title: subjectTitle,
                spaceId: space._id,
                position: subIdx + 1,
                slug: `subject-${sIdx}-${subIdx}-${Date.now()}`
            });

            for (let tIdx = 0; tIdx < TOPICS_PER_SUBJECT; tIdx++) {
                const topicTitle = `Topic ${tIdx + 1}: ${spaceName} Concept`;
                const topic = await Topic.create({
                    title: topicTitle,
                    subjectId: subject._id,
                    position: tIdx + 1,
                    slug: `topic-${sIdx}-${subIdx}-${tIdx}-${Date.now()}`
                });

                // Determine if this topic should have overdue items or due soon items
                // Mix: 60% Overdue, 40% Due Soon/Today
                const isOverdue = Math.random() > 0.4;
                const status = isOverdue ? 'Overdue' : 'Due Soon';

                const numQuestions = getRandomInt(3, 8);

                for (let qIdx = 0; qIdx < numQuestions; qIdx++) {
                    const block = await ContentBlock.create({
                        topicId: topic._id,
                        position: qIdx,
                        kind: ContentBlockType.SINGLE_SELECT_MCQ,
                        group: 'Generated Questions',
                        question: `Question ${qIdx + 1} for ${topicTitle}?`,
                        options: [
                            { id: 'a', text: 'Correct Answer', isCorrect: true },
                            { id: 'b', text: 'Wrong Answer', isCorrect: false }
                        ]
                    });

                    // Set review date
                    const reviewDate = new Date();
                    if (isOverdue) {
                        // Past date (1-10 days ago)
                        reviewDate.setDate(reviewDate.getDate() - getRandomInt(1, 10));
                    } else {
                        // Today (Due Soon)
                        // Ensure it's effectively today for the query (<= now)
                        reviewDate.setMinutes(reviewDate.getMinutes() - 1);
                    }

                    await SpacedRepetition.create({
                        userId: user._id,
                        questionId: block._id,
                        // spaceId: space._id, // Not in schema
                        // box: 1, // Not in schema
                        nextReviewAt: reviewDate,
                        state: 'review',
                        stability: 1,
                        difficulty: 5,
                        reps: 1
                    });
                }
            }
        }
    }

    console.log('Mass dashboard seeding complete! Created ~100 topics with due items.');
    process.exit(0);
};

seedDashboardData();
