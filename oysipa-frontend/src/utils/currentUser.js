import { jwtDecode } from 'jwt-decode';

// The signed-in user from the stored token (same decoding as ProtectedRoute).
// The server re-checks the role on every request; this only drives the UI.
export const getCurrentUser = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    return jwtDecode(token).user || null;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

export const isAdminRole = (role) => role === 'Director-General' || role === 'Portal-Admin';
