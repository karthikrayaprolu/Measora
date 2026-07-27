import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import client from './client';

/**
 * Returns true once the Supabase session is ready (has an access token).
 * Used to gate queries so they don't fire before the JWT is available,
 * which would cause spurious 401s on every page load.
 */
export const useIsAuthReady = () => {
  const { session, loading } = useAuth();
  return !loading && !!session?.access_token;
};

export const useProducts = () => {
  const authReady = useIsAuthReady();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['products', user?.id],
    queryFn: async () => {
      const { data } = await client.get('/products');
      return data;
    },
    enabled: authReady,
  });
};

export const useCreateSession = () => {
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await client.post('/sessions', payload);
      return data;
    },
  });
};

export const useSession = (sessionId) => {
  const authReady = useIsAuthReady();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['session', user?.id, sessionId],
    queryFn: async () => {
      const { data } = await client.get(`/sessions/${sessionId}`);
      return data;
    },
    enabled: !!sessionId && authReady,
    refetchInterval: (query) => {
      // Poll if status indicates processing
      const status = query?.state?.data?.status;
      if (['queued', 'processing', 'fast_processing', 'accurate_processing', 'capturing'].includes(status)) {
        return 2000;
      }
      return false;
    }
  });
};

export const useUploadFrame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, formData }) => {
      const { data } = await client.post(`/sessions/${sessionId}/frames`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return data;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useValidateFrame = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, frameId }) => {
      const { data } = await client.post(`/sessions/${sessionId}/frames/${frameId}/validate`);
      return data;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useConfirmPoints = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, frameId, landmarks }) => {
      const { data } = await client.post(`/sessions/${sessionId}/frames/${frameId}/confirm-points`, { landmarks });
      return data;
    },
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useFastEstimate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId) => {
      const { data } = await client.post(`/sessions/${sessionId}/fast-estimate`);
      return data;
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
      queryClient.invalidateQueries({ queryKey: ['fast-estimate'] });
    },
  });
};

export const useGetFastEstimate = (sessionId, isReady) => {
  const authReady = useIsAuthReady();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['fast-estimate', user?.id, sessionId],
    queryFn: async () => {
      const { data } = await client.get(`/sessions/${sessionId}/fast-estimate`);
      return data;
    },
    enabled: !!sessionId && isReady && authReady,
  });
};

export const useAccurateEstimate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId) => {
      const { data } = await client.post(`/sessions/${sessionId}/accurate-estimate`);
      return data;
    },
    onSuccess: (_, sessionId) => {
      queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });
};

export const useBrands = (productType) => {
  const authReady = useIsAuthReady();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['brands', user?.id, productType],
    queryFn: async () => {
      const { data } = await client.get(`/brands`, { params: { product_type: productType } });
      return data;
    },
    enabled: !!productType && authReady,
  });
};

export const useSizeRecommendation = () => {
  return useMutation({
    mutationFn: async ({ sessionId, payload }) => {
      const { data } = await client.post(`/sessions/${sessionId}/size-recommendation`, payload);
      return data;
    },
  });
};

export const useMeasurements = (userId) => {
  const authReady = useIsAuthReady();
  return useQuery({
    queryKey: ['measurements', userId],
    queryFn: async () => {
      const { data } = await client.get(`/users/${userId}/profiles`);
      return data;
    },
    enabled: !!userId && authReady,
  });
};

export const useSaveMeasurement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, payload }) => {
      const { data } = await client.post(`/users/${userId}/profiles`, payload);
      return data;
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', userId] });
    },
  });
};

export const useDeleteMeasurement = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, id }) => {
      await client.delete(`/users/${userId}/profiles/${id}`);
    },
    onSuccess: (_, { userId }) => {
      queryClient.invalidateQueries({ queryKey: ['measurements', userId] });
    },
  });
};

export const useResult = (sessionId, sessionStatus) => {
  const authReady = useIsAuthReady();
  const { user } = useAuth();
  return useQuery({
    queryKey: ['result', user?.id, sessionId],
    queryFn: async () => {
      const { data } = await client.get(`/sessions/${sessionId}/result`);
      return data;
    },
    enabled: !!sessionId && authReady,
    retry: (count, error) => error?.response?.status === 404 ? count < 8 : count < 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
    // The accurate worker commits measurements shortly after it marks the
    // session complete. Keep reading until the result itself has data, rather
    // than leaving the page with the one empty response from that brief gap.
    refetchInterval: (query) => {
      if (sessionStatus === 'failed') return false;
      return query.state.data?.measurements?.length ? false : 2000;
    },
    refetchIntervalInBackground: true,
  });
};
