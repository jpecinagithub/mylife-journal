import { useCallback, useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useLang } from '../i18n/strings';

interface Props {
  images: string[];
  index: number;
  onClose: () => void;
  onIndex?: (i: number) => void;
  alt?: string;
}

/** Fullscreen photo viewer: arrows navigate, Esc closes, body scroll locked. */
export function Lightbox({ images, index, onClose, onIndex, alt }: Props) {
  const { t } = useLang();
  // Remounted on every open (parent renders conditionally), so the initial
  // index prop is the source of truth for the starting photo.
  const [i, setI] = useState(index);

  const go = useCallback(
    (delta: number) => {
      const n = (i + delta + images.length) % images.length;
      setI(n);
      onIndex?.(n);
    },
    [i, images.length, onIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, go]);

  if (images.length === 0) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={alt ?? t('a11y.closeLightbox')}
      onClick={onClose}
    >
      <button
        type="button"
        aria-label={t('a11y.closeLightbox')}
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X size={22} aria-hidden />
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label={t('a11y.prevPhoto')}
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:left-4"
          >
            <ChevronLeft size={26} aria-hidden />
          </button>
          <button
            type="button"
            aria-label={t('a11y.nextPhoto')}
            onClick={(e) => { e.stopPropagation(); go(1); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 sm:right-4"
          >
            <ChevronRight size={26} aria-hidden />
          </button>
        </>
      )}
      <img
        src={images[i]}
        alt={alt ?? ''}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
        draggable={false}
      />
      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
          {i + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
