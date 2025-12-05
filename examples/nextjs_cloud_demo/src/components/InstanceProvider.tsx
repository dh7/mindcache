'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface InstanceContextType {
  instances: Record<string, string>;
  projectId: string | null;
  isLoading: boolean;
  error: string | null;
  getInstanceId: (demoName: string) => string | undefined;
}

const InstanceContext = createContext<InstanceContextType>({
  instances: {},
  projectId: null,
  isLoading: true,
  error: null,
  getInstanceId: () => undefined,
});

export function InstanceProvider({ children }: { children: React.ReactNode }) {
  const [instances, setInstances] = useState<Record<string, string>>({});
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInstances() {
      try {
        const response = await fetch('/api/instances');
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch instances');
        }

        const data = await response.json();
        setInstances(data.instances);
        setProjectId(data.projectId);
        console.log('☁️ Loaded instances:', data.instances);
      } catch (err) {
        console.error('☁️ Failed to load instances:', err);
        setError(err instanceof Error ? err.message : 'Failed to load instances');
      } finally {
        setIsLoading(false);
      }
    }

    fetchInstances();
  }, []);

  const getInstanceId = (demoName: string) => instances[demoName];

  return (
    <InstanceContext.Provider value={{ instances, projectId, isLoading, error, getInstanceId }}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstances() {
  return useContext(InstanceContext);
}

