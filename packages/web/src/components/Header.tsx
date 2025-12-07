'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { useAuth, useUser, useClerk, SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

interface Project {
  id: string;
  name: string;
}

interface Instance {
  id: string;
  name: string;
}

export function Header() {
  const pathname = usePathname();
  const { getToken } = useAuth();
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Parse route to get projectId and instanceId
  const projectMatch = pathname.match(/\/projects\/([^/]+)/);
  const instanceMatch = pathname.match(/\/instances\/([^/]+)/);
  const projectId = projectMatch?.[1];
  const instanceId = instanceMatch?.[1];

  // Fetch project and instance names
  const [project, setProject] = useState<Project | null>(null);
  const [instance, setInstance] = useState<Instance | null>(null);

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setInstance(null);
      return;
    }

    const fetchProject = async () => {
      try {
        const token = await getToken() || 'dev';
        const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setProject(await res.json());
        }
      } catch {
        // ignore
      }
    };

    fetchProject();
  }, [projectId, getToken]);

  useEffect(() => {
    if (!projectId || !instanceId) {
      setInstance(null);
      return;
    }

    const fetchInstance = async () => {
      try {
        const token = await getToken() || 'dev';
        const res = await fetch(`${API_URL}/api/projects/${projectId}/instances`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const found = data.instances?.find((i: Instance) => i.id === instanceId);
          if (found) setInstance(found);
        }
      } catch {
        // ignore
      }
    };

    fetchInstance();
  }, [projectId, instanceId, getToken]);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Brand + Breadcrumbs */}
        <div className="flex items-center gap-2 min-w-0">
          <Link 
            href="/" 
            className="font-semibold text-lg tracking-tight text-white hover:text-zinc-300 transition shrink-0"
          >
            mindcache
          </Link>

          {project && (
            <>
              <span className="text-zinc-600">/</span>
              <Link
                href={`/projects/${projectId}`}
                className="text-zinc-400 hover:text-white transition truncate max-w-[180px]"
                title={project.name}
              >
                {project.name}
              </Link>
            </>
          )}

          {instance && (
            <>
              <span className="text-zinc-600">/</span>
              <span className="text-zinc-500 truncate max-w-[140px]" title={instance.name}>
                {instance.name}
              </span>
            </>
          )}
        </div>

        {/* Right: User Menu */}
        <div className="flex items-center gap-3">
          <SignedOut>
            <SignInButton mode="modal">
              <button className="px-4 py-1.5 bg-white text-zinc-900 text-sm font-medium rounded-md hover:bg-zinc-200 transition">
                Sign In
              </button>
            </SignInButton>
          </SignedOut>

          <SignedIn>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-zinc-800 transition"
              >
                {user?.imageUrl ? (
                  <img
                    src={user.imageUrl}
                    alt=""
                    className="w-7 h-7 rounded-full ring-1 ring-zinc-700"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-xs font-bold text-white">
                    {user?.firstName?.charAt(0) || user?.emailAddresses?.[0]?.emailAddress?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
                <svg
                  className={`w-4 h-4 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 py-1.5 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* User Info */}
                  <div className="px-4 py-2 border-b border-zinc-800">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.fullName || user?.firstName || 'User'}
                    </p>
                    <p className="text-xs text-zinc-500 truncate">
                      {user?.primaryEmailAddress?.emailAddress}
                    </p>
                  </div>

                  {/* Menu Items */}
                  <div className="py-1">
                    <Link
                      href="/settings/keys"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
                      </svg>
                      API Keys
                    </Link>

                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        openUserProfile();
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Manage Account
                    </button>
                  </div>

                  <div className="border-t border-zinc-800 py-1">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        signOut({ redirectUrl: '/' });
                      }}
                      className="flex items-center gap-3 w-full px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-red-400 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

