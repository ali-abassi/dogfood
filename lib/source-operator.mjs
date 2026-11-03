import { validationError } from './store.mjs';
import { requestProjectFromCheckout } from './board-context.mjs';

// Accidental self-approval guard, not a sandbox against the same local OS user.
export function nativeRequestContext() {
  return Boolean(process.env.DOGFOOD_NATIVE_REQUEST || requestProjectFromCheckout(process.cwd()));
}

export function assertSourceOperator() {
  if (nativeRequestContext()) throw Object.assign(validationError('Applying or saving source is an explicit operator action. Native request agents cannot integrate their own work.'), { status: 403 });
}
