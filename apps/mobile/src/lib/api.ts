import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL!;

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface ApiOptions {
  method?: HttpMethod;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Mobile API クライアント
 * Bearer token認証でサーバー側Action endpointを呼び出す
 */
export async function mobileApi<T = unknown>(
  path: string,
  options: ApiOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new ApiError("認証が必要です", 401);
  }

  const url = `${API_BASE_URL}/api/mobile${path}`;

  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...headers,
    },
  };

  if (body && method !== "GET") {
    fetchOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, fetchOptions);

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new ApiError(
      errorBody.error || `API Error: ${response.status}`,
      response.status,
      errorBody
    );
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}
