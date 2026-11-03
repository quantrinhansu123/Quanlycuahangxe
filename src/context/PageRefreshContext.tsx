/* This module intentionally colocates the provider with its small page-action hooks. */
/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

type RefreshHandler = () => void | Promise<void>;

interface PageRefreshContextValue {
  canRefresh: boolean;
  isRefreshing: boolean;
  registerRefreshHandler: (handler: RefreshHandler) => () => void;
  refreshCurrentPage: () => Promise<void>;
}

const PageRefreshContext = createContext<PageRefreshContextValue | null>(null);
const noRefreshHandler = () => () => {};
const noRefresh = async () => {};
const emptyPageRefreshContext: PageRefreshContextValue = {
  canRefresh: false,
  isRefreshing: false,
  registerRefreshHandler: noRefreshHandler,
  refreshCurrentPage: noRefresh,
};

export const PageRefreshProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const handlerRef = useRef<RefreshHandler | null>(null);
  const refreshingRef = useRef(false);
  const [canRefresh, setCanRefresh] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const registerRefreshHandler = useCallback((handler: RefreshHandler) => {
    handlerRef.current = handler;
    setCanRefresh(true);

    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
        setCanRefresh(false);
      }
    };
  }, []);

  const refreshCurrentPage = useCallback(async () => {
    const handler = handlerRef.current;
    if (!handler || refreshingRef.current) return;

    refreshingRef.current = true;
    setIsRefreshing(true);
    try {
      await handler();
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, []);

  return (
    <PageRefreshContext.Provider value={{ canRefresh, isRefreshing, registerRefreshHandler, refreshCurrentPage }}>
      {children}
    </PageRefreshContext.Provider>
  );
};

export function usePageRefreshActions(): PageRefreshContextValue {
  return useContext(PageRefreshContext) ?? emptyPageRefreshContext;
}

export function useRegisterPageRefresh(handler: RefreshHandler): void {
  const { registerRefreshHandler } = usePageRefreshActions();
  const handlerRef = useRef(handler);

  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  const stableHandler = useCallback(async () => {
    await handlerRef.current();
  }, []);

  useEffect(() => registerRefreshHandler(stableHandler), [registerRefreshHandler, stableHandler]);
}
