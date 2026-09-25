# Page audit model research — 2026-09-24

Scope: literal GitHub code searches for `robots.txt`, `is-crawlable`, and OWASP anti-automation requirements; inspect maintained source, then adapt only the checklist mechanics. No code copied.

| Rank | Candidate | Source reality and activity | License | Verdict |
|---|---|---|---|---|
| 1 | [GoogleChrome/lighthouse](https://github.com/GoogleChrome/lighthouse), `08c05cd` (2026-09-18) | `core/audits/seo/is-crawlable.js` checks both response headers and meta directives by user agent; `core/audits/seo/robots-txt.js` checks robots syntax and fetch failures. Active code and test infrastructure. | Apache 2.0 | Steal now: distinguish indexability from robots policy; port as prompts only, about 3 checklist rows, no dependency. |
| 2 | [OWASP/ASVS](https://github.com/OWASP/ASVS), `2b30071` | `5.0/en/0x17-V8-Authorization.md` covers access control, `0x11-V2-Validation-and-Business-Logic.md` V2.4.1 covers anti-automation/data extraction, and `0x23-V14-Data-Protection.md` covers sensitive data. Current, maintained standard. | CC BY-SA 4.0 | Steal now: page-scoped verification prompts for access, data exposure, and abuse; paraphrase requirements, no code. |
| 3 | [Lissy93/web-check](https://github.com/Lissy93/web-check), `7c5fdee` (2026-09-20) | Inspected `src/components/homepage/Screenshots.astro`; robots, headers, and security.txt appear as separate website check examples, but no load-bearing audit source in this sparse snapshot. | MIT | Bank category separation only; no implementation port or verification claim. |

Official cross-check: [Google Search Central noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing) says `noindex` controls indexing while `robots.txt` controls crawling, and a blocked crawler may never see the `noindex` directive. [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) treats authorization, data protection, and anti-automation as distinct requirements. Public content remains copyable; do not label an untested mitigation as effective.

Smallest implementation: keep editable per-page check rows with `untested` default and evidence notes, and a separate source-provenance API map. No crawler, scanner, or new package is needed for this local review workspace.
