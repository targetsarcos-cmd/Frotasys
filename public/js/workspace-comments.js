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
    const rect = cell.getBoundingClientRect();
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
    if (!pinned && !pending) timer = setTimeout(close, 230);
  }
  function show(id, pin = false, compose = false) {
    const trip = byTrip(id);
    if (!trip || (!pin && !hasHistory(trip))) return;
    clearTimeout(timer);
    if (pending || (pinned && !pin)) return;
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
        if (!resolved && canWrite() && msg.authorId === currentUserWorkId()) {
          main.append(button('Editar', () => {
            pin();
            const editor = form('edit',{threadId:thread.id,messageId:msg.id},msg.text,'Salvar');
            main.replaceChildren(meta, editor, button('Cancelar', () => render()));
            editor.querySelector('textarea').focus();
            position();
          }, 'beta-comment-link'));
        }
        message.append(avatar, main); card.append(message);
      }
      if (!resolved && canWrite()) {
        card.append(form('reply',{threadId:thread.id},'','Responder'));
        card.append(button('Marcar como resolvido', async () => {
          pin();
          if (pending) return;
          if (!window.confirm('Resolver este comentario? As mensagens nao poderao mais ser editadas.')) return;
          await save({action:'resolve',threadId:thread.id});
        }, 'beta-comment-resolve'));
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
  async function save(payload) {
    if (!canWrite() || pending || !activeId) return;
    pending = true;
    const id = activeId;
    try {
      const updated = await apiFetch('/api/viagens/' + encodeURIComponent(id) + '/comentarios', {method:'POST',body:JSON.stringify(payload)});
      if (!updated || String(updated._id) !== id) return;
      const index = state.viagens.findIndex(trip => String(trip._id) === id);
      if (index !== -1) state.viagens[index] = updated;
      if (String(state.selectedViagemId) === id) {
        state.selectedViagemDetails = updated;
        if (state.drawerDraft) state.drawerDraft.comentariosBeta = updated.comentariosBeta;
      }
      renderAll();
      render();
    } finally { pending = false; }
  }

  const detailsItem = el('div','ctx-item','Abrir detalhes');
  const obsItem = el('div','ctx-item','Observacoes');
  const viewItem = el('div','ctx-item','Ver comentarios');
  const addItem = el('div','ctx-item','Adicionar comentario');
  for (const node of [detailsItem,obsItem,viewItem,addItem]) {
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
  function configureMenu(mode, trip) {
    const visible = mode === 'placa' && !!trip;
    detailsItem.style.display = visible ? '' : 'none';
    obsItem.style.display = visible ? '' : 'none';
    viewItem.style.display = visible && hasHistory(trip) ? '' : 'none';
    addItem.style.display = visible && canWrite() ? '' : 'none';
  }
  function decorate(row, trip) {
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
  });
  panel.addEventListener('pointerenter', () => clearTimeout(timer));
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
    if (panel.hidden || panel.contains(event.target)) return;
    if (pinned) position(); else close();
  }, true);
  window.FrotasysBetaComments = { decorate, configureMenu };
})();
