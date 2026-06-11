import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Loader2, Play } from 'lucide-react';

import { PromptService } from '@/services/PromptService';
import { type Topic } from '@/types/domain';
import { useContentStore } from '@/store/contentStore';
import { useTakeTest } from '@/hooks/useTakeTest';


import { useSpaceStore } from '@/store/spaceStore';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { Tooltip } from '@/components/common/Tooltip';
import { EmptyState } from '@/components/common/EmptyState';
import { Breadcrumbs } from '@/components/common/Breadcrumbs';
import { DynamicIcon, getDeterministicColor } from '@/components/UI/DynamicIcon';
import { TruncatedText } from '@/components/common/TruncatedText';

export default function TopicList() {
  const { spaceSlug, subjectSlug } = useParams();
  const navigate = useNavigate();

  // Stores

  const { currentSpace, fetchSpace } = useSpaceStore();
  const {
    currentSubject,
    // setCurrentSubject, // No longer manually setting from list
    fetchSubject,
    topics,
    isLoading,
    fetchTopics,
    createTopic,
    updateTopic,
    deleteTopic,
    setCurrentTopic
  } = useContentStore();


  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTakeTestModalOpen, setIsTakeTestModalOpen] = useState(false);
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [targetTopic, setTargetTopic] = useState<Topic | null>(null);
  const [targetTestTopic, setTargetTestTopic] = useState<Topic | null>(null);



  const [isCreating, setIsCreating] = useState(false);

  const [formData, setFormData] = useState({ title: '' });

  // Initial load
  useEffect(() => {
    if (spaceSlug && subjectSlug) {
      if (!currentSpace || currentSpace.slug !== spaceSlug) fetchSpace(spaceSlug);

      // Fetch specific subject directly
      if (!currentSubject || currentSubject.slug !== subjectSlug) {
        fetchSubject(subjectSlug);
      }

      fetchTopics(subjectSlug);
    }
  }, [spaceSlug, subjectSlug, fetchSpace, fetchSubject, fetchTopics, currentSpace, currentSubject]);


  const handleCreate = async () => {
    if (!subjectSlug) return;
    setIsCreating(true);
    try {
      await createTopic(subjectSlug, formData.title);
      closeModals();
    } catch (err) {
      console.error(err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!targetTopic) return;
    try {
      await updateTopic(targetTopic._id, formData.title);
      closeModals();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async () => {
    if (!targetTopic) return;
    try {
      await deleteTopic(targetTopic._id);
      closeModals();
    } catch (err) {
      console.error(err);
    }
  };

  const openCreateModal = () => {
    setFormData({ title: '' });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (topic: Topic, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetTopic(topic);
    setFormData({ title: topic.title });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (topic: Topic, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetTopic(topic);
    setIsDeleteModalOpen(true);
  };

  const closeModals = () => {
    setIsCreateModalOpen(false);
    setIsEditModalOpen(false);
    setIsDeleteModalOpen(false);
    setIsTakeTestModalOpen(false);
    setTargetTopic(null);
    setTargetTestTopic(null);
  };

  const openTakeTestModal = (topic: Topic | null, e: React.MouseEvent) => {
    e.stopPropagation();
    setTargetTestTopic(topic);
    setIsTakeTestModalOpen(true);
  };

  const { startTest } = useTakeTest();

  const handleQuickTest = async (mode: 'pending' | 'all', topicOverride?: Topic) => {
    const topicToUse = topicOverride || targetTestTopic;
    const count = topicToUse ? topicToUse.questionCount : currentSubject?.questionCount;

    if (!count || count === 0) {
      PromptService.alert("No Questions", "Don't have questions to create test");
      return;
    }

    if (!currentSpace || !currentSubject) return;

    setIsCreatingTest(true);
    try {
      await startTest({
        spaceId: currentSpace._id,
        subjectId: currentSubject._id,
        topicId: topicToUse?._id,
        mode
      });
      setIsTakeTestModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create test:', err);
      PromptService.error(err.response?.data?.message || "Failed to create test. Maybe no questions available?");
    } finally {
      setIsCreatingTest(false);
    }
  };

  const handleTopicClick = (topic: Topic) => {
    setCurrentTopic(topic);
    navigate(`/spaces/${spaceSlug}/${subjectSlug}/${topic.slug}`);
  };

  if (isLoading && topics.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex-none bg-background z-10 px-8 pt-8 pb-0">
        <div className="container mx-auto max-w-7xl">
          <div className="mb-6">
            <Breadcrumbs
              items={[
                { label: currentSpace?.name || <div className="h-4 w-24 bg-muted animate-pulse rounded" />, href: `/spaces/${spaceSlug}/library` },
                { label: currentSubject?.title || <div className="h-4 w-32 bg-muted animate-pulse rounded" /> }
              ]}
            />
          </div>

          <div className="flex items-center justify-between mb-8">
            <div className="flex-1 min-w-0 mr-4">
              <TruncatedText as="h1" className="text-3xl font-bold tracking-tight" title={currentSubject?.title}>
                {currentSubject?.title}
              </TruncatedText>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" onClick={(e) => openTakeTestModal(null, e)}>
                Take Test
              </Button>
              <Button onClick={openCreateModal}>
                <Plus className="mr-2 h-4 w-4" />
                Add Topic
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="container mx-auto max-w-7xl">
          {topics.length === 0 ? (
            <EmptyState
              title="No topics yet"
              description="Create a topic to start adding content."
              action={<Button onClick={openCreateModal}>Add Topic</Button>}
            />
          ) : (
            <div className="space-y-4">
              {topics.map((topic) => (
                <div
                  key={topic._id}
                  onClick={() => handleTopicClick(topic)}
                  className="group grid grid-cols-12 gap-4 items-center p-4 rounded-lg border border-border bg-background hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <div className="col-span-12 md:col-span-5 flex items-center gap-4 min-w-0">
                    <div className={`h-10 w-10 rounded-md flex items-center justify-center text-lg font-bold shrink-0 ${getDeterministicColor(topic._id)}`}>
                      <DynamicIcon name={topic.icon || 'Hash'} className="h-5 w-5" />
                    </div>
                    <TruncatedText as="h3" className="text-lg font-medium">
                      {topic.title}
                    </TruncatedText>
                  </div>

                  {/* Stats Block (Centered with Labels) */}
                  <div className="col-span-12 md:col-span-4 flex justify-center py-2 md:py-0">
                     <div className="flex items-center gap-8 bg-muted/20 px-6 py-2 rounded-lg border border-border/40">
                        <div className="flex flex-col items-center gap-0.5">
                           <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">New</span>
                           <span className="text-[#00aaff] font-bold text-lg leading-none">
                              {topic.newCount || 0}
                           </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                           <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Lrn</span>
                           <span className="text-[#da3e3e] font-bold text-lg leading-none">
                              {topic.learningCount || 0}
                           </span>
                        </div>
                        <div className="flex flex-col items-center gap-0.5">
                           <span className="text-[10px] uppercase text-muted-foreground font-semibold tracking-wider">Rev</span>
                           <span className="text-[#25b845] font-bold text-lg leading-none">
                              {topic.reviewCount || 0}
                           </span>
                        </div>
                     </div>
                  </div>

                  <div className="col-span-12 md:col-span-3 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      className="h-8 px-4 rounded-full bg-green-500 hover:bg-green-600 text-white shadow-sm font-semibold border-none transition-all transform hover:scale-105 active:scale-95"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/spaced-repetition/topic/${topic._id}`);
                      }}
                    >
                      Review
                    </Button>

                    <div className="flex items-center gap-1">
                      {/* Note: Original code didn't have a bg-secondary/50 wrapper for TopicList actions in the snippet I saw, but I'll check if I should add it or just keep them inline. 
                       Looking at previous read, TopicList buttons were just in a flex div. 
                       I will group the others to match SubjectLibrary if appropriate, or just leave them.
                       The previous code had them separated by dividers (w-px). 
                       I'll group the secondary actions for consistency if they were grouped before or just lay them out.
                       Actually looking at the TargetContent, they were just in a div with gap-2. 
                   */}
                      <Tooltip content="Take Test" delay={0}>
                        <Button
                          variant="secondary"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                          onClick={(e) => openTakeTestModal(topic, e)}
                        >
                          <Play className="h-4 w-4 fill-current" />
                        </Button>
                      </Tooltip>
                      <div className="w-px h-4 bg-border mx-1" />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => openEditModal(topic, e)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={(e) => openDeleteModal(topic, e)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create Modal */}
        </div>
      </div>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={closeModals}
        title="Add New Topic"
        footer={
          <>
            <Button variant="secondary" onClick={closeModals}>Cancel</Button>
            <Button onClick={handleCreate} disabled={isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Topic'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <input
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="e.g. Linear Equations"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            autoFocus
          />
        </div>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={closeModals}
        title="Edit Topic"
        footer={
          <>
            <Button variant="secondary" onClick={closeModals}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Title</label>
          <input
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleUpdate();
              }
            }}
          />
        </div>
      </Modal>

      <Modal
        isOpen={isDeleteModalOpen}
        onClose={closeModals}
        title="Delete Topic"
        footer={
          <>
            <Button variant="secondary" onClick={closeModals}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete Topic'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          Are you sure you want to delete "{targetTopic?.title}"?
        </p>
      </Modal>

      <Modal
        isOpen={isTakeTestModalOpen}
        onClose={() => setIsTakeTestModalOpen(false)}
        title={targetTestTopic ? `Test: ${targetTestTopic.title}` : `Test: ${currentSubject?.title}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground mb-4">
            Start a quick test for <strong>{targetTestTopic?.title || currentSubject?.title}</strong>.
            This will create a 30-minute test with 15 questions (if available).
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5"
              onClick={() => handleQuickTest('pending')}
              disabled={isCreatingTest}
            >
              <span className="text-lg font-bold">Pending Q's</span>
              <span className="text-xs text-muted-foreground">Due for review</span>
            </Button>

            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5"
              onClick={() => handleQuickTest('all')}
              disabled={isCreatingTest}
            >
              <span className="text-lg font-bold">All Q's</span>
              <span className="text-xs text-muted-foreground">Random mix</span>
            </Button>
          </div>

          {isCreatingTest && (
            <div className="flex items-center justify-center text-sm text-muted-foreground mt-4">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating test...
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
