import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/integrations/github")({
  component: GitHubIntegrationPage,
});

function GitHubIntegrationPage() {
  const isConnected = false;

  return (
    <div className="min-h-full p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <Link
            to="/integrations"
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 mb-2 inline-block"
          >
            &larr; Back to integrations
          </Link>
          <div className="flex items-center gap-3">
            <svg className="w-8 h-8 text-gray-900 dark:text-gray-100" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              GitHub
            </h1>
          </div>
        </div>

        {isConnected ? (
          <div className="space-y-6">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-700 dark:text-green-300 font-medium">
                Connected to GitHub
              </p>
            </div>

            <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                Sync Settings
              </h3>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Pull Requests
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Issues
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Commits
                  </span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Reviews
                  </span>
                </label>
              </div>
            </div>

            <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors">
              Disconnect
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                Connect your GitHub account
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                We'll use OAuth to securely connect to your GitHub account. Your
                token will be stored in your system keychain.
              </p>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
                Connect with GitHub
              </button>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-800 rounded-lg">
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                What we sync
              </h3>
              <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <li>- Pull Requests you created or participated in</li>
                <li>- Issues you created or are assigned to</li>
                <li>- Your commits</li>
                <li>- Review comments you made or received</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
