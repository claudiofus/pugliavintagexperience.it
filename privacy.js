(() => {
  'use strict';

  const config = window.PVE_ROUTE_CONFIG;
  const measurement = config.measurement;
  const site = new URL(config.base_url);
  const apex = site.hostname.replace(/^www\./, '');
  const production = !window.PVE_EMBEDDED && location.protocol === 'https:' &&
    (location.host === site.host || location.host === apex);
  const storageKey = 'pve-cookie-preferences-v1';
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  const choicesOff = { analytics: false, ads: false };
  const useGTM = /^GTM-[A-Z0-9]+$/.test(measurement.gtm_id);
  const ga4 = measurement.ga4_id;
  const ads = measurement.ads_id;
  const saved = readPreference();
  let choices = saved || choicesOff;
  let choiceRecorded = Boolean(saved);
  let started = false;
  let analyticsConfigured = false;
  let adsConfigured = false;
  let lastPageView = '';
  let languageReady = !document.body.dataset.page;

  const landingParams = new URLSearchParams(location.search);
  const campaign = new URLSearchParams();
  for (const key of ['gclid', 'gbraid', 'wbraid', 'dclid', 'gad_source', 'gad_campaignid',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_content', 'utm_term',
    'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic']) {
    const value = landingParams.get(key);
    if (value && value.length <= 512) campaign.set(key, value);
  }

  function addCampaign(url) {
    campaign.forEach((value, key) => url.searchParams.set(key, value));
    return url;
  }

  // Keep ad attribution on this landing page and on internal links until the visitor chooses.
  window.PVE_CAMPAIGN_URL = (url, samePage) =>
    (url.origin === location.origin && (samePage || !choiceRecorded)) ? addCampaign(url) : url;

  const languages = {
    it: {
      title: 'Cookie e privacy',
      description: 'Con il tuo consenso misuriamo le visite e i risultati delle campagne. Puoi scegliere quali cookie facoltativi attivare.',
      reject: 'Rifiuta', customize: 'Preferenze', accept: 'Accetta tutti', save: 'Salva preferenze', link: 'Preferenze cookie',
      analytics: 'Statistiche con Google Analytics', ads: 'Misurazione delle campagne con Google Ads',
      settings: 'Puoi modificare o revocare la scelta in qualsiasi momento. Se cambi una scelta già attiva, la pagina può ricaricarsi.',
      close: 'Chiudi'
    },
    en: {
      title: 'Cookies and privacy',
      description: 'With your permission, we measure visits and the results of our ad campaigns. Choose which optional cookies to allow.',
      reject: 'Reject', customize: 'Preferences', accept: 'Accept all', save: 'Save preferences', link: 'Cookie preferences',
      analytics: 'Site statistics with Google Analytics', ads: 'Campaign measurement with Google Ads',
      settings: 'You can change or withdraw your choice at any time. Changing an active preference may reload the page.',
      close: 'Close'
    },
    fr: {
      title: 'Cookies et confidentialité',
      description: 'Avec votre accord, nous mesurons les visites et les résultats de nos campagnes. Vous pouvez choisir les cookies facultatifs à autoriser.',
      reject: 'Refuser', customize: 'Préférences', accept: 'Tout accepter', save: 'Enregistrer', link: 'Préférences de cookies',
      analytics: 'Statistiques avec Google Analytics', ads: 'Mesure des campagnes avec Google Ads',
      settings: 'Vous pouvez modifier ou retirer votre accord à tout moment. La page peut se recharger si vous modifiez une préférence active.',
      close: 'Fermer'
    }
  };

  function readPreference() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      if (!value || value.until <= Date.now() || !Number.isFinite(value.until)) return null;
      return { analytics: value.analytics === true, ads: value.ads === true };
    } catch (_) {
      return null;
    }
  }

  function consentState(value) {
    return {
      analytics_storage: value.analytics ? 'granted' : 'denied',
      ad_storage: value.ads ? 'granted' : 'denied',
      ad_user_data: value.ads ? 'granted' : 'denied',
      ad_personalization: 'denied'
    };
  }

  function google() {
    window.dataLayer.push(arguments);
  }

  function configureDestinations() {
    if (choices.analytics && !analyticsConfigured) {
      google('config', ga4, {
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false
      });
      analyticsConfigured = true;
    }
    if (choices.ads && !adsConfigured) {
      google('config', ads, { allow_ad_personalization_signals: false });
      adsConfigured = true;
    }
  }

  function startMeasurement() {
    if (!production || started || !(choices.analytics || choices.ads)) return;
    started = true;
    window.dataLayer = window.dataLayer || [];
    const tag = document.createElement('script');
    tag.async = true;
    google('consent', 'default', consentState(choicesOff));
    google('consent', 'update', consentState(choices));

    if (useGTM) {
      // The Consent Initialization template reads these immutable page preferences.
      window.dataLayer.push({ pve_consent: consentState(choices) });
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      tag.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(measurement.gtm_id);
    } else {
      window.gtag = window.gtag || google;
      google('js', new Date());
      configureDestinations();
      tag.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(choices.analytics ? ga4 : ads);
    }
    document.head.append(tag);
    if (useGTM) window.dataLayer.push({ event: 'pve_measurement_ready' });
    trackPageView();
  }

  function pageLocation() {
    const canonical = document.body.dataset.page && document.querySelector('link[rel="canonical"]');
    const url = addCampaign(new URL(canonical ? canonical.href : location.pathname, config.base_url));
    const fragment = location.hash.slice(1);
    if (measurement.page_view_fragments.includes(fragment) && document.getElementById(fragment)) {
      url.hash = fragment;
    }
    return url;
  }

  function trackPageView() {
    if (!started || !choices.analytics || !languageReady) return;
    const url = pageLocation();
    if (url.href === lastPageView) return;
    lastPageView = url.href;
    const page = { page_location: url.href, page_title: document.title };
    if (useGTM) window.dataLayer.push({ event: 'pve_page_view', ...page });
    else google('event', 'page_view', { ...page, send_to: ga4 });
  }

  function track(event, contactSurface, parameters = {}) {
    if (!started || !(choices.analytics || choices.ads)) return;
    const fields = {
      service_page: document.body.dataset.page || (location.pathname === '/qrcode.html' ? 'qr' : 'legacy'),
      site_language: document.documentElement.lang.split('-')[0],
      contact_surface: contactSurface,
      ...parameters
    };
    if (useGTM) {
      window.dataLayer.push({ event, ...fields });
      return;
    }
    if (choices.analytics) google('event', event, { ...fields, page_location: pageLocation().href, send_to: ga4 });
    const labels = measurement.ads_conversion_labels;
    const label = labels[event] || (event === 'click_sul_pulsante' && labels.phone_click);
    if (choices.ads && /^[\w-]+$/.test(label || '')) {
      google('event', 'conversion', { send_to: ads + '/' + label });
    }
  }

  function clearRejectedCookies() {
    if (!production) return;
    const domain = new URL(config.base_url).hostname.replace(/^www\./, '');
    for (const part of document.cookie.split(';')) {
      const name = part.trim().split('=')[0];
      if ((!choices.analytics && /^(_ga($|_)|_gid$|_gat($|_))/.test(name))
        || (!choices.ads && /^_gcl_/.test(name))) {
        document.cookie = name + '=; Max-Age=0; path=/; Secure; SameSite=Lax';
        document.cookie = name + '=; Max-Age=0; path=/; domain=' + domain + '; Secure; SameSite=Lax';
      }
    }
  }

  const banner = document.createElement('section');
  banner.className = 'cookie-banner';
  banner.setAttribute('aria-labelledby', 'cookie-banner-title');
  banner.hidden = Boolean(saved);
  banner.innerHTML = '<h2 id="cookie-banner-title" data-cookie-copy="title"></h2><p data-cookie-copy="description"></p>'
    + '<div class="cookie-actions"><button type="button" data-consent="reject" data-cookie-copy="reject"></button>'
    + '<button type="button" data-consent="customize" data-cookie-copy="customize"></button>'
    + '<button type="button" data-consent="accept" data-cookie-copy="accept"></button></div>';
  const dialog = document.createElement('dialog');
  dialog.className = 'cookie-dialog';
  dialog.setAttribute('aria-labelledby', 'cookie-dialog-title');
  dialog.innerHTML = '<form method="dialog"><h2 id="cookie-dialog-title" data-cookie-copy="link"></h2><p data-cookie-copy="settings"></p>'
    + '<label><input type="checkbox" name="analytics"><span data-cookie-copy="analytics"></span></label>'
    + '<label><input type="checkbox" name="ads"><span data-cookie-copy="ads"></span></label>'
    + '<div class="cookie-actions"><button type="submit" data-cookie-copy="save"></button>'
    + '<button type="button" data-consent="close" data-cookie-copy="close"></button></div></form>';
  const preferences = document.createElement('button');
  preferences.type = 'button';
  preferences.className = 'plain-button';
  preferences.dataset.cookieCopy = 'link';
  const preferenceArea = document.querySelector('.footer-links, .pve-legacy-privacy');
  preferenceArea.append(preferences);
  document.body.append(banner, dialog);
  if ('ResizeObserver' in window) {
    const resize = new ResizeObserver(() => {
      document.body.style.setProperty('--cookie-banner-space', (banner.offsetHeight + 14) + 'px');
    });
    resize.observe(banner);
  }

  function translate() {
    const language = document.documentElement.lang.split('-')[0];
    const text = languages[language] || languages.it;
    document.querySelectorAll('[data-cookie-copy]').forEach(node => {
      node.textContent = text[node.dataset.cookieCopy];
    });
  }

  function openPreferences() {
    dialog.querySelector('[name="analytics"]').checked = choices.analytics;
    dialog.querySelector('[name="ads"]').checked = choices.ads;
    dialog.showModal();
  }

  function savePreferences(next) {
    const changed = choices.analytics !== next.analytics || choices.ads !== next.ads;
    const withdrawn = (choices.analytics && !next.analytics) || (choices.ads && !next.ads);
    choiceRecorded = true;
    choices = next;
    let persisted = false;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ ...next, until: Date.now() + maxAge }));
      persisted = true;
    } catch (_) { /* The choice is kept for this page if browser storage is unavailable. */ }
    banner.hidden = true;
    if (dialog.open) dialog.close();
    clearRejectedCookies();
    if (campaign.size) window.PVE_NAV?.sync(document.documentElement.lang);
    if (started && changed) {
      google('consent', 'update', consentState(choices));
      if (useGTM || withdrawn) {
        if (useGTM) window.dataLayer.push({ event: 'pve_consent_update', pve_consent: consentState(choices) });
        if (persisted) { location.reload(); return; }
      }
      if (!useGTM) configureDestinations();
      trackPageView();
      return;
    }
    startMeasurement();
  }

  banner.querySelector('[data-consent="reject"]').addEventListener('click', () => savePreferences(choicesOff));
  banner.querySelector('[data-consent="accept"]').addEventListener('click', () => savePreferences({ analytics: true, ads: true }));
  banner.querySelector('[data-consent="customize"]').addEventListener('click', openPreferences);
  preferences.addEventListener('click', openPreferences);
  dialog.querySelector('[data-consent="close"]').addEventListener('click', () => dialog.close());
  dialog.querySelector('form').addEventListener('submit', event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    savePreferences({ analytics: form.has('analytics'), ads: form.has('ads') });
  });

  document.addEventListener('click', event => {
    const target = event.target.closest('a[href], #whatsapp-send');
    if (!target || target.closest('#privacy-dialog, .pve-legacy-privacy')) return;
    if (target.id === 'whatsapp-send') {
      track('whatsapp_click', 'quote');
    } else if (target.protocol === 'tel:' && target.pathname.replace(/\D/g, '') === config.contact_number) {
      // The published site used this name and these exact parameters for all its call links.
      track('click_sul_pulsante', 'link', { event_category: 'contact', event_label: 'telefono header' });
    } else if (target.hostname === 'wa.me') {
      track('whatsapp_click', target.classList.contains('floating-whatsapp') ? 'floating' : 'link');
    }
  }, true);
  window.addEventListener('pve:quote-ready', () => track('quote_prepared', 'form'));
  window.addEventListener('hashchange', event => {
    if (!started || !choices.analytics) return;
    if (pageLocation().hash) trackPageView();
    else if (measurement.page_view_fragments.includes(new URL(event.oldURL).hash.slice(1))) {
      // Leaving the section allows a future genuine visit; other scroll links are not page loads.
      lastPageView = pageLocation().href;
    }
  });
  window.addEventListener('pve:language', () => {
    languageReady = true;
    translate();
    trackPageView();
  });
  document.addEventListener('DOMContentLoaded', () => {
    languageReady = true;
    trackPageView();
  }, { once: true });
  translate();
  if (campaign.size) window.PVE_NAV?.sync(document.documentElement.lang);
  if (saved) {
    clearRejectedCookies();
    startMeasurement();
  }
})();
