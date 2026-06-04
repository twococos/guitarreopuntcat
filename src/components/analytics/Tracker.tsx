// Component servidor que injecta el tracker d'engagement client-side.
// No té "use client": és un Server Component pur que emet un <script> inline.

const TRACKER_SCRIPT = `(function(){
  if(navigator.doNotTrack==="1")return;
  var active=0,scrollPct=0,sent=false,lastTick=Date.now(),tickId=0;
  function tick(){
    var now=Date.now();
    if(document.visibilityState==="visible"&&document.hasFocus()){
      active+=now-lastTick;
    }
    lastTick=now;
  }
  tickId=setInterval(tick,5000);
  document.addEventListener("scroll",function(){
    var h=document.documentElement.scrollHeight;
    if(h>0){
      var pct=Math.min(100,Math.round((window.scrollY+window.innerHeight)/h*100));
      if(pct>scrollPct)scrollPct=pct;
    }
  },{passive:true});
  function sendData(){
    if(sent)return;
    sent=true;
    clearInterval(tickId);
    tick();
    var body=JSON.stringify({
      type:"page_engagement",
      path:location.pathname,
      active_ms:Math.round(active),
      scroll_pct:scrollPct,
      viewport_w:window.innerWidth,
      viewport_h:window.innerHeight
    });
    var blob=new Blob([body],{type:"application/json"});
    var ok=navigator.sendBeacon&&navigator.sendBeacon("/api/track",blob);
    if(!ok){
      fetch("/api/track",{method:"POST",body:blob,keepalive:true}).catch(function(){});
    }
  }
  document.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="hidden"){
      sendData();
    } else {
      sent=false;
      lastTick=Date.now();
      tickId=setInterval(tick,5000);
    }
  });
  window.addEventListener("pagehide",sendData);
})();`

export function Tracker() {
  return <script dangerouslySetInnerHTML={{ __html: TRACKER_SCRIPT }} />
}
