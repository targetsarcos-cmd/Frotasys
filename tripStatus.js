const billing=require('./public/js/workspace-trip-sections');

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
  const hasDt = hasValue(trip.dt);
  if (['SEM CADASTRO', 'S/ CADASTRO', 'CONFERIR CADASTRO', 'SEM CADASTRO / DT CRIADA'].includes(status)) {
    return hasDt ? 'SEM CADASTRO / DT CRIADA' : 'SEM CADASTRO';
  }
  if (!normalizeText(trip.pamcard)) return hasDt ? 'SEM CADASTRO / DT CRIADA' : 'SEM CADASTRO';
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

function calculateTripStatus(trip = {}, options = {}) {
  const registrationStatus = hasRegistrationPending(trip);
  if (registrationStatus) return registrationStatus;

  const hasDt = hasValue(trip.dt);
  const isScheduled = trip.programado === true;

  const legacyBilling=options.requireBillingCompletion && options.preserveLegacyCompleted && billing.isLegacyCompleted(trip);
  const documentsReady=options.requireBillingCompletion && !legacyBilling ? billing.hasBillingDocuments(trip) : hasTransportDocuments(trip);
  if (documentsReady) {
    if(options.requireBillingCompletion && !legacyBilling && !billing.hasInvoiceHours(trip))return 'HORA NF';
    const advanceOk = hasAdvanceOk(trip);
    const legacyCompleted = options.preserveLegacyCompleted && trip.descargaVerde === undefined && normalizeText(trip.status) === 'CONCLUIDO';
    const hasDischargeTime = hasValue(trip.descarga) && (!options.requireDischargeConfirmation || trip.descargaVerde === true || legacyCompleted);
    if (advanceOk && hasDischargeTime) return 'CONCLUIDO';
    if (!advanceOk && hasDischargeTime) return 'ADIANTAMENTO';
    if (advanceOk && !hasDischargeTime) return 'AGENDAR DESCARGA';
    return 'ADIANTAMENTO / DESCARGA';
  }

  if (hasInvoiceAndToll(trip)) return 'EMITIR CTE';
  if (hasDt && !isScheduled) return 'PROGRAMAR';
  if (hasDt && isScheduled) return String(trip.pedidoEnviadoDt || '').trim() === String(trip.dt).trim() ? 'AGUARDANDO CARREGAMENTO' : 'ENVIAR PEDIDO';
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
