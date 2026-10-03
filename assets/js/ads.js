(function(){
  const C=window.DOCMIVO_CONFIG||{};
  const client=C.adsenseClient;
  if(!client) return;
  const marker='adsbygoogle.js?client='+client;
  if(document.querySelector('script[src*="adsbygoogle.js?client="]')) return;
  const s=document.createElement('script');
  s.async=true;
  s.crossOrigin='anonymous';
  s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(client);
  document.head.appendChild(s);
})();
