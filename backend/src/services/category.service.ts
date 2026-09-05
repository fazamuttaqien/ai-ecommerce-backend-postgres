import { prisma } from '../config/database.config';

export const getCategoriesService = async () => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  return { categories };
};
