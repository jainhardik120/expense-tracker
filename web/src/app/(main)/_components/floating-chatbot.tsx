'use client';

import { MessageSquareTextIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import ChatBotDemo from './chatbot';

export default function FloatingChatbot() {
  return (
    <Popover>
      <PopoverContent className="m-4 h-[520px] w-96">
        <ChatBotDemo />
      </PopoverContent>
      <PopoverTrigger asChild>
        <Button className="fixed right-4 bottom-4 z-50 h-14 w-14 rounded-full">
          <MessageSquareTextIcon />
        </Button>
      </PopoverTrigger>
    </Popover>
  );
}
