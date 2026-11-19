"""Build twelve complete language pages, SEO files and an offline preview."""
from pathlib import Path
from html.parser import HTMLParser
from copy import deepcopy
from urllib.parse import quote, urljoin
import argparse, base64, html, json, re, zipfile

ROOT = Path(__file__).resolve().parent
DIST = ROOT if (ROOT/'index.html').exists() else ROOT/'dist'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT/'export')
OUT = parser.parse_args().output.resolve()
OUT.mkdir(parents=True, exist_ok=True)
CONFIG = json.loads((ROOT/'site-config.json').read_text())
ROUTES = CONFIG['routes']
LANGS = list(ROUTES)
SHARED = json.loads((DIST/'translations.js').read_text().removeprefix('window.WEDDING_I18N = ').strip().removesuffix(';'))
PAGES = json.loads((DIST/'pages-data.js').read_text().removeprefix('window.PVE_PAGES = ').strip().removesuffix(';'))
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
CSS = ['styles.css', 'pages.css', 'readability.css', 'privacy.css']
JS = ['translations.js', 'pages-data.js', 'site-routes.js', 'navigation.js', 'privacy.js', 'experience.js', 'app.js']

# The difference between the red and blue channels gives the coverage of the
# gold ink. The small cutoff removes off-white pixels in the original matte.
BRAND_FILTER = '''
<svg class="brand-filter-defs" width="0" height="0" aria-hidden="true" focusable="false">
  <defs>
    <filter id="brand-remove-white" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="
        0      0  0      0  0.80392
        0      0  0      0  0.60784
        0      0  0      0  0.11373
        1.509  0 -1.509  0 -0.04142
      "/>
    </filter>
  </defs>
</svg>
'''.strip()

PHONE_ICON = (
    '<svg class="phone-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path d="m6 3 4 4-2.5 2.5a16 16 0 0 0 7 7L17 14l4 4-.9 1.8a3 3 0 0 1-3 1.3A18 18 0 0 1 2.9 6.9a3 3 0 0 1 1.3-3Z" '
    'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'
    '</svg>'
)

class Node:
    def __init__(self, tag, attrs=None, children=None, closed=False):
        self.tag, self.attrs, self.children, self.closed = tag, dict(attrs or {}), children or [], closed
    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node): yield from child.walk()
    def render(self):
        attrs = ''.join(' '+key if value is None else ' '+key+'="'+html.escape(str(value), quote=True)+'"' for key,value in self.attrs.items())
        if self.tag in VOID: return '<'+self.tag+attrs+'>'
        if self.closed: return '<'+self.tag+attrs+'/>'
        return '<'+self.tag+attrs+'>'+''.join(c.render() if isinstance(c,Node) else c for c in self.children)+'</'+self.tag+'>'

class DOM(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.root=Node('document'); self.stack=[self.root]; self.feed(source)
    def handle_starttag(self, tag, attrs):
        node=Node(tag,attrs); self.stack[-1].children.append(node)
        if tag not in VOID: self.stack.append(node)
    def handle_startendtag(self, tag, attrs): self.stack[-1].children.append(Node(tag,attrs,closed=True))
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1,0,-1):
            if self.stack[i].tag == tag: self.stack=self.stack[:i]; break
    def handle_data(self, text): self.stack[-1].children.append(text)
    def handle_entityref(self, name): self.handle_data('&'+name+';')
    def handle_charref(self, name): self.handle_data('&#'+name+';')
    def handle_comment(self, text): self.handle_data('<!--'+text+'-->')
    def handle_decl(self, decl): self.handle_data('<!'+decl+'>')
    def all(self, **attrs): return [n for n in self.root.walk() if all(n.attrs.get(k)==v for k,v in attrs.items())]
    def byid(self, value): return next((n for n in self.root.walk() if n.attrs.get('id')==value),None)
    def render(self): return ''.join(c.render() if isinstance(c,Node) else c for c in self.root.children)

def strings(page,lang): return {**SHARED[lang],**PAGES.get(page,{}).get(lang,{})}
def canonical(page,lang): return urljoin(CONFIG['base_url'], ROUTES[lang][page].removesuffix('index.html'))
def jsondata(value): return json.dumps(value,ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
def text_only(value): return html.unescape(re.sub('<[^>]+>',' ',value)).strip()

def add_floating_actions(body, page, lang, copy):
    # The Italian pages are also the templates when the ZIP is rebuilt.
    existing = next((node for node in body.children if isinstance(node, Node)
                     and node.attrs.get('id') == 'floating-actions'), None)
    if existing is not None:
        body.children.remove(existing)
    container = body if existing is None else existing
    booking_bar = next((node for node in container.children if isinstance(node, Node)
                        and node.attrs.get('id') == 'mobile-booking-bar'), None)
    if booking_bar is not None:
        container.children.remove(booking_bar)

    phone = re.sub(r'\D', '', CONFIG['telephone'])
    label = copy['floatingWhatsAppLabel']
    message = copy['generalMessage' if page == 'home' else 'floatingWhatsAppMessage']
    if page == 'home' and lang == 'it':
        message = CONFIG['measurement']['legacy_home_whatsapp_text']
    icon = ('<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
            '<path d="M12 2a9.8 9.8 0 0 0-8.4 14.8L2 22l5.4-1.4A9.8 9.8 0 1 0 12 2zm0 18a8.1 8.1 0 0 1-4.1-1.1l-.3-.2-3.2.9.9-3.1-.2-.3A8.2 8.2 0 1 1 12 20zm4.5-6.1c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.6.1l-.7.8c-.1.2-.3.2-.5.1a6.8 6.8 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.4.2-.4c.1-.1 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.4.1-.6.3-.2.3-.8.8-.8 2 0 1.1.8 2.2.9 2.4.1.1 1.6 2.6 4 3.6.6.3 1 .4 1.3.5.6.2 1.2.2 1.6.1.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .2-1.1-.1-.2-.2-.2-.3-.3z"/>'
            '</svg>')
    link = Node('a', {
        'id': 'floating-whatsapp',
        'class': 'floating-whatsapp',
        'href': f'https://wa.me/{phone}?text={quote(message)}',
        'target': '_blank',
        'rel': 'noopener noreferrer',
        'aria-label': f'{label} · WhatsApp',
    }, [icon])
    actions = [link]
    if booking_bar is not None:
        actions.append(booking_bar)
    body.children.append(Node('div', {'id': 'floating-actions', 'class': 'floating-actions'}, actions))

def image_dimensions(path):
    data=path.read_bytes()
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        return int.from_bytes(data[16:20], 'big'), int.from_bytes(data[20:24], 'big')
    pos=12
    while pos+8<=len(data):
        kind=data[pos:pos+4]; size=int.from_bytes(data[pos+4:pos+8],'little'); chunk=data[pos+8:pos+8+size]
        if kind==b'VP8X': return 1+int.from_bytes(chunk[4:7],'little'),1+int.from_bytes(chunk[7:10],'little')
        if kind==b'VP8 ': return int.from_bytes(chunk[6:8],'little')&16383,int.from_bytes(chunk[8:10],'little')&16383
        if kind==b'VP8L':
            bits=int.from_bytes(chunk[1:5],'little'); return 1+(bits&16383),1+((bits>>14)&16383)
        pos+=8+size+(size&1)
    raise ValueError('Unsupported image '+str(path))

def expand_panels(dom, kind, copy):
    marker='data-'+kind+'-panel'
    old=[n for n in dom.root.walk() if marker in n.attrs or n.attrs.get('id')==kind+'-panel']
    if not old: return
    prototype=deepcopy(old[0])
    parent=next(n for n in dom.root.walk() if old[0] in n.children)
    position=parent.children.index(old[0]); parent.children=[c for c in parent.children if c not in old]
    nodes=[]
    for i in range(3):
        panel=deepcopy(prototype); panel.attrs.update({'id':f'{kind}-panel-{i}',marker:str(i),'aria-labelledby':f'{kind}-tab-{i}'})
        panel.attrs.pop('hidden',None)
        if i: panel.attrs['hidden']=None
        for n in panel.walk():
            id=n.attrs.get('id','')
            if n is not panel and id: n.attrs['id']=re.sub(r'-[012]$','',id)+'-'+str(i)
            for part in ['title','text','detail']:
                if n.attrs.get('id')==f'{kind}-{part}-{i}':
                    key=kind+part.title()+str(i)
                    if key in copy: n.attrs['data-i18n']=key; n.children=[copy[key]]
            if n.attrs.get('id')==f'{kind}-number-{i}': n.children=[str(i+1).zfill(2)]
            if n.attrs.get('id')==f'use-route-{i}': n.attrs['data-use-route']=str(i)
        if kind=='route':
            for stop,label in zip([n for n in panel.walk() if 'data-route-stop' in n.attrs],copy['routeStops'+str(i)]):stop.children=[html.escape(label)]
        nodes.append(panel)
    parent.children[position:position]=nodes
    for n in dom.root.walk():
        if 'data-'+kind in n.attrs:
            i=n.attrs['data-'+kind]; n.attrs['aria-controls']=kind+'-panel-'+i

def graph(page,lang):
    c=strings(page,lang); base=CONFIG['base_url']; url=canonical(page,lang)
    organization={'@type':'Organization','@id':base+'#organization','name':CONFIG['name'],'url':base,'telephone':CONFIG['telephone'],'sameAs':[CONFIG['instagram']], 'areaServed':{'@type':'AdministrativeArea','name':'Puglia'},'contactPoint':{'@type':'ContactPoint','telephone':CONFIG['telephone'],'contactType':'reservations','availableLanguage':LANGS}}
    website={'@type':'WebSite','@id':base+'#website','url':base,'name':CONFIG['name'],'publisher':{'@id':base+'#organization'},'inLanguage':LANGS}
    webpage={'@type':'WebPage','@id':url+'#webpage','url':url,'name':c['pageTitle'],'description':c['metaDescription'],'inLanguage':lang,'isPartOf':{'@id':base+'#website'},'about':{'@id':base+'#organization'}}
    nodes=[organization,website,webpage]
    if page!='home':
        name=c[{'wedding':'globalWedding','tour':'globalTour','events':'globalEvents'}[page]]
        nodes.append({'@type':'Service','@id':url+'#service','name':name,'serviceType':name,'description':c['metaDescription'],'url':url,'provider':{'@id':base+'#organization'},'areaServed':{'@type':'AdministrativeArea','name':'Puglia'}})
        breadcrumb={'@type':'BreadcrumbList','@id':url+'#breadcrumb','itemListElement':[{'@type':'ListItem','position':1,'name':c['globalHome'],'item':canonical('home',lang)},{'@type':'ListItem','position':2,'name':name,'item':url}]}
        webpage['breadcrumb']={'@id':url+'#breadcrumb'}; webpage['mainEntity']={'@id':url+'#service'}; nodes.append(breadcrumb)
    return {'@context':'https://schema.org','@graph':nodes}

templates={page:(DIST/path).read_text() for page,path in ROUTES['it'].items()}
(DIST/'site-routes.js').write_text('window.PVE_ROUTE_CONFIG = '+jsondata({
    'base_url':CONFIG['base_url'], 'routes':ROUTES, 'measurement':CONFIG.get('measurement', {}),
    'contact_number':re.sub(r'\D', '', CONFIG['telephone'])
})+';\n')
rendered={}
for lang in LANGS:
    for page,filename in ROUTES[lang].items():
        c=strings(page,lang); dom=DOM(templates[page]); root=next(n for n in dom.root.walk() if n.tag=='html'); root.attrs['lang']=lang
        head=next(n for n in dom.root.walk() if n.tag=='head'); body=next(n for n in dom.root.walk() if n.tag=='body')
        prefix='../'*len(Path(filename).parent.parts) if str(Path(filename).parent)!='.' else ''
        body.attrs['data-site-root']=prefix or './'
        if not dom.byid('brand-remove-white'):
            body.children.insert(0, DOM(BRAND_FILTER).root.children[0])
        add_floating_actions(body, page, lang, c)
        for kind in ['moment','route','brief']: expand_panels(dom,kind,c)
        for n in dom.root.walk():
            key=n.attrs.get('data-i18n')
            if page == 'home' and key == 'quickTour':
                n.attrs.pop('data-page', None)
                n.attrs['href'] = '#tour-consigliati'
            if n.attrs.get('id') == 'whatsapp-send':
                n.tag = 'a'
                n.attrs.pop('type', None)
                phone = re.sub(r'\D', '', CONFIG['telephone'])
                n.attrs.update({'href': f'https://wa.me/{phone}', 'target': '_blank', 'rel': 'noopener noreferrer'})
            if key:
                if key not in c: raise KeyError((page,lang,key))
                n.children=[c[key]]
                if key=='chooseTitle':n.tag='h2'
            for source,target in [('data-i18n-alt','alt'),('data-i18n-aria','aria-label'),('data-i18n-placeholder','placeholder')]:
                if source in n.attrs:n.attrs[target]=c[n.attrs[source]]
            if n.tag=='a' and 'data-page' in n.attrs:
                n.attrs['href']=prefix+ROUTES[lang][n.attrs['data-page']]
                n.attrs.pop('aria-current',None)
                if 'brand' in n.attrs.get('class','').split():n.attrs['aria-label']=CONFIG['name']+' — '+c['globalHome']
            if n.tag == 'a' and n.attrs.get('href', '').startswith('tel:'):
                classes = n.attrs.get('class', '').split()
                if 'phone-link' not in classes:
                    n.attrs['class'] = ' '.join([*classes, 'phone-link'])
                    localized = {'data-i18n': n.attrs.pop('data-i18n')} if key else {}
                    n.children = [
                        DOM(PHONE_ICON).root.children[0],
                        Node('span', localized, n.children),
                    ]
            if 'data-lang' in n.attrs:
                n.tag='a'; n.attrs.pop('type',None);n.attrs.pop('aria-pressed',None)
                n.attrs['href']=prefix+ROUTES[n.attrs['data-lang']][page];n.attrs['hreflang']=n.attrs['data-lang'];n.attrs['lang']=n.attrs['data-lang']
                n.attrs.pop('aria-current',None)
                if n.attrs['data-lang']==lang:n.attrs['aria-current']='page'
            if n.tag=='img' and n.attrs.get('src','').lstrip('./').startswith('assets/'):
                asset=n.attrs['src'].lstrip('./');n.attrs['src']=prefix+asset
                n.attrs['width'],n.attrs['height']=image_dimensions(DIST/asset)
            if n.tag=='link' and n.attrs.get('href','').lstrip('./').startswith('assets/'):
                n.attrs['href']=prefix+n.attrs['href'].lstrip('./')
        for nav in [n for n in dom.root.walk() if 'global-nav' in n.attrs.get('class','').split()]:
            for n in nav.walk():
                if n.attrs.get('data-page')==page:n.attrs['aria-current']='page'
        if page=='wedding':
            dom.byid('experience-image').attrs['alt']=c['altExperience0']
        if page=='tour':
            dom.byid('route-image').attrs.update({'src':prefix+c['routeImage0'],'alt':c['routeAlt0']})
        if page=='events':
            dom.byid('brief-image').attrs.update({'src':prefix+c['briefImage0'],'alt':c['briefAlt0']})
        if page=='home':
            card_images = (image for card in dom.root.walk()
                           if 'home-card' in card.attrs.get('class', '').split()
                           for image in card.walk() if image.tag == 'img')
            for index,image_node in enumerate(card_images):
                if index==0: image_node.attrs['fetchpriority']='high'
                else: image_node.attrs.pop('fetchpriority',None); image_node.attrs['loading']='lazy'
        card=next((n for n in dom.root.walk() if 'booking-card' in n.attrs.get('class','').split()),None)
        if card:
            card.children=[n for n in card.children if not isinstance(n,Node) or n.attrs.get('id')!='request-nojs']
            help_text={'it':'Scrivici su WhatsApp: raccontaci data, luogo e quello che immagini.','en':'Send us your date, location and a little about your plans on WhatsApp.','fr':'Écrivez-nous sur WhatsApp avec votre date, le lieu et quelques mots sur votre projet.'}[lang]
            card.children.append(Node('noscript',{'id':'request-nojs'},[Node('p',{'class':'form-note'},[help_text]),Node('a',{'class':'button button-dark','href':'https://wa.me/393663031469','target':'_blank','rel':'noopener noreferrer'},[c['openWhatsapp']])]))
        # Metadata is complete in the initial HTML, independent of JavaScript.
        head.children=[n for n in head.children if not isinstance(n,Node) or not (n.tag in ['meta','title','noscript'] or n.tag=='link' and n.attrs.get('rel') in ['canonical','alternate','stylesheet'] or n.tag=='script')]
        image={'home':'assets/wedding-hero.webp','wedding':'assets/wedding-hero.webp','tour':'assets/night.webp','events':'assets/events-wide.webp'}[page]
        def meta(key,value,property=False):head.children.append(Node('meta',{'property' if property else 'name':key,'content':value}))
        head.children[0:0]=[Node('meta',{'charset':'utf-8'}),Node('meta',{'name':'viewport','content':'width=device-width, initial-scale=1'}),Node('title',children=[html.escape(c['pageTitle'])])]
        meta('theme-color','#f7f7f2');meta('description',c['metaDescription']);meta('robots','index, follow, max-image-preview:large')
        for key,value in [('og:title',c['pageTitle']),('og:description',c['ogDescription']),('og:type','website'),('og:url',canonical(page,lang)),('og:site_name',CONFIG['name']),('og:locale',{'it':'it_IT','en':'en_GB','fr':'fr_FR'}[lang]),('og:image',urljoin(CONFIG['base_url'],image))]:meta(key,value,True)
        for alt in LANGS:
            if alt!=lang:meta('og:locale:alternate',{'it':'it_IT','en':'en_GB','fr':'fr_FR'}[alt],True)
        meta('twitter:card','summary_large_image');meta('twitter:title',c['pageTitle']);meta('twitter:description',c['metaDescription']);meta('twitter:image',urljoin(CONFIG['base_url'],image))
        head.children.append(Node('link',{'rel':'canonical','href':canonical(page,lang)}))
        for alt in LANGS:head.children.append(Node('link',{'rel':'alternate','hreflang':alt,'href':canonical(page,alt)}))
        head.children.append(Node('link',{'rel':'alternate','hreflang':'x-default','href':canonical(page,'it')}))
        head.children.extend(Node('link',{'rel':'stylesheet','href':prefix+file}) for file in CSS)
        head.children.extend([Node('script',{'id':'seo-jsonld','type':'application/ld+json'},[jsondata(graph(page,lang))]),Node('script',{'id':'seo-variants','type':'application/json'},[jsondata({l:graph(page,l) for l in LANGS})])])
        head.children.append(Node('noscript',children=['<style>.menu-toggle,[role="tablist"],[data-use-route],#use-brief,.booking-card form,#form-step{display:none!important}#mobile-nav[hidden]{display:block!important;position:static}.site-header{position:static}[data-moment-panel][hidden],[data-route-panel][hidden],[data-brief-panel][hidden]{display:block!important}.route-stage{display:block}</style>']))
        scripts=['translations.js','pages-data.js','site-routes.js','navigation.js','privacy.js','app.js' if page=='wedding' else 'experience.js']
        head.children.extend(Node('script',{'src':prefix+file,'defer':None}) for file in scripts)
        rendered[(page,lang)]=dom.render()
        path=DIST/filename;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(rendered[(page,lang)])

sitemap='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+''.join('  <url><loc>'+html.escape(canonical(page,lang))+'</loc></url>\n' for lang in LANGS for page in ROUTES[lang])+'</urlset>\n'
(DIST/'sitemap.xml').write_text(sitemap)
(DIST/'robots.txt').write_text('User-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: *\nAllow: /\n\nSitemap: '+urljoin(CONFIG['base_url'],'sitemap.xml')+'\n')

files=CSS+JS
assetnames=set()
for source in [*rendered.values(),*((DIST/file).read_text() for file in files)]:assetnames.update(re.findall(r'assets/([A-Za-z0-9_.-]+\.(?:webp|jpg|png|svg))',source))
asset_mime = {'.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp'}
assets = {
    name: f'data:{asset_mime[Path(name).suffix]};base64,' + base64.b64encode((DIST/'assets'/name).read_bytes()).decode()
    for name in sorted(assetnames)
}
bridge=r'''window.PVE_EMBEDDED=true;window.PVE_PREVIEW_LANGUAGE="__PVE_LANGUAGE__";
window.PVE_ASSETS=__PVE_ASSETS__;
document.querySelectorAll('[data-preview-asset]').forEach(e=>e.src=window.PVE_ASSETS[e.dataset.previewAsset]);
window.addEventListener('pve:language',e=>{window.PVE_PREVIEW_LANGUAGE=e.detail.language;parent.postMessage({kind:'pve:language',language:e.detail.language,title:document.title},'*');});
document.addEventListener('click',e=>{
 const a=e.target.closest('a');if(!a)return;
 if(a.dataset.page){e.preventDefault();parent.postMessage({kind:'pve:navigate',page:a.dataset.page,language:document.documentElement.lang,anchor:a.dataset.anchor||''},'*');return;}
 const href=a.getAttribute('href');if(href&&href.startsWith('#')){const target=document.getElementById(href.slice(1));if(target){e.preventDefault();target.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}}
});'''
inline={}
for page in ROUTES['it']:
    dom=DOM(rendered[(page,'it')]);head=next(n for n in dom.root.walk() if n.tag=='head');body=next(n for n in dom.root.walk() if n.tag=='body')
    scripts=[n.attrs['src'] for n in head.children if isinstance(n,Node) and n.tag=='script' and 'src' in n.attrs]
    head.children=[n for n in head.children if not isinstance(n,Node) or not (n.tag=='link' and n.attrs.get('rel')=='stylesheet' or n.tag=='script' and 'src' in n.attrs)]
    head.children.extend(Node('style',children=[(DIST/file).read_text()]) for file in CSS)
    for n in dom.root.walk():
        if n.tag=='meta' and n.attrs.get('name')=='robots':n.attrs['content']='noindex, follow'
        if n.tag=='link' and n.attrs.get('rel')=='icon':n.attrs['href']=assets['favicon.svg']
        if n.tag=='img' and n.attrs.get('src','').startswith('assets/'):
            n.attrs['data-preview-asset']=n.attrs.pop('src').replace('assets/','')
    body.children.append(Node('script',children=[bridge]))
    body.children.extend(Node('script',children=[(DIST/file).read_text()]) for file in scripts)
    inline[page]=dom.render()

outer='''<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, follow"><meta name="theme-color" content="#f7f7f2"><title>Puglia Vintage Experience</title><link rel="icon" href="'''+assets['favicon.svg']+'''" type="image/svg+xml"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f7f7f2}iframe{display:block;border:0;width:100%;height:100vh;height:100dvh;background:#f7f7f2}</style></head><body><iframe id="experience" title="Puglia Vintage Experience"></iframe><script>
window.PVE_ASSET_MAP='''+jsondata(assets)+''';const PAGES='''+jsondata(inline)+''';
const app=document.getElementById('experience');let current={page:null,language:null};
function parseRoute(){const parts=location.hash.replace(/^#\\/?/,'').split('/');return{page:PAGES[parts[0]]?parts[0]:'home',language:['it','en','fr'].includes(parts[1])?parts[1]:'it'};}
function render(page,language,push=false){if(!PAGES[page]||!['it','en','fr'].includes(language))return;if(current.page!==page||current.language!==language){current={page,language};document.documentElement.lang=language;app.srcdoc=PAGES[page].replace('__PVE_LANGUAGE__',language).replace('__PVE_ASSETS__',JSON.stringify(window.PVE_ASSET_MAP));}const hash='#'+page+'/'+language;if(location.hash!==hash){if(push)location.hash=hash;else{try{history.replaceState(null,'',hash);}catch(_){}}}}
window.addEventListener('message',e=>{if(e.source!==app.contentWindow)return;const d=e.data;if(!d||!['it','en','fr'].includes(d.language))return;if(d.kind==='pve:navigate'&&PAGES[d.page])render(d.page,d.language,true);if(d.kind==='pve:language'){current.language=d.language;document.documentElement.lang=d.language;if(typeof d.title==='string'){document.title=d.title;app.title=d.title;}try{history.replaceState(null,'','#'+current.page+'/'+d.language);}catch(_){}}});
window.addEventListener('hashchange',()=>{const r=parseRoute();render(r.page,r.language);});const first=parseRoute();render(first.page,first.language);
</script></body></html>'''
(OUT/'Puglia_Vintage_Experience_Anteprima.html').write_text(outer)
(DIST/'anteprima-completa.html').write_text(outer)
with zipfile.ZipFile(OUT/'Puglia_Vintage_Experience_Sito.zip','w',zipfile.ZIP_DEFLATED) as z:
    for filename in [*(file for lang in LANGS for file in ROUTES[lang].values()),*files,'robots.txt','sitemap.xml']:
        z.write(DIST/filename,'Puglia_Vintage_Experience/'+filename)
    for name in sorted(assetnames):z.write(DIST/'assets'/name,'Puglia_Vintage_Experience/assets/'+name)
    for file in ['LEGGIMI.txt','site-config.json']:z.write(ROOT/file,'Puglia_Vintage_Experience/'+file)
    z.write(Path(__file__).resolve(),'Puglia_Vintage_Experience/build_preview.py')
print('Complete HTML pages:',len(rendered),'| Embedded assets:',len(assets))
for name in ['Puglia_Vintage_Experience_Anteprima.html','Puglia_Vintage_Experience_Sito.zip']:print(name,(OUT/name).stat().st_size,'bytes')
