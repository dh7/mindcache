interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  showUntagged: boolean;
  onToggleTag: (tag: string) => void;
  onToggleUntagged: () => void;
  onClearFilters: () => void;
}

export function TagFilter({
  availableTags,
  selectedTags,
  showUntagged,
  onToggleTag,
  onToggleUntagged,
  onClearFilters
}: TagFilterProps) {
  return (
    <div className="mb-4">
      <div className="text-xs text-zinc-400 mb-2">Filter by tags:</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={onToggleUntagged}
          className={`px-2 py-0.5 text-xs rounded transition border font-mono ${
            showUntagged
              ? 'bg-cyan-900 bg-opacity-50 text-cyan-300 border-cyan-600'
              : 'bg-zinc-800 text-zinc-300 border-zinc-800 hover:bg-zinc-700'
          }`}
          title="Show keys with no tags"
        >
          untagged
        </button>
        {availableTags.map(tag => (
          <button
            key={tag}
            onClick={() => onToggleTag(tag)}
            className={`px-2 py-0.5 text-xs rounded transition border font-mono ${
              selectedTags.includes(tag)
                ? 'bg-cyan-900 bg-opacity-50 text-cyan-300 border-cyan-600'
                : 'bg-zinc-800 text-zinc-300 border-zinc-800 hover:bg-zinc-700'
            }`}
          >
            {tag}
          </button>
        ))}
        {(selectedTags.length > 0 || showUntagged) && (
          <button
            onClick={onClearFilters}
            className="px-2 py-0.5 text-xs rounded border border-zinc-800 bg-red-600 text-white hover:bg-red-700 transition flex items-center gap-1"
            title="Clear filters"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
