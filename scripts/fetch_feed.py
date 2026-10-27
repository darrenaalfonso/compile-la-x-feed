"""Fetch only the authenticated owner's public posts. Python standard library only."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import sys
import time
from datetime import datetime, timezone
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


def encode(value):
    return quote(str(value), safe="~")


def authorization(url, params, credentials, nonce=None, timestamp=None):
    key, secret, token, token_secret = credentials
    oauth = dict(oauth_consumer_key=key, oauth_token=token,
                 oauth_nonce=nonce or secrets.token_hex(16),
                 oauth_timestamp=str(timestamp or int(time.time())),
                 oauth_signature_method="HMAC-SHA1", oauth_version="1.0")
    pairs = sorted((encode(k), encode(v)) for k, v in {**params, **oauth}.items())
    normalized = "&".join(f"{k}={v}" for k, v in pairs)
    base = "&".join(map(encode, ["GET", url, normalized]))
    signing_key = f"{encode(secret)}&{encode(token_secret)}"
    oauth["oauth_signature"] = base64.b64encode(hmac.new(
        signing_key.encode(), base.encode(), hashlib.sha1).digest()).decode()
    return "OAuth " + ", ".join(f'{encode(k)}="{encode(v)}"' for k, v in sorted(oauth.items()))


def api(path, params, credentials):
    url = "https://api.x.com/2/" + path
    request = Request(url + "?" + urlencode(params), headers={
        "Authorization": authorization(url, params, credentials),
        "Accept": "application/json", "User-Agent": "CompileLAFeed/1.0"})
    try:
        with urlopen(request, timeout=25) as response:
            body = json.load(response)
    except HTTPError as error:
        # Never print response bodies, request headers or credentials.
        raise RuntimeError(f"X returned HTTP {error.code}; check credentials, credit balance and access.") from None
    except (URLError, TimeoutError, ValueError):
        raise RuntimeError("X request failed or returned invalid JSON; retry later.") from None
    if not isinstance(body, dict) or body.get("errors"):
        raise RuntimeError("X returned an incomplete response; previous deployment retained.")
    return body


def make_feed(get, now=None):
    author = get("users/me", {"user.fields": "protected,profile_image_url,withheld"}).get("data", {})
    if not re.fullmatch(r"\d{1,19}", str(author.get("id", ""))):
        raise RuntimeError("Missing authenticated user ID.")
    if author.get("username", "").lower() != "compilela":
        raise RuntimeError("These credentials do not belong to @compilela.")
    if not isinstance(author.get("protected"), bool):
        raise RuntimeError("X did not return the account visibility.")
    feed = {"version": 1, "updated_at": now or datetime.now(timezone.utc).isoformat(),
            "author": {k: author.get(k, "") for k in ("name", "username", "profile_image_url")}, "posts": []}
    if author["protected"] or author.get("withheld"):
        return feed  # Replace the public feed with no posts if visibility changes.
    body = get(f"users/{author['id']}/tweets", {
        "max_results": "5", "exclude": "replies,retweets",
        "post.fields": "created_at,note_post,entities,withheld,possibly_sensitive"})
    posts = body.get("data", [])
    if not isinstance(posts, list) or (not posts and body.get("meta", {}).get("result_count") != 0):
        raise RuntimeError("Invalid timeline response.")
    seen = set()
    for post in posts:
        pid = post.get("id", "")
        text = (post.get("note_post") or post.get("note_tweet") or {}).get("text", post.get("text"))
        created = post.get("created_at", "")
        if not re.fullmatch(r"\d{1,19}", pid) or not isinstance(text, str):
            raise RuntimeError("Invalid post data.")
        try:
            datetime.fromisoformat(created.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            raise RuntimeError("Missing or invalid post timestamp.") from None
        if pid in seen or post.get("withheld") or post.get("possibly_sensitive"):
            continue
        seen.add(pid)
        source = post.get("note_post") or post.get("note_tweet") or post
        entities = {}
        for kind, fields in {"urls": ("start", "end", "url", "display_url"),
                             "mentions": ("start", "end", "username"),
                             "hashtags": ("start", "end", "tag")}.items():
            entities[kind] = [{k: e[k] for k in fields if k in e}
                              for e in source.get("entities", {}).get(kind, [])]
        feed["posts"].append({"id": pid, "text": text, "created_at": created,
                              "entities": entities,
                              "edited": len(post.get("edit_history_post_ids", post.get("edit_history_tweet_ids", []))) > 1})
    feed["posts"].sort(key=lambda p: int(p["id"]), reverse=True)
    feed["posts"] = feed["posts"][:5]
    return feed


def main():
    names = ("X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET")
    credentials = tuple(os.environ.get(name, "") for name in names)
    if not all(credentials):
        raise RuntimeError("Add all four X repository secrets before running this workflow.")
    feed = make_feed(lambda path, params: api(path, params, credentials))
    target = Path("public/feed.json")
    target.parent.mkdir(exist_ok=True)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(target)
    print(f"Prepared {len(feed['posts'])} public posts for @compilela.")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
