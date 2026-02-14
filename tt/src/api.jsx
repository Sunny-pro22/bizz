// api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api', // adjust if your backend runs on a different port
});

// Request interceptor: attach token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 (unauthorized) globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Token is invalid or expired – clear local storage and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Product endpoints
export const fetchProducts = () => api.get('/products');
export const addProduct = (data) => api.post('/products/add', data);
export const sellProduct = (data) => api.post('/products/sell', data);

// Profile & transactions
export const fetchProfile = () => api.get('/profile');
export const fetchTransactions = () => api.get('/transactions');

// Voice command
export const parseVoice = (text) => api.post('/voice', { text });

export default api;