import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Open House Router',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <a href="/" className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 mb-8">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back to Open House Router
        </a>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
          <p className="text-sm text-gray-400 mb-8">Last updated: April 2026</p>

          <div className="prose prose-gray prose-sm max-w-none space-y-6">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mt-0">What We Collect</h2>
              <p className="text-gray-600">
                Open House Router collects minimal data necessary to provide the service:
              </p>
              <ul className="text-gray-600 list-disc pl-5 space-y-1">
                <li>Session names and member names you provide</li>
                <li>Open house listing data you upload from Redfin CSV files</li>
                <li>Starting location coordinates (when you set them)</li>
                <li>Route preferences (favorites and exclusions)</li>
              </ul>
              <p className="text-gray-600">
                All session data is stored on our server and is accessible to anyone with the
                session code. Sessions are not password-protected.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">Cookies &amp; Local Storage</h2>
              <p className="text-gray-600">We use browser local storage to remember:</p>
              <ul className="text-gray-600 list-disc pl-5 space-y-1">
                <li>Your member identity within a session</li>
                <li>Ad display cooldown timestamps</li>
                <li>Cookie consent preferences</li>
              </ul>
              <p className="text-gray-600">
                We do not set tracking cookies ourselves, but our advertising partners may set
                cookies to serve relevant ads and measure performance.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">Advertising</h2>
              <p className="text-gray-600">
                Open House Router is a free service supported by advertising. We work with
                third-party ad networks including Google AdSense and Google Ad Manager, which
                may collect and use data to serve personalized ads. These partners may use
                cookies, device identifiers, and browsing data as described in their respective
                privacy policies:
              </p>
              <ul className="text-gray-600 list-disc pl-5 space-y-1">
                <li>
                  <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                    Google Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="https://policies.google.com/technologies/ads" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                    How Google uses advertising cookies
                  </a>
                </li>
              </ul>
              <p className="text-gray-600">
                You can opt out of personalized advertising by visiting{' '}
                <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Google Ads Settings
                </a>.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">Third-Party Services</h2>
              <p className="text-gray-600">We use the following external services:</p>
              <ul className="text-gray-600 list-disc pl-5 space-y-1">
                <li><strong>OpenStreetMap</strong> — map tiles</li>
                <li><strong>Nominatim</strong> — address geocoding</li>
                <li><strong>OSRM</strong> — driving route calculations</li>
              </ul>
              <p className="text-gray-600">
                These services have their own privacy policies and may log IP addresses and
                request metadata.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">Data Retention</h2>
              <p className="text-gray-600">
                Session data is stored on our server for the lifetime of the application.
                We do not currently provide automated data deletion, but you can contact us
                to request removal of your session data.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-900">Contact</h2>
              <p className="text-gray-600">
                For questions about this privacy policy or to request data deletion, please
                open an issue on our{' '}
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  GitHub repository
                </a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
