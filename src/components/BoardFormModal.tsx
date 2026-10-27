import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDomainStore } from '../store/domainStore';
import { useUIStore } from '../store/uiStore';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input from './ui/Input';

export default function BoardFormModal() {
  const addBoard = useDomainStore((s) => s.addBoard);
  const closeModal = useUIStore((s) => s.closeModal);
  const pushToast = useUIStore((s) => s.pushToast);
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const id = addBoard(title.trim(), description.trim());
    closeModal();
    pushToast({ tone: 'success', message: `Created board “${title.trim()}”.` }, 3000);
    navigate(`/board/${id}`);
  };

  return (
    <Modal
      titleId="board-modal-title"
      title="Create a board"
      description="Give your project a place to take shape."
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit}>
        <Input
          id="board-title"
          label="Board title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Website refresh"
          maxLength={65}
          required
        />
        <Input
          id="board-description"
          label="Short description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this board for?"
          maxLength={110}
          required
        />
        <div className="dialog-actions">
          <Button onClick={closeModal}>Cancel</Button>
          <Button type="submit" variant="primary">
            Create board
          </Button>
        </div>
      </form>
    </Modal>
  );
}
