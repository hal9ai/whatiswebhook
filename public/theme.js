(function(){var d=document.documentElement;d.classList.add("js");try{var t=localStorage.getItem("theme");if(!t)t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";d.dataset.theme=t}catch(e){d.dataset.theme="light"}
// Palette preview: ?palette=lagoon|meadow|citrine, remembered; ?palette=blue resets.
try{var p=new URLSearchParams(location.search).get("palette");if(p)localStorage.setItem("palette",p);p=localStorage.getItem("palette");if(p&&p!=="blue")d.dataset.palette=p}catch(e){}})();
