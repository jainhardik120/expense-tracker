import { z } from 'zod';

export const createAccountSchema = z.object({
  startingBalance: z.string().refine((val) => !Number.isNaN(parseInt(val, 10)), {
    message: 'Expected number, received a string',
  }),
  accountName: z.string(),
});
