/**
 * MyLife Journal — Diaro Online DOCX export contract tests.
 *
 * Exercises the real parser (src/lib/import/diaro-docx.ts) against a
 * synthetic Diaro Online export built in-memory with JSZip. The fixture
 * mirrors the real export layout (verified against a 1033-entry export):
 *
 *   \t<day>  <Weekday> / <Month> <Year>\t<hh:mm> a/p. m.   (date header)
 *   <Title>
 *   <text paragraphs...>
 *    <temp>°C <Folder>[ <address> (<lat>, <lng>)]              (meta line)
 *   <photo paragraph: VML v:shape + v:imagedata r:id>
 *
 * Fixture facts (all data synthetic):
 * - "Noche de cine"  (2026-09-27): folder "Pelis" (pure meta line),
 *   1 photo (rId10 -> word/media/photo1.jpg).
 * - "Subida al monte" (2026-06-08): folder "Excursiones" (pure meta line),
 *   no photos.
 * - "Tarde de lectura" (2026-03-15): compound meta line
 *   " 18.0°C Excursiones NA-1300, Navarra, España (42.933728, -1.809294)"
 *   -> folder "Excursiones" (discovered from the pure line above),
 *   location "NA-1300, Navarra, España (42.933728, -1.809294)".
 * - "Nota breve" (2026-01-05): meta " 10.0°C" (weather only), no folder,
 *   no location, no photos.
 * Parser sorts oldest first.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseDiaroDocx } from '../src/lib/import/diaro-docx.js';
import { detectFormat, parseFile } from '../src/lib/import/index.js';
import type { ParsedImport } from '../src/lib/import/types.js';

// 1x1 transparent PNG, base64 — stands in for real export photos.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const V = 'urn:schemas-microsoft-com:vml';

function p(inner: string): string {
  return `<w:p xmlns:w="${W}"><w:r>${inner}</w:r></w:p>`;
}
function t(text: string): string {
  return `<w:t xml:space="preserve">${text}</w:t>`;
}
function dateHeader(day: string, weekday: string, month: string, year: string, time: string): string {
  return p(`<w:tab/>${t(`${day}  ${weekday} / ${month} ${year}`)}<w:tab/>${t(time)}`);
}
function photoPara(rid: string, widthPt: number): string {
  return `<w:p xmlns:w="${W}" xmlns:v="${V}" xmlns:r="${R}"><w:r><w:pict><v:shape style="width:${widthPt}pt;height:150pt"><v:imagedata r:id="${rid}"/></v:shape></w:pict></w:r></w:p>`;
}

const DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="${W}">
<w:body>
${p(t('Generado en 11 October 2026'))}
${dateHeader('27', 'Domingo', 'Septiembre', '2026', '05:23 p. m.')}
${p('')}
${p(t('Noche de cine'))}
${p(t('Vimos una comedia muy divertida.'))}
${p(t(' 23.6°C Pelis'))}
${photoPara('rId10', 400)}
${p('')}
${dateHeader('08', 'Lunes', 'Junio', '2026', '10:00 a. m.')}
${p('')}
${p(t('Subida al monte'))}
${p(t('Buen día de senderismo.'))}
${p(t(' 20.0°C Excursiones'))}
${p('')}
${dateHeader('15', 'Sábado', 'Marzo', '2026', '06:45 p. m.')}
${p('')}
${p(t('Tarde de lectura'))}
${p(t('Capítulo tercero, enganchado.'))}
${p(t(' 18.0°C Excursiones NA-1300, Navarra, España (42.933728, -1.809294)'))}
${p('')}
${dateHeader('05', 'Lunes', 'Enero', '2026', '09:00 a. m.')}
${p('')}
${p(t('Nota breve'))}
${p(t('Solo una línea.'))}
${p(t(' 10.0°C'))}
</w:body>
</w:document>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/photo1.jpg"/>
</Relationships>`;

async function buildDocx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('word/document.xml', DOCUMENT_XML);
  zip.file('word/_rels/document.xml.rels', RELS_XML);
  zip.file('word/media/photo1.jpg', PNG_1X1);
  return zip.generateAsync({ type: 'blob' });
}

async function parse(): Promise<ParsedImport> {
  return parseDiaroDocx(await buildDocx());
}

describe('parseDiaroDocx (Diaro Online DOCX contract)', () => {
  it('parses 4 entries, oldest first', async () => {
    const { entries } = await parse();
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.eventDate)).toEqual([
      '2026-01-05',
      '2026-03-15',
      '2026-06-08',
      '2026-09-27',
    ]);
  });

  it('extracts title, text, folder and photo', async () => {
    const { entries } = await parse();
    const cine = entries[3];
    expect(cine.title).toBe('Noche de cine');
    expect(cine.description).toBe('Vimos una comedia muy divertida.');
    expect(cine.categoryHint).toBe('Pelis');
    expect(cine.location).toBeNull();
    expect(cine.photos).toHaveLength(1);
    expect(cine.photos[0].fileName).toBe('photo1.jpg');
    expect(cine.sourceEntryId).toBe('docx-2026-09-27-0000');
  });

  it('splits compound folder + location meta lines', async () => {
    const { entries } = await parse();
    const lectura = entries[1];
    expect(lectura.title).toBe('Tarde de lectura');
    expect(lectura.categoryHint).toBe('Excursiones');
    expect(lectura.location).toBe('NA-1300, Navarra, España (42.933728, -1.809294)');
  });

  it('handles weather-only meta lines and entries without meta data', async () => {
    const { entries } = await parse();
    const breve = entries[0];
    expect(breve.title).toBe('Nota breve');
    expect(breve.categoryHint).toBeNull();
    expect(breve.location).toBeNull();
    expect(breve.photos).toHaveLength(0);
    expect(breve.tags).toEqual([]);
    expect(breve.rating).toBeNull();
  });

  it('reports discovered folders', async () => {
    const { folders } = await parse();
    expect(folders).toContainEqual({ id: 'docx-folder-Pelis', title: 'Pelis' });
    expect(folders).toContainEqual({ id: 'docx-folder-Excursiones', title: 'Excursiones' });
  });

  it('detectFormat recognizes the DOCX export', async () => {
    const blob = await buildDocx();
    const file = new File([blob], 'entryExport.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(await detectFormat(file)).toBe('diaro-docx');
  });

  it('parseFile dispatches to the DOCX parser', async () => {
    const blob = await buildDocx();
    const file = new File([blob], 'entryExport.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const parsed = await parseFile(file);
    expect(parsed.entries).toHaveLength(4);
  });
});
