(() => {
  'use strict';
  const page=document.body.dataset.page;
  if(!window.PVE_PAGES?.[page])return;
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let language='it', activeRoute=0, activeBrief=0, message='',scheduled=false;
  const briefKinds = [['party', 'communion', 'birthday18'], ['shoot'], ['brand']];
  const briefForKind = kind => briefKinds.findIndex(kinds => kinds.includes(kind));
  const t=k=>window.PVE_PAGES[page][language][k]??window.WEDDING_I18N[language][k]??k;
  const asset=p=>window.PVE_ASSETS?.[p.replace('assets/','')]||new URL(p,window.PVE_NAV?.rootURL||location.href).href;
  function initialLanguage(){return window.PVE_PREVIEW_LANGUAGE||window.PVE_NAV?.languageFromURL()||document.documentElement.lang||'it';}
  function fitTitle(){const h=$('#hero-title');if(!h)return;h.style.fontSize='';const width=h.clientWidth;const content=Math.max(...[...h.children].map(e=>e.scrollWidth));if(content>width&&width)h.style.fontSize=Math.floor(parseFloat(getComputedStyle(h).fontSize)*width/content*.99)+'px';}
  function applyLanguage(next,updateURL=true){
    if(!window.PVE_PAGES[page][next])return;language=next;document.documentElement.lang=next;document.title=t('pageTitle');
    $('meta[name="description"]').content=t('metaDescription');$('meta[property="og:title"]').content=t('pageTitle');$('meta[property="og:description"]').content=t('ogDescription');$('meta[property="og:locale"]').content={it:'it_IT',en:'en_GB',fr:'fr_FR'}[next];
    $$('[data-i18n]').forEach(e=>e.innerHTML=t(e.dataset.i18n));$$('[data-i18n-alt]').forEach(e=>e.alt=t(e.dataset.i18nAlt));$$('[data-i18n-placeholder]').forEach(e=>e.placeholder=t(e.dataset.i18nPlaceholder));$$('[data-i18n-aria]').forEach(e=>e.setAttribute('aria-label',t(e.dataset.i18nAria)));
    $('#enquiry-form')?.querySelectorAll('input,textarea,select').forEach(e=>e.setCustomValidity(''));
    if(page==='tour')renderRoute(activeRoute,false);if(page==='events')renderBrief(activeBrief,false);
    if($('#request-preview')&&!$('#request-preview').hidden)prepareMessage();
    try{localStorage.setItem('pve-wedding-language',next);}catch(_){}
    window.dispatchEvent(new CustomEvent('pve:language',{detail:{language:next,page,navigate:updateURL}}));fitTitle();
  }
  function renderRoute(index,setForm){
    activeRoute=index;
    $$('[data-route]').forEach(e=>{const on=+e.dataset.route===index;e.setAttribute('aria-selected',String(on));e.tabIndex=on?0:-1;});
    $$('[data-route-panel]').forEach(panel=>{
      const route=+panel.dataset.routePanel;panel.hidden=route!==index;
      [...panel.querySelectorAll('[data-route-stop]')].forEach((e,i)=>e.textContent=t('routeStops'+route)[i]);
    });
    const im=$('#route-image');im.src=asset(t('routeImage'+index));im.alt=t('routeAlt'+index);im.classList.toggle('route-image-coast',index===1);
    $('#route-count').textContent=String(index+1).padStart(2,'0')+' / 03';
    if(setForm)$('#enquiry-route').value=String(index);
  }
  function renderBrief(index,setForm){
    activeBrief=index;
    $$('[data-brief]').forEach(e=>{const on=+e.dataset.brief===index;e.setAttribute('aria-selected',String(on));e.tabIndex=on?0:-1;});
    $$('[data-brief-panel]').forEach(panel=>{panel.hidden=+panel.dataset.briefPanel!==index;});
    const im=$('#brief-image');im.src=asset(t('briefImage'+index));im.alt=t('briefAlt'+index);im.style.objectPosition=index===0?'50% 65%':index===1?'50% 45%':'50% 50%';
    $('#brief-count').textContent=String(index+1).padStart(2,'0')+' / 03';
    if (setForm) {
      const kind = $('#enquiry-kind');
      if (briefForKind(kind.value) !== index) kind.value = briefKinds[index][0];
    }
  }

  function activateTab(event,index,kind){
    const moves={ArrowRight:1,ArrowLeft:-1,Home:-index,End:2-index};if(!(event.key in moves))return;event.preventDefault();const next=(index+moves[event.key]+3)%3;
    if(kind==='route')renderRoute(next,false);else renderBrief(next,true);
    $(`[data-${kind}="${next}"]`).focus();
  }
  function prepareMessage(){
    const separator=language==='fr'?'\u00a0: ':': ';
    const val=id=>$(id)?.value.trim()||'';
    const parts=[t('messageHello'),'',t('messageWish'),''];
    const add=(label,value)=>{if(value)parts.push(t(label)+separator+value);};
    if(page==='events')add('messageKind',$('#enquiry-kind').selectedOptions[0].textContent);
    add('messageWhen',val('#enquiry-when'));add('messageWhere',val('#enquiry-where'));
    if(page==='tour'){add('messagePeople',val('#enquiry-people'));const route=$('#enquiry-route');const choice=route.selectedOptions[0].textContent;add('messageRoute',/^[012]$/.test(route.value)?choice+' — '+t('routeStops'+route.value).join(' → '):choice);}
    else add('messageDuration',val('#enquiry-duration'));
    add('messageNames',val('#enquiry-name'));add('messageNotes',val('#enquiry-notes'));parts.push('',t('messageQuestion'));
    message=parts.join('\n');$('#message-preview').textContent=message;$('#copy-status').innerHTML=t('previewNote');
  }
  function showForm(){if(!$('#enquiry-form'))return;$('#enquiry-form').hidden=false;$('#request-preview').hidden=true;$('#form-step').textContent='01 — 02';}
  function scrollToForm(){showForm();$('#your-date').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});}
  function onScroll(){
    const y=scrollY;$('#site-header').classList.toggle('scrolled',y>12);const max=document.documentElement.scrollHeight-innerHeight;$('.scroll-progress').style.transform=`scaleX(${max>0?Math.min(y/max,1):0})`;
    const photo=$('.hero-photo'),visual=$('.hero-visual');if(photo&&visual&&!reduced.matches){const r=visual.getBoundingClientRect();photo.style.transform=`translateY(${Math.max(-24,Math.min(24,(innerHeight/2-r.top-r.height/2)*.055))}px)`;}
    const booking=$('#your-date');if(booking){const r=booking.getBoundingClientRect();$('#mobile-booking-bar').classList.toggle('visible',y>450&&!(r.top<innerHeight-80&&r.bottom>100));}scheduled=false;
  }
  window.addEventListener('pve:select-language',e=>applyLanguage(e.detail.language));
  $$('[data-route]').forEach(e=>{e.addEventListener('click',()=>renderRoute(+e.dataset.route,false));e.addEventListener('keydown',ev=>activateTab(ev,activeRoute,'route'));});
  $$('[data-brief]').forEach(e=>{e.addEventListener('click',()=>renderBrief(+e.dataset.brief,true));e.addEventListener('keydown',ev=>activateTab(ev,activeBrief,'brief'));});
  $$('[data-use-route]').forEach(button=>button.addEventListener('click',()=>{renderRoute(+button.dataset.useRoute,true);scrollToForm();}));
  $('#use-brief')?.addEventListener('click',()=>{renderBrief(activeBrief,true);scrollToForm();});
  $('#enquiry-route')?.addEventListener('change',e=>{if(e.target.value!=='custom')renderRoute(+e.target.value,false);});
  $('#enquiry-kind')?.addEventListener('change', e => renderBrief(briefForKind(e.target.value), false));
  $('#enquiry-form')?.addEventListener('submit',e=>{
    e.preventDefault();let valid=true;
    e.currentTarget.querySelectorAll('[required]').forEach(input=>{if(input.type==='text')input.value=input.value.trim();input.setCustomValidity(input.value?'':t('requiredField'));if(!input.validity.valid)valid=false;});
    if(!valid||!e.currentTarget.reportValidity()){e.currentTarget.reportValidity();return;}
    prepareMessage();e.currentTarget.hidden=true;$('#request-preview').hidden=false;$('#form-step').textContent='02 — 02';$('.booking-card').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});$('#whatsapp-send').focus({preventScroll:true});
    window.dispatchEvent(new Event('pve:quote-ready'));
  });
  $('#enquiry-form')?.querySelectorAll('input,select,textarea').forEach(e=>e.addEventListener('input',()=>e.setCustomValidity('')));
  $('#edit-request')?.addEventListener('click',()=>{showForm();$('#enquiry-when').focus({preventScroll:true});});
  $('#copy-message')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(message);$('#copy-status').textContent=t('copied');}catch(_){const range=document.createRange();range.selectNodeContents($('#message-preview'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);$('#copy-status').textContent=t('copyFailed');}});
  $('#privacy-open').addEventListener('click',()=>{$('#privacy-dialog').showModal();document.body.classList.add('modal-open');});$('#privacy-close').addEventListener('click',()=>$('#privacy-dialog').close());$('#privacy-dialog').addEventListener('click',e=>{if(e.target===$('#privacy-dialog'))e.target.close();});$('#privacy-dialog').addEventListener('close',()=>document.body.classList.remove('modal-open'));
  $$('.faq-list details').forEach(d=>d.addEventListener('toggle',()=>{if(d.open)$$('.faq-list details').forEach(other=>{if(other!==d)other.open=false;});}));
  addEventListener('scroll',()=>{if(!scheduled){scheduled=true;requestAnimationFrame(onScroll);}},{passive:true});addEventListener('resize',()=>{fitTitle();onScroll();},{passive:true});addEventListener('popstate',()=>applyLanguage(initialLanguage(),false));
  $('#copyright-year').textContent=new Date().getFullYear();applyLanguage(initialLanguage(),false);onScroll();
  if('IntersectionObserver'in window&&!reduced.matches){document.documentElement.classList.add('js');const o=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('is-visible');o.unobserve(e.target);}}),{threshold:.07,rootMargin:'0px 0px -15px 0px'});$$('.reveal').forEach(e=>o.observe(e));}
})();
