/* Freight uses the workspace navigation and the authenticated trip application. */
(() => {
  const shell = document.getElementById('beta-shell');
  const page = document.getElementById('beta-fretes');
  const home = document.getElementById('navHome');
  const nav = shell.querySelector('[data-nav="Consulta Frete"]');
  const queue = document.getElementById('beta-espera');
  const queueNav = shell.querySelector('[data-nav="Lista de Espera"]');
  const form = document.getElementById('waitlist-form');
  document.getElementById('espera-cadastro').append(form);
  for (const group of form.querySelectorAll('.form-group')) {
    group.querySelector('label').htmlFor = group.querySelector('input,select').id;
  }
  const queueTable = document.querySelector('#waitlist-overlay .waitlist-table-wrap');
  queueTable.querySelector('th:last-child').textContent = 'Ações';
  document.getElementById('espera-fila').append(queueTable);
  const title = shell.querySelector('.shell-location strong');
  const homeTitle = title.textContent;
  const grid = document.getElementById('frete-consult-grid');
  page.append(grid);

  function navigate() {
    const active = location.hash === '#fretes';
    const queueActive = location.hash === '#lista-espera';
    queue.hidden = !queueActive;
    page.hidden = !active;
    shell.querySelector('main.workspace').hidden = active || queueActive;
    title.textContent = active ? 'Tabela de Fretes' : queueActive ? 'Lista de Espera' : homeTitle;
    for (const [button,selected] of [[home,!active && !queueActive],[nav,active],[queueNav,queueActive]]) {
      button.classList.toggle('nav-current',selected);
      if (selected) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    }
    if (queueActive) {
      closeTravelDrawer();
      prepareWaitlistForm();
      renderListaEspera();
      if (state.userProfile) loadListaEspera();
    }
    if (active) {
      closeTravelDrawer();
      renderFreteConsultas();
      if (state.userProfile) refreshFreteConsultas();
    }
  }
  home.addEventListener('click',() => { if (!page.hidden || !queue.hidden) location.hash = ''; });
  window.addEventListener('hashchange',navigate);
  navigate();
})();

function renderBetaFreteBoard(routes) {
  const edit = isAdmin() && !isBetaReadOnly();
  const categories = [['agregado','Agregado'],['rows','Terceiros']];
  const sections = routes.map(route => {
    const index = freteRoutes().indexOf(route);
    function cells(key,i) {
      const row = route[key]?.[i];
      if (!row) return '<td colspan="3" class="rate-empty">&mdash;</td>';
      return ['eixos','pj','pf'].map(field => {
        const value = field === 'eixos' ? row.eixos : formatFreteAccounting(row[field]);
        const remove = edit && field === 'eixos' ? '<button type="button" class="rate-remove" aria-label="Excluir eixo '+row.eixos+'" onclick="deleteFreteEixo('+index+','+i+',\''+key+'\')">&times;</button>' : '';
        return '<td><span contenteditable="'+edit+'" data-frete-field="'+field+'" data-rate-group="'+key+'" data-route-index="'+index+'" data-row-index="'+i+'" data-value="'+escapeAttr(value)+'">'+escapeHtml(value)+'</span>'+remove+'</td>';
      }).join('');
    }
    const count = Math.max(route.agregado?.length || 0,route.rows.length,1);
    const name = '<th scope="rowgroup" rowspan="'+(count+(edit?1:0))+'"><span contenteditable="'+edit+'" data-frete-field="rota" data-route-index="'+index+'" data-value="'+escapeAttr(route.rota)+'">'+escapeHtml(route.rota)+'</span>'+
      (edit ? '<button type="button" class="rate-remove" aria-label="Excluir rota" onclick="deleteFreteRoute('+index+')">&times;</button>' : '')+'</th>';
    const rows = Array.from({length:count},(_,i) => '<tr>'+(i===0?name:'')+categories.map(([key])=>cells(key,i)).join('')+'</tr>').join('');
    const add = edit ? '<tr>'+categories.map(([key,label])=>'<td colspan="3"><button type="button" onclick="addFreteEixo('+index+',\''+key+'\')">+ Eixo '+label+'</button></td>').join('')+'</tr>' : '';
    return '<tbody>'+rows+add+'</tbody>';
  }).join('');
  const headers = categories.map(([,label])=>'<th scope="colgroup" colspan="3">'+label+'</th>').join('');
  const fields = '<th scope="col">Eixos</th><th scope="col">Valor PJ</th><th scope="col">Valor PF</th>';
  return '<div class="rate-scroll"><table class="rate-table"><thead><tr><th rowspan="2" scope="col"><button onclick="toggleFreteAlphabeticSort()">Rota ↕</button></th>'+headers+'</tr><tr>'+fields+fields+'</tr></thead>'+ (sections || '<tbody><tr><td colspan="7">Nenhuma rota encontrada.</td></tr></tbody>')+'</table></div>';
}
