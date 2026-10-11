/** User-facing message of a caught error (store actions throw `DomainError` / `ApiError` with Chinese text). */
export function getErrorMessage(error: unknown, fallback = "操作失败，请稍后再试") {
  return error instanceof Error && error.message ? error.message : fallback;
}
