import { getFrontendConfig } from "@/lib/frontend-config";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type ApiResponse<T = unknown> = { success: boolean; data: T; [key: string]: unknown };

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  // Luôn đọc backend_url MỚI NHẤT tại thời điểm gọi — không cache, không hardcode.
  const backendUrl = getFrontendConfig().backend_url.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${backendUrl}${normalizedPath}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
  } catch {
    throw new ApiError(
      `Không kết nối được tới Backend tại ${backendUrl}. Hãy kiểm tra Backend đang chạy và địa chỉ trong Cài đặt.`
    );
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = await response.json();
  } catch {
    // Body rỗng hoặc không phải JSON (ví dụ 204) — bỏ qua, xử lý dựa vào response.ok ở dưới.
  }

  if (!response.ok) {
    const detail =
      (payload as { detail?: string; message?: string } | null)?.detail ??
      (payload as { detail?: string; message?: string } | null)?.message;
    throw new ApiError(detail || `Backend trả lỗi (HTTP ${response.status}).`, response.status);
  }
  if (payload && payload.success === false) {
    throw new ApiError((payload as { message?: string }).message || "Backend từ chối yêu cầu.");
  }

  return payload ?? ({ success: true, data: undefined as T } as ApiResponse<T>);
}

export const apiClient = {
  get: <T = unknown>(path: string) => request<T>(path, { method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T = unknown>(path: string) => request<T>(path, { method: "DELETE" }),
};