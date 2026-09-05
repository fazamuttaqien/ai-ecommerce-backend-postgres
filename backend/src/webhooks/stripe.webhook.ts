import { and, eq, sql } from 'drizzle-orm';
import { Request, Response } from 'express';
import stripeClient from '../config/stripe.config';
import { envConfig } from '../config/env.config';
import { db } from '../db';
import { carts, orderItems, orders, products } from '../db/schema';
import { isValidId } from '../utils/id.util';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants/enums';

type StatusHistoryEntry = { status: string; note?: string; date: Date | string };

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event;
  try { event = stripeClient.webhooks.constructEvent(req.body, sig, envConfig.STRIPE_WEBHOOK_SECRET); }
  catch { res.status(400).json({ message: 'Webhook signature verification failed' }); return; }
  const session = event.data.object as { metadata?: { orderId?: string } };
  const orderId = session.metadata?.orderId;
  if (!orderId || !isValidId(orderId)) { res.status(200).json({ received: true }); return; }
  const [order] = await db.select().from(orders).where(eq(orders._id, orderId)).limit(1);
  if (!order) { res.status(200).json({ received: true }); return; }
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order._id));
  const statusHistory = [...((order.statusHistory as StatusHistoryEntry[]) ?? [])];
  switch (event.type) {
    case 'checkout.session.completed': {
      statusHistory.push({ status: ORDER_STATUS.CONFIRMED, date: new Date() });
      await db.transaction(async (tx) => {
        await tx.update(orders).set({ paymentStatus: PAYMENT_STATUS.PAID, status: ORDER_STATUS.CONFIRMED, statusHistory, updatedAt: new Date() }).where(eq(orders._id, order._id));
        await tx.delete(carts).where(eq(carts.userId, order.userId));
        for (const item of items) await tx.update(products).set({ stockCount: sql`${products.stockCount} - ${item.quantity}`, updatedAt: new Date() }).where(eq(products._id, item.productId));
      });
      console.log(`Order ${order.orderNo} paid and confirmed`);
      break;
    }
    case 'checkout.session.expired': {
      statusHistory.push({ status: ORDER_STATUS.CANCELLED, date: new Date() });
      await db.update(orders).set({ paymentStatus: PAYMENT_STATUS.FAILED, status: ORDER_STATUS.CANCELLED, statusHistory, updatedAt: new Date() }).where(eq(orders._id, order._id));
      console.log(`Order ${order.orderNo} payment expired`);
      break;
    }
  }
  res.status(200).json({ received: true });
};
