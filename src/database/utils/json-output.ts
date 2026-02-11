/**
 * JSON Output Utilities
 * Helpers for formatting command output as JSON
 */

export interface JsonResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Create a successful JSON response
 */
export function jsonSuccess<T>(data: T): JsonResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create an error JSON response
 */
export function jsonError(error: string | Error): JsonResponse {
  return {
    success: false,
    error: error instanceof Error ? error.message : error,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Output JSON response to console
 */
export function outputJson(response: JsonResponse): void {
  console.log(JSON.stringify(response, null, 2));
}

/**
 * Check if JSON mode is enabled
 */
export function isJsonMode(options: any): boolean {
  return options.json === true;
}
