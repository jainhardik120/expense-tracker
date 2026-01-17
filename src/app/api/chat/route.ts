import { headers } from 'next/headers';

import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, type UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';

import { db } from '@/lib/db';
import { createCaller } from '@/server/routers';

export const maxDuration = 30;

const tools = (caller: ReturnType<typeof createCaller>) => {
  return {
    'get-accounts-summary': tool({
      description: 'Get a summary of all accounts',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await caller.summary.getSummary({});
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return { accounts: result.accountsSummaryData, friends: result.friendsSummaryData };
      },
    }),
  };
};

export const POST = async (req: Request) => {
  const heads = await headers();
  const caller = createCaller({
    headers: heads,
    db: db,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const {
    messages,
  }: {
    messages: UIMessage[];
  } = await req.json();
  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: google('gemini-3-flash-preview'),
    messages: modelMessages,
    tools: tools(caller),
    stopWhen: stepCountIs(5),
    system: `You are an accounting expert. You are helpful and honest. You will answer questions about accounting and finance. You will also provide financial advice and guidance. Your answers should be helpful, honest, and informative. You should not provide any financial advice that is not related to the question. If you are unsure of the answer, you should say "I'm not sure" and not "I don't know". You can only answer questions related to accounting and finance. If you are asked about a topic that is not related to accounting or finance, you should say "I'm not sure" and not "I don't know". You should not answer questions that are not related to accounting or finance.`,
  });
  return result.toUIMessageStreamResponse({
    sendSources: true,
    sendReasoning: true,
  });
};
