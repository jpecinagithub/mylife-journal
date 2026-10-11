/**
 * MyLife Journal — shared TypeScript types.
 *
 * ZERO runtime imports: safe to import from both the browser bundle and the
 * node-only API routes. DTOs only — no zod, no drizzle, no node builtins.
 */

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  color: string;
  icon: string;
  sort_order: number;
  /** Present on list/detail responses that include the usage count. */
  entry_count?: number;
}

export interface EntryPhotoDTO {
  id: string;
  blob_pathname: string;
  thumbnail_pathname: string | null;
  /** Resolved public Vercel Blob URL (stored at upload time, see api/_lib/blob.ts). */
  url: string | null;
  thumbnail_url: string | null;
  alt_text: string | null;
  sort_order: number;
}

export interface EntryDTO {
  id: string;
  event_date: string; // YYYY-MM-DD (SQL DATE, no timezone)
  title: string;
  description: string;
  category: CategoryDTO;
  rating: number | null;
  location: string | null;
  source: string;
  source_entry_id: string | null;
  tags: string[];
  photos: EntryPhotoDTO[];
  created_at: string;
  updated_at: string;
}

export interface StatsDTO {
  totalEntries: number;
  yearsActive: number[];
  byCategory: { slug: string; name: string; color: string; count: number }[];
  totalPhotos: number;
  perYear: { year: number; count: number }[];
  books: number;
  movies: number;
  trips: number;
}

export interface CalendarDay {
  date: string; // YYYY-MM-DD
  count: number;
  categories: { slug: string; color: string }[];
}

export type ImportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ImportJobDTO {
  id: string;
  source: string;
  status: ImportJobStatus;
  file_name: string | null;
  total_items: number;
  processed_items: number;
  imported_items: number;
  duplicate_items: number;
  failed_items: number;
  created_at: string;
  completed_at: string | null;
}

export interface ImportPreviewResult {
  job_id: string;
  total: number;
  will_import: number;
  will_duplicate: number;
  will_fail: number;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}
