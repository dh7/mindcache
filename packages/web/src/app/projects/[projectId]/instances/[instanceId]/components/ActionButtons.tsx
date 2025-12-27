interface ActionButtonsProps {
  onAddKey: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onExportMarkdown: () => void;
  onImportMarkdown: () => void;
  onExportToGitHub?: () => void;
  gitHubConnected?: boolean;
  isExportingToGitHub?: boolean;
}

export function ActionButtons({
  onAddKey,
  onExportJSON,
  onImportJSON,
  onExportMarkdown,
  onImportMarkdown,
  onExportToGitHub,
  gitHubConnected,
  isExportingToGitHub
}: ActionButtonsProps) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <button
        onClick={onAddKey}
        className="px-3 py-1 bg-white text-black text-sm rounded hover:bg-zinc-200 transition flex items-center gap-1.5"
        title="Add Key"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Key
      </button>
      <div className="flex items-center gap-1">
        {gitHubConnected && onExportToGitHub && (
          <button
            onClick={onExportToGitHub}
            disabled={isExportingToGitHub}
            className="px-2 py-1.5 bg-zinc-800 text-white text-sm rounded hover:bg-zinc-700 transition flex items-center gap-1.5 disabled:opacity-50"
            title="Export to GitHub"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            {isExportingToGitHub ? 'Pushing...' : 'Push'}
          </button>
        )}
        <button
          onClick={onExportJSON}
          className="px-2 py-1.5 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
          title="Export as JSON"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          JSON
        </button>
        <button
          onClick={onImportJSON}
          className="px-2 py-1.5 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
          title="Import from JSON"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          JSON
        </button>
        <button
          onClick={onExportMarkdown}
          className="px-2 py-1.5 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
          title="Export as Markdown"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          MD
        </button>
        <button
          onClick={onImportMarkdown}
          className="px-2 py-1.5 bg-zinc-700 text-white text-sm rounded hover:bg-zinc-600 transition flex items-center gap-1.5"
          title="Import from Markdown"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          MD
        </button>
      </div>
    </div>
  );
}
