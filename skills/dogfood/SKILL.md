---
name: dogfood
description: Check whether every page of a web app works, page by page, with dogfood, and show the owner six plain answers per page. Use when someone asks to QA their app, to check whether their app or site is working, or to set up or use dogfood.
---

# Check an app with dogfood

The person you are helping built an app and wants to know if it works. They may not be technical. dogfood gives every page of their app a screenshot on a computer and a phone, and six plain answers:

| Answer | The question it answers | Where the answer comes from |
|---|---|---|
| Looks right | Does it look finished and match the rest of the app? | The AI check of the screenshots, or your verdict `design` |
| Clear purpose | Is it clear why this page exists? | The AI check, or your verdict `purpose` |
| Easy to use | Can people find and do things easily, on a phone and a computer? | The AI check or your verdict `ease`, the page check (sideways scrolling, unnamed buttons), and the accessibility questions |
| Safe | Is it protected from hackers and from people copying its data? | The security and scraping questions |
| Fast & findable | Does it load quickly and show up properly in search? | The page check's load time and the search questions |
| Works as expected | Does everything you can do here work, with no bugs? | Your verdict on each thing a person can do there, open bugs, and errors the page check found |

Your job: set dogfood up, add the app, write down what people can do on each page, answer the six questions with real evidence, and tell the person what you found. A page is not done until `dogfood_complete` accepts it.

## 1. Set up dogfood (once)

You need Node 20 or newer.

```sh
git clone https://github.com/ali-abassi/dogfood.git ~/dogfood   # skip if it is already there
npm install --global agent-browser && agent-browser install      # the browser dogfood uses to check pages
cd ~/dogfood && npm start                                        # keep it running; the app is at http://127.0.0.1:4321
```

If port 4321 is taken, start it with another, for example `DOGFOOD_PORT=4400 npm start`, and use that address everywhere below.

Every step below names a dogfood tool. Call it either way:

- **MCP (preferred for long work).** Register it once, for example `claude mcp add --scope user dogfood -- node ~/dogfood/mcp.mjs` in Claude Code. Most clients load new MCP servers only in a new session.
- **Shell (works right away).** `node ~/dogfood/mcp.mjs <tool> '<json arguments>'` runs one tool and prints its result, for example `node ~/dogfood/mcp.mjs dogfood_next '{"project":"my-app"}'`. A failure exits with status 1 and says why.

Every tool that changes something takes an `agent` argument: your name, for example `"agent": "claude"`. dogfood records who did what, and shows the person which answers came from you.

Keep dogfood's data where it is (`~/dogfood/data`, which git ignores). Never edit `data/projects/*.json` by hand: dogfood signs every change it writes and flags edits made outside it.

## 2. Add the app

1. Ask the person for the app's address: a local dev server such as `http://localhost:3000` or the live site. Ask whether some pages need signing in; if they do, ask which Chrome profile is signed in (usually `Default`).
2. The AI check costs about half a cent per page. Say so and ask before the first time you use it. A yes covers this app until they say otherwise.
3. Call `dogfood_onboard_project` with `url`, a `name`, and `browserProfile` when needed. Leave `confirmAiReviewUsage` out: it would run the AI check on every page it finds, before you can remove duplicates. Onboarding finds the pages, takes both screenshots of each, and measures them.
4. Read the page list it returns. Remove anything that is not a real page (a duplicate, a redirect, a file) with `dogfood_remove_page` and a reason. Add important pages it could not find, such as pages behind sign-in or inside a single-page app, with `dogfood_register_page` (give `url` for hash routes like `https://app.example/#/billing`, and `untestedNote` for what you will not be able to check there), then `dogfood_scan_page`.
5. If the person said yes to the AI check, run `dogfood_ai_review` with `confirmUsage: true` on each real page now. Stay within any page limit they gave you.

## 3. Write down what people can do on each page

For each page, list the things a person comes there to do, each with what should happen when it works. These are what Works as expected checks.

- Name them as jobs, in a few words: "Book a lesson for a child", "Compare plans by price", "Reset a forgotten password". A menu, a button, a link, a header, or a form field is never one.
- Read the app's code for each route (what the page loads, what its forms send, what its handlers do) and write what should happen end to end: "The booking is saved, the slot disappears for others, and a confirmation email arrives."
- `dogfood_suggestions` lists what the AI check proposed, for the whole project at once (call it once, not per page). Keep the ones that match the code, reword the rest, and add them with `dogfood_add_features`.
- Usually two to five per page. Show the person the list for any page where you are unsure what it is for, and use their words.

## 4. Answer the six questions, page by page

Work through `dogfood_next` in order. It lists each unfinished page with what is missing and the tool that answers it. Record answers with `dogfood_record_verdicts`, passing your agent name. Every Good or Needs work needs a note.

**Write notes a non-technical person understands.** Start with what you did and what you saw: "Pressed Reserve with a real email on a phone; the confirmation showed and the email arrived within a minute." Do not start with tooling, URLs, or commit hashes.

- **Looks right, Clear purpose, Easy to use.** A current AI check (step 2.5) answers all three from both screenshots; after a page changes, run `dogfood_ai_review` again if the person agreed to the cost. Then open the page yourself. Confirm or correct the AI with `checks.design`, `checks.purpose`, or `checks.ease` whenever you saw something it could not, such as a layout that breaks while you use it. Your verdict outranks the AI's.
- **Easy to use** also needs the accessibility questions (`audit.accessibility`). Tab through the page, check that buttons, fields, and images have names, check contrast in each theme the app has (light, and dark if it has one), and zoom to 200%.
- **Safe.** Answer `audit.security` and `audit.scraping` from the code and the page: are inputs checked on the server, can one person reach another's data by changing an ID, are data endpoints limited against bulk copying, is only public content visible to crawlers. Say Needs work, with the reason, when you find a gap. When you cannot tell, leave it Not checked and say why in your report.
- **Fast & findable.** The page check measures load time (over 3 seconds on either device is Needs work). Answer `audit.seo`: a specific title and description, and indexing only for pages meant to be public.
- **Works as expected.** Do each thing in a real browser, for example with agent-browser, the way a person would: fill the form, press the button, wait for the result, and check that the data really saved (reload, or look where it should appear). Record one verdict per thing in `features`, with what you did and saw. Report every bug with `dogfood_add_issue`:
  - P0 when it breaks the app.
  - P1 when it blocks this page.
  - P2 when it is annoying.
  - P3 when it is cosmetic.

  Use a title a person can read, and steps that reproduce it. When a fix lands, check again and close it with `dogfood_resolve_issue` and what you retested.
- After a deploy, `dogfood_scan_project` retakes every page and names the ones that look different; look at those again.
- Call `dogfood_complete` for each page. Report a page as done only when it accepts; otherwise it lists exactly what is still missing.

Do not fix the app while checking it unless the person asks. Report what you found; fixing is a separate job.

## 5. Tell the person

- Point them to <http://127.0.0.1:4321>. Each page shows its screenshots and six answers, and each answer opens to show its evidence.
- Summarise from `dogfood_report` in plain words: how many pages are good, which need work and why, the open bugs by how bad they are, and what you could not check.
- Never call something checked that you did not check. Not checked stays Not checked, and a screenshot alone does not prove that anything works.
