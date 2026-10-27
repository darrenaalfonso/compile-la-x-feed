(() => {
  'use strict';
  const script = document.currentScript;
  const base = new URL('.', script.src);
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function link(text, href, className) {
    const a = element('a', text, className);
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    return a;
  }
  function textWithEntities(text, entities = {}) {
    const node = element('p', undefined, 'clx-text');
    const chars = Array.from(text);
    const spans = [];
    for (const e of entities.urls || []) {
      if (/^https:\/\/t\.co\/[a-zA-Z0-9]+$/.test(e.url || ''))
        spans.push({...e, href: e.url, label: e.display_url});
    }
    for (const e of entities.mentions || []) {
      if (/^[a-zA-Z0-9_]{1,15}$/.test(e.username || ''))
        spans.push({...e, href: `https://x.com/${e.username}`});
    }
    for (const e of entities.hashtags || []) {
      if (typeof e.tag === 'string')
        spans.push({...e, href: `https://x.com/search?q=${encodeURIComponent('#' + e.tag)}`});
    }
    let cursor = 0;
    for (const e of spans.sort((a, b) => a.start - b.start)) {
      if (!Number.isInteger(e.start) || !Number.isInteger(e.end) ||
          e.start < cursor || e.end <= e.start || e.end > chars.length) continue;
      node.append(document.createTextNode(chars.slice(cursor, e.start).join('')));
      node.append(link(typeof e.label === 'string' ? e.label : chars.slice(e.start, e.end).join(''), e.href));
      cursor = e.end;
    }
    node.append(document.createTextNode(chars.slice(cursor).join('')));
    return node;
  }
  async function start() {
    let host = document.getElementById('compile-la-x-feed');
    if (!host && script.dataset.homepage === 'true' && location.pathname === '/') {
      host = element('div'); host.id = 'compile-la-x-feed';
      const footer = document.querySelector('footer');
      if (footer) footer.before(host); else document.body.append(host);
    }
    if (!host || host.dataset.loaded) return;
    host.dataset.loaded = 'true';
    const section = element('section', undefined, 'clx');
    section.setAttribute('aria-label', 'Latest from Compile LA on X');
    const heading = element('header', undefined, 'clx-heading');
    const title = element('div');
    title.append(element('span', 'AROUND LOS ANGELES', 'clx-eyebrow'), element('h2', 'The latest from Compile LA'));
    const logo = link('', 'https://x.com/compilela', 'clx-logo');
    logo.setAttribute('aria-label', 'Compile LA on X');
    logo.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932 6.064-6.933zm-1.29 19.49h2.039L6.487 3.24H4.3l13.31 17.403z"/></svg>';
    heading.append(title, logo);
    const status = element('p', 'Loading posts…', 'clx-status'); status.setAttribute('role', 'status');
    const posts = element('div', undefined, 'clx-posts');
    section.append(heading, status, posts, link('Follow @compilela on X ↗', 'https://x.com/compilela', 'clx-follow'));
    host.replaceChildren(section);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(new URL('feed.json', base), {signal: controller.signal, credentials: 'omit', cache: 'no-cache'});
      if (!response.ok) throw new Error('Feed unavailable');
      const feed = await response.json();
      const age = Date.now() - Date.parse(feed.updated_at);
      if (feed.version !== 1 || feed.author?.username?.toLowerCase() !== 'compilela' ||
          !Array.isArray(feed.posts) || !Number.isFinite(age) || age < -300000 || age > 48 * 3600000)
        throw new Error('Stale or invalid feed');
      const fragment = document.createDocumentFragment();
      for (const post of feed.posts.slice(0, 5)) {
        if (!/^\d{1,19}$/.test(post.id) || typeof post.text !== 'string' || !Number.isFinite(Date.parse(post.created_at)))
          throw new Error('Invalid post');
        const permalink = `https://x.com/compilela/status/${post.id}`;
        const card = element('article', undefined, 'clx-post');
        const cover = link('', permalink, 'clx-cover'); cover.tabIndex = -1; cover.setAttribute('aria-hidden', 'true');
        const author = link('', 'https://x.com/compilela', 'clx-author');
        if (/^https:\/\/pbs\.twimg\.com\//.test(feed.author.profile_image_url || '')) {
          const avatar = element('img'); avatar.src = feed.author.profile_image_url;
          avatar.alt = ''; avatar.width = 40; avatar.height = 40; avatar.loading = 'lazy'; author.append(avatar);
        }
        const identity = element('span'); identity.append(element('strong', feed.author.name || 'Compile LA'), element('span', '@compilela'));
        author.append(identity);
        const meta = element('div', undefined, 'clx-meta');
        const timestamp = link('', permalink);
        const date = new Date(post.created_at);
        const time = element('time', date.toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric', timeZone:'America/Los_Angeles'}));
        time.dateTime = post.created_at;
        timestamp.append(time);
        if (post.edited) timestamp.append(document.createTextNode(' · Edited'));
        meta.append(timestamp, link('View on X ↗', permalink));
        card.append(cover, author, textWithEntities(post.text, post.entities), meta);
        fragment.append(card);
      }
      posts.replaceChildren(fragment);
      status.textContent = feed.posts.length ? 'Updated ' + new Date(feed.updated_at).toLocaleString('en-US', {timeZone:'America/Los_Angeles', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'}) : 'No recent public posts to display.';
      // An open tab must not retain stale posts indefinitely.
      setTimeout(() => { posts.replaceChildren(); status.textContent = 'For the latest posts, visit @compilela on X.'; }, Math.max(0, 48 * 3600000 - age));
    } catch {
      posts.replaceChildren(); status.textContent = 'For the latest posts, visit @compilela on X.';
    } finally { clearTimeout(timeout); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
