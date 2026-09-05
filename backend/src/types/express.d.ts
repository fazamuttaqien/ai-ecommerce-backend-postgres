import type { User as PrismaUser } from '@prisma/client';

export type AuthUser = Omit<PrismaUser, 'password'>;

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      guestCartId?: string | null;
    }
  }
}
