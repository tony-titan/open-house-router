'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdGate } from '@/components/AdGateProvider';
import AdUnit from '@/components/AdUnit';

export default function HomePage() {
  const router = useRouter();
  const { requireAd } = useAdGate();
  const [sessionName, setSessionName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    await requireAd();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: sessionName || 'Open House Weekend' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/session/${data.id}`);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim();
    if (!code) {
      setError('Please enter a session code');
      return;
    }
    router.push(`/session/${code}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 text-white text-2xl mb-4 shadow-lg shadow-indigo-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
              <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
              <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Open House Router</h1>
          <p className="text-gray-500 text-lg">
            Optimize your team&apos;s open house visits with intelligent routing
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-8 space-y-8">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Create New Session</h2>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Session name (e.g., Weekend of April 4th)"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm"
              />
              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-medium rounded-xl transition shadow-sm"
              >
                {loading ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-gray-400">or join an existing session</span>
            </div>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Join Session</h2>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter session code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition text-sm"
              />
              <button
                onClick={handleJoin}
                className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition shadow-sm"
              >
                Join
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl">{error}</div>
          )}
        </div>

        <AdUnit slot="HOME_BELOW_CARD" format="horizontal" className="mt-6 rounded-xl overflow-hidden" />

        <p className="text-center text-gray-400 text-xs mt-6">
          Upload a Redfin CSV, set starting locations, and generate optimized routes for your team.
        </p>
        <p className="text-center text-gray-300 text-[10px] mt-2">
          <a href="/privacy" className="hover:text-gray-500 transition">Privacy Policy</a>
        </p>
      </div>
    </div>
  );
}
