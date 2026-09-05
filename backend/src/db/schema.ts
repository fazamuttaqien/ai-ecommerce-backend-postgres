import { boolean, index, integer, jsonb, pgEnum, pgTable, real, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['user', 'admin']);
export const paymentMethodEnum = pgEnum('payment_method', ['card', 'cash_on_delivery']);
export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'paid', 'failed', 'refunded']);
export const orderStatusEnum = pgEnum('order_status', ['placed', 'confirmed', 'assigned', 'packed', 'out_for_delivery', 'delivered', 'cancelled']);

export type StatusHistoryEntry = { status: string; note?: string; date: Date | string };
export type ShippingAddress = { recipientName: string; phone: string; street: string; city: string; state: string; postalCode: string; country: string };

const timestamps = {
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
};

export const users = pgTable('users', {
  _id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), email: text('email').notNull().unique(), password: text('password').notNull(), role: userRoleEnum('role').notNull().default('user'), phone: text('phone'), avatar: text('avatar'), ...timestamps,
});
export const addresses = pgTable('addresses', {
  _id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users._id, { onDelete: 'cascade' }), recipientName: text('recipient_name').notNull(), phone: text('phone').notNull(), street: text('street').notNull(), city: text('city').notNull(), state: text('state').notNull(), postalCode: text('postal_code').notNull(), country: text('country').notNull(), isDefault: boolean('is_default').notNull().default(false), ...timestamps,
}, (table) => [index('addresses_user_id_idx').on(table.userId)]);
export const categories = pgTable('categories', {
  _id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), slug: text('slug').notNull().unique(), imageUrl: text('image_url'), description: text('description'), isActive: boolean('is_active').notNull().default(true), ...timestamps,
});
export const products = pgTable('products', {
  _id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users._id), categoryId: uuid('category_id').notNull().references(() => categories._id), name: text('name').notNull(), slug: text('slug').notNull().unique(), description: text('description'), images: text('images').array().notNull().default([]), originalPrice: real('original_price').notNull(), salePrice: real('sale_price').notNull().default(0), discountPercent: real('discount_percent').notNull().default(0), discountLabel: text('discount_label'), unit: text('unit').notNull().default('pc'), stockCount: integer('stock_count').notNull().default(0), ratingAverage: real('rating_average').notNull().default(0), reviewCount: integer('review_count').notNull().default(0), isActive: boolean('is_active').notNull().default(true), ...timestamps,
}, (table) => [index('products_category_id_idx').on(table.categoryId), index('products_is_active_idx').on(table.isActive)]);
export const carts = pgTable('carts', {
  _id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').unique().references(() => users._id, { onDelete: 'cascade' }), guestCartId: text('guest_cart_id').unique(), ...timestamps,
});
export const cartItems = pgTable('cart_items', {
  _id: uuid('id').primaryKey().defaultRandom(), cartId: uuid('cart_id').notNull().references(() => carts._id, { onDelete: 'cascade' }), productId: uuid('product_id').notNull().references(() => products._id, { onDelete: 'cascade' }), quantity: integer('quantity').notNull().default(1),
}, (table) => [unique('cart_items_cart_product_unique').on(table.cartId, table.productId)]);
export const orders = pgTable('orders', {
  _id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users._id), orderNo: text('order_no').notNull().unique(), shippingAddress: jsonb('shipping_address').$type<ShippingAddress>().notNull(), paymentMethod: paymentMethodEnum('payment_method').notNull(), paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'), status: orderStatusEnum('status').notNull().default('placed'), statusHistory: jsonb('status_history').$type<StatusHistoryEntry[]>().notNull().default([]), subtotal: real('subtotal').notNull(), deliveryFee: real('delivery_fee').notNull().default(0), tax: real('tax').notNull(), total: real('total').notNull(), ...timestamps,
}, (table) => [index('orders_user_id_idx').on(table.userId)]);
export const orderItems = pgTable('order_items', {
  _id: uuid('id').primaryKey().defaultRandom(), orderId: uuid('order_id').notNull().references(() => orders._id, { onDelete: 'cascade' }), productId: uuid('product_id').notNull().references(() => products._id), name: text('name').notNull(), image: text('image').notNull(), originalPrice: real('original_price').notNull(), discountPercent: real('discount_percent').notNull().default(0), salePrice: real('sale_price').notNull(), quantity: integer('quantity').notNull(), isReviewed: boolean('is_reviewed').notNull().default(false),
}, (table) => [index('order_items_order_id_idx').on(table.orderId)]);
export const reviews = pgTable('reviews', {
  _id: uuid('id').primaryKey().defaultRandom(), userId: uuid('user_id').notNull().references(() => users._id), orderId: uuid('order_id').notNull().references(() => orders._id), orderItemId: uuid('order_item_id').notNull().unique().references(() => orderItems._id), productId: uuid('product_id').notNull().references(() => products._id), rating: integer('rating').notNull(), comment: text('comment'), ...timestamps,
}, (table) => [index('reviews_product_id_idx').on(table.productId), index('reviews_user_id_idx').on(table.userId)]);

export type User = typeof users.$inferSelect;
export type Address = typeof addresses.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Cart = typeof carts.$inferSelect;
export type CartItem = typeof cartItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Review = typeof reviews.$inferSelect;
