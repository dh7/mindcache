import { Instance, Permission } from '../types';

interface InstanceHeaderProps {
  instance: Instance | null;
  instanceName: string;
  editingName: boolean;
  canEdit: boolean;
  connected: boolean;
  permission: Permission;
  error: string | null;
  onNameChange: (name: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveName: () => void;
}

export function InstanceHeader({
  instance,
  instanceName,
  editingName,
  canEdit,
  connected,
  permission,
  error,
  onNameChange,
  onStartEdit,
  onCancelEdit,
  onSaveName
}: InstanceHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          {editingName ? (
            <input
              type="text"
              value={instanceName}
              onChange={(e) => onNameChange(e.target.value)}
              onBlur={onSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSaveName();
                }
                if (e.key === 'Escape') {
                  onCancelEdit();
                }
              }}
              className="text-lg bg-transparent border-b-2 border-zinc-500 outline-none px-1"
              autoFocus
            />
          ) : (
            <h1
              className="text-lg cursor-pointer hover:text-zinc-300 transition group flex items-center gap-2"
              onClick={() => canEdit && onStartEdit()}
              title={canEdit ? 'Click to edit name' : undefined}
            >
              {instance?.name || 'Loading...'}
              {canEdit && (
                <svg className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              )}
            </h1>
          )}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-red-500 text-xs">{error}</span>}
          <span
            className={`px-2 py-0.5 text-xs rounded border font-mono ${
              connected ? 'bg-green-900 bg-opacity-50 text-green-300 border-green-600' : 'bg-red-900 bg-opacity-50 text-red-300 border-red-600'
            }`}
          >
            {connected
              ? `Connected${permission === 'system' ? '(admin)' : permission !== 'read' ? `(${permission})` : ''}`
              : 'Disconnected'}
          </span>
        </div>
      </div>
    </div>
  );
}
