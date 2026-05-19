import { z } from 'zod';

export const ExpandableSchema = z.object({
  expand: z.array(z.string()).optional(),
});
