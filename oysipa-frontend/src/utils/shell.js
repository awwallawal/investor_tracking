// Helpers for the app shell (story 11.13).

// The active sidebar item: the route itself or anything under it
// (e.g. /investors/abc highlights Investors).
// Case-insensitive; a trailing slash is ignored; "/" matches only itself.
const normalisePath = (p) => {
  const lower = String(p || '/').toLowerCase().replace(/\/+$/, '');
  return lower === '' ? '/' : lower;
};

export const isActivePath = (pathname, path) => {
  const current = normalisePath(pathname);
  const target = normalisePath(path);
  if (target === '/') return current === '/';
  return current === target || current.startsWith(`${target}/`);
};

// Two-letter tile from the name, else from the role ("Director-General" → DG).
export const initialsFor = (user) => {
  const source = (user?.name || '').trim() || (user?.role || '').trim();
  const words = source.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};

// "⌘K" on a Mac, "Ctrl K" elsewhere.
export const isMacPlatform = () => {
  if (typeof navigator === 'undefined') return false;
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  return /mac/i.test(platform);
};
export const searchShortcutLabel = () => (isMacPlatform() ? '⌘K' : 'Ctrl K');
