/**
 * MyLife Journal — shared zod validation schemas.
 *
 * ZOD-ONLY: this file is imported by the browser bundle too, so it must not
 * import drizzle, node builtins, bcryptjs, or anything else node-only.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();
const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color');
const slugSchema = z.string().regex(/^[a-z0-9-]+$/, 'must match ^[a-z0-9-]+$');

/** YYYY-MM-DD that is a real calendar date (leap years included). */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((s) => {
    const [y, m, d] = s.split('-').map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }, 'must be a real calendar date');

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const categorySchema = z.object({
  name: z.string().min(1).max(80),
  slug: slugSchema,
  color: hexColorSchema,
  icon: z.string().min(1).max(40),
  sort_order: z.number().int().optional(),
});
export type CategoryInput = z.infer<typeof categorySchema>;

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const photoSchema = z.object({
  pathname: z.string().min(1).max(500),
  thumbnailPathname: z.string().max(500).nullable().optional(),
  // Resolved public Blob URLs, stored alongside pathnames (migration 0002).
  url: z.string().max(2048).nullable().optional(),
  thumbnailUrl: z.string().max(2048).nullable().optional(),
  altText: z.string().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export const entryInputSchema = z.object({
  event_date: dateStringSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(20000).optional().default(''),
  category_id: uuidSchema,
  rating: z.number().int().min(1).max(5).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
  photos: z.array(photoSchema).max(20).optional().default([]),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

// ---------------------------------------------------------------------------
// Query schemas
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(1900).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});
export type CalendarQueryInput = z.infer<typeof calendarQuerySchema>;

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export const importBatchItemSchema = z.object({
  source_entry_id: z.string().min(1).max(500),
  event_date: dateStringSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(20000).optional().default(''),
  category_slug: z.string().min(1).max(80).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
});
export type ImportBatchItem = z.infer<typeof importBatchItemSchema>;

export const importBatchSchema = z.object({
  jobId: uuidSchema,
  items: z.array(importBatchItemSchema).min(1).max(100),
});
export type ImportBatch = z.infer<typeof importBatchSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Entries list query
// ---------------------------------------------------------------------------

export const entriesQuerySchema = z.object({
  search: z.string().max(200).optional(),
  category: slugSchema.optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  hasPhotos: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['asc', 'desc']).default('desc'),
});
export type EntriesQuery = z.infer<typeof entriesQuerySchema>;

// ---------------------------------------------------------------------------
// Import: preview + jobs + batches (batched import flow)
// ---------------------------------------------------------------------------

export const importPreviewSchema = z.object({
  source: z.string().min(1).max(80),
  items: z
    .array(
      z.object({
        source_entry_id: z.string().min(1).max(500),
        event_date: dateStringSchema,
        title: z.string().min(1).max(200),
      }),
    )
    .min(1)
    .max(5000),
});
export type ImportPreviewInput = z.infer<typeof importPreviewSchema>;

export const importJobCreateSchema = z.object({
  source: z.string().min(1).max(80),
  fileName: z.string().max(255).optional(),
  totalItems: z.number().int().min(0).default(0),
});
export type ImportJobCreateInput = z.infer<typeof importJobCreateSchema>;

const importCategoryRefSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(80),
  color: hexColorSchema.optional(),
  icon: z.string().min(1).max(40).optional(),
});

const importPhotoSchema = z.object({
  pathname: z.string().min(1).max(500),
  thumbnailPathname: z.string().max(500).nullable().optional(),
  url: z.string().max(2048).nullable().optional(),
  thumbnailUrl: z.string().max(2048).nullable().optional(),
  alt_text: z.string().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const importJobBatchItemSchema = z
  .object({
    source_entry_id: z.string().min(1).max(500),
    event_date: dateStringSchema,
    title: z.string().min(1).max(200),
    description: z.string().max(20000).optional().default(''),
    category_id: uuidSchema.optional(),
    category: importCategoryRefSchema.optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    location: z.string().max(200).nullable().optional(),
    tags: z.array(z.string().min(1).max(40)).max(20).optional().default([]),
    photos: z.array(importPhotoSchema).max(20).optional().default([]),
  })
  .superRefine((v, ctx) => {
    if (v.category_id && v.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide category_id or category, not both',
        path: ['category'],
      });
    }
  });
export type ImportJobBatchItem = z.infer<typeof importJobBatchItemSchema>;

export const importJobBatchSchema = z.object({
  items: z.array(importJobBatchItemSchema).min(1).max(50),
});
export type ImportJobBatchInput = z.infer<typeof importJobBatchSchema>;

// ---------------------------------------------------------------------------
// Image upload (JSON + base64, not multipart)
// ---------------------------------------------------------------------------

const imageContentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

export const imageUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: imageContentTypeSchema,
  /** base64-encoded file bytes */
  data: z.string().min(1),
  thumbnail: z
    .object({
      contentType: imageContentTypeSchema,
      data: z.string().min(1),
    })
    .optional(),
});
export type ImageUploadInput = z.infer<typeof imageUploadSchema>;

// ---------------------------------------------------------------------------
// Export (JSON backup)
// ---------------------------------------------------------------------------

export const exportJsonQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ExportJsonQuery = z.infer<typeof exportJsonQuerySchema>;
