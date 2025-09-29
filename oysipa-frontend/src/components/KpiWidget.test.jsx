import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import KpiWidget from '../components/KpiWidget';

// Mock the useNavigate hook
const mockedUsedNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedUsedNavigate,
  };
});

describe('KpiWidget', () => {
  beforeEach(() => {
    mockedUsedNavigate.mockClear();
  });

  it('renders the title and value', () => {
    render(
      <BrowserRouter>
        <KpiWidget title="Total Investors" value={125} />
      </BrowserRouter>
    );
    expect(screen.getByText('Total Investors')).toBeInTheDocument();
    expect(screen.getByText('125')).toBeInTheDocument();
  });

  it('navigates to the specified path when clicked', () => {
    render(
      <BrowserRouter>
        <KpiWidget title="Total Investors" value={125} navigateTo="/investors" />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Total Investors'));
    expect(mockedUsedNavigate).toHaveBeenCalledWith('/investors');
  });

  it('does not navigate if navigateTo prop is not provided', () => {
    render(
      <BrowserRouter>
        <KpiWidget title="Total Investors" value={125} />
      </BrowserRouter>
    );
    fireEvent.click(screen.getByText('Total Investors'));
    expect(mockedUsedNavigate).not.toHaveBeenCalled();
  });
});