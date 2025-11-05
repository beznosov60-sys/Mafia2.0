export const SAMPLE_CLIENTS = [
  {
    id: 'client-ivanov',
    fullName: 'Иванов Иван Иванович',
    manager: 'Мария Петрова',
    phone: '+7 (900) 111-22-33',
    email: 'ivanov@example.com',
    city: 'Москва',
    stage: 'Договор',
    subStage: 'сбор документов',
    courtDate: '2024-06-18',
    nextStep: 'Дождаться полный пакет документов',
    notes: 'Приоритетный клиент, необходимо держать в курсе каждый этап.',
    tasks: [
      { id: 'task-1', text: 'Согласовать договор с клиентом', done: true },
      { id: 'task-2', text: 'Получить оригиналы документов', done: false },
    ],
    payments: [
      { id: 'payment-1', amount: 25000, date: '2024-05-02', description: 'Первичный взнос' },
      { id: 'payment-2', amount: 15000, date: '2024-05-15', description: 'Оплата консультации' },
    ],
    updates: [
      { id: 'update-1', date: '2024-05-20', text: 'Получены нотариально заверенные копии свидетельств.' },
      { id: 'update-2', date: '2024-05-27', text: 'Менеджер назначил встречу для подписания договора.' },
    ],
  },
  {
    id: 'client-smirnova',
    fullName: 'Смирнова Анна Алексеевна',
    manager: 'Олег Сергеев',
    phone: '+7 (900) 222-44-55',
    email: 'smirnova@example.com',
    city: 'Санкт-Петербург',
    stage: 'Подача в суд',
    subStage: 'ждем принятия заявления',
    courtDate: '2024-07-04',
    nextStep: 'Получить номер дела после подачи заявления',
    notes: 'Клиент ожидает подтверждение оплаты депозита.',
    tasks: [
      { id: 'task-3', text: 'Подготовить пакет документов для суда', done: true },
      { id: 'task-4', text: 'Отправить копию заявления клиенту', done: false },
    ],
    payments: [
      { id: 'payment-3', amount: 30000, date: '2024-04-28', description: 'Оплата судебных расходов' },
    ],
    updates: [
      { id: 'update-3', date: '2024-05-12', text: 'Заявление передано в канцелярию суда.' },
    ],
  },
];
