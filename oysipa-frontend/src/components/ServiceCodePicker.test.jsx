import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ServiceCodePicker from './ServiceCodePicker';
import { SERVICE_CODES } from '../constants/serviceCodes';

const Harness = ({ onChange = () => {}, onCredit = () => {} }) => {
  const [codes, setCodes] = useState([]);
  const [credit, setCredit] = useState(false);
  return (
    <ServiceCodePicker
      value={codes}
      onChange={(c) => { setCodes(c); onChange(c); }}
      creditLinkage={credit}
      onCreditLinkageChange={(v) => { setCredit(v); onCredit(v); }}
    />
  );
};

describe('ServiceCodePicker', () => {
  it('has all 29 SABER codes: 7 Marketing, 7 Information, 10 Assistance, 5 Advocacy', () => {
    expect(SERVICE_CODES).toHaveLength(29);
    const count = (cat) => SERVICE_CODES.filter((s) => s.category === cat).length;
    expect([count('Marketing'), count('Information'), count('Assistance'), count('Advocacy')]).toEqual([7, 7, 10, 5]);
    expect(new Set(SERVICE_CODES.map((s) => s.code)).size).toBe(29);
  });

  it('lists the options grouped with the verbatim wording and keeps PDF order', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox', { name: /saber services/i }));

    expect(await screen.findByText('Marketing Services')).toBeInTheDocument();
    expect(document.querySelectorAll('li[data-value]')).toHaveLength(29);
    expect(screen.getByText('Proactively meeting/visiting investors to monitor the status of investment projects and explore new investment opportunities')).toBeInTheDocument();

    await userEvent.click(screen.getByText('V5'));
    await userEvent.click(screen.getByText('I7'));
    expect(onChange).toHaveBeenLastCalledWith(['I7', 'V5']);

    // Clicking again deselects
    await userEvent.click(screen.getByText('V5'));
    expect(onChange).toHaveBeenLastCalledWith(['I7']);
  }, 20000);

  it('toggles the credit-linkage checkbox', async () => {
    const onCredit = vi.fn();
    render(<Harness onCredit={onCredit} />);
    const box = screen.getByRole('checkbox', { name: /credit linkage/i });
    expect(box).not.toBeChecked();
    await userEvent.click(box);
    expect(onCredit).toHaveBeenLastCalledWith(true);
    expect(box).toBeChecked();
  });
});
