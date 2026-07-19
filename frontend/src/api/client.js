import axios from 'axios';
import { supabase } from '../lib/supabase';

export const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: `${API_BASE}/v1`,
  timeout: 20_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to attach the auth token
client.interceptors.request.use(async (config) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch (error) {
    console.error('Failed to get Supabase token', error);
  }
  return config;
});

client.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      error.userMessage = 'Unable to reach Measora. Check your connection and try again.';
    }
    return Promise.reject(error);
  },
);

export default client;
