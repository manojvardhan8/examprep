import { useState, useEffect } from 'react';
import { ContentBlockDisplay } from '@/components/content-blocks/ContentBlockDisplay';
import { Button } from '@/components/common/Button';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SpacedRepetitionRating, SpacedRepetitionSessionItem } from '@/services/SpacedRepetitionService';

interface CardStats {
    newCount: number;
    learningCount: number;
    reviewCount: number;
    reviewedCount?: number;
    total?: number;
    totalNew?: number;
    totalReview?: number;
}

interface SpacedRepetitionCardViewProps {
    currentItem: SpacedRepetitionSessionItem;
    questionsLeft: number;
    onRating: (rating: SpacedRepetitionRating) => void;
    onExit: () => void;
    stats: CardStats;
}

export function SpacedRepetitionCardView({ currentItem, questionsLeft, onRating, onExit, stats }: SpacedRepetitionCardViewProps) {
    const [showAnswer, setShowAnswer] = useState(false);
    // Bound to ContentBlockDisplay so MCQ/FITB selections render in practice mode.
    const [selectedAnswer, setSelectedAnswer] = useState<unknown>(undefined);

    const getIntervalLabel = (rating: SpacedRepetitionRating): string => {
        return currentItem?.nextIntervals?.[rating] ?? '-';
    };

    // Keyboard shortcuts (matches Anki): Space/Enter reveals, 1-4 rate.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!showAnswer) {
                if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setShowAnswer(true);
                }
                return;
            }
            switch (e.key) {
                case '1': onRating('Again'); break;
                case '2': onRating('Hard'); break;
                case '3': onRating('Good'); break;
                case '4': onRating('Easy'); break;
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showAnswer, onRating]);

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col transition-colors duration-300">
            {/* Header */}
            <div className="p-4 flex justify-between items-center text-sm text-muted-foreground">
                <Button variant="ghost" size="sm" onClick={onExit} className="text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Exit
                </Button>
                <div className="bg-secondary px-3 py-1 rounded-full text-secondary-foreground font-medium">
                    Questions Left: {questionsLeft}
                </div>
                <div />
            </div>

            {/* Card state counters */}
            {stats && (
                <div className="flex justify-center items-center gap-3 px-4 pb-3">
                    {/* New — blue */}
                    <div className={`flex items-center justify-center min-w-[60px] h-8 px-3 rounded-md bg-blue-500/20 border border-blue-500/30 transition-all duration-300 ${currentItem?.cardType === 'new' ? 'ring-2 ring-blue-400 scale-110 shadow-lg shadow-blue-500/50' : ''}`}>
                        <span className="text-lg font-bold text-blue-500">{stats.newCount}</span>
                    </div>
                    {/* Learning/Relearning — red */}
                    <div className={`flex items-center justify-center min-w-[60px] h-8 px-3 rounded-md bg-red-500/20 border border-red-500/30 transition-all duration-300 ${currentItem?.cardType === 'learning' ? 'ring-2 ring-red-400 scale-110 shadow-lg shadow-red-500/50' : ''}`}>
                        <span className="text-lg font-bold text-red-500">{stats.learningCount}</span>
                    </div>
                    {/* Review — green */}
                    <div className={`flex items-center justify-center min-w-[60px] h-8 px-3 rounded-md bg-green-500/20 border border-green-500/30 transition-all duration-300 ${currentItem?.cardType === 'review' ? 'ring-2 ring-green-400 scale-110 shadow-lg shadow-green-500/50' : ''}`}>
                        <span className="text-lg font-bold text-green-500">{stats.reviewCount}</span>
                    </div>
                </div>
            )}

            {/* Main content */}
            <div className="flex-1 flex flex-col items-center max-w-4xl mx-auto w-full p-6 pt-10">
                <div className="w-full mb-8">
                    <ContentBlockDisplay
                        block={currentItem.questionId}
                        isTest={false} // Practice mode
                        value={selectedAnswer}
                        onChange={(val) => setSelectedAnswer(val)}
                        onSubmit={() => setShowAnswer(true)}
                        onShowAnswer={() => setShowAnswer(true)}
                    />
                </div>

                {/* Footer / controls */}
                <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-t border-border p-6 z-10">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        {!showAnswer ? (
                            currentItem.questionId.kind === 'note' ? (
                                <Button
                                    className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
                                    onClick={() => setShowAnswer(true)}
                                >
                                    Show Answer
                                </Button>
                            ) : null
                        ) : (
                            <div className="w-full grid grid-cols-4 gap-4">
                                <RatingButton label="Again" subLabel={getIntervalLabel('Again')} color="text-destructive" hoverBg="hover:bg-destructive/10" onClick={() => onRating('Again')} />
                                <RatingButton label="Hard" subLabel={getIntervalLabel('Hard')} color="text-warning" hoverBg="hover:bg-warning/10" onClick={() => onRating('Hard')} />
                                <RatingButton label="Good" subLabel={getIntervalLabel('Good')} color="text-success" hoverBg="hover:bg-success/10" border="border-t-4 border-success bg-secondary/50" onClick={() => onRating('Good')} />
                                <RatingButton label="Easy" subLabel={getIntervalLabel('Easy')} color="text-blue-500 dark:text-blue-400" hoverBg="hover:bg-blue-500/10" onClick={() => onRating('Easy')} />
                            </div>
                        )}
                    </div>
                    {showAnswer && (
                        <div className="text-center text-xs text-muted-foreground mt-2">
                            Shortcuts: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
                        </div>
                    )}
                </div>
                <div className="h-24" />
            </div>
        </div>
    );
}

interface RatingButtonProps {
    label: string;
    subLabel: string;
    color: string;
    hoverBg: string;
    onClick: () => void;
    border?: string;
}

function RatingButton({ label, subLabel, color, hoverBg, onClick, border = 'border border-border bg-card' }: RatingButtonProps) {
    return (
        <button
            onClick={onClick}
            className={cn('flex flex-col items-center justify-center py-3 rounded-lg transition-all', border, hoverBg)}
        >
            <span className="text-xs text-muted-foreground mb-1">{subLabel}</span>
            <span className={cn('text-lg font-bold', color)}>{label}</span>
        </button>
    );
}
