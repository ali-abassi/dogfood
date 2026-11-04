import { escapeHtml } from '../format.mjs';
import { isNative } from '../platform.mjs';
export function nativeEvidenceMarkup(page) {
  if (!isNative(page)) return '';
  const check = page.nativeCheck;
  if (!check) return '<section class="content-panel native-evidence"><h2>App check</h2><p>No device check has been recorded for this screen yet. Ask the QA agent to inspect the installed app and attach its screenshot, build and device evidence.</p><p class="field-hint">Capture this screen on the Simulator to begin its review.</p></section>';
  const matched = check.build.sourceProof === 'matched';
  return `<section class="content-panel native-evidence"><h2>App check</h2><p><strong>${matched ? 'Build source recorded' : 'Installed build not matched to source'}</strong></p><p>${escapeHtml(check.device.name)} · ${escapeHtml(check.device.os)} · App ${escapeHtml(check.app.version)} (${escapeHtml(check.app.build)})</p><p>${escapeHtml(check.build.note)}</p><details><summary>Build and device details</summary><dl class="facts"><div><dt>App</dt><dd>${escapeHtml(check.app.bundleId)}</dd></div><div><dt>Simulator</dt><dd>${escapeHtml(check.device.simulatorUDID)}</dd></div><div><dt>Checked</dt><dd>${escapeHtml(check.checkedAt)}</dd></div><div><dt>Source fingerprint</dt><dd><code>${escapeHtml(check.sourceFingerprint)}</code></dd></div></dl></details><p class="field-hint">This is a recorded screen state. Voice, network, purchases and other behavior need their own observed feature checks. The acceptance gate also checks whether this evidence is current.</p></section>`;
}
