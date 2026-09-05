import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';

export const findUserById = async (id: string) => {
  const [user] = await db.select().from(users).where(eq(users._id, id)).limit(1);
  if (!user) return null;
  const { password: _password, ...safeUser } = user;
  return safeUser;
};
