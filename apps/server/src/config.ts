import { z } from 'zod';
import dotenv from 'dotenv';

import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '../../.env') });
dotenv.config({ path: resolve(process.cwd(), '.env') });

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  CLAUDE_API_KEY: z.string().default(''),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  GITLAB_REPO_URL: z.string().default(''),
  GITLAB_TOKEN: z.string().default(''),
  GITLAB_REPO2_URL: z.string().default(''),
  GITLAB_REPO2_TOKEN: z.string().default(''),

  GIT_CLONE_BASE_DIR: z.string().default('./data/repos'),
  REPO_SCHEMA_SUBPATH: z.string().default(''),
  REPO_DATA_SUBPATH: z.string().default(''),

  JIRA_BASE_URL: z.string().default(''),
  JIRA_USER_EMAIL: z.string().default(''),
  JIRA_API_TOKEN: z.string().default(''),
  JIRA_DEFAULT_PROJECT: z.string().default(''),

  CONFLUENCE_BASE_URL: z.string().default(''),

  GOOGLE_SHEETS_ID: z.string().default(''),
  GOOGLE_API_KEY: z.string().default(''),
  GOOGLE_SERVICE_ACCOUNT_KEY: z.string().default(''),
  GOOGLE_STRINGDATA_SYNC_INTERVAL: z.coerce.number().default(300_000),

  DB_PATH: z.string().default('./data/datamaster.db'),
  WIKI_DIR: z.string().default('./data/wiki'),

  AUTO_SYNC_ON_START: z.coerce.boolean().default(true),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
