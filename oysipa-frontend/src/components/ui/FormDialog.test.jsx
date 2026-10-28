import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import FormDialog, { FormSection } from './FormDialog';

// useMediaQuery reads window.matchMedia; `phone` decides whether "down(sm)" matches.
const mockMatchMedia = (phone) => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: phone && /max-width/.test(query),
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe('FormDialog (11.16)', () => {
  it('has the title as its name, the help line, grouped fields and the primary action last', () => {
    render(
      <FormDialog
        open
        onClose={() => {}}
        title="Register issue"
        help="Fields marked * are required."
        actions={<><button type="button">Cancel</button><button type="button">Register</button></>}
      >
        <FormSection title="The issue" first><input aria-label="Description" /></FormSection>
        <FormSection title="Reported"><input aria-label="Date reported" /></FormSection>
      </FormDialog>,
    );
    const dialog = screen.getByRole('dialog', { name: 'Register issue' });
    expect(within(dialog).getByText('Fields marked * are required.')).toBeInTheDocument();
    // The help line describes the dialog.
    expect(dialog).toHaveAccessibleDescription('Fields marked * are required.');
    // Not full screen: no Close button in the title.
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['The issue', 'Reported']);
    expect(within(within(dialog).getByRole('region', { name: 'Reported' })).getByLabelText('Date reported')).toBeInTheDocument();
    const buttons = within(dialog).getAllByRole('button');
    expect(buttons[buttons.length - 1]).toHaveTextContent('Register');
  });

  it('renders nothing when closed', () => {
    render(<FormDialog open={false} onClose={() => {}} title="Hidden"><p>x</p></FormDialog>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('on a phone (full screen)', () => {
    const original = window.matchMedia;
    beforeEach(() => mockMatchMedia(true));
    afterEach(() => { window.matchMedia = original; });

    it('has a Close button that calls onClose; the dialog name stays the title', () => {
      const onClose = vi.fn();
      render(<FormDialog open onClose={onClose} title="Edit details"><p>x</p></FormDialog>);
      const dialog = screen.getByRole('dialog', { name: 'Edit details' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('no Close button while onClose is not given (e.g. saving)', () => {
      render(<FormDialog open title="Saving"><p>x</p></FormDialog>);
      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });
  });
});
