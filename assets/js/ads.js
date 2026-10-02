(function(){
 const C=window.DOCMIVO_CONFIG||{};
 const client=C.adsenseClient;
 if(!client) return;
 // Load the official AdSense script only after the site is approved and a real Publisher ID is configured.
 const s=document.createElement('script');
 s.async=true;s.crossOrigin='anonymous';
 s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+encodeURIComponent(client);
 document.head.appendChild(s);
 // Ad units stay hidden until real slot IDs are configured after approval.
})();
