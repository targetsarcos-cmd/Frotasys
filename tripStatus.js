function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function normalizeTipo(value) {
  const raw = normalizeText(value);
  if (raw === 'AGREG' || raw === 'AGREGADO') return 'AGREGADO';
  if (raw === 'CARRE' || raw === 'CARRETEIRO') return 'CARRETEIRO';
  if (raw === 'DEDICADO') return 'DEDICADO';
  if (raw === 'FROTA') return 'FROTA';
  return raw;
}

function hasPamcardOk(value) {
  return normalizeText(value) === 'PAMCARD OK';
}

function isConferirMotoristaPendente(trip = {}) {
  return normalizeText(trip.status) === 'CONFERIR MOTORISTA' && trip.trocaMotoristaConcluida !== true;
}

function hasRegistrationPending(trip = {}) {
  if (isConferirMotoristaPendente(trip)) return 'CONFERIR MOTORISTA';
  if (hasPamcardOk(trip.pamcard)) return '';
  const status = normalizeText(trip.status);
  if (['SEM CADASTRO', 'S/ CADASTRO', 'CONFERIR CADASTRO'].includes(status)) return 'SEM CADASTRO';
  if (!normalizeText(trip.pamcard)) return 'SEM CADASTRO';
  return '';
}

function hasTransportDocuments(trip = {}) {
  return ['cte', 'manifesto', 'contrato'].every(field => hasValue(trip[field]));
}

function hasInvoiceAndToll(trip = {}) {
  return hasValue(trip.nota) && hasValue(trip.num_pedagio);
}

function hasAdvanceOk(trip = {}) {
  return normalizeTipo(trip.tipo) === 'FROTA' ||
    trip.adiantamentoOk === true ||
    ['ADIANTAMENTO EFETUADO', 'NAO FAZ CONTRATO'].includes(normalizeText(trip.conclusaoContrato));
}

function calculateTripStatus(trip = {}) {
  const registrationStatus = hasRegistrationPending(trip);
  if (registrationStatus) return registrationStatus;

  const hasDt = hasValue(trip.dt);
  const isScheduled = trip.programado === true;

  if (hasTransportDocuments(trip)) {
    const advanceOk = hasAdvanceOk(trip);
    const hasDischargeTime = hasValue(trip.descarga);
    if (advanceOk && hasDischargeTime) return 'CONCLUIDO';
    if (!advanceOk && hasDischargeTime) return 'ADIANTAMENTO';
    if (advanceOk && !hasDischargeTime) return 'AGENDAR DESCARGA';
    return 'ADIANTAMENTO / DESCARGA';
  }

  if (hasInvoiceAndToll(trip)) return 'EMITIR CTE';
  if (hasDt && isScheduled) return 'AGUARDANDO CARREGAMENTO';
  if (hasDt && !isScheduled) return 'PROGRAMAR';
  if (!hasDt && isScheduled) return 'CRIAR DT';
  return 'CRIAR DT / PROGRAMAR';
}

module.exports = {
  calculateTripStatus,
  hasAdvanceOk,
  hasInvoiceAndToll,
  hasPamcardOk,
  hasRegistrationPending,
  hasTransportDocuments,
  hasValue,
  normalizeText,
  normalizeTipo
};
