export type FrontendConfig = {
  backend_url: string;
  auto_refresh: boolean;
  confirm_render: boolean;
  compact_navigation: boolean;
};

export const DEFAULT_FRONTEND_CONFIG: FrontendConfig = {
  backend_url: "http://localhost:8765",
  auto_refresh: true,
  confirm_render: true,
  compact_navigation: false,
};

const STORAGE_KEY = "story-maker-frontend-config";
// localStorage "storage" event KHÔNG bắn ra ở tab vừa gọi setItem — chỉ bắn ở các tab khác.
// Nên tự bắn thêm CustomEvent để các component khác trong CÙNG tab cũng cập nhật ngay lập tức.
const LOCAL_CHANGE_EVENT = "story-maker-frontend-config-changed";

/**
 * Đọc config hiện tại từ localStorage. Dùng được ở bất kỳ đâu (component, helper,
 * hàm gọi API...), không chỉ trong React component.
 */
export function getFrontendConfig(): FrontendConfig {
  if (typeof window === "undefined") return DEFAULT_FRONTEND_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_FRONTEND_CONFIG, ...JSON.parse(raw) } : DEFAULT_FRONTEND_CONFIG;
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return DEFAULT_FRONTEND_CONFIG;
  }
}

/**
 * Ghi config mới vào localStorage và thông báo cho mọi listener (context, hook...)
 * trong cùng tab cập nhật lại ngay.
 */
export function setFrontendConfig(config: FrontendConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent<FrontendConfig>(LOCAL_CHANGE_EVENT, { detail: config }));
}

/**
 * Lắng nghe thay đổi config — từ tab khác (storage event) hoặc từ chính tab này
 * (custom event). Trả về hàm unsubscribe để dùng trong useEffect cleanup.
 */
export function subscribeFrontendConfig(callback: (config: FrontendConfig) => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleLocalChange = (event: Event) => {
    callback((event as CustomEvent<FrontendConfig>).detail);
  };
  const handleCrossTabChange = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) callback(getFrontendConfig());
  };

  window.addEventListener(LOCAL_CHANGE_EVENT, handleLocalChange);
  window.addEventListener("storage", handleCrossTabChange);

  return () => {
    window.removeEventListener(LOCAL_CHANGE_EVENT, handleLocalChange);
    window.removeEventListener("storage", handleCrossTabChange);
  };
}