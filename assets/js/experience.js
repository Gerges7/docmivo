/* DocMivo: accessible, preference-aware theme and progressive UI localization.
   Tool documentation is authored in Arabic; do not claim a fully translated article. */
(function () {
  'use strict';
  const root=document.documentElement;
  const allowed=['ar','en','fr','es'];
  const labels={
    ar:{language:'لغة الواجهة',theme:'المظهر',auto:'تلقائي',light:'فاتح',dark:'داكن',note:'ترجمة القوائم والأزرار الأساسية فقط؛ شرح الأدوات التفصيلي متاح بالعربية حاليًا.'},
    en:{language:'Interface language',theme:'Theme',auto:'System',light:'Light',dark:'Dark',note:'Navigation and basic controls are translated. Detailed tool guides are currently in Arabic.'},
    fr:{language:"Langue de l’interface",theme:'Thème',auto:'Système',light:'Clair',dark:'Sombre',note:'Les menus et commandes principales sont traduits. Les guides détaillés restent en arabe.'},
    es:{language:'Idioma de interfaz',theme:'Tema',auto:'Sistema',light:'Claro',dark:'Oscuro',note:'Los menús y controles básicos están traducidos. Las guías detalladas siguen en árabe.'}
  };
  // All entries are reviewed UI labels, not automatic translation of substantive guidance.
  const phrases={
    'الأدوات':['Tools','Outils','Herramientas'],
    'الأدوات الذكية':['AI tools','Outils IA','Herramientas IA'],
    'الدلائل':['Guides','Guides','Guías'],
    'الأدلة':['Guides','Guides','Guías'],
    'عن الموقع':['About','À propos','Acerca de'],
    'الخصوصية':['Privacy','Confidentialité','Privacidad'],
    'كل الأدوات':['All tools','Tous les outils','Todas las herramientas'],
    'الرئيسية':['Home','Accueil','Inicio'],
    'تواصل معنا':['Contact us','Contactez-nous','Contáctanos'],
    'تواصل':['Contact','Contact','Contacto'],
    'المحتوى':['Resources','Ressources','Recursos'],
    'قانوني':['Legal','Mentions légales','Legal'],
    'ابدأ العملية':['Start processing','Lancer le traitement','Iniciar proceso'],
    'اختيار ملفات':['Choose files','Choisir des fichiers','Elegir archivos'],
    'اختيار ملف':['Choose a file','Choisir un fichier','Elegir un archivo'],
    'اسحب الملفات هنا':['Drop files here','Déposez les fichiers ici','Suelta los archivos aquí'],
    'ابحث عن أداة':['Find a tool','Chercher un outil','Buscar herramienta'],
    'أسئلة شائعة':['Frequently asked questions','Questions fréquentes','Preguntas frecuentes'],
    'أدوات مرتبطة':['Related tools','Outils associés','Herramientas relacionadas'],
    'اقرأ المزيد':['Read more','En savoir plus','Leer más'],
    'العودة إلى الرئيسية':['Back to home','Retour à l’accueil','Volver al inicio'],
    'استكشف الأدوات ←':['Explore tools →','Explorer les outils →','Explorar herramientas →'],
    'مجاني • بدون تسجيل • بدون علامة مائية':['Free • No sign-up • No watermarks','Gratuit • Sans inscription • Sans filigrane','Gratis • Sin registro • Sin marcas de agua'],
    'أدوات مجانية • معالجة محلية قدر الإمكان':['Free tools • Local processing when possible','Outils gratuits • Traitement local si possible','Herramientas gratis • Procesamiento local cuando sea posible'],
    'مجاني • سريع • بدون تسجيل':['Free • Fast • No sign-up','Gratuit • Rapide • Sans inscription','Gratis • Rápido • Sin registro'],
    '✓ بدون تسجيل':['✓ No sign-up','✓ Sans inscription','✓ Sin registro'],
    '✓ بدون علامة مائية':['✓ No watermarks','✓ Sans filigrane','✓ Sin marcas de agua'],
    '✓ واجهة بسيطة':['✓ Simple interface','✓ Interface simple','✓ Interfaz sencilla'],
    '✓ عربي وإنجليزي':['✓ Interface translations (beta)','✓ Menus traduits (bêta)','✓ Menús traducidos (beta)'],
    'العودة إلى الأدوات':['Back to tools','Retour aux outils','Volver a herramientas'],
    'الأداة غير متاحة مؤقتًا':['Tool temporarily unavailable','Outil temporairement indisponible','Herramienta temporalmente no disponible']
  };
  const keys=Object.keys(phrases);
  const dictionary=new Map(keys.map(k=>[k,phrases[k]]));
  const original=new WeakMap();
  function storeRead(key,fallback){try{return localStorage.getItem(key)||fallback;}catch{return fallback;}}
  function storeWrite(key,val){try{localStorage.setItem(key,val);}catch{}}
  let language=storeRead('docmivo.language','ar');
  if(!allowed.includes(language))language='ar';
  let theme=storeRead('docmivo.theme','system');
  if(!['light','dark','system'].includes(theme))theme='system';
  const mq=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)');
  function setTheme(next,save){
    theme=next;
    if(save)storeWrite('docmivo.theme',next);
    root.dataset.theme=next==='system'?(mq&&mq.matches?'dark':'light'):next;
    root.dataset.themePreference=next;
    if(themeButton){
      const active=root.dataset.theme;
      themeButton.textContent=next==='system'?'◐':active==='dark'?'☀':'☾';
      themeButton.setAttribute('aria-label',labels[language].theme+': '+labels[language][next==='system'?'auto':next]);
      themeButton.title=themeButton.getAttribute('aria-label');
      themeButton.setAttribute('aria-pressed',String(active==='dark'));
    }
  }
  let themeButton=null,languageSelect=null,notice=null;
  function translate(){
    // Keep original text in memory so changing languages is reversible.
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    let n;
    while((n=walker.nextNode())){
      const parent=n.parentElement;
      if(!parent||parent.closest('script,style,noscript,textarea,code,pre,option,#infoBox,#status,.dm-preferences,.dm-language-notice'))continue;
      if(!original.has(n))original.set(n,n.nodeValue);
      const before=original.get(n),trimmed=before.trim(),found=dictionary.get(trimmed);
      if(!found){if(n.nodeValue!==before)n.nodeValue=before;continue;}
      const target=language==='ar'?trimmed:found[allowed.indexOf(language)-1];
      n.nodeValue=before.replace(trimmed,target);
    }
    root.lang=language;
    root.dir=language==='ar'?'rtl':'ltr';
    if(languageSelect){languageSelect.value=language;languageSelect.setAttribute('aria-label',labels[language].language);languageSelect.title=labels[language].language;}
    if(notice){notice.hidden=language==='ar';notice.textContent=labels[language].note;}
    setTheme(theme,false);
    document.dispatchEvent(new CustomEvent('docmivo:languagechange',{detail:{language:language}}));
  }
  function createControls(){
    const nav=document.querySelector('.nav-actions')||document.querySelector('.nav-inner');
    if(!nav||document.querySelector('.dm-preferences'))return;
    const controls=document.createElement('div');
    controls.className='dm-preferences';
    controls.setAttribute('role','group');
    const select=document.createElement('select');
    select.className='dm-language';
    select.setAttribute('aria-label',labels[language].language);
    for(const [code,name] of [['ar','العربية'],['en','English'],['fr','Français'],['es','Español']]){
      const option=document.createElement('option');option.value=code;option.textContent=name;select.appendChild(option);
    }
    select.value=language;
    select.addEventListener('change',()=>{
      language=allowed.includes(select.value)?select.value:'ar';
      storeWrite('docmivo.language',language);translate();
    });
    languageSelect=select;
    const btn=document.createElement('button');
    btn.type='button';btn.className='dm-theme-button';btn.setAttribute('aria-label','Theme');
    btn.addEventListener('click',()=>{
      const next=theme==='system'?'dark':theme==='dark'?'light':'system';
      setTheme(next,true);
    });
    themeButton=btn;
    controls.append(select,btn);
    const menu=nav.querySelector('.menu-btn');
    if(menu)nav.insertBefore(controls,menu);else nav.appendChild(controls);
    const main=document.querySelector('main');
    if(main){
      notice=document.createElement('p');
      notice.className='dm-language-notice';
      notice.setAttribute('role','note');notice.hidden=true;
      main.insertBefore(notice,main.firstChild);
    }
  }
  createControls();
  translate();
  if(mq){
    const update=()=>{if(theme==='system')setTheme('system',false);};
    if(mq.addEventListener)mq.addEventListener('change',update);else if(mq.addListener)mq.addListener(update);
  }
})();