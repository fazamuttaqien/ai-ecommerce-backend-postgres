import 'dotenv/config';
import slugify from 'slugify';
import { db } from '../db';
import { categories } from '../db/schema';

const categoriesData = [
  ['Beverages', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265027/Beverages_lcunrb.png', 'Drinks, juices, and everyday refreshments.'],
  ['Snacks', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265027/Snacks_wxordv.png', 'Chips, biscuits, and quick bites.'],
  ['Bakery', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265027/Bakery_xwbrje.png', 'Fresh bread, pastries, and baked goods.'],
  ['Baby Care', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265026/Baby_Care_bxxwu0.png', 'Essentials for infants and toddlers.'],
  ['Frozen Foods', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265027/Frozen_Foods_wknnin.png', 'Frozen meals and freezer staples.'],
  ['Fruits & Vegetables', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265026/Fruits_Vegetables_lnmslm.png', 'Fresh produce for everyday cooking.'],
  ['Meat & Seafood', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265026/Meat_Seafood_nhtxen.png', 'Fresh meat, fish, and seafood options.'],
  ['Pantry Staples', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265027/Pantry_Staples_ppwolo.png', 'Rice, flour, oil, and pantry basics.'],
  ['Personal Care', 'https://res.cloudinary.com/dp9vvlndo/image/upload/v1781265026/Personal_Care_osossq.png', 'Daily hygiene and personal grooming items.'],
] as const;

const seedCategories = async () => {
  try {
    await db.delete(categories);
    const rows = categoriesData.map(([name, imageUrl, description]) => ({ name, imageUrl, description, isActive: true, slug: slugify(name, { lower: true, strict: true }) }));
    const created = await db.insert(categories).values(rows).returning();
    console.log(`${created.length} categories seeded successfully`);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  }
};

void seedCategories();
