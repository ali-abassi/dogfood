# Review native apps and generated publications

Dogfood tracks iOS screens beside web pages and CLI-generated publications. A platform profile
chooses the evidence required by the page gate. It does not build an app, launch a Simulator,
prove a deployment or certify an integration.

| Profile | Default capture coverage | Evidence |
| --- | --- | --- |
| `web` (also the default for existing projects) | Computer and phone | Browser screenshots and page measurements |
| `ios` | Mobile only; desktop is invalid | Simulator PNG, app/device identity and native build/check receipt |
| `cli` | Computer and phone | Browser review of generated output; CLI behavior needs separate command checks |

For a deliberately desktop-only web product or publication, set `captureDevices: ["desktop"]`.
This records computer coverage; it does not measure or review a phone. Review Dogfood's own
dashboard at 1280 and 390 wide independently of the product's required devices.

## Configure an existing iOS project

Register the committed app checkout with `dogfood init` first. Use the same `DOGFOOD_DATA` for CLI,
MCP and dashboard. Inspect the shipped schemas, then save the JSON below as `ios-project.json`,
replacing the example project ID and bundle with the real values:

```sh
dogfood schema dogfood_configure_project
dogfood schema dogfood_record_native_check
```

```json
{
  "project": "my-app",
  "by": "qa-operator",
  "source": {"platform": "ios", "captureDevices": ["mobile"], "bundleId": "com.example.MyApp", "url": null}
}
```

```sh
dogfood tool dogfood_configure_project --input ios-project.json
```

Configuration preserves existing pages and QA history. An evidence-profile change can invalidate
earlier proof. Optional `checkout` must point to an existing directory. Evidence binds the full Git checkout
fingerprint returned by Dogfood.

Save a screen definition as `library-page.json`, with actual features and untested boundaries:

```json
{
  "project": "my-app",
  "page": {
    "id": "library", "name": "Library", "group": "App", "route": "/library",
    "url": "ios://com.example.MyApp/library",
    "features": [{"id": "open-item", "name": "Open a saved item", "expected": "The selected item opens with its stored content."}],
    "untestedNote": "Physical-device behavior and hosted services require separate observed checks."
  }
}
```

```sh
dogfood tool dogfood_register_page --input library-page.json
dogfood tool dogfood_page --input library-id.json
```

`library-id.json` contains `{"project":"my-app","page":"library"}`. Read
`progress.checkoutFingerprint` immediately before collecting evidence. `ios://BUNDLE/SCREEN`
identifies a registered screen; it is not a browser URL or proof of an app deep link. Without an
explicit page URL, `/library` derives that same identity. Screen paths allow letters, digits,
`/`, `_` and `-`, without query, fragment or `..` segments. Replace any old HTTP page URL explicitly
when converting a web page to a native screen.

## Record the actual Simulator screen

Use the existing authorized Simulator and preserve its data. Build/install and exercise the app
with its own tooling. Record the actual bundle/version/build, Simulator UDID/name/OS, PNG and
how the installed executable was linked to the source you inspected. Dogfood imports receipts;
it does not perform those actions or independently verify the build narrative.

Save `native-check.json`. This is an **unaccepted unknown-build example**, not a test result.
Replace every placeholder with observed values, including the current 64-character SHA-256
source fingerprint. If that fingerprint itself is unavailable, resolve the gap before importing.

```json
{
  "project": "my-app", "page": "library",
  "file": "/absolute/path/to/actual-library.png",
  "sourceUrl": "ios://com.example.MyApp/library",
  "actor": "qa-operator", "sourceFingerprint": "CURRENT_CHECKOUT_SHA256",
  "app": {"bundleId": "com.example.MyApp", "version": "OBSERVED_VERSION", "build": "OBSERVED_BUILD"},
  "device": {"simulatorUDID": "OBSERVED_SIMULATOR_UUID", "name": "OBSERVED_DEVICE_NAME", "os": "OBSERVED_OS"},
  "build": {"sourceProof": "unknown", "note": "The installed executable has not yet been matched to the reviewed source."}
}
```

```sh
dogfood tool dogfood_record_native_check --input native-check.json
dogfood tool dogfood_page --input library-id.json
```

For a genuinely matched build, replace `build` with these fields, using actual values:

```json
{
  "sourceProof": "matched", "sourceFingerprint": "SAME_CURRENT_CHECKOUT_SHA256",
  "artifactFile": "/absolute/path/to/built/MyApp.app/MyApp",
  "artifactSha256": "ACTUAL_EXECUTABLE_SHA256",
  "note": "Describe the observed build, install and executable comparison linking this installed app to this exact source."
}
```

`artifactFile` is the executable, not the `.app` directory. Dogfood reads its bytes and verifies
`artifactSha256`; the build fingerprint must equal the current source fingerprint. A matching
file hash alone does not prove the Simulator runs those bytes: establish that connection and
explain it in the note. Native evidence notes require 12–1200 characters.

Optional `checks` contains only `launch`, `accessibility` and `logs`. Each supplied check requires
an observed `status` (`pass` or `needs_work`) and specific `note`. `launch` also requires measured
`milliseconds` between 0 and 600000. Omit checks you did not perform; they remain untested.
A successful build does not prove an observed launch; a screenshot does not prove accessibility.

The report shows one mobile image with app/build/device provenance. Full-screen review defaults
to mobile and supports pinned feedback tied to its screenshot hash. Use the native importer
instead of HTTP scans or fabricated computer images. Unknown build source cannot pass the native
check. Source or profile changes and mismatched image/build/device receipts invalidate current
acceptance. Features, audit questions and findings must also satisfy the gate.

The importer currently requires a Simulator UDID. Physical-device QA, microphone/audio, reminders,
purchases, accounts, hosted services, signing and distribution need their own observed evidence.
Simulator screenshots and local build receipts do not prove those capabilities.

## Review a CLI-generated publication

Keep the CLI's product checkout registered; configure `platform: "cli"` and point `url` to its
served generated output. Explicitly declare `servesCheckout: true` only after verifying that output
was generated by the registered source. Loopback location alone does not prove that relationship.
For example, the `source` part of `dogfood_configure_project` can be:

```json
{
  "platform": "cli", "captureDevices": ["desktop"],
  "url": "http://127.0.0.1:8080", "servesCheckout": true,
  "environment": "Locally generated publication"
}
```

Review real generated pages through browser QA. Use separate task-command receipts for
initialization, validation, generation and invalid-input handling. Label synthetic fixtures:
they prove only their controlled workflow. A local publication or passing scan does not prove
public hosting, indexing, ranking, email delivery or paid services.

## Choose current projects without discarding history

`dogfood_portfolio` reads current coverage and history. `dogfood_set_active_projects` selects
1–50 unique registered project IDs in order. It changes the current list, not project QA.

```sh
dogfood tool dogfood_portfolio --input empty.json
dogfood tool dogfood_set_active_projects --input portfolio.json
```

`empty.json` contains `{}`. On the first save, `portfolio.json` can contain:

```json
{"agent":"operator","input":{"projects":["my-app","my-publication"]}}
```

Later saves require the latest portfolio response's `revision` as `input.expectedRevision`.
Stale writes conflict; reread and review before saving again. This is an operator action;
recognized native request contexts cannot change the list. Current projects get dashboard cards.
The picker shows Current projects and the Dogfood workspace. Omitted projects retain their pages,
evidence and conversations through saved URLs, CLI and API access, without cluttering the picker.
A saved URL can still open an earlier project; an ordinary app entry ignores a remembered project
outside the current list. A failed portfolio load does not silently repopulate old projects.
