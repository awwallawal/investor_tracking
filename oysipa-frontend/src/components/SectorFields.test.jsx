import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import SectorFields from './SectorFields';
import ProjectForm from './ProjectForm';
import InvestorForm from './InvestorForm';
import apiClient from '../api/api';
import { SECTORS, SECTOR_VALUES, PRIORITY_SECTORS } from '../constants/sectors';

vi.mock('../api/api');

const Harness = ({ initial, onValues, ...props }) => {
  const [values, setValues] = useState(initial);
  return (
    <SectorFields
      values={values}
      onChange={(name, value) => setValues((v) => {
        const next = { ...v, [name]: value };
        onValues?.(next);
        return next;
      })}
      {...props}
    />
  );
};

describe('sector list copy (keep in sync with the backend)', () => {
  it('has the six priority sectors first, 15 sectors, Other last, plus Not recorded', () => {
    expect(SECTORS.slice(0, 6).every((s) => s.priority)).toBe(true);
    expect(PRIORITY_SECTORS).toEqual(['Infrastructure', 'Waste and circular economy', 'Real estate and construction', 'Agribusiness', 'Renewable energy', 'Culture and tourism']);
    expect(SECTORS).toHaveLength(15);
    expect(SECTORS[14]).toEqual({ name: 'Other', priority: false });
    expect(SECTOR_VALUES[SECTOR_VALUES.length - 1]).toBe('Not recorded');
  });
});

describe('SectorFields (11.14)', () => {
  it('lists the priority sectors first under their own heading, then the others and Not recorded', async () => {
    render(<Harness initial={{ sector: '' }} />);
    await userEvent.click(screen.getByRole('combobox', { name: /sector/i }));
    const listbox = await screen.findByRole('listbox');
    const headings = ['SABER priority sectors', 'Other sectors'];
    const options = within(listbox).getAllByRole('option').map((o) => o.textContent).filter((t) => !headings.includes(t));
    expect(options.slice(0, 6)).toEqual(PRIORITY_SECTORS);
    expect(options[options.length - 1]).toBe('Not recorded');
    expect(within(listbox).getByText('SABER priority sectors')).toBeInTheDocument();
    expect(within(listbox).getByText('Other sectors')).toBeInTheDocument();
  });

  it('choosing a sector and typing a detail updates the values', async () => {
    const onValues = vi.fn();
    render(<Harness initial={{ sector: '' }} onValues={onValues} />);
    await userEvent.click(screen.getByRole('combobox', { name: /sector/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Agribusiness' }));
    expect(onValues).toHaveBeenLastCalledWith({ sector: 'Agribusiness' });
    await userEvent.type(screen.getByLabelText('Sector detail (optional)'), 'Cashew');
    expect(onValues).toHaveBeenLastCalledWith({ sector: 'Agribusiness', sectorDetail: 'Cashew' });
  });

  it('an old value not on the list still shows (and stays selectable)', async () => {
    render(<Harness initial={{ sector: 'Agro' }} />);
    expect(screen.getByRole('combobox', { name: /sector/i })).toHaveTextContent('Agro (old value)');
    expect(screen.getByText(/not on the sector list/)).toBeInTheDocument();
  });
});

describe('ProjectForm sector (11.14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: [{ _id: 's1', name: 'Lead' }] });
  });

  it('create: empty sector is not sent (the server uses the investor\'s sector)', async () => {
    apiClient.post.mockResolvedValue({ data: {} });
    render(<ProjectForm open onClose={() => {}} onSave={() => {}} investorId="inv1" />);
    expect(screen.getByRole('combobox', { name: /sector/i })).toHaveTextContent("Use the investor's sector");
    fireEvent.change(screen.getByLabelText('Project Title'), { target: { value: 'Plant' } });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).not.toHaveProperty('sector');
  });

  it('create: a chosen sector and detail are sent', async () => {
    apiClient.post.mockResolvedValue({ data: {} });
    render(<ProjectForm open onClose={() => {}} onSave={() => {}} investorId="inv1" />);
    fireEvent.change(screen.getByLabelText('Project Title'), { target: { value: 'Plant' } });
    await userEvent.click(screen.getByRole('combobox', { name: /sector/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Renewable energy' }));
    await userEvent.type(screen.getByLabelText('Sector detail (optional)'), 'Solar mini-grid');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).toMatchObject({ sector: 'Renewable energy', sectorDetail: 'Solar mini-grid' });
  });

  it('edit: shows the stored sector and sends it back', async () => {
    apiClient.put.mockResolvedValue({ data: {} });
    render(<ProjectForm open onClose={() => {}} onSave={() => {}} projectData={{ _id: 'p1', projectTitle: 'Old', sector: 'Healthcare', lifecycleStatus: { _id: 's1' } }} />);
    expect(screen.getByRole('combobox', { name: /sector/i })).toHaveTextContent('Healthcare');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(apiClient.put).toHaveBeenCalled());
    expect(apiClient.put.mock.calls[0][1]).toMatchObject({ sector: 'Healthcare' });
  });
});

describe('InvestorForm sector (11.14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.get.mockResolvedValue({ data: [] });
    apiClient.post.mockResolvedValue({ data: {} });
  });

  it('a sector must be chosen; the picked list value is sent', async () => {
    render(<InvestorForm open onClose={() => {}} onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Investor Name/), { target: { value: 'Synthetic Co' } });
    await userEvent.click(screen.getByRole('combobox', { name: /lead source/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Other' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('Choose a sector (or "Not recorded").')).toBeInTheDocument();
    expect(apiClient.post).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('combobox', { name: /^sector/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'Waste and circular economy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    expect(apiClient.post.mock.calls[0][1]).toMatchObject({ sector: 'Waste and circular economy', sectorDetail: '' });
  }, 20000);
});
