import { prisma } from '../config/database.config';

export const findUserById = async (id: string) => {
  const user = await prisma.user.findUnique({ where: { _id: id } });
  if (!user) return null;

  const { password: _password, ...safeUser } = user;
  return safeUser;
};
