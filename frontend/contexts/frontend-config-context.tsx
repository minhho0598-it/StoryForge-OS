"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_FRONTEND_CONFIG,
  getFrontendConfig,
  setFrontendConfig,
  subscribeFrontendConfig,
  type FrontendConfig,
} from "@/lib/frontend-config";

type FrontendConfigContextValue = {
  /** Config đã lưu (đã áp dụng), mọi component đọc từ đây để hiển thị / dùng logic. */
  config: FrontendConfig;
  /** Ghi đè toàn bộ config và lưu ngay vào localStorage + phát cho các component khác. */
  saveConfig: (config: FrontendConfig) => void;
};

const FrontendConfigContext = createContext<FrontendConfigContextValue | null>(null);

/**
 * Đặt Provider này ở layout gốc (app/layout.tsx), bao ngoài toàn bộ app, để mọi
 * trang (Settings, Writer Room, Studio, Architecture...) dùng chung một nguồn config.
 */
export function FrontendConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<FrontendConfig>(DEFAULT_FRONTEND_CONFIG);

  useEffect(() => {
    setConfigState(getFrontendConfig());
    return subscribeFrontendConfig(setConfigState);
  }, []);

  const value = useMemo<FrontendConfigContextValue>(
    () => ({
      config,
      saveConfig: (next) => {
        setConfigState(next);
        setFrontendConfig(next);
      },
    }),
    [config]
  );

  return <FrontendConfigContext.Provider value={value}>{children}</FrontendConfigContext.Provider>;
}

export function useFrontendConfig(): FrontendConfigContextValue {
  const ctx = useContext(FrontendConfigContext);
  if (!ctx) throw new Error("useFrontendConfig() phải được gọi bên trong <FrontendConfigProvider>.");
  return ctx;
}