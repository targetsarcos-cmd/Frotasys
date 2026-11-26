/* Excel-style trip discussion for the beta workspace. */
(() => {
  'use strict';
  const shell = document.getElementById('beta-shell');
  const menu = document.getElementById('ctx-menu');
  const panel = document.createElement('section');
  panel.id = 'beta-comment-panel';
  panel.className = 'beta-comment-panel';
  panel.setAttribute('aria-label', 'Comentarios da viagem');
  panel.setAttribute('role', 'dialog');
  panel.hidden = true;
  document.body.append(panel);
  let activeId = '', pinned = false, timer = 0, pending = false;
  const byTrip = id => state.viagens.find(trip => String(trip._id) === String(id));
  const threads = trip => Array.isArray(trip?.comentariosBeta) ? trip.comentariosBeta : [];
  const observation = trip => String(trip?.obs || '').trim();
  const hasHistory = trip => !!observation(trip) || threads(trip).length > 0;
  const canWrite = () => canEditViagens() && !isBetaReadOnly();
  const colors = [
    ['orange','Laranja','#E97132'],
    ['yellow','Amarelo','#FFC000'],
    ['blue','Azul claro','#A6C9EC'],
    ['pink','Rosa','#D86DCD']
  ];
  const colorOf = trip => colors.some(([id]) => id === trip?.corLinhaBeta) ? trip.corLinhaBeta :
    (trip?.marcadoAmarelo ? 'yellow' : '');
  const el = (tag, cls, value) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  };
  function button(text, fn, cls = '') {
    const btn = el('button', cls, text);
    btn.type = 'button';
    btn.onclick = fn;
    return btn;
  }
  function anchor(id) {
    return shell.querySelector('td[data-field="placa"][data-id="' + CSS.escape(String(id)) + '"]');
  }
  function position() {
    const cell = anchor(activeId);
    if (!cell || !cell.getClientRects().length) { close(); return; }
    const rect = (cell.querySelector('.beta-comment-plate') || cell).getBoundingClientRect();
    const width = panel.offsetWidth, height = panel.offsetHeight;
    let left = rect.right + 7;
    if (left + width > window.innerWidth - 10) left = rect.left - width - 7;
    panel.style.left = Math.max(8, Math.min(left, window.innerWidth - width - 8)) + 'px';
    panel.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)) + 'px';
  }
  function close() {
    clearTimeout(timer);
    if (pending) return;
    panel.hidden = true;
    activeId = '';
    pinned = false;
  }
  function delayClose() {
    clearTimeout(timer);
    if (!pinned && !pending) timer = setTimeout(close, 700);
  }
  function show(id, pin = false, compose = false) {
    const trip = byTrip(id);
    if (!trip || (!pin && !hasHistory(trip))) return;
    clearTimeout(timer);
    if (pending || (!pin && (pinned || !menu.classList.contains('hidden')))) return;
    activeId = String(id);
    pinned = pin;
    panel.hidden = false;
    render(compose);
  }
  function pin() { pinned = true; clearTimeout(timer); }
  function dateLabel(value) {
    const date = new Date(value);
    return isNaN(date.getTime()) ? '' : date.toLocaleString('pt-BR', {dateStyle:'short', timeStyle:'short'});
  }
  function form(action, ids = {}, value = '', label = 'Publicar') {
    const wrapper = el('form', 'beta-comment-form');
    const input = el('textarea');
    input.rows = 2; input.maxLength = 2000; input.required = true;
    input.placeholder = action === 'reply' ? 'Responder...' : 'Escreva um comentario...';
    input.setAttribute('aria-label', input.placeholder);
    input.value = value;
    input.addEventListener('focus', pin);
    const submit = el('button', 'beta-comment-primary', label);
    submit.type = 'submit';
    wrapper.append(input, submit);
    wrapper.onsubmit = async event => {
      event.preventDefault();
      if (!input.value.trim() || pending) return;
      pin();
      submit.disabled = true;
      try { await save({ action, ...ids, text:input.value }); }
      finally { submit.disabled = false; }
    };
    return wrapper;
  }
  function render(compose = false) {
    const trip = byTrip(activeId);
    if (!trip) { close(); return; }
    panel.replaceChildren();
    const header = el('div', 'beta-comment-header');
    const heading = el('div');
    heading.append(el('strong', '', trip.placa || 'Viagem'), el('small', '', 'Observacoes e comentarios'));
    const dismiss = button('×', () => close(), 'beta-comment-close');
    dismiss.setAttribute('aria-label','Fechar comentarios');
    header.append(heading, dismiss); panel.append(header);
    const content = el('div', 'beta-comment-content');
    const obs = observation(trip);
    if (obs) {
      const section = el('div', 'beta-comment-observation');
      section.append(el('strong', '', 'Observacao da viagem'), el('p', '', obs));
      if (canWrite() && canEditViagemField(trip,'obs')) {
        const actions = el('div','beta-comment-actions');
        actions.append(button('Editar observacao', () => {
          pin();
          const editor = el('textarea','beta-obs-editor');
          editor.value = obs;
          editor.rows = 3;
          editor.setAttribute('aria-label','Editar observacao');
          const controls = el('div','beta-comment-actions');
          controls.append(button('Cancelar', () => render(), 'beta-comment-link'),
            button('Salvar', () => saveObservation(editor.value), 'beta-comment-primary'));
          section.replaceChildren(el('strong','','Observacao da viagem'),editor,controls);
          editor.focus();
          position();
        },'beta-comment-link'), button('Excluir observacao', async () => {
          pin();
          if (!pending && window.confirm('Excluir a observacao desta viagem?')) await saveObservation('');
        },'beta-comment-link beta-comment-danger'));
        section.append(actions);
      }
      content.append(section);
    }
    const list = threads(trip);
    if (!list.length && !obs) content.append(el('p', 'beta-comment-empty', 'Nenhum comentario registrado.'));
    for (const thread of list) {
      const resolved = !!thread.resolvedAt;
      const card = el('article', 'beta-comment-thread' + (resolved ? ' is-resolved' : ''));
      if (resolved) card.append(el('div','beta-comment-resolved', 'Resolvido por ' + (thread.resolvedBy?.name || 'usuario') + ' · ' + dateLabel(thread.resolvedAt)));
      for (const msg of Array.isArray(thread.messages) ? thread.messages : []) {
        const message = el('div', 'beta-comment-message');
        const avatar = el('span', 'beta-comment-avatar', initialsFromName(msg.authorName || 'U'));
        const main = el('div', 'beta-comment-message-main');
        const meta = el('div', 'beta-comment-meta');
        meta.append(el('strong', '', msg.authorName || 'Usuario'), el('small', '', dateLabel(msg.createdAt) + (msg.editedAt ? ' · editado' : '')));
        main.append(meta, el('p','',msg.text || ''));
        const actions = el('div','beta-comment-actions');
        if (!resolved && canWrite() && msg.authorId === currentUserWorkId()) {
          actions.append(button('Editar', () => {
            pin();
            const editor = form('edit',{threadId:thread.id,messageId:msg.id},msg.text,'Salvar');
            main.replaceChildren(meta, editor, button('Cancelar', () => render()));
            editor.querySelector('textarea').focus();
            position();
          }, 'beta-comment-link'));
        }
        if (!resolved && canWrite() && (isAdmin() || msg.authorId === currentUserWorkId())) {
          actions.append(button('Excluir', async () => {
            pin();
            if (!pending && window.confirm('Excluir esta mensagem?')) {
              await save({action:'delete',threadId:thread.id,messageId:msg.id});
            }
          }, 'beta-comment-link beta-comment-danger'));
        }
        if (actions.childElementCount) main.append(actions);
        message.append(avatar, main); card.append(message);
      }
      if (!resolved && canWrite()) {
        card.append(form('reply',{threadId:thread.id},'','Responder'));
        const threadActions = el('div','beta-comment-actions beta-comment-thread-actions');
        if (isAdmin() || thread.messages.every(msg => msg.authorId === currentUserWorkId())) {
          threadActions.append(button('Excluir conversa', async () => {
            pin();
            if (!pending && window.confirm('Excluir todas as mensagens desta conversa?')) {
              await save({action:'delete-thread',threadId:thread.id});
            }
          }, 'beta-comment-link beta-comment-danger'));
        }
        threadActions.append(button('Marcar como resolvido', async () => {
          pin();
          if (pending) return;
          if (!window.confirm('Resolver este comentario? As mensagens nao poderao mais ser editadas.')) return;
          await save({action:'resolve',threadId:thread.id});
        }, 'beta-comment-resolve'));
        card.append(threadActions);
      }
      content.append(card);
    }
    if (canWrite()) {
      const footer = el('div','beta-comment-compose');
      footer.append(el('strong','','Novo comentario'),form('create'));
      content.append(footer);
    }
    panel.append(content);
    position();
    if (compose && canWrite()) {
      const input = content.querySelector('.beta-comment-compose textarea');
      input?.scrollIntoView({block:'nearest'});
      input?.focus({preventScroll:true});
    }
  }
  async function saveObservation(value) {
    if (pending || !activeId || !canWrite()) return;
    const trip = byTrip(activeId);
    if (!trip || !canEditViagemField(trip,'obs')) return;
    pending = true;
    try {
      const updated = await updateViagemField(activeId,'obs',String(value || '').trim());
      if (updated) render();
    } finally { pending = false; }
  }
  function applyUpdatedTrip(id, updated) {
    if (!updated || String(updated._id) !== id) return false;
    const index = state.viagens.findIndex(trip => String(trip._id) === id);
    if (index !== -1) state.viagens[index] = updated;
    if (String(state.selectedViagemId) === id) {
      state.selectedViagemDetails = updated;
      if (state.drawerDraft) {
        state.drawerDraft.comentariosBeta = updated.comentariosBeta;
        state.drawerDraft.corLinhaBeta = updated.corLinhaBeta;
        state.drawerDraft.marcadoAmarelo = updated.marcadoAmarelo;
      }
    }
    renderAll();
    return true;
  }
  async function save(payload) {
    if (!canWrite() || pending || !activeId) return;
    pending = true;
    const id = activeId;
    try {
      const updated = await apiFetch('/api/viagens/' + encodeURIComponent(id) + '/comentarios', {method:'POST',body:JSON.stringify(payload)});
      if (applyUpdatedTrip(id,updated)) render();
    } finally { pending = false; }
  }

  const detailsItem = el('div','ctx-item','Abrir detalhes');
  const obsItem = el('div','ctx-item','Observacoes');
  const viewItem = el('div','ctx-item','Ver comentarios');
  const addItem = el('div','ctx-item','Adicionar comentario');
  const colorItem = el('div','beta-row-color-menu');
  colorItem.append(el('div','beta-row-color-title','Cor da linha'));
  const swatches = el('div','beta-row-swatches');
  for (const [id,name,hex] of colors) {
    const swatch = button('', () => menuAction(tripId => setRowColor(tripId,id)), 'beta-row-swatch');
    swatch.dataset.color = id;
    swatch.style.setProperty('--swatch',hex);
    swatch.title = name;
    swatch.setAttribute('aria-label','Marcar linha em '+name.toLowerCase());
    swatch.setAttribute('aria-pressed','false');
    swatches.append(swatch);
  }
  colorItem.append(swatches,button('Remover cor', () => menuAction(tripId => setRowColor(tripId,'')), 'beta-row-clear'));
  for (const node of [detailsItem,obsItem,viewItem,addItem,colorItem]) {
    node.style.display = 'none';
    menu.append(node);
  }
  function menuAction(action) {
    const id = state.ctxTargetId;
    hideCtxMenu();
    if (id) action(id);
  }
  detailsItem.onclick = () => menuAction(id => selectViagem(id));
  obsItem.onclick = () => menuAction(id => selectViagem(id,'observacoes'));
  viewItem.onclick = () => menuAction(id => show(id,true));
  addItem.onclick = () => menuAction(id => show(id,true,true));
  const pendingColors = new Set();
  async function setRowColor(id,color) {
    if (!canWrite() || pendingColors.has(id)) return;
    pendingColors.add(id);
    try {
      const updated = await apiFetch('/api/viagens/'+encodeURIComponent(id)+'/cor-linha',{method:'POST',body:JSON.stringify({color})});
      applyUpdatedTrip(String(id),updated);
    } finally { pendingColors.delete(id); }
  }
  function configureMenu(mode, trip) {
    close();
    const visible = mode === 'placa' && !!trip;
    detailsItem.style.display = visible ? '' : 'none';
    obsItem.style.display = visible ? '' : 'none';
    viewItem.style.display = visible && hasHistory(trip) ? '' : 'none';
    addItem.style.display = visible && canWrite() ? '' : 'none';
    colorItem.style.display = visible && canWrite() ? '' : 'none';
    for (const swatch of swatches.children) swatch.setAttribute('aria-pressed',String(swatch.dataset.color === colorOf(trip)));
  }
  function decorate(row, trip) {
    const color = colorOf(trip);
    row.classList.remove('is-marcado-amarelo');
    if (color) row.dataset.betaRowColor = color;
    else delete row.dataset.betaRowColor;
    const original = row.querySelector('.master-plate');
    const cell = row.querySelector('td[data-field="placa"]');
    if (!cell || !trip) return;
    let plate = cell.querySelector('.beta-comment-plate');
    if (!plate && original) {
      plate = el('button','plate beta-comment-plate',trip.placa || '-');
      plate.type = 'button';
      plate.dataset.tripId = String(trip._id);
      plate.setAttribute('aria-haspopup','menu');
      original.replaceWith(plate); // Removes the old observation balloon.
    }
    if (!plate) return;
    const open = threads(trip).some(thread => !thread.resolvedAt);
    plate.classList.toggle('beta-plate-attention', !!observation(trip) || open);
    plate.setAttribute('aria-label', 'Placa ' + (trip.placa || '-') + (hasHistory(trip) ? ', possui observacoes ou comentarios' : '') + ', abrir opcoes');
  }
  shell.addEventListener('pointerover', event => {
    const plate = event.target.closest('.beta-comment-plate');
    if (!plate || plate.contains(event.relatedTarget)) return;
    if (hasHistory(byTrip(plate.dataset.tripId))) show(plate.dataset.tripId);
  });
  shell.addEventListener('pointerout', event => {
    const plate = event.target.closest('.beta-comment-plate');
    if (plate && !plate.contains(event.relatedTarget)) delayClose();
  });
  shell.addEventListener('click', event => {
    const plate = event.target.closest('.beta-comment-plate');
    if (!plate) return;
    event.preventDefault(); event.stopPropagation();
    close();
    const rect = plate.getBoundingClientRect();
    showCtxMenu({preventDefault(){},clientX:rect.left,clientY:rect.bottom+4},plate.dataset.tripId,'placa');
  }, true);
  shell.addEventListener('dblclick', event => {
    if (event.target.closest('.beta-comment-plate')) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  panel.addEventListener('pointerenter', () => clearTimeout(timer));
  panel.addEventListener('pointerdown', pin);
  panel.addEventListener('click', event => event.stopPropagation());
  panel.addEventListener('pointerleave', delayClose);
  panel.addEventListener('focusin', pin);
  document.addEventListener('pointerdown', event => {
    if (!panel.contains(event.target) && !event.target.closest('.beta-comment-plate') && !menu.contains(event.target)) close();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close();
  });
  window.addEventListener('resize', () => { if (!panel.hidden) position(); });
  window.addEventListener('scroll', event => {
    if (panel.hidden || (event.target instanceof Node && panel.contains(event.target))) return;
    if (pinned) position(); else close();
  }, true);
  window.FrotasysBetaComments = { decorate, configureMenu };
})();
