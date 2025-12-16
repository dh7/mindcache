type SystemTag = 'SystemPrompt' | 'LLMRead' | 'LLMWrite' | 'protected' | 'ApplyTemplate';

const SYSTEM_TAG_LABELS: Record<SystemTag, string> = {
  SystemPrompt: 'SP',
  LLMRead: 'LR',
  LLMWrite: 'LW',
  protected: 'P',
  ApplyTemplate: 'AT'
};

const SYSTEM_TAG_COLORS: Record<SystemTag, { active: string; inactive: string }> = {
  SystemPrompt: {
    active: 'bg-purple-900 bg-opacity-50 text-purple-300 border-purple-600',
    inactive: 'bg-zinc-800 text-purple-400 border-zinc-800 hover:bg-zinc-700'
  },
  LLMRead: {
    active: 'bg-blue-900 bg-opacity-50 text-blue-300 border-blue-600',
    inactive: 'bg-zinc-800 text-blue-400 border-zinc-800 hover:bg-zinc-700'
  },
  LLMWrite: {
    active: 'bg-green-900 bg-opacity-50 text-green-300 border-green-600',
    inactive: 'bg-zinc-800 text-green-400 border-zinc-800 hover:bg-zinc-700'
  },
  protected: {
    active: 'bg-red-900 bg-opacity-50 text-red-300 border-red-600',
    inactive: 'bg-zinc-800 text-red-400 border-zinc-800 hover:bg-zinc-700'
  },
  ApplyTemplate: {
    active: 'bg-yellow-900 bg-opacity-50 text-yellow-300 border-yellow-600',
    inactive: 'bg-zinc-800 text-yellow-400 border-zinc-800 hover:bg-zinc-700'
  }
};

interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  selectedSystemTags: SystemTag[];
  showUntagged: boolean;
  onToggleTag: (tag: string) => void;
  onToggleSystemTag: (tag: SystemTag) => void;
  onToggleUntagged: () => void;
  onClearFilters: () => void;
}

export function TagFilter({
  availableTags,
  selectedTags,
  selectedSystemTags,
  showUntagged,
  onToggleTag,
  onToggleSystemTag,
  onToggleUntagged,
  onClearFilters
}: TagFilterProps) {
  const hasFilters = selectedTags.length > 0 || selectedSystemTags.length > 0 || showUntagged;
  const systemTags: SystemTag[] = ['SystemPrompt', 'LLMRead', 'LLMWrite', 'protected', 'ApplyTemplate'];

  return (
    <div className="mb-4">
      <div className="flex flex-wrap gap-2 items-center">
        {systemTags.map(tag => (
          <button
            key={tag}
            onClick={() => onToggleSystemTag(tag)}
            className={`px-2 py-0.5 text-xs rounded transition border font-mono ${
              selectedSystemTags.includes(tag)
                ? SYSTEM_TAG_COLORS[tag].active
                : SYSTEM_TAG_COLORS[tag].inactive
            }`}
            title={tag}
          >
            {SYSTEM_TAG_LABELS[tag]}
          </button>
        ))}

        <span className="text-zinc-600">|</span>

        <button
          onClick={onToggleUntagged}
          className={`px-2 py-0.5 text-xs rounded transition border font-mono ${
            showUntagged
              ? 'bg-cyan-900 bg-opacity-50 text-cyan-300 border-cyan-600'
              : 'bg-zinc-800 text-zinc-300 border-zinc-800 hover:bg-zinc-700'
          }`}
          title="Show keys with no content tags"
        >
          ∅
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
        {hasFilters && (
          <button
            onClick={onClearFilters}
            className="px-2 py-0.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-white hover:border-red-600 transition"
            title="Clear filters"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
