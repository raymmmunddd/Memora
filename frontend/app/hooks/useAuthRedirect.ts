// hooks/useAuthRedirect.ts
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '@/services/auth.service';

export function useAuthRedirect(redirectTo: string = '/dashboard') {
  const router = useRouter();

  useEffect(() => {
    if (authService.isAuthenticated()) {
      router.push(redirectTo);
    }
  }, [router, redirectTo]);
}