'use client';

import { useState, useEffect } from 'react';

const CONSENT_KEY = 'cookie_consent';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(CONSENT_KEY)) setVisible(true);
    } catch { /* noop */ }
  }, []);

  function accept() {
    try { localStorage.setItem(CONSENT_KEY, 'accepted'); } catch { /* noop */ }
    setVisible(false);
  }

  function decline() {
    try { localStorage.setItem(CONSENT_KEY, 'declined'); } catch { /* noop */ }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-[150] p-4 pointer-events-none">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-2xl shadow-gray-300/50 border border-gray-200 p-5 pointer-events-auto">
        <p className="text-sm text-gray-600 mb-3">
          We use cookies and similar technologies for ads and analytics.
          See our{' '}
          <a href="/privacy" className="text-indigo-600 hover:underline font-medium">
            Privacy Policy
          </a>{' '}
          for details.
        </p>
        <div className="flex gap-2">
          <button
            onClick={accept}
            className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition"
          >
            Accept
          </button>
          <button
            onClick={decline}
            className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-xl transition"
          >
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
