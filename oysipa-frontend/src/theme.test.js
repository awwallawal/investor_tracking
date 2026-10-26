import theme from './theme';

// Story 11.13: the approved design tokens.
describe('theme', () => {
  it('uses Poppins and the approved palette', () => {
    expect(theme.typography.fontFamily).toMatch(/^Poppins/);
    expect(theme.palette.primary.main).toBe('#850504');
    expect(theme.palette.primary.dark).toBe('#5E0302');
    expect(theme.palette.secondary.main).toBe('#0A558C');
    expect(theme.palette.background.default).toBe('#FAFAF8');
    expect(theme.palette.background.paper).toBe('#FFFFFF');
    expect(theme.palette.divider).toBe('#ECE8E2');
    expect(theme.palette.text.primary).toBe('#1F1D1B');
    expect(theme.palette.text.secondary).toBe('#5C5752');
    expect(theme.palette.success.main).toBe('#1E7A4D');
  });

  it('secondary is the blue (intended: secondary buttons and chips on other screens are blue)', () => {
    expect(theme.palette.secondary.main).toBe('#0A558C');
  });

  it('keeps the `accent` key, pointed at the blue', () => {
    expect(theme.palette.accent.main).toBe('#0A558C');
  });

  it('buttons: radius 10, no uppercase, weight 600; inputs radius 10; cards radius 16', () => {
    expect(theme.components.MuiButton.styleOverrides.root).toMatchObject({ borderRadius: 10, textTransform: 'none', fontWeight: 600 });
    expect(theme.components.MuiOutlinedInput.styleOverrides.root).toMatchObject({ borderRadius: 10 });
    expect(theme.components.MuiCard.styleOverrides.root).toMatchObject({ borderRadius: 16, border: '1px solid #ECE8E2' });
  });

  it('keeps the responsive heading sizes', () => {
    expect(theme.typography.h1['@media (max-width:599.95px)']).toEqual({ fontSize: '26px' });
    expect(theme.typography.h4['@media (max-width:599.95px)']).toEqual({ fontSize: '1.5rem', lineHeight: 1.3 });
  });
});
