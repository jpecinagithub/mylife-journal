-- Seed: 9 default journal categories.
-- Idempotent: re-running is a no-op thanks to ON CONFLICT DO NOTHING.
INSERT INTO "categories" ("name", "slug", "color", "icon", "sort_order") VALUES
	('Acontecimientos', 'acontecimientos', '#b08968', 'sparkles', 1),
	('Libros', 'libros', '#6d7ea8', 'book-open', 2),
	('Películas', 'peliculas', '#9a6b6b', 'clapperboard', 3),
	('Viajes', 'viajes', '#5f8a8b', 'plane', 4),
	('Montaña y naturaleza', 'montana-naturaleza', '#6b8e6b', 'mountain', 5),
	('Cultura', 'cultura', '#a07ba8', 'palette', 6),
	('Trabajo', 'trabajo', '#7a7468', 'briefcase', 7),
	('Reflexiones', 'reflexiones', '#66788f', 'pen-line', 8),
	('Otros', 'otros', '#6b7280', 'package', 9)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
