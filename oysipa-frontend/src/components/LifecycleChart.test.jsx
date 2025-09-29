import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import LifecycleChart from '../components/LifecycleChart';

// Mock the useNavigate hook
const mockedUsedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedUsedNavigate,
  };
});

describe('LifecycleChart', () => {
  const mockData = [
    { status: 'Lead', count: 10 },
    { status: 'Prospect', count: 15 },
  ];

  it('renders the chart with data', () => {
    render(
      <BrowserRouter>
        <LifecycleChart data={mockData} />
      </BrowserRouter>
    );
    expect(screen.getByText('Projects by Status')).toBeInTheDocument();
    expect(screen.getByText('Lead')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('Prospect')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
  });

  it('navigates to the projects list with correct filter when a row is clicked', () => {
    render(
      <BrowserRouter>
        <LifecycleChart data={mockData} />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Lead'));
    expect(mockedUsedNavigate).toHaveBeenCalledWith('/projects?lifecycleStatus=Lead');
  });

  it('renders a message when no data is available', () => {
    render(
      <BrowserRouter>
        <LifecycleChart data={[]} />
      </BrowserRouter>
    );
    expect(screen.getByText('No project data available.')).toBeInTheDocument();
  });
});