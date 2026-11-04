import { state } from './state.mjs';
export function isNative(page) { return (page?.platform || state.project?.source?.platform) === 'ios'; }
function sourceDevices() { return state.project?.source?.captureDevices; }
function defaultDevices(page) { return isNative(page) ? ['mobile'] : ['desktop', 'mobile']; }
export function requiredDevices(page) { const selected = page?.requiredDevices || sourceDevices(); return selected || defaultDevices(page); }
function defaultDeviceName(device, page) { return isNative(page) && device === 'mobile' ? 'iPhone / Simulator' : { desktop: 'Computer', mobile: 'Phone' }[device]; }
export function deviceName(device, page) { const labels = page?.deviceLabels; return labels ? labels[device] : defaultDeviceName(device, page); }
export function ensureScreenDevice(page) { if (!requiredDevices(page).includes(state.screensDevice)) state.screensDevice = requiredDevices(page)[0]; }
