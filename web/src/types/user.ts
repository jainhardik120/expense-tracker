import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { user } from '@/db/auth-schema';

/**
 * A user as the admin pages list them.
 *
 * Its own module because building it needs the auth schema and drizzle-zod,
 * which have no business in the browser: kept in '@/types', every client
 * component importing anything from there shipped both.
 */
export const userSchema = createSelectSchema(user).extend({
  twoFactorEnabled: z.boolean().optional(),
  image: z.string().nullish(),
  role: z.string().nullish(),
  banReason: z.string().nullish(),
  banExpires: z.date().nullish(),
});
