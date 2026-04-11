'use client';

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import VideoAd from './VideoAd';

const COOLDOWN_MS = 10 * 60 * 1000;
const AD_DURATION_SECONDS = 15;
const STORAGE_KEY = 'ad_cooldown_ts';
const DEV_TOGGLE_KEY = 'ad_dev_toggle';

const SPONSOR_NAME = process.env.NEXT_PUBLIC_SPONSOR_NAME || '';
const SPONSOR_LOGO = process.env.NEXT_PUBLIC_SPONSOR_LOGO || '';
const SPONSOR_URL = process.env.NEXT_PUBLIC_SPONSOR_URL || '';
const SPONSOR_VIDEO = process.env.NEXT_PUBLIC_SPONSOR_VIDEO || '';
const AD_MANAGER_TAG = process.env.NEXT_PUBLIC_AD_MANAGER_TAG || '';
const HAS_SPONSOR = !!(SPONSOR_NAME && SPONSOR_URL);
const HAS_VIDEO_ADS = !!AD_MANAGER_TAG;

type AdCreative = 'sponsor' | 'video' | 'fallback';

interface AdGateContextValue {
  requireAd: () => Promise<void>;
}

const AdGateContext = createContext<AdGateContextValue>({
  requireAd: () => Promise.resolve(),
});

export function useAdGate() {
  return useContext(AdGateContext);
}

function useAdsEnabled(): [boolean, (v: boolean) => void] {
  const isDev = process.env.NODE_ENV === 'development';
  const envFlag = process.env.NEXT_PUBLIC_ADS_ENABLED !== 'false';

  const [devOverride, setDevOverride] = useState<boolean>(isDev ? false : envFlag);

  useEffect(() => {
    if (!isDev) return;
    try {
      const stored = localStorage.getItem(DEV_TOGGLE_KEY);
      if (stored !== null) setDevOverride(stored === 'true');
    } catch { /* noop */ }
  }, [isDev]);

  function setEnabled(v: boolean) {
    setDevOverride(v);
    try { localStorage.setItem(DEV_TOGGLE_KEY, String(v)); } catch { /* noop */ }
  }

  if (!isDev) return [envFlag, () => {}];
  return [devOverride, setEnabled];
}

function resolveCreativeType(): AdCreative {
  if (HAS_SPONSOR) return 'sponsor';
  if (HAS_VIDEO_ADS) return 'video';
  return 'fallback';
}

export default function AdGateProvider({ children }: { children: React.ReactNode }) {
  const isDev = process.env.NODE_ENV === 'development';
  const [adsEnabled, setAdsEnabled] = useAdsEnabled();

  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(AD_DURATION_SECONDS);
  const [creative, setCreative] = useState<AdCreative>('fallback');
  const [videoFinished, setVideoFinished] = useState(false);
  const resolveRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function isCooldownActive(): boolean {
    try {
      const ts = localStorage.getItem(STORAGE_KEY);
      if (!ts) return false;
      return Date.now() - parseInt(ts, 10) < COOLDOWN_MS;
    } catch {
      return false;
    }
  }

  function markAdCompleted() {
    try {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    } catch { /* noop */ }
  }

  const requireAd = useCallback((): Promise<void> => {
    if (!adsEnabled || isCooldownActive()) return Promise.resolve();

    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      setSecondsLeft(AD_DURATION_SECONDS);
      setVideoFinished(false);
      setCreative(resolveCreativeType());
      setVisible(true);
    });
  }, [adsEnabled]);

  useEffect(() => {
    if (!visible) return;

    // For video ads served by IMA, the timer is not used — completion
    // is driven by the onComplete callback from the VideoAd component.
    if (creative === 'video' && !videoFinished) return;

    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, creative, videoFinished]);

  function handleComplete() {
    markAdCompleted();
    setVisible(false);
    resolveRef.current?.();
    resolveRef.current = null;
  }

  function handleVideoComplete() {
    setVideoFinished(true);
    setSecondsLeft(0);
  }

  function handleVideoError() {
    // Video ad failed to load — fall back to timer-only interstitial
    setCreative('fallback');
  }

  const showTimer = creative !== 'video' || videoFinished;
  const progress = showTimer
    ? ((AD_DURATION_SECONDS - secondsLeft) / AD_DURATION_SECONDS) * 100
    : 0;

  return (
    <AdGateContext.Provider value={{ requireAd }}>
      {children}

      {isDev && (
        <button
          onClick={() => setAdsEnabled(!adsEnabled)}
          className={`fixed bottom-4 left-4 z-[300] px-3 py-1.5 rounded-full text-xs font-mono font-medium shadow-lg border transition-all ${
            adsEnabled
              ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
              : 'bg-gray-100 text-gray-500 border-gray-300 hover:bg-gray-200'
          }`}
          title="Toggle ad gate for testing (dev only)"
        >
          Ads: {adsEnabled ? 'ON' : 'OFF'}
        </button>
      )}

      {visible && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center">
          <div className="w-full max-w-md mx-4 text-center">
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 shadow-2xl border border-gray-700/50">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-indigo-600/20 mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-indigo-400">
                    <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
                    <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white mb-1">
                  {creative === 'sponsor' ? `Sponsored by ${SPONSOR_NAME}` : 'A word from our sponsor'}
                </h2>
                <p className="text-sm text-gray-400">
                  This free tool is supported by ads
                </p>
              </div>

              {/* --- Ad creative area --- */}
              {creative === 'sponsor' && (
                <a
                  href={SPONSOR_URL}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  className="block mb-6 group"
                >
                  {SPONSOR_VIDEO ? (
                    <video
                      src={SPONSOR_VIDEO}
                      autoPlay
                      muted
                      playsInline
                      className="rounded-xl w-full aspect-video object-cover"
                    />
                  ) : SPONSOR_LOGO ? (
                    <div className="bg-gray-700/50 rounded-xl aspect-video flex items-center justify-center border border-gray-600/30 group-hover:border-indigo-500/50 transition">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={SPONSOR_LOGO}
                        alt={SPONSOR_NAME}
                        className="max-h-24 max-w-[80%] object-contain"
                      />
                    </div>
                  ) : (
                    <div className="bg-gray-700/50 rounded-xl aspect-video flex items-center justify-center border border-gray-600/30 group-hover:border-indigo-500/50 transition">
                      <span className="text-2xl font-bold text-white/80">{SPONSOR_NAME}</span>
                    </div>
                  )}
                  <p className="text-indigo-400 text-xs mt-2 group-hover:underline">
                    Visit {SPONSOR_NAME} &rarr;
                  </p>
                </a>
              )}

              {creative === 'video' && !videoFinished && (
                <div className="mb-6">
                  <VideoAd onComplete={handleVideoComplete} onError={handleVideoError} />
                </div>
              )}

              {creative === 'video' && videoFinished && (
                <div className="bg-gray-700/50 rounded-xl aspect-video flex items-center justify-center mb-6 border border-gray-600/30">
                  <p className="text-gray-400 text-sm">Thanks for watching!</p>
                </div>
              )}

              {creative === 'fallback' && (
                <div className="bg-gray-700/50 rounded-xl aspect-video flex items-center justify-center mb-6 border border-gray-600/30">
                  <div className="text-center">
                    <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Advertisement</p>
                    <p className="text-gray-400 text-sm">Supporting Open House Router</p>
                  </div>
                </div>
              )}

              {/* Progress bar — hidden during IMA video playback */}
              {showTimer && (
                <div className="w-full bg-gray-700 rounded-full h-1.5 mb-4 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              {creative === 'video' && !videoFinished ? (
                <p className="text-sm text-gray-400">
                  Ad playing...
                </p>
              ) : secondsLeft > 0 ? (
                <p className="text-sm text-gray-400">
                  Continue in <span className="font-mono font-bold text-white">{secondsLeft}s</span>
                </p>
              ) : (
                <button
                  onClick={handleComplete}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition shadow-lg shadow-indigo-600/25"
                >
                  Continue
                </button>
              )}
            </div>

            <p className="text-[10px] text-gray-600 mt-4">
              Ads keep Open House Router free for everyone
            </p>
          </div>
        </div>
      )}
    </AdGateContext.Provider>
  );
}
