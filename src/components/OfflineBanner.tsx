import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useLang } from '../i18n/strings';
import { apiFetch } from '../lib/api';

/**
 * Pill shown when the device is offline; fades out when back online.
 * Combines navigator.onLine events with a 60s heartbeat to /api/auth/me
 * (catches captive portals / dead uplinks where onLine lies).
 */
export function OfflineBanner() {
  const { t } = useLang();
  const [online, setOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const on = () => {
      setOnline(true);
      setVisible(true);
      window.setTimeout(() => setVisible(false), 4000);
    };
    const off = () => {
      setOnline(false);
      setVisible(true);
    };
    window.addEventListener('online', on);
    window.addEventListener('offline', off);

    let cancelled = false;
    const heartbeat = async () => {
      try {
        await apiFetch('/api/auth/me', { skipAuthRedirect: true });
        if (!cancelled && !navigator.onLine) {
          /* onLine says offline but the API answers — trust the API */
        }
      } catch (e) {
        if (!cancelled && (e as { status?: number }).status === 0) off();
      }
    };
    const id = window.setInterval(heartbeat, 60_000);

    return () => {
      cancelled = true;
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.clearInterval(id);
    };
  }, []);

  if (!visible) return null;
  return (
    <div
      role="status"
      className={`fixed bottom-20 left-1/2 z-40 -translate-x-1/2 sm:bottom-6 ${
        online ? 'animate-[fadeout_4s_forwards]' : ''
      }`}
    >
      <div
        className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
          online ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}
      >
        {online ? <Wifi size={16} aria-hidden /> : <WifiOff size={16} aria-hidden />}
        {online ? t('offline.online') : t('offline.title')}
      </div>
    </div>
  );
}
