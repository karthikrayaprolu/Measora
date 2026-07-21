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
    } else {
      // No token: this will cause a 401 on protected routes.
      // Root cause: Supabase anonymous sign-in likely failed or is disabled.
      console.warn(
        '[API] No Supabase session found — request will be sent without Authorization header.',
        'Check: Supabase Dashboard → Authentication → Providers → Anonymous is enabled.',
        'Request:', config.method?.toUpperCase(), config.url
      );
    }
  } catch (error) {
    console.error('[API] Failed to get Supabase session:', error);
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
