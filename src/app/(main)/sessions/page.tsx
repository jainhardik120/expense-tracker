'use client';

import { useEffect, useState } from 'react';

import { toast } from 'sonner';

import { authClient } from '@/lib/auth-client';

export default function Page() {
  const [sessions, setSessions] = useState<
    {
      id: string;
      userId: string;
      expiresAt: Date;
      createdAt: Date;
      updatedAt: Date;
      token: string;
      ipAddress?: string | null;
      userAgent?: string | null;
    }[]
  >([]);
  useEffect(() => {
    authClient
      .listSessions()
      .then((res) => {
        setSessions(res.data ?? []);
        return true;
      })
      .catch(toast.error);
  }, []);
  return <div>{JSON.stringify(sessions)}</div>;
}
