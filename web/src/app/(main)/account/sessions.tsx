'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { MobileIcon } from '@radix-ui/react-icons';
import { Laptop, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { UAParser } from 'ua-parser-js';

import { type Session } from '@/lib/auth';
import { authClient } from '@/lib/auth-client';

const Sessions = (props: { session: Session | null; activeSessions: Session['session'][] }) => {
  const [activeSessions, setActiveSessions] = useState(props.activeSessions);
  const removeActiveSession = (id: string) => {
    setActiveSessions(activeSessions.filter((session) => session.id !== id));
  };
  const [isTerminating, setIsTerminating] = useState<string>();
  const router = useRouter();

  const getButtonContent = (
    isTerminating: string | undefined,
    sessionId: string,
    currentSessionId: string | undefined,
  ) => {
    if (isTerminating === sessionId) {
      return <Loader2 className="animate-spin" size={15} />;
    }
    if (sessionId === currentSessionId) {
      return <>Sign Out</>;
    }
    return <>Terminate</>;
  };
  return (
    <div className="flex w-max flex-col gap-1 border-l-2 px-2">
      <p className="text-xs font-medium">Active Sessions</p>
      {activeSessions
        .filter(
          (session) =>
            session.userAgent !== undefined &&
            session.userAgent !== '' &&
            session.userAgent !== null,
        )
        .map((session) => {
          return (
            <div key={session.id}>
              <div className="flex items-center gap-2 text-sm font-medium text-black dark:text-white">
                {new UAParser(session.userAgent ?? '').getDevice().type === 'mobile' ? (
                  <MobileIcon />
                ) : (
                  <Laptop size={16} />
                )}
                {new UAParser(session.userAgent ?? '').getOS().name ?? session.userAgent},{' '}
                {new UAParser(session.userAgent ?? '').getBrowser().name}
                <button
                  className="border-muted-foreground text-destructive cursor-pointer text-xs underline opacity-80"
                  onClick={async () => {
                    setIsTerminating(session.id);
                    const res = await authClient.revokeSession({
                      token: session.token,
                    });

                    if (res.error === null) {
                      toast.success('Session terminated successfully');
                      removeActiveSession(session.id);
                    } else {
                      toast.error(res.error.message);
                    }
                    if (session.id === props.session?.session.id) {
                      router.refresh();
                    }
                    setIsTerminating(undefined);
                  }}
                >
                  {getButtonContent(isTerminating, session.id, props.session?.session.id)}
                </button>
              </div>
            </div>
          );
        })}
    </div>
  );
};

export default Sessions;
