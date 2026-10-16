import { useState, type FormEvent } from 'react';
import { useDomainStore } from '../store/domainStore';
import { useUIStore, type ModalState } from '../store/uiStore';
import Modal from './Modal';

interface Props {
  modal: Extract<ModalState, { type: 'column' } | { type: 'renameColumn' }>;
}

// Handles both "create a new column" and "rename an existing column" —
// same form shape, different store action on submit.
export default function ColumnFormModal({ modal }: Props) {
  const addColumn = useDomainStore((s) => s.addColumn);
  const renameColumn = useDomainStore((s) => s.renameColumn);
  const closeModal = useUIStore((s) => s.closeModal);
  const isRename = modal.type === 'renameColumn';
  const [name, setName] = useState(modal.type === 'renameColumn' ? modal.currentName : '');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (modal.type === 'renameColumn') {
      renameColumn(modal.columnId, name.trim());
    } else {
      addColumn(modal.boardId, name.trim());
    }
    closeModal();
  };

  return (
    <Modal
      titleId="column-modal-title"
      title={isRename ? 'Rename column' : 'Create a column'}
      description={
        isRename ? 'Update what this stage of work is called.' : 'Add a new stage of work to this board.'
      }
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="column-name">Column name</label>
          <input
            id="column-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. In review"
            maxLength={40}
            required
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="secondary" onClick={closeModal}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {isRename ? 'Save name' : 'Create column'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
