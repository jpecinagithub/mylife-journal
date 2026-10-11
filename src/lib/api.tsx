/**
 * MyLife Journal — API client: fetch wrapper, auth context, query hooks,
 * mutations. All requests are same-origin with credentials included.
 *
 * Shapes are aligned with the browser-safe shared libs:
 *   - DTO types from '../../api/_lib/types' (snake_case)
 *   - zod schemas from '../../api/_lib/validate'
 * Where the original prose contract and the shared libs disagree, this client
 * normalizes defensively (snake_case first, camelCase fallback).
 */
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  EntryDTO,
  CategoryDTO,
  CalendarDay,
  Paginated,
  EntryPhotoDTO,
  ImportJobDTO,
  ImportJobStatus,
} from '../../api/_lib/types';
import { useEffect } from 'react';

// Re-export shared DTO types so components import from one place.
export type {
  EntryDTO,
  CategoryDTO,
  CalendarDay,
  Paginated,
  EntryPhotoDTO,
  ImportJobDTO,
  ImportJobStatus,
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isNetworkError(e: unknown): boolean {
  return e instanceof ApiError && e.status === 0;
}

// ---------------------------------------------------------------------------
// fetch wrapper
// ---------------------------------------------------------------------------

interface ApiFetchOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Do not redirect to /login on 401 (used by the login page itself). */
  skipAuthRedirect?: boolean;
}

/**
 * Same-origin JSON fetch. Success envelopes {data} are unwrapped.
 * On 401 the user is sent to /login (unless on /login or opted out).
 */
export async function apiFetch<T>(path: string, opts: ApiFetchOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, 'NETWORK_ERROR', e instanceof Error ? e.message : 'network error');
  }

  if (res.status === 401) {
    if (!opts.skipAuthRedirect && window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    let code = 'UNAUTHORIZED';
    try {
      const j = await res.json();
      if (j?.error?.code) code = j.error.code;
    } catch {
      /* ignore */
    }
    throw new ApiError(401, code, 'unauthorized');
  }

  let json: unknown = null;
  try {
    json = res.status === 204 ? null : await res.json();
  } catch {
    throw new ApiError(res.status, 'BAD_RESPONSE', 'error.network');
  }

  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(res.status, err?.code ?? 'REQUEST_FAILED', err?.message ?? 'error.generic');
  }

  if (json !== null && typeof json === 'object' && 'data' in json) {
    return (json as { data: T }).data;
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const qk = {
  auth: ['auth'] as const,
  entries: (f: EntryFilters) => ['entries', f] as const,
  entry: (id: string) => ['entry', id] as const,
  calendar: (y: number, m: number) => ['calendar', y, m] as const,
  categories: ['categories'] as const,
  tags: ['tags'] as const,
  stats: ['stats'] as const,
};

export function invalidateJournalCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['entries'] });
  void queryClient.invalidateQueries({ queryKey: ['calendar'] });
  void queryClient.invalidateQueries({ queryKey: ['stats'] });
  void queryClient.invalidateQueries({ queryKey: ['tags'] });
  void queryClient.invalidateQueries({ queryKey: ['entry'] });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthState {
  authenticated: boolean;
}

interface AuthContextValue extends AuthState {
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery<AuthState>({
    queryKey: qk.auth,
    queryFn: () =>
      apiFetch<AuthState>('/api/auth/me', { skipAuthRedirect: true }).catch((e) => {
        if (e instanceof ApiError && e.status === 401) return { authenticated: false };
        throw e;
      }),
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const login = async (password: string) => {
    await apiFetch<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: { password },
      skipAuthRedirect: true,
    });
    queryClient.setQueryData(qk.auth, { authenticated: true });
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', skipAuthRedirect: true });
    } catch {
      /* best effort */
    }
    queryClient.clear();
    window.location.href = '/login';
  };

  const value: AuthContextValue = {
    authenticated: data?.authenticated ?? false,
    loading: isLoading && !isError,
    login,
    logout,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export interface EntryFilters {
  search?: string;
  category?: string; // slug
  year?: number;
  month?: number;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  rating?: number;
  hasPhotos?: boolean;
  page?: number;
  per_page?: number;
  sort?: 'asc' | 'desc';
}

export function entriesSearchParams(f: EntryFilters): string {
  const p = new URLSearchParams();
  if (f.search) p.set('search', f.search);
  if (f.category) p.set('category', f.category);
  if (f.year) p.set('year', String(f.year));
  if (f.month) p.set('month', String(f.month));
  if (f.from) p.set('from', f.from);
  if (f.to) p.set('to', f.to);
  if (f.rating) p.set('rating', String(f.rating));
  if (f.hasPhotos) p.set('hasPhotos', 'true');
  p.set('page', String(f.page ?? 1));
  p.set('limit', String(f.per_page ?? 20));
  if (f.sort) p.set('sort', f.sort);
  return p.toString();
}

/** Defensive unwrap: {data:Paginated} or {data:{items}} or a bare Paginated. */
export function normalizePaginated<T>(raw: unknown): Paginated<T> {
  const d = raw as Record<string, unknown>;
  const items = (d.items ?? []) as T[];
  const total = Number(d.total ?? items.length);
  const page = Number(d.page ?? 1);
  const per_page = Number(d.per_page ?? d.limit ?? 20);
  const total_pages = Number(d.total_pages ?? Math.max(1, Math.ceil(total / per_page)));
  return { items, page, per_page, total, total_pages };
}

export function useEntries(filters: EntryFilters, opts?: Partial<UseQueryOptions<Paginated<EntryDTO>>>) {
  return useQuery<Paginated<EntryDTO>>({
    queryKey: qk.entries(filters),
    queryFn: () => apiFetch<unknown>(`/api/entries?${entriesSearchParams(filters)}`).then(normalizePaginated<EntryDTO>),
    ...opts,
  });
}

export function useEntry(id: string | undefined) {
  return useQuery<EntryDTO>({
    queryKey: qk.entry(id ?? ''),
    queryFn: () => apiFetch<EntryDTO>(`/api/entries/${id}`),
    enabled: Boolean(id),
  });
}

export interface EntryPhotoInput {
  pathname: string;
  thumbnailPathname?: string | null;
  altText?: string | null;
  sortOrder?: number;
}

export interface CreateEntryInput {
  event_date: string;
  title: string;
  description?: string;
  category_id: string;
  rating?: number | null;
  location?: string | null;
  tags?: string[];
  photos?: EntryPhotoInput[];
}

export function useCreateEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEntryInput) =>
      apiFetch<EntryDTO>('/api/entries', { method: 'POST', body: input }),
    onSuccess: () => invalidateJournalCaches(qc),
  });
}

export function useUpdateEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CreateEntryInput>) =>
      apiFetch<EntryDTO>(`/api/entries/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (data) => {
      qc.setQueryData(qk.entry(id), data);
      invalidateJournalCaches(qc);
    },
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateJournalCaches(qc),
  });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface CalendarData {
  year: number;
  month: number;
  days: CalendarDay[];
}

export function useCalendar(year: number, month: number) {
  const qc = useQueryClient();
  // Prefetch adjacent months so month navigation feels instant.
  useEffect(() => {
    const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
    const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
    for (const { y, m } of [prev, next]) {
      void qc.prefetchQuery({
        queryKey: qk.calendar(y, m),
        queryFn: () => apiFetch<CalendarData>(`/api/calendar?year=${y}&month=${m}`),
        staleTime: 2 * 60_000,
      });
    }
  }, [qc, year, month]);

  return useQuery<CalendarData>({
    queryKey: qk.calendar(year, month),
    queryFn: () => apiFetch<CalendarData>(`/api/calendar?year=${year}&month=${month}`),
  });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export interface CategoryView extends CategoryDTO {
  entryCount?: number;
  entry_count?: number;
}

export function categoryCount(c: CategoryView): number {
  return c.entryCount ?? c.entry_count ?? 0;
}

function normalizeCategories(raw: unknown): CategoryView[] {
  if (Array.isArray(raw)) return raw as CategoryView[];
  const d = raw as { items?: CategoryView[]; categories?: CategoryView[] };
  return d.items ?? d.categories ?? [];
}

export function useCategories() {
  return useQuery<CategoryView[]>({
    queryKey: qk.categories,
    queryFn: () => apiFetch<unknown>('/api/categories').then(normalizeCategories),
  });
}

export interface CategoryInput {
  name: string;
  slug: string;
  color: string;
  icon: string;
  sort_order?: number;
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CategoryInput) =>
      apiFetch<CategoryDTO>('/api/categories', { method: 'POST', body: input }),
    onSuccess: () => invalidateJournalCaches(qc),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<CategoryInput>) =>
      apiFetch<CategoryDTO>(`/api/categories/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => invalidateJournalCaches(qc),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      apiFetch<void>(
        `/api/categories/${id}${reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : ''}`,
        { method: 'DELETE' },
      ),
    onSuccess: () => invalidateJournalCaches(qc),
  });
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export interface TagView {
  id: string;
  name: string;
  count: number;
}

function normalizeTags(raw: unknown): TagView[] {
  if (Array.isArray(raw)) return raw as TagView[];
  const d = raw as { items?: TagView[]; tags?: TagView[] };
  return d.items ?? d.tags ?? [];
}

export function useTags() {
  return useQuery<TagView[]>({
    queryKey: qk.tags,
    queryFn: () => apiFetch<unknown>('/api/tags').then(normalizeTags),
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface StatsView {
  totalEntries: number;
  yearsActive: number[];
  byCategory: { slug: string; name: string; color: string; count: number }[];
  totalPhotos: number;
  perYear: { year: number; count: number }[];
  averageRating: number | null;
}

function normalizeStats(raw: unknown): StatsView {
  const d = (raw ?? {}) as Record<string, unknown>;
  const byCategory = (d.byCategory ?? d.by_category ?? []) as StatsView['byCategory'];
  const perYear = (d.perYear ?? d.by_year ?? []) as StatsView['perYear'];
  const yearsActive =
    (d.yearsActive as number[] | undefined) ??
    (d.years_active as number[] | undefined) ??
    perYear.map((p) => p.year);
  return {
    totalEntries: Number(d.totalEntries ?? d.total_entries ?? 0),
    yearsActive,
    byCategory,
    totalPhotos: Number(d.totalPhotos ?? d.total_photos ?? 0),
    perYear,
    averageRating:
      d.averageRating !== undefined && d.averageRating !== null
        ? Number(d.averageRating)
        : d.average_rating !== undefined && d.average_rating !== null
          ? Number(d.average_rating)
          : null,
  };
}

export function useStats() {
  return useQuery<StatsView>({
    queryKey: qk.stats,
    queryFn: () => apiFetch<unknown>('/api/stats').then(normalizeStats),
  });
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export interface UploadResult {
  pathname: string;
  url: string;
  thumbnailPathname?: string | null;
  thumbnailUrl?: string | null;
}

export function uploadImage(payload: {
  fileName: string;
  contentType: string;
  data: string; // base64, no data: prefix
  thumbnail?: { contentType: string; data: string };
}): Promise<UploadResult> {
  return apiFetch<UploadResult>('/api/images/upload', { method: 'POST', body: payload });
}

export function deleteImageRow(id: string): Promise<void> {
  return apiFetch<void>(`/api/images/${id}`, { method: 'DELETE' });
}

// ---------------------------------------------------------------------------
// Photo URL resolution
// ---------------------------------------------------------------------------

/**
 * Entry photos carry resolved public URLs (url / thumbnail_url) when the
 * backend provides them; fall back to the raw pathname which may already be
 * an absolute URL.
 */
export type PhotoView = EntryPhotoDTO & {
  url?: string | null;
  thumbnail_url?: string | null;
};

export function photoSrc(p: PhotoView): string {
  const v = p.url ?? p.thumbnail_url ?? p.blob_pathname;
  return typeof v === 'string' ? v : '';
}

export function photoThumbSrc(p: PhotoView): string {
  const v = p.thumbnail_url ?? p.url ?? p.thumbnail_pathname ?? p.blob_pathname;
  return typeof v === 'string' ? v : '';
}

// ---------------------------------------------------------------------------
// Import endpoints (consumed by the importer lib + ImportPage)
// ---------------------------------------------------------------------------

export interface ImportPreviewRequestItem {
  source_entry_id: string;
  event_date: string;
  title: string;
}

export interface ImportPreviewResult {
  total: number;
  newCount: number;
  duplicates: unknown[];
  dateRange: { min: string; max: string } | null;
}

export function previewImport(source: string, items: ImportPreviewRequestItem[]) {
  return apiFetch<ImportPreviewResult>('/api/import/preview', {
    method: 'POST',
    body: { source, items },
  });
}

export interface ImportJobCreate {
  source: string;
  fileName?: string;
  totalItems: number;
}

export function createImportJob(input: ImportJobCreate) {
  return apiFetch<{ job: ImportJobDTO } | ImportJobDTO>('/api/import/jobs', {
    method: 'POST',
    body: input,
  });
}

export function getImportJob(id: string) {
  return apiFetch<{ job: ImportJobDTO; items: unknown[] } | ImportJobDTO>(`/api/import/jobs/${id}`);
}

export interface ImportBatchItem {
  source_entry_id: string;
  event_date: string;
  title: string;
  description?: string;
  category_slug?: string;
  rating?: number | null;
  location?: string | null;
  tags?: string[];
}

export interface ImportBatchResult {
  source_entry_id: string;
  status: 'imported' | 'duplicate' | 'failed';
  entry_id?: string;
  error?: string;
}

export function postImportBatch(jobId: string, items: ImportBatchItem[]) {
  return apiFetch<{ results: ImportBatchResult[] }>(`/api/import/jobs/${jobId}/batch`, {
    method: 'POST',
    body: { jobId, items },
  });
}

export function completeImportJob(jobId: string) {
  return apiFetch<{ report: unknown }>(`/api/import/jobs/${jobId}/complete`, { method: 'POST' });
}
