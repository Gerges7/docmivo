(function(){
 const C=window.DOCMIVO_CONFIG||{};
 const client=C.adsenseClient;
 if(!client) return;
 // The verification/Auto Ads script is embedded in <head> on production pages.
 // Avoid loading the same AdSense library twice.
 if(document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) return;
 const s=document.createElement('script');
 s.async=true;s.crossOrigin='anonymous';
 s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(client);
 document.head.appendChild(s);
})();
