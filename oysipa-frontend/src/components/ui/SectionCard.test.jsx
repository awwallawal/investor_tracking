import React from 'react';
import { render, screen, within } from '@testing-library/react';
import SectionCard from './SectionCard';
import KeyFacts from './KeyFacts';

describe('SectionCard (11.16)', () => {
  it('is a named region with an h2 title, a subtitle and actions', () => {
    render(<SectionCard title="Actions" subtitle="What was done" actions={<button type="button">Add</button>}><p>Body</p></SectionCard>);
    const region = screen.getByRole('region', { name: 'Actions' });
    expect(within(region).getByRole('heading', { level: 2, name: 'Actions' })).toBeInTheDocument();
    expect(within(region).getByText('What was done')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Add' })).toBeInTheDocument();
    expect(within(region).getByText('Body')).toBeInTheDocument();
  });
});

describe('KeyFacts (11.16)', () => {
  it('lists label → value pairs and leaves out null values', () => {
    render(<KeyFacts ariaLabel="Facts" items={[{ label: 'Status', value: 'Open' }, { label: 'MDA', value: null }, null, { label: 'Officer', value: '—' }]} />);
    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    expect(terms).toEqual(['Status', 'Officer']);
    expect(screen.getAllByRole('definition').map((d) => d.textContent)).toEqual(['Open', '—']);
  });
});
