import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { addresses, cartItems, carts, orderItems, orders, products, users } from '../db/schema';
import { isValidId } from '../utils/id.util';
import { CreateOrderInput } from '../validators/order.validator';
import { BadRequestException, NotFoundException } from '../utils/app-error';
import { calculateCartTotals } from '../utils/cart.util';
import { generateOrderNo } from '../utils/order.util';
import { ORDER_STATUS, PAYMENT_METHODS, PaymentMethod } from '../constants/enums';
import stripeClient from '../config/stripe.config';
import { envConfig } from '../config/env.config';

const cartProductColumns = { _id: products._id, name: products.name, slug: products.slug, images: products.images, originalPrice: products.originalPrice, discountPercent: products.discountPercent, salePrice: products.salePrice, stockCount: products.stockCount };

const loadOrder = async (orderId: string) => {
  const [order] = await db.select().from(orders).where(eq(orders._id, orderId)).limit(1);
  if (!order) return null;
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { ...order, items };
};

export const createOrderService = async (userId: string, data: CreateOrderInput) => {
  const { addressId, paymentMethod } = data;
  const [cart] = await db.select().from(carts).where(eq(carts.userId, userId)).limit(1);
  if (!cart) throw new BadRequestException('Cart is empty');
  const cartRows = await db.select({ item: cartItems, product: cartProductColumns }).from(cartItems).innerJoin(products, eq(cartItems.productId, products._id)).where(eq(cartItems.cartId, cart._id));
  if (cartRows.length === 0) throw new BadRequestException('Cart is empty');
  const [address] = await db.select().from(addresses).where(and(eq(addresses._id, addressId), eq(addresses.userId, userId))).limit(1);
  if (!address) throw new NotFoundException('Address not found');
  const items = cartRows.map((row) => ({ productId: row.product, quantity: row.item.quantity }));
  const totals = calculateCartTotals(items);
  const newOrderItems = items.map((item) => ({ productId: item.productId._id, name: item.productId.name, image: item.productId.images?.[0] ?? '', originalPrice: item.productId.originalPrice, discountPercent: item.productId.discountPercent, salePrice: item.productId.salePrice, quantity: item.quantity }));
  const shippingAddress = { recipientName: address.recipientName, phone: address.phone, street: address.street, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country };
  const orderId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(orders).values({ _id: orderId, userId, orderNo: generateOrderNo(), shippingAddress, paymentMethod: paymentMethod as PaymentMethod, subtotal: totals.subtotal, deliveryFee: totals.deliveryFee, tax: totals.tax, total: totals.orderTotal, statusHistory: [{ status: ORDER_STATUS.PLACED, date: new Date() }] });
    await tx.insert(orderItems).values(newOrderItems.map((item) => ({ ...item, orderId })));
  });
  const order = await loadOrder(orderId);
  if (!order) throw new BadRequestException('Failed to create order');
  if (paymentMethod === PAYMENT_METHODS.CASH_ON_DELIVERY) {
    await db.transaction(async (tx) => {
      await tx.delete(carts).where(eq(carts._id, cart._id));
      for (const item of items) await tx.update(products).set({ stockCount: sql`${products.stockCount} - ${item.quantity}`, updatedAt: new Date() }).where(eq(products._id, item.productId._id));
    });
    return { order, stripeUrl: null };
  }
  const lineItems = newOrderItems.map((item) => ({ price_data: { currency: 'usd', product_data: { name: item.name, images: item.image ? [item.image] : [] }, unit_amount: Math.round(item.salePrice * 100) }, quantity: item.quantity }));
  if (totals.deliveryFee > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Delivery Fee' }, unit_amount: Math.round(totals.deliveryFee * 100) }, quantity: 1 });
  if (totals.tax > 0) lineItems.push({ price_data: { currency: 'usd', product_data: { name: 'Tax' }, unit_amount: Math.round(totals.tax * 100) }, quantity: 1 });
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users._id, userId)).limit(1);
  const session = await stripeClient.checkout.sessions.create({ payment_method_types: ['card'], mode: 'payment', customer_email: user?.email, line_items: lineItems, metadata: { orderId }, success_url: `${envConfig.FRONTEND_ORIGIN}/orders/${orderId}`, cancel_url: `${envConfig.FRONTEND_ORIGIN}/checkout` });
  return { stripeUrl: session.url! };
};

export const getUserOrdersService = async (userId: string) => {
  const orderRows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt));
  const ordersWithItems = await Promise.all(orderRows.map(async (order) => ({ ...order, items: await db.select().from(orderItems).where(eq(orderItems.orderId, order._id)) })));
  return { orders: ordersWithItems };
};

export const getUserOrderByIdService = async (userId: string, orderId: string) => {
  if (!isValidId(orderId)) throw new BadRequestException('Invalid order ID');
  const [order] = await db.select().from(orders).where(and(eq(orders._id, orderId), eq(orders.userId, userId))).limit(1);
  if (!order) throw new NotFoundException('Order not found');
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
  return { order: { ...order, items } };
};
