import { useParams, useNavigate } from 'react-router-dom';
import { useSpacedRepetitionSession } from '@/hooks/useSpacedRepetitionSession';
import { Button } from '@/components/common/Button';
import { Loader2 } from 'lucide-react';
import { SpacedRepetitionCardView } from '@/components/spaced-repetition/SpacedRepetitionCardView';

export default function SpacedRepetitionBoard() {
    const { type, id } = useParams(); // type: 'subject' | 'topic'

    const context = {
        topicId: type === 'topic' ? id : undefined,
        subjectId: type === 'subject' ? id : undefined
    };

    const { currentItem, queueLength, isLoading, isFinished, handleRating, refresh, stats } = useSpacedRepetitionSession(context);
    const navigate = useNavigate();

    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Loading Session...</span>
            </div>
        );
    }

    if (isFinished) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-gray-900 text-white p-4">
                <h1 className="text-3xl font-bold mb-4">You've finished this review session!</h1>
                <p className="text-gray-400 mb-8">Great job keeping up with your spaced repetition.</p>
                <div className="flex gap-4">
                    <Button onClick={refresh}>Start Another Session</Button>
                    <Button variant="secondary" onClick={() => navigate(-1)}>Back to Library</Button>
                </div>
            </div>
        );
    }

    if (!currentItem) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <div className="text-center">
                    <h2 className="text-xl font-bold">No questions due!</h2>
                    <p className="text-gray-400 mt-2">Check back later or add more content.</p>
                    <Button className="mt-4" onClick={() => navigate(-1)}>Go Back</Button>
                </div>
            </div>
        );
    }

    return (
        <SpacedRepetitionCardView
            key={`${currentItem.questionId._id}-${stats.reviewedCount}`}
            currentItem={currentItem}
            questionsLeft={queueLength}
            onRating={handleRating}
            onExit={() => navigate(-1)}
            stats={stats}
        />
    );
}
