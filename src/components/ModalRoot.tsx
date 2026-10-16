import { useUIStore } from '../store/uiStore';
import BoardFormModal from './BoardFormModal';
import ColumnFormModal from './ColumnFormModal';
import CardFormModal from './CardFormModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';

// Single mount point for every modal in the app. Reads the UI store's
// activeModal and renders whichever one matches — pages never render
// modals themselves, they just call openModal(...).
export default function ModalRoot() {
  const modal = useUIStore((s) => s.activeModal);
  if (!modal) return null;

  switch (modal.type) {
    case 'board':
      return <BoardFormModal />;
    case 'column':
    case 'renameColumn':
      return <ColumnFormModal modal={modal} />;
    case 'card':
      return <CardFormModal modal={modal} />;
    case 'confirmDelete':
      return <ConfirmDeleteModal modal={modal} />;
    default:
      return null;
  }
}
