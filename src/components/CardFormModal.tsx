import { useState, type FormEvent } from 'react';
import { useDomainStore } from '../store/domainStore';
import { useUIStore, type ModalState } from '../store/uiStore';
import Modal from './Modal';

interface Props {
  modal: Extract<ModalState, { type: 'card' }>;
}

// Handles both "add a new card to a column" and "edit an existing card" —
// the cardId on the modal state tells us which mode we're in.
export default function CardFormModal({ modal }: Props) {
  const existingCard = useDomainStore((s) => (modal.cardId ? s.cards[modal.cardId] : undefined));
  const addCard = useDomainStore((s) => s.addCard);
  const updateCard = useDomainStore((s) => s.updateCard);
  const closeModal = useUIStore((s) => s.closeModal);

  const [title, setTitle] = useState(existingCard?.title ?? '');
  const [description, setDescription] = useState(existingCard?.description ?? '');
  const [tags, setTags] = useState(existingCard?.tags.join(', ') ?? '');
  const [dueDate, setDueDate] = useState(existingCard?.dueDate ?? '');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const parsedTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (existingCard) {
      updateCard(existingCard.id, {
        title: title.trim(),
        description,
        tags: parsedTags,
        dueDate: dueDate || null,
      });
    } else {
      // addCard only takes a title (so a bare card is quick to create);
      // it returns the new id, which we use to patch in the rest of this form.
      const newId = addCard(modal.columnId, title.trim());
      updateCard(newId, { description, tags: parsedTags, dueDate: dueDate || null });
    }
    closeModal();
  };

  return (
    <Modal
      titleId="card-modal-title"
      title={existingCard ? 'Edit card' : 'Add a card'}
      description={
        existingCard ? 'Update this task’s details.' : 'Add a next step to this column.'
      }
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="card-title">Title</label>
          <input
            id="card-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            maxLength={90}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="card-description">Description (markdown supported)</label>
          <textarea
            id="card-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="**Bold**, _italic_, bullet lists..."
          />
        </div>
        <div className="field">
          <label htmlFor="card-tags">Tags (comma separated)</label>
          <input
            id="card-tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="Design, Research, Priority"
          />
        </div>
        <div className="field">
          <label htmlFor="card-due">Due date</label>
          <input
            id="card-due"
            type="date"
            value={dueDate ?? ''}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {existingCard ? 'Save changes' : 'Create card'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
