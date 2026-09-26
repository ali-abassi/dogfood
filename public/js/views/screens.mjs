import { escapeHtml, externalLinkMarkup, relativeCaptureAge, safeCapturePath, safeServedImagePath } from '../format.mjs';
import { deviceNames, state } from '../state.mjs';
import { backMarkup } from './answer.mjs';

function deviceSwitchMarkup() {
  const buttons = Object.entries(deviceNames).map(([device, label]) => `<button type="button" data-action="screens-device" data-screens-device="${device}" aria-pressed="${state.screensDevice === device}">${label}</button>`).join('');
  return `<div class="device-switch" role="group" aria-label="Screenshot">${buttons}</div>`;
}

function fullScreenshotMarkup(page, device) {
  const capture = page.captures[device];
  const image = capture.state === 'rendered' ? safeCapturePath(capture.path) : '';
  if (!image) return `<p class="screen-missing">${escapeHtml(capture.reason || 'No screenshot yet.')}</p>`;
  return `<figure class="full-screen full-screen-${device}"><img data-screenshot data-screens-image src="${image}" alt="The whole ${escapeHtml(page.name)} page on a ${escapeHtml(deviceNames[device].toLowerCase())}" width="${escapeHtml(capture.pixelWidth)}" height="${escapeHtml(capture.pixelHeight)}"><figcaption>${escapeHtml(relativeCaptureAge(capture))} · <a href="${image}" target="_blank" rel="noopener">Open full size ↗</a></figcaption></figure>`;
}

function changeFigureMarkup(page, device, kind, path, caption) {
  const image = safeServedImagePath(path);
  if (!image) return '';
  return `<figure class="change-figure"><a href="${image}" target="_blank" rel="noopener"><img data-change-image="${kind}" src="${image}" alt="${escapeHtml(`${caption}: ${page.name} on a ${deviceNames[device].toLowerCase()}`)}" loading="lazy"></a><figcaption>${escapeHtml(caption)}</figcaption></figure>`;
}

function changeWords(device, change) {
  const share = Math.max(1, Math.round(change.changedShare * 100));
  const size = change.sizeChanged ? 'The page changed size, and about' : 'About';
  return `${deviceNames[device]}: ${size} ${share}% of the page looks different.`;
}

function changeDeviceMarkup(page, device) {
  const change = page.scan.changes[device];
  if (!change.changed) return `<p class="change-same">${escapeHtml(deviceNames[device])}: looks the same as the last check.</p>`;
  const figures = [
    changeFigureMarkup(page, device, 'previous', change.previousPath, 'Before'),
    changeFigureMarkup(page, device, 'current', page.captures[device].path, 'Now'),
    changeFigureMarkup(page, device, 'diff', change.diffPath, 'What changed'),
  ].join('');
  return `<div class="change-device"><h3>${escapeHtml(changeWords(device, change))}</h3><div class="change-images">${figures}</div></div>`;
}

function changesMarkup(page) {
  const changes = page.scan?.changes;
  const devices = ['desktop', 'mobile'].filter(device => changes?.[device]);
  if (!devices.length) return '';
  return `<section class="content-panel" aria-label="What changed"><h2>What changed since the last check</h2>${devices.map(device => changeDeviceMarkup(page, device)).join('')}</section>`;
}

export function screensMarkup(page) {
  const source = externalLinkMarkup(page.captures.desktop.sourceUrl, 'Open the real page ↗', 'link-button');
  return `<section class="screens-view" data-screens aria-labelledby="answer-heading">${backMarkup(page)}<div class="screens-heading"><h1 id="answer-heading" tabindex="-1">How it looks</h1>${source}</div><div class="screens-toolbar">${deviceSwitchMarkup()}</div><section class="content-panel full-screen-panel" aria-label="${escapeHtml(deviceNames[state.screensDevice])} screenshot">${fullScreenshotMarkup(page, state.screensDevice)}</section>${changesMarkup(page)}</section>`;
}
