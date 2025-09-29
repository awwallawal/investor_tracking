import { jwtDecode } from 'jwt-decode';

export const getAuthenticatedUser = () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const decoded = jwtDecode(token);
      // The user payload is nested under 'user' in the token
      return decoded.user;
    } catch (error) {
      console.error('Invalid token', error);
      return null;
    }
  }
  return null;
};