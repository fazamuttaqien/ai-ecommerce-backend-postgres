import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { addresses } from '../db/schema';
import { CreateAddressInput } from '../validators/address.validator';

export const createAddressService = async (userId: string, data: CreateAddressInput) => {
  const address = await db.transaction(async (tx) => {
    await tx.update(addresses).set({ isDefault: false }).where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)));
    const [created] = await tx.insert(addresses).values({ ...data, userId, isDefault: true }).returning();
    return created;
  });
  return address;
};

export const getUserAddressesService = async (userId: string) => {
  const result = await db.select().from(addresses).where(eq(addresses.userId, userId)).orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
  return { addresses: result };
};
