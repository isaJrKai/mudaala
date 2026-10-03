'use client'

// Session state via TanStack Query - invalidated after sign-in/out/register.

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { apiGet, apiPost, clearSessionToken } from '@/lib/client'
import type { SessionUser } from '@/lib/client'

export function useSession() {
  const query = useQuery({
    queryKey: ['session'],
    queryFn: () => apiGet<{ user: SessionUser | null }>('/api/auth/me'),
    staleTime: 60_000,
  })
  return {
    user: query.data?.user ?? null,
    isLoading: query.isLoading,
  }
}

export function useSignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>('/api/auth/logout'),
    onSuccess: () => {
      // Drop the Bearer-channel token too, then wipe every cached query so no
      // signed-in data lingers on screen.
      clearSessionToken()
      queryClient.clear()
    },
  })
}
