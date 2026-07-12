'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { storeJwt } from '@/lib/api';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get('token');

    if (token) {
      storeJwt(token);
      router.push('/dashboard');
    } else {
      router.push('/login?error=oauth_failed');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
      <div className="flex flex-col items-center gap-4">
        {/* Loading Spinner */}
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        <h2 className="text-xl font-medium text-slate-200">
          Completing sign in...
        </h2>
        <p className="text-slate-500 text-sm">
          Please wait while we authenticate your account.
        </p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
          <div className="text-slate-400">Loading...</div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
