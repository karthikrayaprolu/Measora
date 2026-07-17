import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from './client';

export const useProducts = () => {
  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await client.get('/products');
      return data;
    },
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
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const { data } = await client.get(`/sessions/${sessionId}`);
      return data;
    },
    enabled: !!sessionId,
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
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
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
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
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
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
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
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['fast-estimate', sessionId] });
    },
  });
};

export const useGetFastEstimate = (sessionId, isReady) => {
  return useQuery({
    queryKey: ['fast-estimate', sessionId],
    queryFn: async () => {
      const { data } = await client.get(`/sessions/${sessionId}/fast-estimate`);
      return data;
    },
    enabled: !!sessionId && isReady,
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
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });
};

export const useBrands = (productType) => {
  return useQuery({
    queryKey: ['brands', productType],
    queryFn: async () => {
      const { data } = await client.get(`/brands`, { params: { product_type: productType } });
      return data;
    },
    enabled: !!productType,
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
  return useQuery({
    queryKey: ['measurements', userId],
    queryFn: async () => {
      const { data } = await client.get(`/users/${userId}/profiles`);
      return data;
    },
    enabled: !!userId,
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

export const useResult = (sessionId) => {
  return useQuery({
    queryKey: ['result', sessionId],
    queryFn: async () => {
      const { data } = await client.get(`/sessions/${sessionId}/result`);
      return data;
    },
    enabled: !!sessionId,
    retry: (count, error) => error?.response?.status === 404 ? count < 8 : count < 2,
    retryDelay: attempt => Math.min(1000 * 2 ** attempt, 5000),
  });
};
