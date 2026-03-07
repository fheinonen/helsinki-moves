export interface OkResult<T> {
  ok: true;
  value: T;
}

export interface ErrorResult<E> {
  error: E;
  ok: false;
}

export type Result<T, E> = ErrorResult<E> | OkResult<T>;

export function ok<T>(value: T): OkResult<T> {
  return { ok: true, value };
}

export function error<E>(value: E): ErrorResult<E> {
  return { ok: false, error: value };
}
