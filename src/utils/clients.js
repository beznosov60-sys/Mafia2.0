import { DEFAULT_STAGE, STAGES, findStageByName } from '../constants/stages';
import { createId } from './id';

export const STORAGE_KEY = 'mafia-crm-clients';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function ensureClientShape(rawClient = {}) {
  const stage = findStageByName(rawClient.stage)?.name || DEFAULT_STAGE.name;
  const stageDefinition = findStageByName(stage) || DEFAULT_STAGE;
  const subStage = stageDefinition.subStages.includes(rawClient.subStage)
    ? rawClient.subStage
    : stageDefinition.subStages[0] || '';

  return {
    id: rawClient.id || createId('client'),
    fullName: rawClient.fullName || '',
    manager: rawClient.manager || '',
    phone: rawClient.phone || '',
    email: rawClient.email || '',
    city: rawClient.city || '',
    stage,
    subStage,
    courtDate: rawClient.courtDate || '',
    nextStep: rawClient.nextStep || '',
    notes: rawClient.notes || '',
    tasks: Array.isArray(rawClient.tasks)
      ? rawClient.tasks.map((task) => ({
          id: task.id || createId('task'),
          text: task.text || '',
          done: Boolean(task.done),
        }))
      : [],
    payments: Array.isArray(rawClient.payments)
      ? rawClient.payments.map((payment) => ({
          id: payment.id || createId('payment'),
          amount: Number(payment.amount) || 0,
          date: payment.date || '',
          description: payment.description || '',
        }))
      : [],
    updates: Array.isArray(rawClient.updates)
      ? rawClient.updates.map((update) => ({
          id: update.id || createId('update'),
          date: update.date || new Date().toISOString().slice(0, 10),
          text: update.text || '',
        }))
      : [],
  };
}

export function createEmptyClient() {
  const stage = DEFAULT_STAGE;
  return ensureClientShape({
    stage: stage.name,
    subStage: stage.subStages[0] || '',
  });
}

export function readClientsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((client) => ensureClientShape(client));
  } catch (error) {
    console.warn('Не удалось прочитать клиентов из localStorage', error);
    return [];
  }
}

export function saveClientsToStorage(clients) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clone(clients)));
  } catch (error) {
    console.warn('Не удалось сохранить клиентов в localStorage', error);
  }
}

export function getStageOptions() {
  return STAGES.map((stage) => ({
    id: stage.id,
    name: stage.name,
    subStages: stage.subStages,
  }));
}
