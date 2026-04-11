'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    google?: {
      ima: {
        AdDisplayContainer: new (container: HTMLElement, video: HTMLVideoElement) => ImaAdDisplayContainer;
        AdsLoader: new (container: ImaAdDisplayContainer) => ImaAdsLoader;
        AdsRequest: new () => ImaAdsRequest;
        AdsManagerLoadedEvent: { Type: { ADS_MANAGER_LOADED: string } };
        AdErrorEvent: { Type: { AD_ERROR: string } };
        AdEvent: { Type: { COMPLETE: string; ALL_ADS_COMPLETED: string; STARTED: string; SKIPPED: string } };
        ViewMode: { NORMAL: string };
      };
    };
  }
}

interface ImaAdDisplayContainer {
  initialize(): void;
}

interface ImaAdsLoader {
  addEventListener(type: string, handler: (e: any) => void): void;
  requestAds(request: ImaAdsRequest): void;
  contentComplete(): void;
}

interface ImaAdsRequest {
  adTagUrl: string;
  linearAdSlotWidth: number;
  linearAdSlotHeight: number;
}

interface ImaAdsManager {
  addEventListener(type: string, handler: (e: any) => void): void;
  init(width: number, height: number, viewMode: string): void;
  start(): void;
  destroy(): void;
}

interface VideoAdProps {
  onComplete: () => void;
  onError: () => void;
}

export default function VideoAd({ onComplete, onError }: VideoAdProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adsManagerRef = useRef<ImaAdsManager | null>(null);
  const [loading, setLoading] = useState(true);
  const [adStarted, setAdStarted] = useState(false);
  const completeCalled = useRef(false);

  const adTagUrl = process.env.NEXT_PUBLIC_AD_MANAGER_TAG;

  const safeComplete = useCallback(() => {
    if (completeCalled.current) return;
    completeCalled.current = true;
    onComplete();
  }, [onComplete]);

  const safeError = useCallback(() => {
    if (completeCalled.current) return;
    completeCalled.current = true;
    onError();
  }, [onError]);

  useEffect(() => {
    if (!adTagUrl) {
      safeError();
      return;
    }

    let destroyed = false;

    const script = document.createElement('script');
    script.src = 'https://imasdk.googleapis.com/js/sdkloader/ima3.js';
    script.async = true;

    script.onload = () => {
      if (destroyed || !window.google?.ima || !containerRef.current || !videoRef.current) {
        safeError();
        return;
      }

      try {
        const ima = window.google.ima;
        const adDisplayContainer = new ima.AdDisplayContainer(containerRef.current, videoRef.current);
        adDisplayContainer.initialize();

        const adsLoader = new ima.AdsLoader(adDisplayContainer);

        adsLoader.addEventListener(ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e: any) => {
          if (destroyed) return;
          const adsManager: ImaAdsManager = e.getAdsManager(videoRef.current);
          adsManagerRef.current = adsManager;

          adsManager.addEventListener(ima.AdEvent.Type.STARTED, () => {
            setLoading(false);
            setAdStarted(true);
          });

          adsManager.addEventListener(ima.AdEvent.Type.COMPLETE, safeComplete);
          adsManager.addEventListener(ima.AdEvent.Type.ALL_ADS_COMPLETED, safeComplete);
          adsManager.addEventListener(ima.AdEvent.Type.SKIPPED, safeComplete);
          adsManager.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, safeError);

          try {
            adsManager.init(640, 360, ima.ViewMode.NORMAL);
            adsManager.start();
          } catch {
            safeError();
          }
        });

        adsLoader.addEventListener(ima.AdErrorEvent.Type.AD_ERROR, safeError);

        const adsRequest = new ima.AdsRequest();
        adsRequest.adTagUrl = adTagUrl;
        adsRequest.linearAdSlotWidth = 640;
        adsRequest.linearAdSlotHeight = 360;

        adsLoader.requestAds(adsRequest);
      } catch {
        safeError();
      }
    };

    script.onerror = safeError;
    document.head.appendChild(script);

    return () => {
      destroyed = true;
      adsManagerRef.current?.destroy();
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, [adTagUrl, safeComplete, safeError]);

  return (
    <div className="relative rounded-xl overflow-hidden aspect-video bg-black">
      <div ref={containerRef} className="absolute inset-0">
        <video
          ref={videoRef}
          className="w-full h-full"
          playsInline
          muted
        />
      </div>
      {loading && !adStarted && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-800/80">
          <div className="text-center">
            <svg className="animate-spin h-6 w-6 text-indigo-400 mx-auto mb-2" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-gray-400 text-xs">Loading ad...</p>
          </div>
        </div>
      )}
    </div>
  );
}
