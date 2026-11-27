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
  const threads = trip => Array.isArray(trip?.comentariosBeta) ? trip.comentariosBeta.filter(thread => !thread.resolvedAt) : [];
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
    input.placeholder = 'Escreva um comentário...';
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
    heading.append(el('strong', '', trip.placa || 'Viagem'), el('small', 'beta-comment-driver', String(trip.nome || '').trim() || 'Motorista não informado'));
    const dismiss = button('×', () => close(), 'beta-comment-close');
    dismiss.setAttribute('aria-label','Fechar comentarios');
    header.append(heading, dismiss); panel.append(header);
    const content = el('div', 'beta-comment-content');
    const obs = observation(trip);
    if (obs) {
      const group = el('div', 'beta-comment-observation-group');
      const section = el('div', 'beta-comment-observation');
      section.append(el('p', '', obs));
      group.append(section);
      if (canWrite() && canEditViagemField(trip,'obs')) {
        const actions = el('div','beta-comment-actions');
        actions.append(button('Editar observação', () => {
          pin();
          const editor = el('textarea','beta-obs-editor');
          editor.value = obs;
          editor.rows = 3;
          editor.setAttribute('aria-label','Editar observacao');
          const controls = el('div','beta-comment-actions');
          controls.append(button('Cancelar', () => render(), 'beta-comment-link'),
            button('Salvar', () => saveObservation(editor.value), 'beta-comment-primary'));
          section.replaceChildren(editor);
          actions.replaceWith(controls);
          editor.focus();
          position();
        },'beta-comment-link'), button('Excluir observação', async () => {
          pin();
          if (!pending && window.confirm('Excluir a observacao desta viagem?')) await saveObservation('');
        },'beta-comment-link beta-comment-danger'));
        group.append(actions);
      }
      content.append(group);
    }
    const list = threads(trip);
    if (!list.length && !obs) content.append(el('p', 'beta-comment-empty', 'Nenhum comentario registrado.'));
    for (const thread of list) {
      const card = el('article', 'beta-comment-thread');
      for (const msg of Array.isArray(thread.messages) ? thread.messages : []) {
        const message = el('div', 'beta-comment-message');
        const avatar = el('span', 'beta-comment-avatar', initialsFromName(msg.authorName || 'U'));
        const main = el('div', 'beta-comment-message-main');
        const meta = el('div', 'beta-comment-meta');
        meta.append(el('strong', '', msg.authorName || 'Usuario'), el('small', '', dateLabel(msg.createdAt) + (msg.editedAt ? ' · editado' : '')));
        main.append(meta, el('p','',msg.text || ''));
        const actions = el('div','beta-comment-actions');
        if (canWrite() && msg.authorId === currentUserWorkId()) {
          actions.append(button('Editar', () => {
            pin();
            const editor = form('edit',{threadId:thread.id,messageId:msg.id},msg.text,'Salvar');
            main.replaceChildren(meta, editor, button('Cancelar', () => render()));
            editor.querySelector('textarea').focus();
            position();
          }, 'beta-comment-link'));
        }
        if (canWrite() && (isAdmin() || msg.authorId === currentUserWorkId())) {
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
      if (canWrite()) {
        const threadActions = el('div','beta-comment-actions beta-comment-thread-actions');
        if (thread.messages.length > 1 && (isAdmin() || thread.messages.every(msg => msg.authorId === currentUserWorkId()))) {
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
          if (!window.confirm('Marcar como resolvido e excluir definitivamente este comentário?')) return;
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

  const menuIcons = {
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    details:'<path d="M13 3h8v8M21 3l-9 9"/><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    observation:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    view:'<path d="M13 3H5a2 2 0 0 0-2 2v7l3-3h7a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z"/><path d="M16 10h3a2 2 0 0 1 2 2v7l-3-3h-6a2 2 0 0 1-2-2v-2"/>',
    add:'<path d="M20 11a8 8 0 0 1-8 8H5l2-4a8 8 0 1 1 13-4Z"/><path d="M12 8v6M9 11h6"/>',
    registration:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    clear:'<path d="m5 16 8-11a2 2 0 0 1 3-.4l4 4a2 2 0 0 1 0 3L12 20H8l-3-3a1 1 0 0 1 0-1Z"/><path d="m9 11 7 7M12 20h9"/>'
  };
  function menuLabel(node, icon, label) {
    node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+menuIcons[icon]+'</svg>';
    node.append(el('span','beta-menu-label',label));
    node.classList.add('beta-menu-entry');
    if (node.tagName !== 'BUTTON') {
      node.setAttribute('role','button');
      node.tabIndex=0;
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); node.click(); }
      });
    }
    return node;
  }
  const copyItem = menuLabel(document.getElementById('ctx-copy'),'copy','Copiar placa');
  const detailsItem = menuLabel(el('div','ctx-item'),'details','Abrir detalhes');
  const obsItem = menuLabel(el('div','ctx-item'),'observation','Observações');
  const viewItem = menuLabel(el('div','ctx-item'),'view','Ver comentários');
  const addItem = menuLabel(el('div','ctx-item'),'add','Adicionar comentário');
  const registrationItem = menuLabel(el('div','ctx-item'),'registration','Cadastro efetuado');
  const colorItem = el('div','beta-row-color-menu');
  colorItem.append(el('div','beta-row-color-title','Cor da linha'));
  const swatches = el('div','beta-row-swatches');
  for (const [id,name,hex] of colors) {
    const swatch = button('', () => writeMenuAction(tripId => setRowColor(tripId,id)), 'beta-row-swatch');
    swatch.dataset.color = id;
    swatch.style.setProperty('--swatch',hex);
    swatch.title = name;
    swatch.setAttribute('aria-label','Marcar linha em '+name.toLowerCase());
    swatch.setAttribute('aria-pressed','false');
    swatches.append(swatch);
  }
  const clearItem = menuLabel(button('', () => writeMenuAction(tripId => setRowColor(tripId,'')), 'beta-row-clear'),'clear','Remover cor');
  const readOnlyNote = el('div','beta-menu-readonly');
  readOnlyNote.setAttribute('role','status');
  colorItem.append(swatches,clearItem,readOnlyNote);
  for (const node of [detailsItem,obsItem,viewItem,addItem,registrationItem,colorItem]) {
    node.style.display = 'none';
    menu.append(node);
  }
  function menuAction(action) {
    const id = state.ctxTargetId;
    hideCtxMenu();
    if (id) action(id);
  }
  function writeMenuAction(action) {
    if (!canWrite()) {
      readOnlyNote.textContent = isBetaReadOnly() ? 'Edição desativada no servidor beta. Ative BETA_ENABLE_WRITES no Render.' : 'Seu perfil não possui permissão de edição.';
      return;
    }
    menuAction(action);
  }
  detailsItem.onclick = () => menuAction(id => selectViagem(id));
  obsItem.onclick = () => menuAction(id => selectViagem(id,'observacoes'));
  viewItem.onclick = () => menuAction(id => show(id,true));
  addItem.onclick = () => writeMenuAction(id => show(id,true,true));
  registrationItem.onclick = () => writeMenuAction(async id=>{
    const trip=byTrip(id);
    if(!trip||!isCadastroPendente(trip)||!canEditViagemField(trip,'pamcard'))return;
    if(!window.confirm('Confirmar que o cadastro desta placa foi efetuado?'))return;
    await updateViagemField(id,'pamcard','PAMCARD OK');
  });
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
    menu.classList.toggle('beta-plate-context',visible);
    for (const item of [detailsItem,obsItem,viewItem,addItem,colorItem]) item.style.display = visible ? '' : 'none';
    const writable = visible && canWrite();
    registrationItem.style.display = visible && isCadastroPendente(trip) ? '' : 'none';
    registrationItem.setAttribute('aria-disabled',String(!writable || !canEditViagemField(trip,'pamcard')));
    for (const item of [addItem,clearItem,...swatches.children]) {
      item.setAttribute('aria-disabled',String(!writable));
      item.title = writable ? (item.dataset.color ? colors.find(c=>c[0]===item.dataset.color)[1] : '') : 'Edição indisponível';
    }
    readOnlyNote.hidden = !visible || writable;
    readOnlyNote.textContent = !writable ? (isBetaReadOnly() ? 'Beta em modo somente leitura. Ative a edição no Render.' : 'Seu perfil não permite editar.') : '';
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
    const open = threads(trip).length > 0;
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
