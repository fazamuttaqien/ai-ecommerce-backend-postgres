const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Replacement for `mongoose.isValidObjectId`.
 * Postgres primary keys are UUIDs (see prisma/schema.prisma), so this
 * validates the string looks like a UUID before it's used in a query -
 * Prisma throws a hard error on a malformed UUID instead of just
 * returning no results, so we still want to guard for it up front.
 */
export const isValidId = (value: unknown): value is string =>
  typeof value === 'string' && UUID_REGEX.test(value);
