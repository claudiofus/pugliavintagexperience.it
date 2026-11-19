(() => {
  'use strict';
  const config = window.PVE_ROUTE_CONFIG;
  if (!config) return;
  const page = document.body.dataset.page;
  const rootURL = new URL(document.body.dataset.siteRoot || './', document.baseURI).href;
  function route(target, lang, samePage = false) {
    const url = new URL(config.routes[lang]?.[target] || config.routes.it.home, rootURL);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.pathname = url.pathname.replace(/\/index\.html$/, '/');
    }
    return (window.PVE_CAMPAIGN_URL ? window.PVE_CAMPAIGN_URL(url, samePage) : url).href;
  }
  const canonical = (target, lang) => new URL(config.routes[lang][target].replace(/index\.html$/, ''), config.base_url).href;
  let language = document.documentElement.lang || 'it';
  const button = document.querySelector('#menu-toggle');
  const menu = document.querySelector('#mobile-nav');
  const whatsapp = document.querySelector('.floating-whatsapp');
  const label = key => window.PVE_PAGES?.[page]?.[language]?.[key] ?? window.WEDDING_I18N?.[language]?.[key] ?? key;
  function languageFromURL() {
    if (window.PVE_PREVIEW_LANGUAGE) return window.PVE_PREVIEW_LANGUAGE;
    const query = new URLSearchParams(location.search).get('lang');
    if (Object.hasOwn(config.routes, query)) return query;
    const path = location.pathname;
    return Object.keys(config.routes).find(lang => Object.values(config.routes[lang]).some(file => {
      const candidate = new URL(file, rootURL).pathname;
      return path === candidate || path === candidate.replace(/index\.html$/, '');
    })) || document.documentElement.lang || 'it';
  }
  function closeMenu(restoreFocus = false) {
    if (!button || !menu) return;
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', label('menuOpen'));
    document.querySelector('.site-header')?.classList.remove('menu-open');
    if (restoreFocus) button.focus();
  }
  function syncSEO(next) {
    const canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) canonicalLink.href = canonical(page, next);
    const setMeta = (selector, value) => { const el = document.querySelector(selector); if (el) el.content = value; };
    setMeta('meta[property="og:url"]', canonical(page, next));
    setMeta('meta[name="twitter:title"]', document.title);
    setMeta('meta[name="twitter:description"]', document.querySelector('meta[name="description"]')?.content || '');
    const locales = { it: 'it_IT', en: 'en_GB', fr: 'fr_FR' };
    document.querySelectorAll('meta[property="og:locale:alternate"]').forEach((el, index) => {
      el.content = Object.keys(locales).filter(lang => lang !== next).map(lang => locales[lang])[index];
    });
    const variants = document.querySelector('#seo-variants');
    const graph = document.querySelector('#seo-jsonld');
    if (variants && graph) {
      try { graph.textContent = JSON.stringify(JSON.parse(variants.textContent)[next]); } catch (_) { /* Static metadata remains available. */ }
    }
  }
  function sync(next, navigate = false) {
    language = next;
    document.querySelectorAll('a[data-page]').forEach(a => {
      a.href = route(a.dataset.page, next) + (a.dataset.anchor ? '#' + a.dataset.anchor : '');
      if (a.closest('.global-nav') && a.dataset.page === page) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.querySelectorAll('a[data-lang]').forEach(a => {
      a.href = route(page, a.dataset.lang, true) + location.hash;
      a.removeAttribute('aria-pressed');
      if (a.dataset.lang === next) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (button) button.setAttribute('aria-label', label(menu?.hidden ? 'menuOpen' : 'menuClose'));
    if (whatsapp) {
      const whatsappLabel = label('floatingWhatsAppLabel');
      const text = page === 'home' && next === 'it' ? config.measurement.legacy_home_whatsapp_text :
        label(page === 'home' ? 'generalMessage' : 'floatingWhatsAppMessage');
      whatsapp.href = 'https://wa.me/' + config.contact_number + '?text=' + encodeURIComponent(text);
      whatsapp.setAttribute('aria-label', `${whatsappLabel} · WhatsApp`);
    }
    syncSEO(next);
    if (navigate && !window.PVE_EMBEDDED) {
      const nextURL = route(page, next, true) + location.hash;
      if (nextURL !== location.href) {
        try { history.replaceState(null, '', nextURL); } catch (_) { /* Local files still translate in place. */ }
      }
    }
  }
  button?.addEventListener('click', () => {
    if (!menu) return;
    const open = menu.hidden;
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', label(open ? 'menuClose' : 'menuOpen'));
    document.querySelector('.site-header')?.classList.toggle('menu-open', open);
    if (open) menu.querySelector('a')?.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu && !menu.hidden) { e.preventDefault(); closeMenu(true); }
  });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-lang]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!window.PVE_EMBEDDED && page === 'home' && location.protocol !== 'file:' && a.dataset.lang !== language) {
      // The home pages use their own document URLs for GA4 page-load goals.
      a.href = route(page, a.dataset.lang, true) + location.hash;
      return;
    }
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('pve:select-language', { detail: { language: a.dataset.lang } }));
    closeMenu();
  });
  document.querySelectorAll('img[src]').forEach(img => { img.src = img.src; });
  // Outbound-link rules see the public business link. The private draft goes only to WhatsApp.
  function openWhatsApp(event) {
    const link = event.target.closest('a#whatsapp-send, a[data-general-whatsapp], a#floating-whatsapp');
    if (!link || (event.button !== 0 && event.button !== 1)) return;
    let text;
    if (link.id === 'whatsapp-send') {
      text = document.querySelector('#message-preview')?.textContent;
    } else if (page === 'home') {
      text = label('generalMessage');
    }
    if (!text) return;
    event.preventDefault();
    window.open('https://wa.me/' + config.contact_number + '?text=' + encodeURIComponent(text),
      '_blank', 'noopener,noreferrer');
  }
  window.addEventListener('click', openWhatsApp);
  window.addEventListener('auxclick', openWhatsApp);
  menu?.querySelectorAll('a').forEach(a => a.addEventListener('click', () => closeMenu()));
  window.addEventListener('resize', () => { if (innerWidth > 1160) closeMenu(); }, { passive: true });
  window.addEventListener('pve:language', e => sync(e.detail.language, e.detail.navigate));
  window.PVE_NAV = { sync, routes: config.routes, route, rootURL, languageFromURL };
  sync(language);
})();
