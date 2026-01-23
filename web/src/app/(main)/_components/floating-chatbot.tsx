'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';

import ChatBotDemo from './chatbot';

export default function FloatingChatbot() {
  const [open, setOpen] = useState<boolean>(false);

  return (
    <>
      {open ? (
        <div className="bg-background fixed right-4 bottom-20 z-50 flex h-[520px] w-96 flex-col rounded-2xl border shadow-xl">
          <div className="flex-1 overflow-hidden">
            <ChatBotDemo />
          </div>
        </div>
      ) : null}
      <Button
        className="fixed right-4 bottom-4 z-50 h-14 w-14 rounded-full"
        onClick={() => {
          setOpen((prev) => !prev);
        }}
      >
        💬
      </Button>
    </>
  );
}
