import { env } from '@/lib/env';

export const isAiAssistantEnabled = (): boolean => env.AI_ASSISTANT_ENABLED === 'true';
