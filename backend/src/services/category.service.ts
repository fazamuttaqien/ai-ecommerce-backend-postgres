import { asc, eq } from 'drizzle-orm';
import { db } from '../db';
import { categories } from '../db/schema';

export const getCategoriesService = async () => {
  const result = await db.select().from(categories).where(eq(categories.isActive, true)).orderBy(asc(categories.createdAt));
  return { categories: result };
};
