/**
 * MyLife Journal — single Drizzle schema source.
 *
 * All table and column definitions live here. Migrations are generated
 * with `drizzle-kit generate` (output committed under ./drizzle).
 * See api/_lib/db.ts for the Neon HTTP client wired to this schema.
 */
import {
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  date,
  primaryKey,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  color: text('color').notNull().default('#6b7280'),
  icon: text('icon').notNull().default('tag'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ---------------------------------------------------------------------------
// entries
// ---------------------------------------------------------------------------

export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // SQL DATE — deliberately NOT timestamptz. A journal entry belongs to a
    // calendar day, independent of timezone.
    eventDate: date('event_date').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    rating: smallint('rating'),
    location: text('location'),
    source: text('source').notNull().default('manual'),
    sourceEntryId: text('source_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    // rating may be NULL or 1..5; validated at the zod level as well
    check('entries_rating_check', sql`${t.rating} IS NULL OR (${t.rating} >= 1 AND ${t.rating} <= 5)`),
    // idempotency key for imports: one (source, source_entry_id) pair may be
    // claimed by at most one entry
    uniqueIndex('entries_source_unique_idx')
      .on(t.source, t.sourceEntryId)
      .where(sql`${t.sourceEntryId} IS NOT NULL`),
    index('entries_event_date_idx').on(t.eventDate),
    index('entries_category_id_idx').on(t.categoryId),
  ],
);

// ---------------------------------------------------------------------------
// entry_images
// ---------------------------------------------------------------------------

export const entryImages = pgTable(
  'entry_images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    blobPathname: text('blob_pathname').notNull(),
    thumbnailPathname: text('thumbnail_pathname'),
    // Resolved public Vercel Blob URL for <img> tags; stored at upload time.
    // Nullable only for rows created before 0002 (none at migration time).
    url: text('url'),
    thumbnailUrl: text('thumbnail_url'),
    altText: text('alt_text'),
    sortOrder: integer('sort_order').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('entry_images_entry_id_idx').on(t.entryId)],
);

// ---------------------------------------------------------------------------
// tags + entry_tags
// ---------------------------------------------------------------------------

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const entryTags = pgTable(
  'entry_tags',
  {
    entryId: uuid('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entryId, t.tagId] })],
);

// ---------------------------------------------------------------------------
// import_jobs + import_items
// ---------------------------------------------------------------------------

export const importJobs = pgTable('import_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  source: text('source').notNull(),
  status: text('status').notNull().default('pending'), // pending|running|completed|failed
  fileName: text('file_name'),
  totalItems: integer('total_items').default(0),
  processedItems: integer('processed_items').default(0),
  importedItems: integer('imported_items').default(0),
  duplicateItems: integer('duplicate_items').default(0),
  failedItems: integer('failed_items').default(0),
  checkpoint: jsonb('checkpoint'),
  errorSummary: jsonb('error_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const importItems = pgTable(
  'import_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    importJobId: uuid('import_job_id')
      .notNull()
      .references(() => importJobs.id, { onDelete: 'cascade' }),
    sourceEntryId: text('source_entry_id').notNull(),
    status: text('status').default('pending'), // pending|imported|duplicate|failed
    errorMessage: text('error_message'),
    entryId: uuid('entry_id').references(() => entries.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [uniqueIndex('import_items_job_source_idx').on(t.importJobId, t.sourceEntryId)],
);
