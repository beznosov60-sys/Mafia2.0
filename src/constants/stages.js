export const STAGES = [
  {
    id: 'contract',
    name: 'Договор',
    subStages: ['сбор документов', 'составление заявления', 'отправить заявление'],
  },
  {
    id: 'submission',
    name: 'Подача в суд',
    subStages: [
      'Ждём номер дела',
      'направить клиента ФУ чтобы приняла',
      'заявление приняли',
      'заявление отложили',
      'приобщить доки которые запросил суд до указанной судом даты',
      'ждем принятия заявления',
      'дата суда по рассмотрению',
      'оплатить депозит',
      'приобщить доки и депозит до даты суда',
      'ждем доки от суда',
    ],
  },
  {
    id: 'decision',
    name: 'Решение суда о банкротстве',
    subStages: [
      'сообщить клиенту и отправить решение, если есть решение',
      'оплатить публикацию ФУ',
      'пояснение по сделкам',
      'исключение из КМ',
      'торги по реализации залога',
    ],
  },
  {
    id: 'complete',
    name: 'Завершение',
    subStages: [
      'собрать доки для завершения',
      'отправить доки ФУ',
      'доки отправлены ждем завершения',
      'ждем доки от суда',
    ],
  },
];

export const DEFAULT_STAGE = STAGES[0];

export function findStageByName(name) {
  return STAGES.find((stage) => stage.name === name) || null;
}

export function resolveStageId(name) {
  const stage = findStageByName(name);
  return stage ? stage.id : 'contract';
}

export function slugifyStage(name) {
  return resolveStageId(name);
}
