import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import StatCard from './StatCard';

describe('StatCard', () => {
  it('shows label, value and hint, with no link when `to` is missing', () => {
    render(<MemoryRouter><StatCard label="Investors" value={177} hint="166 investors" /></MemoryRouter>);
    expect(screen.getByText('Investors')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('177')).toBeInTheDocument();
    expect(screen.getByText('166 investors')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links to `to` and navigates on click', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route path="/dashboard" element={<StatCard label="Projects" value={60} to="/projects" />} />
          <Route path="/projects" element={<p>projects page</p>} />
        </Routes>
      </MemoryRouter>
    );
    const link = screen.getByRole('link', { name: /Projects/ });
    expect(link).toHaveAttribute('href', '/projects');
    await userEvent.click(link);
    expect(screen.getByText('projects page')).toBeInTheDocument();
  });

  it.each(['default', 'primary', 'warning', 'info'])('tone %s is applied', (tone) => {
    const { container } = render(<MemoryRouter><StatCard label="X" value="1" tone={tone} /></MemoryRouter>);
    expect(container.querySelector(`[data-tone="${tone}"]`)).toBeInTheDocument();
  });

  it('an unknown tone falls back to the default colours without crashing', () => {
    render(<MemoryRouter><StatCard label="X" value="1" tone="weird" /></MemoryRouter>);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('secondaryLink is a second link outside the card link (no nested links)', () => {
    render(<MemoryRouter><StatCard label="Projects checked" value="49" to="/projects?saberYear=2025" secondaryLink={{ to: '/fill-gaps?year=2025', label: 'Fill the gaps' }} /></MemoryRouter>);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/projects?saberYear=2025', '/fill-gaps?year=2025']);
    expect(links[0].contains(links[1])).toBe(false);
    expect(links[1]).toHaveTextContent('Fill the gaps');
  });
});
