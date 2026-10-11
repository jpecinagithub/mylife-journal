-- 0002: store resolved Vercel Blob URLs on entry_images.
-- Pathnames alone are not enough to render images; the public URL returned
-- by Blob `put` is stored alongside so API responses can serve it directly.
-- (No backfill: entry_images has no rows at migration time.)
ALTER TABLE "entry_images" ADD COLUMN "url" text;
--> statement-breakpoint
ALTER TABLE "entry_images" ADD COLUMN "thumbnail_url" text;
