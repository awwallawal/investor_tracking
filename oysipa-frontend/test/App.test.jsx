import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import App from '../src/App';

describe('App Component', () => {
  it('renders the sign-in page for an unauthenticated user', () => {
    render(<App />);
    const heading = screen.getByRole('heading', { name: /Sign In/i });
    expect(heading).toBeDefined();
  });
});
