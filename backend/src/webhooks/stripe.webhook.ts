import { Request, Response } from 'express';
import stripeClient from '../config/stripe.config';
import { envConfig } from '../config/env.config';
import { prisma } from '../config/database.config';
import { isValidId } from '../utils/id.util';
import { ORDER_STATUS, PAYMENT_STATUS } from '../constants/enums';

type StatusHistoryEntry = {
  status: string;
  note?: string;
  date: Date | string;
};

export const stripeWebhookHandler = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event;
  try {
    event = stripeClient.webhooks.constructEvent(
      req.body,
      sig,
      envConfig.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    res.status(400).json({ message: 'Webhook signature verification failed' });
    return;
  }

  const session = event.data.object as {
    metadata?: { orderId?: string };
  };
  const orderId = session.metadata?.orderId;

  if (!orderId || !isValidId(orderId)) {
    res.status(200).json({ received: true });
    return;
  }

  const order = await prisma.order.findUnique({
    where: { _id: orderId },
    include: { items: true },
  });
  if (!order) {
    res.status(200).json({ received: true });
    return;
  }

  const statusHistory = (order.statusHistory as StatusHistoryEntry[]) ?? [];

  switch (event.type) {
    case 'checkout.session.completed': {
      statusHistory.push({ status: ORDER_STATUS.CONFIRMED, date: new Date() });

      await prisma.$transaction([
        prisma.order.update({
          where: { _id: order._id },
          data: {
            paymentStatus: PAYMENT_STATUS.PAID,
            status: ORDER_STATUS.CONFIRMED,
            statusHistory,
          },
        }),
        prisma.cart.deleteMany({ where: { userId: order.userId } }),
        ...order.items.map((item) =>
          prisma.product.update({
            where: { _id: item.productId },
            data: { stockCount: { decrement: item.quantity } },
          }),
        ),
      ]);

      console.log(`Order ${order.orderNo} paid and confirmed`);
      break;
    }

    case 'checkout.session.expired': {
      statusHistory.push({ status: ORDER_STATUS.CANCELLED, date: new Date() });

      await prisma.order.update({
        where: { _id: order._id },
        data: {
          paymentStatus: PAYMENT_STATUS.FAILED,
          status: ORDER_STATUS.CANCELLED,
          statusHistory,
        },
      });

      console.log(`Order ${order.orderNo} payment expired`);
      break;
    }
  }

  res.status(200).json({ received: true });
};
