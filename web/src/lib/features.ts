import { env } from '@/lib/env';

/**
 * The AI assistant is experimental and disabled unless explicitly enabled.
 *
 * Both the floating chat button and the /api/chat endpoint check this. Hiding
 * the button alone would leave the route reachable by anyone with a session,
 * and the route is the part that spends the AI gateway key.
 */
export const isAiAssistantEnabled = (): boolean => env.AI_ASSISTANT_ENABLED === 'true';
