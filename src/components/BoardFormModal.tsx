import { useState, type FormEvent } from 'react';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import Modal from './Modal';

export default function BoardFormModal() {
  const addBoard = useDomainStore((s) => s.addBoard);
  const closeModal = useUIStore((s) => s.closeModal);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    addBoard(title.trim(), description.trim());
    closeModal();
  };

  return (
    <Modal
      titleId="board-modal-title"
      title="Create a board"
      description="Give your project a place to take shape."
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="board-title">Board title</label>
          <input
            id="board-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Website refresh"
            maxLength={65}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="board-description">Short description</label>
          <input
            id="board-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this board for?"
            maxLength={110}
            required
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="primary">
            Create board
          </button>
        </div>
      </form>
    </Modal>
  );
}
