/* CRAVE ISLAND CEYLON — customer Settings and original calm ambience */
(function(){
  "use strict";
  const KEY="cicCalmMusicEnabled";
  let audioContext=null, masterGain=null, oscillators=[], melodyTimer=null;
  function toast(message){
    if(typeof window.toast==="function")window.toast(message);
  }
  function startCalmMusic(){
    const AudioContextClass=window.AudioContext||window.webkitAudioContext;
    if(!AudioContextClass){toast("Calm Music is not supported by this browser.");return false;}
    try{
      if(audioContext&&audioContext.state==="running")return true;
      audioContext=new AudioContextClass();
      masterGain=audioContext.createGain();
      masterGain.gain.setValueAtTime(0,audioContext.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.045,audioContext.currentTime+2.5);
      const filter=audioContext.createBiquadFilter();
      filter.type="lowpass";filter.frequency.value=900;filter.Q.value=0.35;
      filter.connect(masterGain);masterGain.connect(audioContext.destination);
      const tones=[
        {frequency:130.81,level:0.34},
        {frequency:164.81,level:0.25},
        {frequency:196.00,level:0.20},
        {frequency:261.63,level:0.12}
      ];
      oscillators=tones.map(tone=>{
        const oscillator=audioContext.createOscillator();
        const gain=audioContext.createGain();
        oscillator.type="sine";oscillator.frequency.value=tone.frequency;
        gain.gain.value=tone.level;
        oscillator.connect(gain);gain.connect(filter);oscillator.start();
        return oscillator;
      });
      // A small original, slow-moving melody keeps the ambience musical without
      // loading or streaming third-party audio.
      const melody=audioContext.createOscillator();
      const melodyGain=audioContext.createGain();
      melody.type="sine";melodyGain.gain.value=0.0001;
      melody.connect(melodyGain);melodyGain.connect(filter);melody.start();
      oscillators.push(melody);
      const phrase=[261.63,329.63,392.00,329.63,293.66,349.23,440.00,349.23];
      const schedulePhrase=()=>{
        if(!audioContext)return;
        const startAt=audioContext.currentTime+0.15;
        phrase.forEach((frequency,index)=>{
          const at=startAt+index*2;
          melody.frequency.setValueAtTime(frequency,at);
          melodyGain.gain.setValueAtTime(0.0001,at);
          melodyGain.gain.linearRampToValueAtTime(0.004,at+0.35);
          melodyGain.gain.linearRampToValueAtTime(0.0001,at+1.8);
        });
      };
      schedulePhrase();
      melodyTimer=window.setInterval(schedulePhrase,16000);
      if(audioContext.state==="suspended")audioContext.resume();
      return true;
    }catch(error){
      stopCalmMusic();toast("Calm Music could not start. Please try again.");return false;
    }
  }
  function stopCalmMusic(){
    if(melodyTimer){window.clearInterval(melodyTimer);melodyTimer=null;}
    if(!audioContext)return;
    const context=audioContext,gain=masterGain,nodes=oscillators.slice();
    audioContext=null;masterGain=null;oscillators=[];
    try{
      if(gain){gain.gain.cancelScheduledValues(context.currentTime);gain.gain.setTargetAtTime(0,context.currentTime,0.25);}
      window.setTimeout(()=>{
        nodes.forEach(node=>{try{node.stop();node.disconnect();}catch(_){}});
        try{context.close();}catch(_){}
      },1000);
    }catch(_){try{context.close();}catch(__){}}
  }
  window.cicToggleCalmMusic=function(enabled){
    const active=!!enabled;
    if(active&&!startCalmMusic()){
      const checkbox=document.getElementById("cicCalmMusic");if(checkbox)checkbox.checked=false;
      try{localStorage.setItem(KEY,"0");}catch(_){}
      return;
    }
    if(!active)stopCalmMusic();
    try{localStorage.setItem(KEY,active?"1":"0");}catch(_){}
    toast(active?"Calm Music is on.":"Calm Music is off.");
  };
  window.cicOpenSettings=function(){
    if(typeof window.openModal==="function")window.openModal("settingsModal");
    let enabled=false;try{enabled=localStorage.getItem(KEY)==="1";}catch(_){}
    const checkbox=document.getElementById("cicCalmMusic");
    if(checkbox)checkbox.checked=enabled;
    // Browsers require a user gesture before resuming audio after a page reload.
    if(enabled)startCalmMusic();
  };
  window.addEventListener("pagehide",stopCalmMusic);
})();