'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type HelpLang = 'en' | 'zh';

const STORAGE_KEY = 'help-lang';

interface HelpLangContextValue {
  lang: HelpLang;
  setLang: (lang: HelpLang) => void;
}

const HelpLangContext = createContext<HelpLangContextValue>({
  lang: 'en',
  setLang: () => undefined,
});

function isHelpLang(value: string | null): value is HelpLang {
  return value === 'en' || value === 'zh';
}

/**
 * Language for the help portal only (independent of ERP UI locale).
 * This file exports only the provider + hook (Fast Refresh safe).
 */
export function HelpLangProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [lang, setLangState] = useState<HelpLang>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isHelpLang(saved)) {
        setLangState(saved);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = useCallback((next: HelpLang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return (
    <HelpLangContext.Provider value={value}>{children}</HelpLangContext.Provider>
  );
}

export function useHelpLang(): HelpLangContextValue {
  return useContext(HelpLangContext);
}
