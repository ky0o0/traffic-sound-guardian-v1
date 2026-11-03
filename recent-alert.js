// Last genuine positive analysis window, retained after stop; no audio or storage.
const title=document.getElementById('last-warning-title');
const output=document.getElementById('last-warning-value');
let last=null;
function render(){
 if(!title||!output)return;
 const language=document.documentElement.lang;
 title.textContent=({ja:'最近の警告',en:'Last warning','zh-CN':'最近一次警告'})[language]??'Last warning';
 output.textContent=last ? (last.labels?.[language]??last.label)+' · '+new Date(last.at).toLocaleTimeString(language,{hour12:false}) : 'N/A';
}
window.addEventListener('tsg:warning',event=>{if(event.detail?.label){last={label:event.detail.label,labels:event.detail.labels,at:Date.now()};render();}});
window.addEventListener('tsg:language',render);
render();
