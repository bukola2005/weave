import { describe, expect, it } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { useUIStore } from '../store/uiStore';
import { wireDomainToasts } from '../lib/realtime';

// One end-to-end pass through the real app (real stores, real components):
// create a board and columns, add cards, reorder with the keyboard, move
// across columns, have a threaded discussion, delete, undo, toggle theme.
const cardTitles = (columnName: string) =>
  within(screen.getByRole('region', { name: `${columnName} column` }))
    .queryAllByRole('listitem')
    .map((li) => li.querySelector('.task-title-btn')?.textContent)
    .filter(Boolean);

describe('board interaction (integration)', () => {
  it('runs a full create → reorder → move → comment → delete → undo flow', async () => {
    const user = userEvent.setup();
    useUIStore.setState({ hydrated: true });
    wireDomainToasts();
    render(<App />);

    // Create a board (navigates straight into it).
    await user.click(screen.getByRole('button', { name: '+ New board' }));
    await user.type(screen.getByLabelText('Board title'), 'Launch');
    await user.type(screen.getByLabelText('Short description'), 'Ship the thing');
    await user.click(screen.getByRole('button', { name: 'Create board' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Launch' })).toBeInTheDocument();

    // Two columns.
    await user.click(screen.getByRole('button', { name: '+ Add a column' }));
    await user.type(screen.getByLabelText('Column name'), 'To do');
    await user.click(screen.getByRole('button', { name: 'Create column' }));
    await user.click(screen.getByRole('button', { name: '+ Add column' }));
    await user.type(screen.getByLabelText('Column name'), 'Done');
    await user.click(screen.getByRole('button', { name: 'Create column' }));

    // Two cards in "To do".
    for (const title of ['Write tests', 'Ship it']) {
      await user.click(screen.getByRole('button', { name: 'Add card to To do' }));
      await user.type(screen.getByLabelText('Title'), title);
      await user.click(screen.getByRole('button', { name: 'Create card' }));
    }
    expect(cardTitles('To do')).toEqual(['Write tests', 'Ship it']);

    // Keyboard reorder: focus the grip, ArrowUp. Focus follows the card.
    const grip = screen.getByRole('button', { name: 'Move Ship it' });
    grip.focus();
    await user.keyboard('{ArrowUp}');
    expect(cardTitles('To do')).toEqual(['Ship it', 'Write tests']);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Ship it' })).toHaveFocus());

    // Move across columns with the arrow button.
    await user.click(screen.getByRole('button', { name: 'Move Write tests to Done' }));
    expect(cardTitles('Done')).toEqual(['Write tests']);
    expect(cardTitles('To do')).toEqual(['Ship it']);

    // Threaded discussion on the card.
    await user.click(screen.getByRole('button', { name: 'Write tests' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit card' });
    await user.type(within(dialog).getByLabelText('Write a comment'), 'Coverage looks thin');
    await user.click(within(dialog).getByRole('button', { name: 'Comment' }));
    await user.click(within(dialog).getByRole('button', { name: 'Reply' }));
    const replyBox = within(dialog).getByLabelText(/^Reply to/);
    await user.type(replyBox, 'Adding more now');
    await user.click(within(replyBox.closest('form')!).getByRole('button', { name: 'Reply' }));
    const replies = within(dialog).getByRole('list', { name: /^Replies to/ });
    expect(within(replies).getByText('Adding more now')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 comments' })).toBeInTheDocument();

    // Delete, then undo from the toast.
    await user.click(screen.getByRole('button', { name: 'Delete card Write tests' }));
    await user.click(screen.getByRole('button', { name: 'Delete card' }));
    expect(cardTitles('Done')).toEqual([]);
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(cardTitles('Done')).toEqual(['Write tests']);
    expect(screen.getByRole('img', { name: '2 comments' })).toBeInTheDocument();

    // Redo from the toolbar re-deletes it.
    await user.click(screen.getByRole('button', { name: /^Redo:/ }));
    expect(cardTitles('Done')).toEqual([]);

    // Dark mode toggle.
    await user.click(screen.getByRole('switch', { name: 'Dark mode' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
  }, 20_000);
});
