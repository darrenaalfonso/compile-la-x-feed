# Compile LA X feed

Daily @compilela → GitHub Actions → public JSON on GitHub Pages → Ghost widget.

## Activate

1. Sign in to https://console.x.com as **@compilela**, register, and create an app owned by that account. Choose Read access. Under Keys and tokens, obtain the OAuth 1.0a API Key/Secret and owner Access Token/Secret. Do not use the app-only Bearer Token or OAuth 2.0 Client ID. Add credits and set a small billing-cycle cap (suggested $2 if the console permits it).
2. In this repository's **Settings → Secrets and variables → Actions → New repository secret**, save `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`. Never put them in a file, Ghost, a commit, or chat.
3. Set **Settings → Pages → Source → GitHub Actions**.
4. In **Actions → Refresh X feed → Run workflow**, run the default branch. Both build and deploy must succeed.
5. Check https://darrenaalfonso.github.io/compile-la-x-feed/ and `/feed.json`. Check that the author, text, timestamps, links, and latest five eligible posts match @compilela.
6. In Ghost **Settings → Advanced → Code Injection**, append `ghost/site-header.html` to Site Header and `ghost/site-footer.html` to Site Footer, preserving existing contents. This inserts the feed before the first homepage footer. Check its position on desktop/mobile. For placement within a page instead, add `ghost/html-card.html` as an HTML card; remove `data-homepage="true"` from the footer script if you do not also want automatic homepage placement.

No Ghost API key or theme upload is required. Code Injection must be available in your Ghost plan; its presence in your actual admin is the definitive check. This is a website widget, not newsletter content.

## Cost and current API behavior (verified 2026-10-27)

| Daily operation | Estimated cost per 30 days |
| --- | ---: |
| Five own posts × $0.001 × 30 | $0.15 |
| One profile read × $0.010 × 30 | $0.30 |
| Total with owned-post eligibility | **$0.45** |
| Total without owned-post discount ($0.005/post) | **$1.05** |

These are usage estimates, not an upfront credit purchase amount. The developer app must belong to @compilela and authenticate as @compilela for owned reads. The fetcher verifies the authenticated handle but cannot verify app ownership; verify the charge in X's console after the first run. The profile lookup supplies attribution and checks that the account remains public. No media/user expansions or recurring username lookups are requested.

X deduplicates billable resources within each UTC calendar day, resetting at midnight UTC; this is explicitly a soft guarantee. Hourly polling would normally cost a similar amount plus new posts seen during the day, but must not be treated as a guaranteed price cap. Daily polling is the default. At 2–3 posts per week, refreshing just five costs little while replacing edits and removing deleted posts. We deliberately do not use since_id or retain a historical post archive.

Endpoint: `GET https://api.x.com/2/users/{id}/tweets`, using OAuth 1.0a user context. `max_results=5` is the documented minimum (maximum 100). Current reference calls the fields parameter `post.fields` and long-form text `note_post`; older API documentation used `tweet.fields` and `note_tweet`. Parser accepts both long-text response shapes. No paid live request was made during offline testing: confirm your account's response on first run. `GET /2/users/me` establishes the authenticated user. Rate limits listed for the timeline are 900 requests/15 minutes per user and 10,000/15 minutes per app; `/users/me` is 75/15 minutes per user. Pay-per-use has a 3-million-post monthly read cap. Credit exhaustion, access restrictions and rate limits still apply.

Public repositories can use standard GitHub-hosted Actions runners and Pages for free within service limits. Keep this repository public for that setup; feed data is public by design.

## Schedule and operation

- Default: daily 14:23 UTC (6:23am PST / 7:23am PDT). GitHub can delay or drop scheduled runs; this is not a precise scheduler.
- For hourly refresh, change cron to `23 * * * *` and commit on the default branch.
- **GitHub disables scheduled workflows after 60 days without repository activity.** Set a personal reminder to check Actions monthly. Re-enable the workflow if disabled. Successful runs alone should not be relied upon to prevent this. No artificial keepalive commits are included.
- Missing secrets, HTTP errors, invalid/partial responses or malformed posts fail the build before deployment. Existing Pages content stays available; the widget hides its posts when the last successful snapshot is more than 48 hours old, including in an open tab. It always offers the X profile link.
- A newly protected or withheld account publishes an empty feed. Replies and reposts are excluded; sensitive or withheld posts are omitted without backfilling, so fewer than five can appear. Quote posts retain their own text and permalink; photos/video/polls/quoted-post bodies are viewed on X, not embedded here.
- Posts are replaced on each successful refresh. Daily refresh is not real-time edit/deletion synchronization; use manual Run workflow immediately after a deletion or change that should disappear promptly, or hourly polling for lower latency.
- JSON is deployed as a Pages artifact, not committed to Git history. Build artifacts have one-day retention. Disabling the workflow alone does not remove the last public JSON: remove the Pages deployment/site to stop serving it. The 48-hour expiry is a widget display rule, not deletion of the hosted file.
- Requests time out after 25 seconds with no automatic retries (avoids unexpected paid retry bursts). Logs never print credentials, authorization headers, response bodies, or post text.

## Verify and troubleshoot

Run from the repository root:

```sh
python3 -m unittest discover -s tests -v
node --check public/widget.js
node --test tests/widget.test.cjs
```

The tests cover OAuth signing against a public known vector, account identity/visibility, empty and malformed feeds, latest-five selection, deduplication, withheld/sensitive posts and full-text edits. Six additional widget tests cover safe text rendering, stale/error fallback, missing targets, the five-card cap, open-tab expiry, malicious URLs/IDs and Unicode link offsets. They do not confirm paid X access or deployment.

If X returns 401, check all four credentials belong to the same app/account; regenerate only if necessary and replace the matching GitHub secrets. For 402/403 check credits, app access, and permissions. For 429 wait and rerun later. A `400` mentioning fields may indicate a reference/account API mismatch; inspect X's console and current API docs before changing `post.fields` to the legacy spelling. Do not log tokens to diagnose failures.

If the widget shows its fallback, check Actions, the public `/feed.json` URL, its `updated_at`, and browser console/network. Pages must serve JSON cross-origin to compile.la. If a site content-security policy is installed, allow this Pages origin for scripts, styles and connect requests and `https://pbs.twimg.com` for avatars. Check that security settings/theme plugins aren't blocking the external files. Append snippets only once.

## Sources

- [X pricing, owned reads, daily deduplication and credits](https://docs.x.com/x-api/getting-started/pricing)
- [X timeline endpoint and parameter limits](https://docs.x.com/x-api/users/get-posts)
- [X authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping)
- [X credential setup](https://docs.x.com/x-api/getting-started/getting-access)
- [X rate limits](https://docs.x.com/x-api/fundamentals/rate-limits)
- [X display requirements](https://docs.x.com/developer-terms/display-requirements)
- [GitHub Pages deployment workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub scheduled workflows and inactivity](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Ghost Code Injection](https://ghost.org/help/code-injection-styles/)
