import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'hscan.activeOrigins';

type StorageShape = {
  [STORAGE_KEY]?: unknown;
};

interface ActiveOriginState {
  currentOrigin: string | null;
  enabled: boolean;
  loading: boolean;
  error: string | null;
  setEnabled: (enabled: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useActiveOrigins(): ActiveOriginState {
  const [activeOrigins, setActiveOrigins] = useState<string[]>([]);
  const [currentOrigin, setCurrentOrigin] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enabled = useMemo(
    () => Boolean(currentOrigin && activeOrigins.includes(currentOrigin)),
    [activeOrigins, currentOrigin],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [origins, origin] = await Promise.all([readActiveOrigins(), getCurrentTabOrigin()]);
      setActiveOrigins(origins);
      setCurrentOrigin(origin);
    } catch (err) {
      setError(err instanceof Error ? err.message : '활성화 상태를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  const setEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (!currentOrigin) return;
      setError(null);
      const nextOrigins = nextEnabled
        ? Array.from(new Set([...activeOrigins, currentOrigin]))
        : activeOrigins.filter((origin) => origin !== currentOrigin);
      setActiveOrigins(nextOrigins);
      try {
        await writeActiveOrigins(nextOrigins);
      } catch (err) {
        setActiveOrigins(activeOrigins);
        setError(err instanceof Error ? err.message : '활성화 상태를 저장하지 못했습니다.');
      }
    },
    [activeOrigins, currentOrigin],
  );

  useEffect(() => {
    void refresh();

    const onActivated = () => void refresh();
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (changeInfo.url) void refresh();
    };
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
      setActiveOrigins(normalizeOrigins(changes[STORAGE_KEY].newValue));
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.storage.onChanged.addListener(onStorageChanged);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.storage.onChanged.removeListener(onStorageChanged);
    };
  }, [refresh]);

  return {
    currentOrigin,
    enabled,
    loading,
    error,
    setEnabled,
    refresh,
  };
}

async function readActiveOrigins(): Promise<string[]> {
  const values = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeOrigins((values as StorageShape)[STORAGE_KEY]);
}

async function writeActiveOrigins(origins: string[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeOrigins(origins) });
}

async function getCurrentTabOrigin(): Promise<string | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) return null;
  return toOrigin(tab.url);
}

function toOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function normalizeOrigins(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((origin): origin is string => {
        if (typeof origin !== 'string') return false;
        return toOrigin(origin) === origin;
      }),
    ),
  );
}

export const activeOriginsStorageKey = STORAGE_KEY;
