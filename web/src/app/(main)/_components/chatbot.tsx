/* eslint-disable react/no-array-index-key */
'use client';
import { useState } from 'react';

import { useChat } from '@ai-sdk/react';
import { CopyIcon, MessageSquare, RefreshCcwIcon } from 'lucide-react';

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from '@/components/ai-elements/message';
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputFooter,
} from '@/components/ai-elements/prompt-input';
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@/components/ai-elements/reasoning';
import { Source, Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';

const SOURCE_URL = 'source-url';

const ChatBotDemo = () => {
  const [input, setInput] = useState('');
  const { messages, sendMessage, status, regenerate } = useChat();
  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files.length);
    if (!(hasText || hasAttachments)) {
      return;
    }
    void sendMessage({
      text: message.text.length > 0 ? message.text : 'Sent with attachments',
      files: message.files,
    });
    setInput('');
  };
  return (
    <div className="relative size-full p-2">
      <div className="flex h-full flex-col">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.length === 0 ? (
              <ConversationEmptyState
                description="Type a message below to begin chatting"
                icon={<MessageSquare className="size-12" />}
                title="Start a conversation"
              />
            ) : (
              messages.map((message) => (
                <div key={message.id}>
                  {message.role === 'assistant' &&
                    message.parts.filter((part) => part.type === SOURCE_URL).length > 0 && (
                      <Sources>
                        <SourcesTrigger
                          count={message.parts.filter((part) => part.type === SOURCE_URL).length}
                        />
                        {message.parts
                          .filter((part) => part.type === SOURCE_URL)
                          .map((part, i) => (
                            <SourcesContent key={`${message.id}-${i}`}>
                              <Source key={`${message.id}-${i}`} href={part.url} title={part.url} />
                            </SourcesContent>
                          ))}
                      </Sources>
                    )}
                  {message.parts.map((part, i) => {
                    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
                    switch (true) {
                      case part.type === 'text':
                        return (
                          <Message key={`${message.id}-${i}`} from={message.role}>
                            <MessageContent>
                              <MessageResponse>{part.text}</MessageResponse>
                            </MessageContent>
                            {message.role === 'assistant' && i === messages.length - 1 && (
                              <MessageActions>
                                <MessageAction label="Retry" onClick={() => regenerate()}>
                                  <RefreshCcwIcon className="size-3" />
                                </MessageAction>
                                <MessageAction
                                  label="Copy"
                                  onClick={() => navigator.clipboard.writeText(part.text)}
                                >
                                  <CopyIcon className="size-3" />
                                </MessageAction>
                              </MessageActions>
                            )}
                          </Message>
                        );
                      case part.type === 'reasoning':
                        return (
                          <Reasoning
                            key={`${message.id}-${i}`}
                            className="w-full"
                            isStreaming={
                              status === 'streaming' &&
                              i === message.parts.length - 1 &&
                              message.id === messages.at(-1)?.id
                            }
                          >
                            <ReasoningTrigger />
                            <ReasoningContent>{part.text}</ReasoningContent>
                          </Reasoning>
                        );
                      default:
                        return null;
                    }
                  })}
                </div>
              ))
            )}
            {status === 'submitted' && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <PromptInput className="mt-4" globalDrop multiple onSubmit={handleSubmit}>
          <PromptInputHeader>
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
          </PromptInputHeader>
          <PromptInputBody>
            <PromptInputTextarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
              }}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputSubmit
              disabled={input.length === 0 || status === 'streaming' || status === 'submitted'}
              status={status}
            />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
};
export default ChatBotDemo;
