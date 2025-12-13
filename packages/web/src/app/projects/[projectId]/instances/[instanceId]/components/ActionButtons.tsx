interface ActionButtonsProps {
  onAddKey: () => void;
  onExportJSON: () => void;
  onImportJSON: () => void;
  onExportMarkdown: () => void;
  onImportMarkdown: () => void;
}

export function ActionButtons({
  onAddKey,
  onExportJSON,
  onImportJSON,
  onExportMarkdown,
  onImportMarkdown
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
