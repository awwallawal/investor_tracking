import axios from 'axios';

// Create a new axios instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/', // Use environment variable
  // Arrays as repeated params (?sector=A&sector=B), not sector[]=A (story 11.15).
  paramsSerializer: { indexes: null },
});

// Add a request interceptor to include the token in all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export default apiClient;
