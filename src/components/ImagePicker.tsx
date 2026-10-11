import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Camera, X, RotateCcw, Loader2 } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { uploadImage } from '../lib/api';

export interface PickedPhoto {
  key: string;
  /** server entry_images row id (only for photos already saved) */
  id?: string;
  pathname?: string;
  thumbnailPathname?: string | null;
  url?: string;
  thumbnailUrl?: string | null;
  altText?: string | null;
  uploading: boolean;
  error?: string;
  /** local preview while uploading */
  previewUrl?: string;
}

interface Props {
  value: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  max?: number;
}

const MAIN_MAX = 2048;
const THUMB_MAX = 480;
const QUALITY = 0.82;

function isHeic(file: File): boolean {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.hei[cf]$/i.test(file.name)
  );
}

async function loadBitmap(file: File): Promise<{ bmp: ImageBitmap | HTMLImageElement; w: number; h: number; revoke: () => void }> {
  const url = URL.createObjectURL(file);
  const revoke = () => URL.revokeObjectURL(url);
  try {
    if (typeof createImageBitmap === 'function') {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
      return { bmp, w: bmp.width, h: bmp.height, revoke };
    }
  } catch {
    /* fall through to <img> */
  }
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('decode failed'));
    img.src = url;
  });
  return { bmp: img, w: img.naturalWidth, h: img.naturalHeight, revoke };
}

function drawScaled(src: ImageBitmap | HTMLImageElement, w: number, h: number, maxDim: number): Promise<Blob> {
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  // JPEG has no alpha: paint cream behind transparent PNGs
  ctx.fillStyle = '#faf8f4';
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0, cw, ch);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('encode failed'))),
      'image/jpeg',
      QUALITY,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result ?? '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    r.onerror = () => reject(r.error ?? new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

let keyCounter = 0;
const nextKey = () => `photo-${Date.now()}-${keyCounter++}`;

/**
 * Photo picker: file input (+ camera capture on mobile), client-side resize
 * via canvas (2048px main JPEG q0.82 + 480px thumbnail), then upload to
 * POST /api/images/upload. HEIC gets a friendly error (browsers can't decode).
 */
export function ImagePicker({ value, onChange, max = 20 }: Props) {
  const { t } = useLang();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // valueRef avoids stale closures when several files upload in parallel
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const processFile = async (file: File): Promise<void> => {
    const key = nextKey();
    if (isHeic(file)) {
      onChange([...valueRef.current, { key, uploading: false, error: t('photos.heic') }]);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    onChange([...valueRef.current, { key, uploading: true, previewUrl }]);

    try {
      const { bmp, w, h, revoke } = await loadBitmap(file);
      try {
        const main = await drawScaled(bmp, w, h, MAIN_MAX);
        const thumb = await drawScaled(bmp, w, h, THUMB_MAX);
        const [mainB64, thumbB64] = await Promise.all([blobToBase64(main), blobToBase64(thumb)]);
        const res = await uploadImage({
          fileName: file.name.replace(/\.[^.]+$/, '.jpg'),
          contentType: 'image/jpeg',
          data: mainB64,
          thumbnail: { contentType: 'image/jpeg', data: thumbB64 },
        });
        onChange(
          valueRef.current.map((p) =>
            p.key === key
              ? {
                  ...p,
                  uploading: false,
                  previewUrl: undefined,
                  pathname: res.pathname,
                  thumbnailPathname: res.thumbnailPathname ?? null,
                  url: res.url,
                  thumbnailUrl: res.thumbnailUrl ?? null,
                  error: undefined,
                }
              : p,
          ),
        );
      } finally {
        revoke();
        URL.revokeObjectURL(previewUrl);
      }
    } catch (e) {
      onChange(
        valueRef.current.map((p) =>
          p.key === key
            ? { ...p, uploading: false, previewUrl: undefined, error: t('photos.uploadFailed') }
            : p,
        ),
      );
      console.error('photo upload failed', e);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (value.length + files.length > max) {
      // still add what fits
    }
    setBusy(true);
    try {
      const room = Math.max(0, max - value.length);
      const list = [...files].slice(0, room);
      for (const f of list) {
        // sequential to keep memory bounded on mobile
        await processFile(f);
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = (key: string) => {
    const p = value.find((v) => v.key === key);
    if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    onChange(value.filter((v) => v.key !== key));
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((p) => (
          <div key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--cream-100)]">
            {(p.thumbnailUrl ?? p.url ?? p.previewUrl) && (
              <img
                src={p.thumbnailUrl ?? p.url ?? p.previewUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
            {p.uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-white">
                <Loader2 size={20} className="animate-spin" aria-hidden />
                <span className="px-1 text-center text-[10px]">{t('photos.uploading')}</span>
              </div>
            )}
            {p.error && !p.uploading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-900/70 p-1 text-center text-white">
                <span className="text-[10px] leading-tight">{p.error}</span>
                <button
                  type="button"
                  onClick={() => remove(p.key)}
                  className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px]"
                >
                  <RotateCcw size={10} aria-hidden /> {t('photos.retry')}
                </button>
              </div>
            )}
            {!p.uploading && !p.error && (
              <button
                type="button"
                aria-label={t('photos.remove')}
                onClick={() => remove(p.key)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
              >
                <X size={14} aria-hidden />
              </button>
            )}
          </div>
        ))}
        {value.length < max && (
          <div className="flex aspect-square flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--cream-200)] text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              <ImagePlus size={20} aria-hidden />
              {t('photos.add')}
            </button>
            <button
              type="button"
              onClick={() => cameraRef.current?.click()}
              disabled={busy}
              className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--cream-200)] text-xs opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              <Camera size={20} aria-hidden />
              {t('photos.take')}
            </button>
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      {value.length >= max && (
        <p className="mt-1 text-xs opacity-60">{t('photos.tooMany', { max })}</p>
      )}
    </div>
  );
}
