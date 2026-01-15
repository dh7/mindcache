"use client";

import { useState, useEffect, useCallback } from 'react';
import { 
  Github, 
  LogOut, 
  Plus, 
  Trash2, 
  Save, 
  RefreshCw, 
  FileText, 
  FolderGit2,
  Check,
  AlertCircle,
  ExternalLink
} from 'lucide-react';

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string;
}

interface Repo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
}

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load user from cookie on mount
  useEffect(() => {
    const userCookie = document.cookie
      .split('; ')
      .find(row => row.startsWith('github_user='));
    
    if (userCookie) {
      try {
        const userData = JSON.parse(decodeURIComponent(userCookie.split('=')[1]));
        setUser(userData);
      } catch {
        // Invalid cookie
      }
    }

    // Check for error in URL
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    if (errorParam) {
      setError(errorParam);
      // Clear the error from URL
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Load repos when user is authenticated
  useEffect(() => {
    if (user) {
      loadRepos();
    }
  }, [user]);

  const loadRepos = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/github/repos');
      if (res.ok) {
        const { repos } = await res.json();
        setRepos(repos);
      }
    } catch (err) {
      console.error('Failed to load repos:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNotes = useCallback(async (repo: Repo) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/github/notes?owner=${repo.owner}&repo=${repo.name}`);
      if (res.ok) {
        const { notes: loadedNotes } = await res.json();
        setNotes(loadedNotes);
        setSelectedNote(loadedNotes[0] || null);
        setHasUnsavedChanges(false);
      } else {
        const { error } = await res.json();
        setError(error);
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
      setError('Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectRepo = (repo: Repo) => {
    setSelectedRepo(repo);
    setNotes([]);
    setSelectedNote(null);
    loadNotes(repo);
  };

  const saveNotes = async () => {
    if (!selectedRepo) return;
    
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/github/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: selectedRepo.owner,
          repo: selectedRepo.name,
          notes
        })
      });

      if (res.ok) {
        const { url } = await res.json();
        setLastSaved(new Date().toLocaleTimeString());
        setHasUnsavedChanges(false);
        console.log('Saved! Commit:', url);
      } else {
        const { error } = await res.json();
        setError(error);
      }
    } catch (err) {
      console.error('Failed to save:', err);
      setError('Failed to save notes');
    } finally {
      setIsSaving(false);
    }
  };

  const createNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: 'New Note',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    setNotes([newNote, ...notes]);
    setSelectedNote(newNote);
    setHasUnsavedChanges(true);
  };

  const updateNote = (updates: Partial<Note>) => {
    if (!selectedNote) return;
    
    const updated = { 
      ...selectedNote, 
      ...updates, 
      updatedAt: new Date().toISOString() 
    };
    setSelectedNote(updated);
    setNotes(notes.map(n => n.id === updated.id ? updated : n));
    setHasUnsavedChanges(true);
  };

  const deleteNote = (noteId: string) => {
    setNotes(notes.filter(n => n.id !== noteId));
    if (selectedNote?.id === noteId) {
      setSelectedNote(notes.find(n => n.id !== noteId) || null);
    }
    setHasUnsavedChanges(true);
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
    setNotes([]);
    setSelectedNote(null);
  };

  // Not logged in - show login screen
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] flex items-center justify-center">
            <FolderGit2 className="w-10 h-10 text-indigo-400" />
          </div>
          <h1 className="text-3xl font-bold mb-3">GitHub Notes</h1>
          <p className="text-[var(--text-secondary)] mb-8">
            Save and sync your notes to any GitHub repository using GitStore OAuth.
          </p>

          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <a
            href="/api/auth/github"
            className="btn-github inline-flex items-center gap-3 text-white font-medium py-4 px-8 rounded-xl text-lg"
          >
            <Github className="w-6 h-6" />
            Connect with GitHub
          </a>

          <p className="text-xs text-[var(--text-secondary)] mt-6">
            We only request access to read/write repositories you choose.
          </p>
        </div>
      </div>
    );
  }

  // Logged in - show app
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderGit2 className="w-6 h-6 text-indigo-400" />
            <span className="font-semibold">GitHub Notes</span>
          </div>

          <div className="flex items-center gap-4">
            {lastSaved && !hasUnsavedChanges && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
                Saved {lastSaved}
              </span>
            )}
            {hasUnsavedChanges && (
              <span className="text-xs text-yellow-400">Unsaved changes</span>
            )}

            <div className="flex items-center gap-2">
              <img 
                src={user.avatarUrl} 
                alt={user.login}
                className="w-8 h-8 rounded-full"
              />
              <span className="text-sm">{user.login}</span>
            </div>

            <button
              onClick={logout}
              className="text-[var(--text-secondary)] hover:text-white transition-colors p-2"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Sidebar - Repo & Note selection */}
        <div className="w-72 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col">
          {/* Repo selector */}
          <div className="p-4 border-b border-[var(--border)]">
            <label className="text-xs text-[var(--text-secondary)] block mb-2">
              Repository
            </label>
            <select
              value={selectedRepo?.fullName || ''}
              onChange={(e) => {
                const repo = repos.find(r => r.fullName === e.target.value);
                if (repo) selectRepo(repo);
              }}
              className="w-full bg-[var(--bg-card)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select a repository...</option>
              {repos.map(repo => (
                <option key={repo.id} value={repo.fullName}>
                  {repo.fullName} {repo.private ? '🔒' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Notes list */}
          {selectedRepo && (
            <>
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <span className="text-sm font-medium">Notes ({notes.length})</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadNotes(selectedRepo)}
                    disabled={isLoading}
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded transition-colors"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'spinner' : ''}`} />
                  </button>
                  <button
                    onClick={createNote}
                    className="p-1.5 hover:bg-[var(--bg-card)] rounded transition-colors text-indigo-400"
                    title="New Note"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-thin">
                {notes.length === 0 ? (
                  <div className="p-6 text-center text-[var(--text-secondary)]">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No notes yet</p>
                    <button
                      onClick={createNote}
                      className="mt-3 text-indigo-400 text-sm hover:underline"
                    >
                      Create your first note
                    </button>
                  </div>
                ) : (
                  notes.map(note => (
                    <div
                      key={note.id}
                      onClick={() => setSelectedNote(note)}
                      className={`p-4 border-b border-[var(--border)] cursor-pointer transition-colors ${
                        selectedNote?.id === note.id 
                          ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500' 
                          : 'hover:bg-[var(--bg-card)]'
                      }`}
                    >
                      <h3 className="font-medium text-sm truncate">{note.title}</h3>
                      <p className="text-xs text-[var(--text-secondary)] mt-1 truncate">
                        {note.content || 'Empty note'}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* Save button */}
              <div className="p-4 border-t border-[var(--border)]">
                <button
                  onClick={saveNotes}
                  disabled={isSaving || !hasUnsavedChanges}
                  className="btn-primary w-full py-2.5 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 spinner" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save to GitHub
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Main editor area */}
        <div className="flex-1 flex flex-col">
          {error && (
            <div className="m-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto text-sm hover:underline">
                Dismiss
              </button>
            </div>
          )}

          {!selectedRepo ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
              <div className="text-center">
                <Github className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Select a repository to get started</p>
              </div>
            </div>
          ) : !selectedNote ? (
            <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p>Select a note or create a new one</p>
              </div>
            </div>
          ) : (
            <>
              {/* Note header */}
              <div className="p-4 border-b border-[var(--border)] flex items-center gap-4">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => updateNote({ title: e.target.value })}
                  placeholder="Note title"
                  className="flex-1 bg-transparent text-xl font-semibold focus:outline-none"
                />
                <button
                  onClick={() => deleteNote(selectedNote.id)}
                  className="p-2 text-[var(--text-secondary)] hover:text-red-400 transition-colors"
                  title="Delete note"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>

              {/* Note editor */}
              <div className="flex-1 p-4">
                <textarea
                  value={selectedNote.content}
                  onChange={(e) => updateNote({ content: e.target.value })}
                  placeholder="Start writing..."
                  className="w-full h-full bg-transparent resize-none focus:outline-none text-[var(--text-secondary)] leading-relaxed"
                />
              </div>

              {/* Note footer */}
              <div className="px-4 py-2 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span>
                  Created: {new Date(selectedNote.createdAt).toLocaleDateString()}
                </span>
                {selectedRepo && (
                  <a
                    href={`https://github.com/${selectedRepo.fullName}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-indigo-400 transition-colors"
                  >
                    <span>{selectedRepo.fullName}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
