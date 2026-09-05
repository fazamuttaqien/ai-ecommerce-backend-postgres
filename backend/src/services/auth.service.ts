import { eq } from 'drizzle-orm';
import { db } from '../db';
import { users } from '../db/schema';
import { hashValue, compareValue } from '../utils/bcrypt.util';
import { BadRequestException, UnauthorizedException } from '../utils/app-error';
import { RegisterInput, LoginInput } from '../validators/auth.validator';
import { mergeGuestCartService } from './cart.service';

export const registerService = async (data: RegisterInput) => {
  const [existingUser] = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
  if (existingUser) throw new BadRequestException('Email already in use');
  const hashedPassword = await hashValue(data.password);
  const [user] = await db.insert(users).values({ ...data, password: hashedPassword }).returning();
  const { password: _password, ...safeUser } = user;
  return safeUser;
};

export const loginService = async ({ email, password }: LoginInput) => {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) throw new UnauthorizedException('Invalid email or password');
  const isMatch = await compareValue(password, user.password);
  if (!isMatch) throw new UnauthorizedException('Invalid email or password');
  const { password: _password, ...safeUser } = user;
  return safeUser;
};

export const registerAndMergeGuestCart = async (data: RegisterInput, guestCartId: string | null) => {
  const user = await registerService(data);
  await mergeGuestCartService(user._id, guestCartId);
  return user;
};
export const loginAndMergeGuestCart = async (email: string, password: string, guestCartId: string | null) => {
  const user = await loginService({ email, password });
  await mergeGuestCartService(user._id, guestCartId);
  return user;
};
