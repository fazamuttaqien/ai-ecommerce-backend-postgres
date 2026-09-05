import { prisma } from '../config/database.config';
import { hashValue, compareValue } from '../utils/bcrypt.util';
import {
  BadRequestException,
  UnauthorizedException,
} from '../utils/app-error';
import { RegisterInput, LoginInput } from '../validators/auth.validator';
import { mergeGuestCartService } from './cart.service';

export const registerService = async (data: RegisterInput) => {
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingUser) {
    throw new BadRequestException('Email already in use');
  }

  const hashedPassword = await hashValue(data.password);

  const user = await prisma.user.create({
    data: {
      ...data,
      password: hashedPassword,
    },
  });

  const { password: _password, ...safeUser } = user;
  return safeUser;
};

export const loginService = async ({ email, password }: LoginInput) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new UnauthorizedException('Invalid email or password');
  }

  const isMatch = await compareValue(password, user.password);
  if (!isMatch) {
    throw new UnauthorizedException('Invalid email or password');
  }

  const { password: _password, ...safeUser } = user;
  return safeUser;
};

export const registerAndMergeGuestCart = async (
  data: RegisterInput,
  guestCartId: string | null,
) => {
  const user = await registerService(data);
  await mergeGuestCartService(user._id.toString(), guestCartId);
  return user;
};

export const loginAndMergeGuestCart = async (
  email: string,
  password: string,
  guestCartId: string | null,
) => {
  const user = await loginService({ email, password });
  await mergeGuestCartService(user._id.toString(), guestCartId);
  return user;
};
