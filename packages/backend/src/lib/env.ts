import 'dotenv/config';
import { z } from 'zod';

const zEnv = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  OPENAI_MODEL: z.string().default('gpt-5.4-mini'),
  PORT: z.coerce.number().int().positive().default(3001),
});

const parsed = zEnv.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
