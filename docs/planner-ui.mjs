import { isDay, monday, cycleWeek, nextVisit, nextWeekday, proposePurchase, applyPurchase } from './planner.mjs?v=0.4.1';

// All state access is supplied by the existing session. This module has no
// storage or networking and never receives a GitHub token.
export function bindPlanner({getData,getState,setState,save,render,notify,escape,isoDay,formatDay,busy}) {
  const $=selector=>document.querySelector(selector);
  let preview=null;
  const anchor=()=>getState().cycleAnchor||getData().planner?.anchor;
  const clear=()=>{preview=null;$('#plan-preview').replaceChildren();$('#plan-notes').replaceChildren();$('#plan-notice').textContent='';$('#plan-quality').textContent='';$('#plan-count').textContent='';};
  const selected=()=>[...document.querySelectorAll('[data-plan-id]:checked:not(:disabled)')].map(i=>i.dataset.planId);
  function count() {
    const amount=selected().length;
    $('#plan-apply').textContent=amount?`Añadir ${amount} producto${amount===1?'':'s'}`:'Guardar planificación';
    $('#plan-count').textContent=`${amount} para añadir · ${preview?.items.filter(i=>i.existing).length||0} ya en tu lista`;
  }
  function showPreview() {
    $('#plan-next').setCustomValidity('');$('#plan-date').setCustomValidity('');
    const tripDate=$('#plan-date').value,nextDate=$('#plan-next').value;
    if(!isDay(tripDate)||!isDay(nextDate)){clear();$('#plan-apply').disabled=true;return;}
    try {
      preview=proposePurchase(getData(),getState(),{tripDate,nextDate,
        week:Number($('#plan-week').value),retireDone:$('#plan-retire').checked});
      $('#plan-apply').disabled=false;
      $('#plan-bases').textContent=preview.templates.join(' + ');
      $('#plan-quality').textContent=getData().planner.visitSplitReviewed===false?'Bases iniciales · Reparto orientativo · Revisión '+(getData().reviewDate||'pendiente'):getData().source?.reference?'Bases revisadas el '+(getData().reviewDate||'sin fecha'):'Datos ficticios de demostración';
      $('#plan-notice').textContent=preview.notice;
      $('#plan-notes').innerHTML=preview.notes.map(n=>`<li>${escape(n)}</li>`).join('');
      $('#plan-reference').textContent=`Ciclo calculado desde la semana ${anchor().week}, lunes ${formatDay(anchor().date,true)}. Puedes corregir la semana de esta compra.`;
      $('#plan-preview').innerHTML=preview.items.map((item,index)=>`<article class="plan-item ${item.existing?'plan-existing':''}">
        <label class="plan-choice" for="plan-item-${index}"><input id="plan-item-${index}" type="checkbox" data-plan-id="${escape(item.id)}" ${item.existing?'disabled':'checked'}><span><strong>${escape(item.name)}</strong><small class="${item.quantity?'':'needs-quantity'}">${item.existing?(item.done?'Ya comprado en tu lista':'Ya está en tu lista'):escape(item.quantity||'Cantidad por confirmar')} · ${item.kind==='menu'?'Menú':item.kind==='habit'?'Habitual':'Comprobar reposición'}</small></span></label>
        <details><summary>Por qué</summary><p>${item.reasons.map(escape).join('<br>')}</p></details></article>`).join('')||'<p class="field-help">No quedan candidatos para este intervalo. Comprueba tus exclusiones y productos apartados.</p>';
      count();
    } catch(error) {
      clear();$('#plan-apply').disabled=true;$('#plan-bases').textContent=error.message;
      $('#plan-next').setCustomValidity(error.message);
    }
  }
  function setDate(day) {
    $('#plan-date').value=day;$('#plan-next').value=nextVisit(day);
    $('#plan-next').min=nextDay(day);
    $('#plan-week').value=String(cycleWeek(day,anchor()));
    showPreview();
  }
  const nextDay=day=>{
    const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);
  };
  function open() {
    if(busy())return;
    if(!getData().planner){notify('Conecta o actualiza GitHub para cargar las ocho compras base.',true);return;}
    $('#plan-retire').checked=false;
    $('#plan-retire-wrap').hidden=!getState().items.some(i=>i.done);
    setDate(isoDay());
    $('#plan-dialog').showModal();
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button||busy())return;
    if(button.classList.contains('planner-open'))open();
    if(button.dataset.planPreset){
      const day=isoDay(),preset=button.dataset.planPreset;
      setDate(preset==='today'?day:nextWeekday(day,preset==='tuesday'?2:5));
    }
  });
  $('#plan-date').addEventListener('change',()=>{
    if(!isDay($('#plan-date').value))return;
    setDate($('#plan-date').value);
  });
  ['#plan-next','#plan-week','#plan-retire'].forEach(id=>$(id).addEventListener('change',showPreview));
  $('#plan-preview').addEventListener('change',count);
  $('#plan-form').addEventListener('submit',event=>{
    event.preventDefault();if(busy()||!preview)return;
    const applied=applyPurchase(getState(),preview,selected());
    setState(applied.state);save();render();$('#plan-dialog').close();
    const amount=applied.added.length,privateData=!!getData().source?.reference;
    notify(`${amount} producto${amount===1?' añadido':'s añadidos'}. Revisa cantidades.${privateData?' Guarda los cambios en GitHub.':''}`);
  });
  $('#plan-dialog').addEventListener('close',()=>{clear();$('#plan-bases').textContent='';$('#plan-reference').textContent='';$('#plan-count').textContent='';$('#plan-form').reset();});
  function refresh() {
    const state=getState(),data=getData();
    document.querySelectorAll('.planner-open').forEach(b=>b.disabled=!data.planner);
    const p=state.plan,summary=$('#plan-summary');
    summary.hidden=!data.planner;
    if(!data.planner)return;
    const week=cycleWeek(state.tripDate,state.cycleAnchor||data.planner.anchor);
    summary.textContent=`Semana ${week} · Hasta ${formatDay(state.nextDate)}${p?(p.tripDate===state.tripDate&&p.nextDate===state.nextDate?' · Propuesta preparada':' · Fechas cambiadas: revisa la propuesta'):' · Puedes preparar una propuesta'}`;
  }
  return {refresh,clear};
}
