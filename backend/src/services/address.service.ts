import { prisma } from '../config/database.config';
import { CreateAddressInput } from '../validators/address.validator';

export const createAddressService = async (
  userId: string,
  data: CreateAddressInput,
) => {
  const address = await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    return tx.address.create({
      data: {
        ...data,
        userId,
        isDefault: true,
      },
    });
  });

  return address;
};

export const getUserAddressesService = async (userId: string) => {
  const addresses = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return { addresses };
};
