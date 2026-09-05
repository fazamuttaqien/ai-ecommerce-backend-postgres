import { prisma } from '../config/database.config';
import { isValidId } from '../utils/id.util';
import { UpsertCartInput } from '../validators/cart.validator';
import { BadRequestException } from '../utils/app-error';
import { calculateCartTotals } from '../utils/cart.util';
import { FREE_DELIVERY_THRESHOLD } from '../constants/constant';

const CART_ITEM_PRODUCT_SELECT = {
  select: {
    _id: true,
    name: true,
    slug: true,
    images: true,
    salePrice: true,
    originalPrice: true,
    discountPercent: true,
    stockCount: true,
  },
} as const;

const EMPTY_CART_RESULT = {
  cart: { items: [] as unknown[] },
  subtotal: 0,
  deliveryFee: 0,
  tax: 0,
  orderTotal: 0,
  freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
};

/**
 * Finds (or lazily creates) the single cart row identified by either a
 * logged-in userId or a guestCartId, mirroring the old
 * `CartModel.findOneAndUpdate(query, ..., { upsert: true })` behaviour.
 */
const findOrCreateCart = async (
  userId: string | null,
  guestCartId: string | null,
) => {
  const where = userId ? { userId } : { guestCartId: guestCartId! };

  const existing = await prisma.cart.findFirst({ where });
  if (existing) return existing;

  return prisma.cart.create({
    data: userId ? { userId } : { guestCartId },
  });
};

export const upsertCartService = async (
  userId: string | null,
  guestCartId: string | null,
  data: UpsertCartInput,
) => {
  if (!userId && !guestCartId) {
    throw new BadRequestException('User ID or guest cart ID is required');
  }

  const validItems: { productId: string; quantity: number }[] = [];
  const seenIds = new Set<string>();

  for (const item of data.items) {
    if (!item.productId || !isValidId(item.productId)) continue;
    if (seenIds.has(item.productId)) continue;
    seenIds.add(item.productId);
    validItems.push({ productId: item.productId, quantity: item.quantity });
  }

  const cart = await findOrCreateCart(userId, guestCartId);

  if (validItems.length === 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart._id } });
    return EMPTY_CART_RESULT;
  }

  const products = await prisma.product.findMany({
    where: {
      _id: { in: validItems.map((i) => i.productId) },
      isActive: true,
    },
    select: CART_ITEM_PRODUCT_SELECT.select,
  });

  const productMap = new Map(products.map((p) => [p._id, p]));

  const filteredItems: { productId: string; quantity: number }[] = [];
  for (const item of validItems) {
    const product = productMap.get(item.productId);
    if (!product) continue;
    filteredItems.push({
      productId: item.productId,
      quantity: Math.min(item.quantity, product.stockCount),
    });
  }

  if (filteredItems.length === 0) {
    await prisma.cartItem.deleteMany({ where: { cartId: cart._id } });
    return EMPTY_CART_RESULT;
  }

  const updatedCart = await prisma.$transaction(async (tx) => {
    // Replace the whole item list, same net effect as the old
    // `$set: { items: filteredItems }` on the embedded array.
    await tx.cartItem.deleteMany({ where: { cartId: cart._id } });
    await tx.cartItem.createMany({
      data: filteredItems.map((item) => ({
        cartId: cart._id,
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    if (userId && !cart.userId) {
      await tx.cart.update({
        where: { _id: cart._id },
        data: { userId, guestCartId: null },
      });
    }

    return tx.cart.findUniqueOrThrow({
      where: { _id: cart._id },
      include: { items: { include: { product: CART_ITEM_PRODUCT_SELECT } } },
    });
  });

  const populatedItems = updatedCart.items.map((item) => ({
    productId: item.product,
    quantity: item.quantity,
  }));

  const totals = calculateCartTotals(populatedItems);

  return { cart: { ...updatedCart, items: populatedItems }, ...totals };
};

export const getCartService = async (
  userId: string | null,
  guestCartId: string | null,
) => {
  if (!userId && !guestCartId) {
    throw new BadRequestException('User ID or guest cart ID is required');
  }

  const where = userId ? { userId } : { guestCartId: guestCartId! };

  const cart = await prisma.cart.findFirst({
    where,
    include: { items: { include: { product: CART_ITEM_PRODUCT_SELECT } } },
  });

  if (!cart || cart.items.length === 0) {
    return EMPTY_CART_RESULT;
  }

  const populatedItems = cart.items.map((item) => ({
    productId: item.product,
    quantity: item.quantity,
  }));

  const totals = calculateCartTotals(populatedItems);

  return { cart: { ...cart, items: populatedItems }, ...totals };
};

export const mergeGuestCartService = async (
  userId: string,
  guestCartId: string | null,
) => {
  if (!guestCartId) return;

  const guestCart = await prisma.cart.findFirst({
    where: { guestCartId },
    include: { items: true },
  });
  if (!guestCart || guestCart.items.length === 0) return;

  const userCart = await prisma.cart.findFirst({
    where: { userId },
    include: { items: true },
  });

  if (!userCart) {
    await prisma.cart.update({
      where: { _id: guestCart._id },
      data: { userId, guestCartId: null },
    });
    return;
  }

  const mergedItems = new Map<string, number>();

  for (const item of userCart.items) {
    mergedItems.set(item.productId, item.quantity);
  }

  for (const item of guestCart.items) {
    const existing = mergedItems.get(item.productId);
    mergedItems.set(
      item.productId,
      existing ? existing + item.quantity : item.quantity,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.cartItem.deleteMany({ where: { cartId: userCart._id } });
    await tx.cartItem.createMany({
      data: Array.from(mergedItems.entries()).map(
        ([productId, quantity]) => ({
          cartId: userCart._id,
          productId,
          quantity,
        }),
      ),
    });
    await tx.cart.delete({ where: { _id: guestCart._id } });
  });
};
