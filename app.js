(() => {
  'use strict';
  const dictionary = window.WEDDING_I18N;
  if (!dictionary) return;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const locales = { it: 'it-IT', en: 'en-GB', fr: 'fr-FR' };
  const asset = path => window.PVE_ASSETS?.[path.split('?')[0].replace('assets/', '')] || new URL(path, window.PVE_NAV?.rootURL || location.href).href;
  const photos = $$('[data-gallery]').map(button => {
    const image = button.querySelector('img');
    return {
      src: image.src,
      alt: image.dataset.i18nAlt,
      caption: button.querySelector('.gallery-caption [data-i18n]').dataset.i18n
    };
  });
  const moments = [
    { src: asset('assets/matrimonio-dettagli.webp?v=2'), position: '50% 54%', width: 1000, height: 667 },
    { src: asset('assets/home-viale-960.webp?v=2'), position: '36% 69%', width: 960, height: 640 },
    { src: asset('assets/matrimonio-tramonto.webp'), position: '65% 59%', width: 1050, height: 789 }
  ];
  let language = 'it';
  let activeMoment = 0;
  let activePhoto = 0;
  let galleryTrigger = null;
  let message = '';
  let scrollScheduled = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const t = (key) => dictionary[language][key] ?? dictionary.it[key] ?? key;

  function initialLanguage() {
    return window.PVE_PREVIEW_LANGUAGE || window.PVE_NAV?.languageFromURL() || document.documentElement.lang || 'it';
  }

  function fitHeroTitle() {
    const title = $('#hero-title');
    title.style.fontSize = '';
    const width = title.clientWidth;
    const contentWidth = Math.max(...[...title.querySelectorAll('span:not(.title-dot)')].map((el) => el.scrollWidth));
    if (contentWidth > width && width > 0) {
      const size = parseFloat(getComputedStyle(title).fontSize);
      title.style.fontSize = Math.floor(size * (width / contentWidth) * .99) + 'px';
    }
  }

  function applyLanguage(next, updateURL = true) {
    if (!dictionary[next]) return;
    language = next;
    document.documentElement.lang = next;
    document.title = t('pageTitle');
    $('meta[name="description"]').content = t('metaDescription');
    $('meta[property="og:title"]').content = t('pageTitle');
    $('meta[property="og:description"]').content = t('ogDescription');
    $('meta[property="og:locale"]').content = {it:'it_IT',en:'en_GB',fr:'fr_FR'}[next];
    $$('[data-i18n]').forEach((el) => { el.innerHTML = t(el.dataset.i18n); });
    $$('[data-i18n-alt]').forEach((el) => { el.alt = t(el.dataset.i18nAlt); });
    $$('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    $('#lightbox').setAttribute('aria-label', t('galleryLabel'));
    $('.desktop-nav').setAttribute('aria-label', t('menuLabel'));
    renderMoment(activeMoment);
    if ($('#lightbox').open) renderPhoto(activePhoto);
    if (!$('#request-preview').hidden) prepareMessage();
    validateDate(false);
    $('#wedding-place').setCustomValidity('');
    try { localStorage.setItem('pve-wedding-language', next); } catch (_) { /* Still works without storage. */ }
    window.dispatchEvent(new CustomEvent('pve:language', {detail:{language:next,page:'wedding',navigate:updateURL}}));
    fitHeroTitle();
  }

  function renderMoment(index) {
    activeMoment = index;
    $$('[data-moment]').forEach(button => {
      const selected = Number(button.dataset.moment) === index;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    $$('[data-moment-panel]').forEach(panel => { panel.hidden = Number(panel.dataset.momentPanel) !== index; });
    const picture = $('#experience-image');
    const moment = moments[index];
    picture.src = moment.src;
    picture.width = moment.width;
    picture.height = moment.height;
    picture.alt = t('altExperience' + index);
    picture.style.objectPosition = moment.position;
    $('#photo-index').textContent = String(index + 1).padStart(2, '0') + ' / 03';
  }

  function renderPhoto(index) {
    activePhoto = (index + photos.length) % photos.length;
    const item = photos[activePhoto];
    $('#lightbox-image').src = item.src;
    $('#lightbox-image').alt = t(item.alt);
    $('#lightbox-caption').textContent = t(item.caption);
    $('#lightbox-count').textContent = String(activePhoto + 1).padStart(2, '0') + ' / ' + String(photos.length).padStart(2, '0');
  }

  function localToday() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function validateDate(report) {
    const input = $('#wedding-date');
    input.min = localToday();
    input.setCustomValidity(input.value && input.value < input.min ? t('invalidDate') : '');
    if (report) input.reportValidity();
  }

  function prepareMessage() {
    const dateValue = $('#wedding-date').value;
    if (!dateValue) return;
    const [year, month, day] = dateValue.split('-').map(Number);
    const date = new Intl.DateTimeFormat(locales[language], {year:'numeric',month:'long',day:'numeric'}).format(new Date(year, month - 1, day, 12));
    const place = $('#wedding-place').value.trim();
    const names = $('#couple-names').value.trim();
    const notes = $('#wedding-notes').value.trim();
    const labelSeparator = language === 'fr' ? '\u00a0: ' : ': ';
    const parts = [t('messageHello'), '', t('messageWish'), '', `${t('messageDate')}${labelSeparator}${date}`, `${t('messagePlace')}${labelSeparator}${place}`];
    if (names) parts.push(`${t('messageNames')}${labelSeparator}${names}`);
    if (notes) parts.push(`${t('messageNotes')}${labelSeparator}${notes}`);
    parts.push('', t('messageQuestion'));
    message = parts.join('\n');
    $('#message-preview').textContent = message;
    $('#copy-status').innerHTML = t('previewNote');
  }

  function updateScroll() {
    const y = window.scrollY;
    $('#site-header').classList.toggle('scrolled', y > 12);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    $('.scroll-progress').style.transform = `scaleX(${max > 0 ? Math.min(y / max, 1) : 0})`;
    if (!reducedMotion.matches) {
      const hero = $('.hero-visual').getBoundingClientRect();
      const offset = Math.max(-24, Math.min(24, (window.innerHeight / 2 - hero.top - hero.height / 2) * .055));
      $('.hero-photo').style.transform = `translateY(${offset}px)`;
    } else { $('.hero-photo').style.transform = ''; }
    const booking = $('#your-date').getBoundingClientRect();
    const bookingVisible = booking.top < window.innerHeight - 80 && booking.bottom > 100;
    $('#mobile-booking-bar').classList.toggle('visible', y > 450 && !bookingVisible);
    scrollScheduled = false;
  }

  window.addEventListener('pve:select-language', event => applyLanguage(event.detail.language));
  $$('[data-moment]').forEach((button) => {
    button.addEventListener('click', () => renderMoment(Number(button.dataset.moment)));
    button.addEventListener('keydown', (event) => {
      const directions = { ArrowRight: 1, ArrowLeft: -1, Home: -activeMoment, End: 2 - activeMoment };
      if (!(event.key in directions)) return;
      event.preventDefault();
      const index = (activeMoment + directions[event.key] + 3) % 3;
      renderMoment(index);
      $(`[data-moment="${index}"]`).focus();
    });
  });
  $$('[data-gallery]').forEach((button) => button.addEventListener('click', () => {
    galleryTrigger = button;
    renderPhoto(Number(button.dataset.gallery));
    $('#lightbox').showModal();
    document.body.classList.add('modal-open');
    $('#lightbox-close').focus();
  }));
  $('#lightbox-close').addEventListener('click', () => $('#lightbox').close());
  $('#gallery-prev').addEventListener('click', () => renderPhoto(activePhoto - 1));
  $('#gallery-next').addEventListener('click', () => renderPhoto(activePhoto + 1));
  $('#lightbox').addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      renderPhoto(activePhoto + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  $('#lightbox').addEventListener('click', (event) => { if (event.target === $('#lightbox')) $('#lightbox').close(); });
  $('#lightbox').addEventListener('close', () => {
    if (!$('#privacy-dialog').open) document.body.classList.remove('modal-open');
    if (galleryTrigger) galleryTrigger.focus({preventScroll:true});
  });
  $('#privacy-open').addEventListener('click', () => { $('#privacy-dialog').showModal(); document.body.classList.add('modal-open'); });
  $('#privacy-close').addEventListener('click', () => $('#privacy-dialog').close());
  $('#privacy-dialog').addEventListener('click', (event) => { if (event.target === $('#privacy-dialog')) $('#privacy-dialog').close(); });
  $('#privacy-dialog').addEventListener('close', () => { if (!$('#lightbox').open) document.body.classList.remove('modal-open'); });
  $$('[data-place]').forEach((button) => button.addEventListener('click', () => {
    $('#wedding-place').value = button.dataset.place;
    $('#wedding-place').setCustomValidity('');
    $('#request-preview').hidden = true;
    $('#wedding-form').hidden = false;
    $('#form-step').textContent = '01 — 02';
    $('#your-date').scrollIntoView({behavior:reducedMotion.matches ? 'instant' : 'smooth'});
  }));
  $('#wedding-date').addEventListener('focus', () => validateDate(false));
  $('#wedding-date').addEventListener('input', () => validateDate(false));
  $('#wedding-place').addEventListener('input', () => $('#wedding-place').setCustomValidity(''));
  $('#wedding-form').addEventListener('submit', (event) => {
    event.preventDefault();
    validateDate(false);
    const place = $('#wedding-place');
    place.value = place.value.trim();
    place.setCustomValidity(place.value ? '' : t('invalidPlace'));
    if (!event.currentTarget.reportValidity()) return;
    prepareMessage();
    event.currentTarget.hidden = true;
    $('#request-preview').hidden = false;
    window.dispatchEvent(new Event('pve:quote-ready'));
    $('#form-step').textContent = '02 — 02';
    $('#whatsapp-send').focus({preventScroll:true});
  });
  $('#edit-request').addEventListener('click', () => {
    $('#request-preview').hidden = true;
    $('#wedding-form').hidden = false;
    $('#form-step').textContent = '01 — 02';
    $('#wedding-date').focus({preventScroll:true});
  });
  $('#copy-message').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message);
      $('#copy-status').textContent = t('copied');
    } catch (_) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents($('#message-preview'));
      selection.removeAllRanges();
      selection.addRange(range);
      $('#copy-status').textContent = t('copyFailed');
    }
  });
  $$('.faq-list details').forEach((detail) => detail.addEventListener('toggle', () => {
    if (detail.open) $$('.faq-list details').forEach((other) => { if (other !== detail) other.open = false; });
  }));
  window.addEventListener('scroll', () => { if (!scrollScheduled) { scrollScheduled = true; requestAnimationFrame(updateScroll); } }, {passive:true});
  window.addEventListener('resize', () => { fitHeroTitle(); updateScroll(); }, {passive:true});
  window.addEventListener('popstate', () => applyLanguage(initialLanguage(), false));
  $('#copyright-year').textContent = new Date().getFullYear();
  validateDate(false);
  applyLanguage(initialLanguage(), false);
  updateScroll();
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    document.documentElement.classList.add('js');
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
    }), {threshold:.08,rootMargin:'0px 0px -20px 0px'});
    $$('.reveal').forEach((el) => observer.observe(el));
  }
})();
