import { validationError } from './store.mjs';
import { requestProjectFromCheckout } from './board-context.mjs';

// Accidental self-approval guard, not a sandbox against the same local OS user.
export function nativeRequestContext() {
  return Boolean(process.env.DOGFOOD_NATIVE_REQUEST || requestProjectFromCheckout(process.cwd()));
}

export function assertSourceOperator(action = 'Applying or saving source') {
  if (nativeRequestContext()) throw Object.assign(validationError(`${action} is an explicit operator action. Native request agents must return their work for independent review.`), { status: 403 });
}
