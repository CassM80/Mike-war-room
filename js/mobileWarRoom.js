(function(){
  const mq=window.matchMedia('(max-width: 900px)');
  const items=[];

  function setup(){
    const roster=document.querySelector('#warRoomView .roster');
    const sidePanels=[...document.querySelectorAll('#warRoomView .side > .panel')];
    const targets=sidePanels[0];
    const intelligence=sidePanels[1];
    const configs=[
      [targets,false],
      [intelligence,true],
      [roster,true]
    ];

    configs.forEach(([panel,collapsed])=>{
      if(!panel||panel.dataset.mobileToggleReady==='1') return;
      const title=panel.querySelector(':scope > .panel-title');
      if(!title) return;
      panel.dataset.mobileToggleReady='1';
      panel.classList.add('mobile-collapsible');
      if(collapsed) panel.classList.add('mobile-collapsed');
      title.setAttribute('role','button');
      title.setAttribute('tabindex','0');
      title.setAttribute('aria-expanded',String(!collapsed));
      const toggle=()=>{
        if(!mq.matches) return;
        const now=panel.classList.toggle('mobile-collapsed');
        title.setAttribute('aria-expanded',String(!now));
      };
      title.addEventListener('click',toggle);
      title.addEventListener('keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}
      });
      items.push({panel,title});
    });
  }

  function sync(){
    items.forEach(({panel,title})=>{
      if(!mq.matches){
        title.setAttribute('aria-expanded','true');
      }else{
        title.setAttribute('aria-expanded',String(!panel.classList.contains('mobile-collapsed')));
      }
    });
  }

  window.addEventListener('DOMContentLoaded',()=>{setup();sync();});
  mq.addEventListener?.('change',sync);
})();
