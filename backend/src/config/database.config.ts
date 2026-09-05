import { PrismaClient } from '@prisma/client';
import { envConfig } from './env.config';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Reuse a single PrismaClient instance (important with ts-node-dev/nodemon
// hot reloads, otherwise every reload opens a new pool of DB connections).
export const prisma =
  global.__prisma ??
  new PrismaClient({
    log: envConfig.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (envConfig.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    console.log('Database connected!');
  } catch (error) {
    console.log('Database connection error', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async () => {
  await prisma.$disconnect();
};
