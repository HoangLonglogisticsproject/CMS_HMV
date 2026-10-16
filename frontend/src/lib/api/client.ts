import createClient, { type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

/**
 * Typed client for the NestJS API. Paths, params, bodies and responses all come from the generated
 * `schema.d.ts` (`pnpm api:generate`), so contract drift becomes a compile error.
 *
 * The browser talks to the API origin directly (CORS + credentials). A Next.js rewrite proxy is not used:
 * it does not forward the client IP, which would turn per-IP login rate limiting into a global limit.
 */
/**
 * The generated paths already start with the API's global prefix (`/api/v1/...`), so the client base must be the
 * API *origin*. `NEXT_PUBLIC_API_URL` is accepted with or without a trailing `/api/v1` (older `.env.local` files
 * used the full base URL, which produced `/api/v1/api/v1/...`).
 */
export function apiOrigin(value = "http://localhost:4000") {
  return value.trim().replace(/\/+$/, "").replace(/\/api\/v1$/, "");
}

export const API_URL = apiOrigin(process.env.NEXT_PUBLIC_API_URL);

export type Schemas = components["schemas"];
export type ApiErrorCode = Schemas["ErrorResponse"]["code"] | "NETWORK_ERROR";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isApiError = (err: unknown, code?: ApiErrorCode): err is ApiError =>
  err instanceof ApiError && (code === undefined || err.code === code);

// ---------- CSRF token (in memory only; re-read from GET /auth/session after a reload) ----------

let csrfToken: string | null = null;
export const setCsrfToken = (token: string | null) => {
  csrfToken = token;
};
export const getCsrfToken = () => csrfToken;

// ---------- Session expiry signal ----------

const expiredListeners = new Set<() => void>();
/** Fires when a protected request answers 401: the session expired or was revoked. */
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener);
  return () => void expiredListeners.delete(listener);
}

// ---------- Permission change signal ----------

const deniedListeners = new Set<() => void>();
/** Fires when a request answers 403 PERMISSION_DENIED: the permissions on screen are older than the server's. */
export function onPermissionDenied(listener: () => void) {
  deniedListeners.add(listener);
  return () => void deniedListeners.delete(listener);
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AUTH_PATHS = ["/api/v1/auth/login", "/api/v1/auth/session"];

const middleware: Middleware = {
  onRequest({ request }) {
    if (UNSAFE.has(request.method) && csrfToken) request.headers.set("X-CSRF-Token", csrfToken);
    return request;
  },
  onResponse({ request, response }) {
    if (response.status === 401 && !AUTH_PATHS.some((p) => new URL(request.url).pathname === p)) {
      expiredListeners.forEach((listener) => listener());
    }
    return response;
  },
};

export const api = createClient<paths>({ baseUrl: API_URL, credentials: "include" });
api.use(middleware);

function toApiError(status: number, body: unknown): ApiError {
  const e = body as Partial<Schemas["ErrorResponse"]> | undefined;
  const err =
    e && typeof e.code === "string"
      ? new ApiError(status, e.code, e.message ?? e.code, e.details)
      : new ApiError(status, status === 401 ? "UNAUTHENTICATED" : "INTERNAL_ERROR", `HTTP ${status}`);
  if (err.code === "PERMISSION_DENIED") deniedListeners.forEach((listener) => listener());
  return err;
}

/** Awaits an openapi-fetch call and returns its data, or throws ApiError (network failures included). */
export async function call<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  let result: Awaited<typeof request>;
  try {
    result = await request;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, "NETWORK_ERROR", "Không kết nối được tới máy chủ API");
  }
  if (!result.response.ok) throw toApiError(result.response.status, result.error);
  return result.data as T;
}

/**
 * Multipart upload with progress (fetch cannot report upload progress). Same cookie + CSRF rules as `api`.
 */
export function uploadFile<T>(
  path: keyof paths & string,
  form: FormData,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    xhr.withCredentials = true;
    xhr.responseType = "json";
    if (csrfToken) xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response as T);
      if (xhr.status === 401) expiredListeners.forEach((listener) => listener());
      reject(toApiError(xhr.status, xhr.response));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK_ERROR", "Không kết nối được tới máy chủ API"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}
