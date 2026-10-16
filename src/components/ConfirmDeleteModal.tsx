import { useDomainStore } from '../store/domainStore';
import { useUIStore, type ModalState } from '../store/uiStore';
import Modal from './Modal';

interface Props {
  modal: Extract<ModalState, { type: 'confirmDelete' }>;
}

export default function ConfirmDeleteModal({ modal }: Props) {
  const deleteBoard = useDomainStore((s) => s.deleteBoard);
  const deleteColumn = useDomainStore((s) => s.deleteColumn);
  const deleteCard = useDomainStore((s) => s.deleteCard);
  const closeModal = useUIStore((s) => s.closeModal);

  const noun = modal.kind === 'board' ? 'board' : modal.kind === 'column' ? 'column' : 'card';

  const handleConfirm = () => {
    if (modal.kind === 'board') deleteBoard(modal.id);
    else if (modal.kind === 'column') deleteColumn(modal.id);
    else deleteCard(modal.id);
    closeModal();
  };

  return (
    <Modal
      titleId="delete-modal-title"
      title={`Delete this ${noun}?`}
      description={`Delete "${modal.label}" and everything inside it? This can't be undone.`}
      onClose={closeModal}
    >
      <div className="dialog-actions">
        <button type="button" className="secondary" onClick={closeModal}>
          Keep {noun}
        </button>
        <button type="button" className="primary danger" onClick={handleConfirm}>
          Delete {noun}
        </button>
      </div>
    </Modal>
  );
}
