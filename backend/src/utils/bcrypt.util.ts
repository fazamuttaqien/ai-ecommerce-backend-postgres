import bcryptjs from 'bcryptjs';

export const hashValue = async (
  value: string,
  saltRounds = 10,
): Promise<string> => {
  return bcryptjs.hash(value, saltRounds);
};

export const compareValue = async (
  value: string,
  hashedValue: string,
): Promise<boolean> => {
  return bcryptjs.compare(value, hashedValue);
};
