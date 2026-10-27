import { useDomainStore } from '../store/domainStore';
import { useUIStore, type ModalState } from '../store/uiStore';
import Modal from './ui/Modal';
import Button from './ui/Button';

interface Props {
  modal: Extract<ModalState, { type: 'confirmDelete' }>;
}

export default function ConfirmDeleteModal({ modal }: Props) {
  const deleteBoard = useDomainStore((s) => s.deleteBoard);
  const deleteColumn = useDomainStore((s) => s.deleteColumn);
  const deleteCard = useDomainStore((s) => s.deleteCard);
  const closeModal = useUIStore((s) => s.closeModal);
  const pushToast = useUIStore((s) => s.pushToast);

  const noun = modal.kind;
  // Card deletes go through the undo log; board/column deletes cascade too
  // widely to invert cheaply (see Architecture Evolution doc), so the copy
  // is honest about which is which.
  const undoable = modal.kind === 'card';

  const handleConfirm = () => {
    if (modal.kind === 'board') deleteBoard(modal.id);
    else if (modal.kind === 'column') deleteColumn(modal.id);
    else deleteCard(modal.id);
    if (!undoable) pushToast({ tone: 'success', message: `Deleted ${noun} “${modal.label}”.` }, 3000);
    closeModal();
  };

  return (
    <Modal
      titleId="delete-modal-title"
      title={`Delete this ${noun}?`}
      description={
        undoable
          ? `Delete "${modal.label}" and its comments? You can undo this.`
          : `Delete "${modal.label}" and everything inside it? This can't be undone.`
      }
      onClose={closeModal}
    >
      <div className="dialog-actions">
        <Button onClick={closeModal}>Keep {noun}</Button>
        <Button variant="danger" onClick={handleConfirm}>
          Delete {noun}
        </Button>
      </div>
    </Modal>
  );
}
