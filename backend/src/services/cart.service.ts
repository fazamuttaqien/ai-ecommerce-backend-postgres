import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { carts, cartItems, products } from '../db/schema';
import { isValidId } from '../utils/id.util';
import { UpsertCartInput } from '../validators/cart.validator';
import { BadRequestException } from '../utils/app-error';
import { calculateCartTotals } from '../utils/cart.util';
import { FREE_DELIVERY_THRESHOLD } from '../constants/constant';

const productColumns = { _id: products._id, name: products.name, slug: products.slug, images: products.images, salePrice: products.salePrice, originalPrice: products.originalPrice, discountPercent: products.discountPercent, stockCount: products.stockCount };
const empty = () => ({ cart: { items: [] as unknown[] }, subtotal: 0, deliveryFee: 0, tax: 0, orderTotal: 0, freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD });

const findCart = async (userId: string | null, guestCartId: string | null) => {
  const condition = userId ? eq(carts.userId, userId) : eq(carts.guestCartId, guestCartId!);
  const [cart] = await db.select().from(carts).where(condition).limit(1);
  return cart;
};
const findOrCreateCart = async (userId: string | null, guestCartId: string | null) => {
  const existing = await findCart(userId, guestCartId);
  if (existing) return existing;
  const [created] = await db.insert(carts).values(userId ? { userId } : { guestCartId }).returning();
  return created;
};
const loadCart = async (cartId: string) => {
  const [cart] = await db.select().from(carts).where(eq(carts._id, cartId)).limit(1);
  if (!cart) return null;
  const rows = await db.select({ item: cartItems, product: productColumns }).from(cartItems).leftJoin(products, eq(cartItems.productId, products._id)).where(eq(cartItems.cartId, cartId));
  return { ...cart, items: rows.map((row) => ({ ...row.item, product: row.product })) };
};

export const upsertCartService = async (userId: string | null, guestCartId: string | null, data: UpsertCartInput) => {
  if (!userId && !guestCartId) throw new BadRequestException('User ID or guest cart ID is required');
  const validItems: { productId: string; quantity: number }[] = [];
  const seenIds = new Set<string>();
  for (const item of data.items) {
    if (!item.productId || !isValidId(item.productId) || seenIds.has(item.productId)) continue;
    seenIds.add(item.productId); validItems.push({ productId: item.productId, quantity: item.quantity });
  }
  const cart = await findOrCreateCart(userId, guestCartId);
  if (validItems.length === 0) { await db.delete(cartItems).where(eq(cartItems.cartId, cart._id)); return empty(); }
  const productRows = await db.select(productColumns).from(products).where(and(inArray(products._id, validItems.map((i) => i.productId)), eq(products.isActive, true)));
  const productMap = new Map(productRows.map((p) => [p._id, p]));
  const filteredItems = validItems.flatMap((item) => { const product = productMap.get(item.productId); return product ? [{ productId: item.productId, quantity: Math.min(item.quantity, product.stockCount) }] : []; });
  if (filteredItems.length === 0) { await db.delete(cartItems).where(eq(cartItems.cartId, cart._id)); return empty(); }
  const updatedCart = await db.transaction(async (tx) => {
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart._id));
    await tx.insert(cartItems).values(filteredItems.map((item) => ({ cartId: cart._id, ...item })));
    if (userId && !cart.userId) await tx.update(carts).set({ userId, guestCartId: null, updatedAt: new Date() }).where(eq(carts._id, cart._id));
    const loaded = await tx.select().from(carts).where(eq(carts._id, cart._id)).limit(1);
    const rows = await tx.select({ item: cartItems, product: productColumns }).from(cartItems).leftJoin(products, eq(cartItems.productId, products._id)).where(eq(cartItems.cartId, cart._id));
    return { ...loaded[0], items: rows.map((row) => ({ ...row.item, product: row.product })) };
  });
  const populatedItems = updatedCart.items.map((item) => ({ productId: item.product, quantity: item.quantity }));
  return { cart: { ...updatedCart, items: populatedItems }, ...calculateCartTotals(populatedItems) };
};

export const getCartService = async (userId: string | null, guestCartId: string | null) => {
  if (!userId && !guestCartId) throw new BadRequestException('User ID or guest cart ID is required');
  const cart = await findCart(userId, guestCartId);
  if (!cart) return empty();
  const loaded = await loadCart(cart._id);
  if (!loaded || loaded.items.length === 0) return empty();
  const populatedItems = loaded.items.map((item) => ({ productId: item.product, quantity: item.quantity }));
  return { cart: { ...loaded, items: populatedItems }, ...calculateCartTotals(populatedItems) };
};

export const mergeGuestCartService = async (userId: string, guestCartId: string | null) => {
  if (!guestCartId) return;
  const guestCart = await findCart(null, guestCartId);
  if (!guestCart) return;
  const guestItems = await db.select().from(cartItems).where(eq(cartItems.cartId, guestCart._id));
  if (guestItems.length === 0) return;
  const userCart = await findCart(userId, null);
  if (!userCart) { await db.update(carts).set({ userId, guestCartId: null, updatedAt: new Date() }).where(eq(carts._id, guestCart._id)); return; }
  const existingItems = await db.select().from(cartItems).where(eq(cartItems.cartId, userCart._id));
  const merged = new Map<string, number>();
  for (const item of existingItems) merged.set(item.productId, item.quantity);
  for (const item of guestItems) merged.set(item.productId, (merged.get(item.productId) ?? 0) + item.quantity);
  await db.transaction(async (tx) => {
    await tx.delete(cartItems).where(eq(cartItems.cartId, userCart._id));
    await tx.insert(cartItems).values(Array.from(merged, ([productId, quantity]) => ({ cartId: userCart._id, productId, quantity })));
    await tx.delete(carts).where(eq(carts._id, guestCart._id));
  });
};
