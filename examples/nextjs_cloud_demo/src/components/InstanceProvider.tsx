'use client';

import React, { createContext, useContext } from 'react';

// Instance IDs are configured via env vars - no auto-creation
const INSTANCES: Record<string, string | undefined> = {
  form: process.env.NEXT_PUBLIC_INSTANCE_FORM,
  image: process.env.NEXT_PUBLIC_INSTANCE_IMAGE,
  workflow: process.env.NEXT_PUBLIC_INSTANCE_WORKFLOW,
  'mindcache-editor': process.env.NEXT_PUBLIC_INSTANCE_EDITOR,
};

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
  isLoading: false,
  error: null,
  getInstanceId: () => undefined,
});

export function InstanceProvider({ children }: { children: React.ReactNode }) {
  // Filter out undefined values
  const instances = Object.fromEntries(
    Object.entries(INSTANCES).filter(([, v]) => v !== undefined)
  ) as Record<string, string>;

  const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || null;
  
  const error = Object.keys(instances).length === 0 
    ? 'No instance IDs configured. Set NEXT_PUBLIC_INSTANCE_* in .env.local'
    : null;

  const getInstanceId = (demoName: string) => instances[demoName];

  console.log('☁️ Using configured instances:', instances);

  return (
    <InstanceContext.Provider value={{ 
      instances, 
      projectId, 
      isLoading: false, 
      error, 
      getInstanceId 
    }}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstances() {
  return useContext(InstanceContext);
}
