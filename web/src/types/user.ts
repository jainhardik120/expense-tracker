import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { user } from '@/db/auth-schema';

export const userSchema = createSelectSchema(user).extend({
  twoFactorEnabled: z.boolean().optional(),
  image: z.string().nullish(),
  role: z.string().nullish(),
  banReason: z.string().nullish(),
  banExpires: z.date().nullish(),
});
