import { useState, type FormEvent } from 'react';
import { useDomainStore } from '../store/domainStore';
import { useUIStore, type ModalState } from '../store/uiStore';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';
import CommentThread from './comments/CommentThread';

interface Props {
  modal: Extract<ModalState, { type: 'card' }>;
}

// Handles both "add a new card to a column" and "edit an existing card" —
// the cardId on the modal state tells us which mode we're in. Editing also
// shows the card's threaded discussion.
export default function CardFormModal({ modal }: Props) {
  const existingCard = useDomainStore((s) => (modal.cardId ? s.cards[modal.cardId] : undefined));
  const addCard = useDomainStore((s) => s.addCard);
  const updateCard = useDomainStore((s) => s.updateCard);
  const closeModal = useUIStore((s) => s.closeModal);

  const [title, setTitle] = useState(existingCard?.title ?? '');
  const [description, setDescription] = useState(existingCard?.description ?? '');
  const [tags, setTags] = useState(existingCard?.tags.join(', ') ?? '');
  const [dueDate, setDueDate] = useState(existingCard?.dueDate ?? '');

  // Another tab can delete the card while this modal is open.
  if (modal.cardId && !existingCard) {
    return (
      <Modal titleId="card-modal-title" title="This card is gone" onClose={closeModal}>
        <p className="dialog-copy">It was deleted, possibly from another tab. Any unsaved edits can’t be applied.</p>
        <div className="dialog-actions">
          <Button variant="primary" onClick={closeModal}>
            Close
          </Button>
        </div>
      </Modal>
    );
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const details = { description, tags: parsedTags, dueDate: dueDate || null };

    if (existingCard) {
      updateCard(existingCard.id, { title: title.trim(), ...details });
    } else {
      // One op (not create + update) so undo removes it in a single step.
      addCard(modal.columnId, title.trim(), details);
    }
    closeModal();
  };

  return (
    <Modal
      titleId="card-modal-title"
      title={existingCard ? 'Edit card' : 'Add a card'}
      description={existingCard ? 'Update this task’s details.' : 'Add a next step to this column.'}
      onClose={closeModal}
      size={existingCard ? 'lg' : 'md'}
    >
      <form onSubmit={handleSubmit}>
        <Input
          id="card-title"
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          maxLength={90}
          required
        />
        <Input
          id="card-description"
          label="Description (markdown supported)"
          multiline
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          placeholder="**Bold**, _italic_, bullet lists..."
        />
        <div className="field-row">
          <Input
            id="card-tags"
            label="Tags (comma separated)"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Design, Research, Priority"
          />
          <Input
            id="card-due"
            label="Due date"
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <Button onClick={closeModal}>Cancel</Button>
          <Button type="submit" variant="primary">
            {existingCard ? 'Save changes' : 'Create card'}
          </Button>
        </div>
      </form>

      {existingCard && <CommentThread cardId={existingCard.id} />}
    </Modal>
  );
}
