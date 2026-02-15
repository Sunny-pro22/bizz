// src/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: 'https://bizz-skq6.onrender.com/api',
  timeout: 15000,
});

// attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (err) => Promise.reject(err)
);

// intercept responses to attach helpful serverMessage
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    if (err.response) {
      err.serverMessage = err.response.data?.details || err.response.data?.error || err.response.statusText;
    }
    return Promise.reject(err);
  }
);

export const fetchProducts = () => api.get('/products');
export const fetchProfile = () => api.get('/profile');
export const fetchTransactions = () => api.get('/transactions');

export const parseVoice = async (text) => {
  const res = await api.post('/voice', { text });
  return res.data; // { action, product, quantity, price }
};

export const addInventory = async (data) => {
  const res = await api.post('/voice/add', data);
  return res.data;
};

export const sellInventory = async (data) => {
  const res = await api.post('/voice/sell', data);
  return res.data;
};

export default api;
