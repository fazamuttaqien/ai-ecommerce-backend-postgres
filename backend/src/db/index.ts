import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

import { envConfig } from '../config/env.config';
import * as schema from './schema';

const client = postgres(envConfig.DATABASE_URL, {
  max: envConfig.NODE_ENV === 'test' ? 1 : undefined,
});

export const db = drizzle(client, { schema });

export const connectDatabase = async (): Promise<void> => {
  try {
    await client`SELECT 1`;
    console.log('Database connected!');
  } catch (error) {
    console.error('Database connection error', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await client.end({ timeout: 5 });
};

export * from './schema';
export * from './relations';
