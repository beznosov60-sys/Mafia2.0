const subStages = {
    'Договор': ['сбор документов', 'составление заявления', 'отправить заявление'],
    'Подача в суд': [
        'Ждём номер дела',
        'направить клиента ФУ чтобы приняла',
        'заявление приняли',
        'заявление отложили',
        'приобщить доки которые запросил суд до указанной судом даты',
        'ждем принятия заявления',
        'дата суда по рассмотрению',
        'оплатить депозит',
        'приобщить доки и депозит до даты суда',
        'ждем доки от суда'
    ],
    'Решение суда о банкротстве': [
        'сообщить клиенту и отправить решение, если есть решение',
        'оплатить публикацию ФУ',
        'пояснение по сделкам',
        'исключение из КМ',
        'торги по реализации залога'
    ],
    'Завершение': [
        'собрать доки для завершения',
        'отправить доки ФУ',
        'доки отправлены ждем завершения',
        'ждем доки от суда'
    ]
};

const stageColorClasses = {
    'Договор': 'stage-contract',
    'Подача в суд': 'stage-submission',
    'Решение суда о банкротстве': 'stage-decision',
    'Завершение': 'stage-complete'
};

const stageOrder = ['Договор', 'Подача в суд', 'Решение суда о банкротстве', 'Завершение'];

let currentManagerId = null;
let currentClientId = null;
let editingManagerId = null;
let summaryExpenseChart = null;
let summaryTransactionsChart = null;
let clientExpenseChart = null;
let clientTransactionsChart = null;
let clientsCache = [];
let currentClientIndex = -1;
let currentClientData = null;
let isClientEditing = false;

const APP_DATA_DEFAULTS = {
    clients: [],
    archivedClients: [],
    managers: [],
    consultations: [],
    managerPayments: {},
};

const APP_DATA_KEYS = Object.keys(APP_DATA_DEFAULTS);
const appData = APP_DATA_KEYS.reduce((acc, key) => {
    acc[key] = Array.isArray(APP_DATA_DEFAULTS[key]) ? [...APP_DATA_DEFAULTS[key]] : { ...APP_DATA_DEFAULTS[key] };
    return acc;
}, {});

function createAppStorage(store) {
    const parseValue = value => {
        try {
            return JSON.parse(value);
        } catch (error) {
            return value;
        }
    };

    const persistKey = async key => {
        if (!APP_DATA_KEYS.includes(key)) return;
        try {
            await fetch('/api/app-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [key]: store[key] ?? APP_DATA_DEFAULTS[key] })
            });
        } catch (error) {
            console.error(`Не удалось сохранить данные ${key} в MySQL:`, error);
        }
    };

    return {
        getItem(key) {
            if (!(key in store)) return null;
            return JSON.stringify(store[key]);
        },
        setItem(key, value) {
            store[key] = parseValue(value);
            persistKey(key);
        },
        removeItem(key) {
            if (!(key in store)) return;
            delete store[key];
            persistKey(key);
        },
        clear() {
            APP_DATA_KEYS.forEach(key => {
                store[key] = Array.isArray(APP_DATA_DEFAULTS[key]) ? [] : {};
                persistKey(key);
            });
        }
    };
}

const appStorage = createAppStorage(appData);

async function loadAppDataFromServer() {
    try {
        const response = await fetch('/api/app-data');
        if (!response.ok) {
            throw new Error('Failed to load application data');
        }

        const payload = await response.json();
        APP_DATA_KEYS.forEach(key => {
            if (payload[key] !== undefined) {
                appData[key] = payload[key];
            } else {
                appData[key] = Array.isArray(APP_DATA_DEFAULTS[key]) ? [] : {};
            }
        });
    } catch (error) {
        console.error('Не удалось загрузить данные из MySQL:', error);
        APP_DATA_KEYS.forEach(key => {
            if (appData[key] === undefined) {
                appData[key] = Array.isArray(APP_DATA_DEFAULTS[key]) ? [] : {};
            }
        });
    }
}

window.__crmAppReady = false;

(function setupLoadingOverlay() {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        return;
    }

    let overlay = null;
    let hideTimer = null;

    function ensureOverlay() {
        if (overlay && document.body.contains(overlay)) {
            return overlay;
        }

        overlay = document.createElement('div');
        overlay.className = 'loading-overlay loading-overlay--hidden';
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.setAttribute('aria-busy', 'true');
        overlay.innerHTML = `
            <div class="loading-overlay__spinner" aria-hidden="true"></div>
            <p class="loading-overlay__label">Загружаем CRM...</p>
        `;
        document.body.appendChild(overlay);
        return overlay;
    }

    function showOverlay() {
        const element = ensureOverlay();
        element.classList.remove('loading-overlay--hidden');
        requestAnimationFrame(() => {
            element.classList.add('loading-overlay--visible');
        });
        element.setAttribute('aria-busy', 'true');
        if (hideTimer) {
            window.clearTimeout(hideTimer);
            hideTimer = null;
        }
    }

    function hideOverlay() {
        if (!overlay) {
            return;
        }
        overlay.setAttribute('aria-busy', 'false');
        overlay.classList.remove('loading-overlay--visible');
        overlay.classList.add('loading-overlay--hidden');
        hideTimer = window.setTimeout(() => {
            overlay?.remove();
            overlay = null;
        }, 500);
    }

    window.appLoadingOverlay = {
        show: showOverlay,
        hide: hideOverlay
    };

    showOverlay();

    if (document.readyState === 'complete') {
        hideOverlay();
    } else {
        window.addEventListener('load', hideOverlay, { once: true });
    }

    window.addEventListener('app:hydrated', hideOverlay);
})();

const DEFAULT_UPDATES = [
    { date: '01.06.2024', text: 'Добавлена история выполненных задач клиента.' },
    { date: '01.06.2024', text: 'Исправлены кнопки редактирования и удаления клиентов у менеджеров.' }
];

const UPDATES_STORAGE_KEY = 'appUpdates';

function saveAppUpdates(updates) {
    if (typeof appStorage === 'undefined' || !Array.isArray(updates)) return;
    appStorage.setItem(UPDATES_STORAGE_KEY, JSON.stringify(updates));
}

function loadAppUpdates() {
    if (typeof appStorage === 'undefined') {
        return DEFAULT_UPDATES.map(update => ({ ...update }));
    }

    let storedUpdates = [];
    try {
        const raw = appStorage.getItem(UPDATES_STORAGE_KEY);
        storedUpdates = raw ? JSON.parse(raw) : [];
    } catch (error) {
        console.error('Не удалось прочитать обновления из appStorage:', error);
        storedUpdates = [];
    }

    if (!Array.isArray(storedUpdates)) {
        storedUpdates = [];
    }

    if (storedUpdates.length === 0) {
        const defaults = DEFAULT_UPDATES.map(update => ({ ...update }));
        saveAppUpdates(defaults);
        return defaults;
    }

    const missingDefaults = DEFAULT_UPDATES.filter(defaultUpdate =>
        !storedUpdates.some(
            storedUpdate => storedUpdate.date === defaultUpdate.date && storedUpdate.text === defaultUpdate.text
        )
    );

    if (missingDefaults.length > 0) {
        storedUpdates = [...missingDefaults.map(update => ({ ...update })), ...storedUpdates];
        saveAppUpdates(storedUpdates);
    }

    return storedUpdates;
}

window.addAppUpdate = function(date, text) {
    const normalizedText = (text || '').trim();
    if (!normalizedText) {
        console.warn('Текст обновления не указан. Добавление обновления отменено.');
        return;
    }

    const normalizedDate = (date || '').trim();
    const updates = loadAppUpdates();
    updates.unshift({
        date: normalizedDate || new Date().toLocaleDateString('ru-RU'),
        text: normalizedText
    });
    saveAppUpdates(updates);
};

function getCourtTypeBadge(client) {
    const types = client.courtTypes || {};
    if (types.arbitration && types.tret) return 'АС/ТС';
    if (types.arbitration) return 'АС';
    if (types.tret) return 'ТС';
    return '';
}

function escapeHtml(value) {
    if (value === undefined || value === null) {
        return '';
    }

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function formatCurrencyDisplay(value) {
    if (value === undefined || value === null || value === '') {
        return '—';
    }

    const normalized = String(value).replace(/\s+/g, '').replace(',', '.');
    const number = Number(normalized);

    if (!Number.isNaN(number)) {
        try {
            return number.toLocaleString('ru-RU', {
                style: 'currency',
                currency: 'RUB',
                maximumFractionDigits: 0
            });
        } catch (error) {
            console.warn('Не удалось отформатировать сумму', value, error);
        }
    }

    return escapeHtml(value);
}

function formatDateDisplay(value) {
    if (!value) {
        return '—';
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return '—';
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('ru-RU');
    }

    const isoParts = trimmed.split('-');
    if (isoParts.length === 3) {
        const [year, month, day] = isoParts.map(part => Number(part));
        if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
            const candidate = new Date(year, month - 1, day);
            if (!Number.isNaN(candidate.getTime())) {
                return candidate.toLocaleDateString('ru-RU');
            }
        }
    }

    const dotParts = trimmed.split('.');
    if (dotParts.length === 3) {
        const [day, month, year] = dotParts.map(part => Number(part));
        if (!Number.isNaN(day) && !Number.isNaN(month)) {
            const normalizedYear = !Number.isNaN(year) ? (year < 100 ? 2000 + year : year) : undefined;
            if (normalizedYear !== undefined) {
                const candidate = new Date(normalizedYear, month - 1, day);
                if (!Number.isNaN(candidate.getTime())) {
                    return candidate.toLocaleDateString('ru-RU');
                }
            }
        }
    }

    return escapeHtml(trimmed);
}

function formatPaymentMonths(value) {
    if (value === undefined || value === null) {
        return '—';
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return '—';
    }

    if (/^\d+$/.test(trimmed)) {
        return `${escapeHtml(trimmed)} мес.`;
    }

    return escapeHtml(trimmed);
}

function formatPhoneDisplay(value) {
    if (!value) {
        return '—';
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return '—';
    }

    const tel = trimmed.replace(/[^+\d]/g, '');
    return `<a href="tel:${escapeAttribute(tel)}">${escapeHtml(trimmed)}</a>`;
}

function formatCourtLink(value) {
    if (!value) {
        return '—';
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
        return '—';
    }

    return `<a href="${escapeAttribute(trimmed)}" target="_blank" rel="noopener">Судебное дело</a>`;
}

function buildClientDetailsMarkup(client) {
    const stage = client.stage ? escapeHtml(client.stage) : '—';
    const subStage = client.subStage ? escapeHtml(client.subStage) : '—';
    const phone = formatPhoneDisplay(client.phone);
    const totalAmount = formatCurrencyDisplay(client.totalAmount);
    const paymentMonths = formatPaymentMonths(client.paymentMonths);
    const paymentStartDate = formatDateDisplay(client.paymentStartDate);
    const caseNumber = client.caseNumber ? escapeHtml(client.caseNumber) : '—';
    const courtLink = formatCourtLink(client.arbitrLink);
    const tasksCount = Array.isArray(client.tasks) ? client.tasks.length : 0;

    return `
        <dl class="client-card__details-grid">
            <div class="client-card__detail">
                <dt>Этап</dt>
                <dd>${stage}</dd>
            </div>
            <div class="client-card__detail">
                <dt>Подэтап</dt>
                <dd>${subStage}</dd>
            </div>
            <div class="client-card__detail">
                <dt>Телефон</dt>
                <dd>${phone}</dd>
            </div>
            <div class="client-card__detail">
                <dt>Сумма</dt>
                <dd>${totalAmount}</dd>
            </div>
            <div class="client-card__detail">
                <dt>Платежей</dt>
                <dd>${paymentMonths}</dd>
            </div>
            <div class="client-card__detail">
                <dt>Старт оплаты</dt>
                <dd>${paymentStartDate}</dd>
            </div>
            <div class="client-card__detail">
                <dt>№ дела</dt>
                <dd>${caseNumber}</dd>
            </div>
            <div class="client-card__detail">
                <dt>Суд</dt>
                <dd>${courtLink}</dd>
            </div>
        </dl>
        <div class="client-card__details-footer">
            <span class="client-card__tasks">Задач: ${tasksCount}</span>
            <a class="client-card__link" href="client-card.html?id=${client.id}">Открыть карточку</a>
        </div>
    `;
}

function buildStageProgress(currentStage) {
    const currentIndex = stageOrder.indexOf(currentStage);
    return stageOrder
        .map((stage, index) => {
            const classes = ['client-card__progress-step'];
            if (currentIndex === -1) {
                if (index === 0) {
                    classes.push('client-card__progress-step--active');
                }
            } else {
                if (index < currentIndex) {
                    classes.push('client-card__progress-step--completed');
                } else if (index === currentIndex) {
                    classes.push('client-card__progress-step--active');
                }
            }
            return `<span class="${classes.join(' ')}" title="${stage}"></span>`;
        })
        .join('');
}

async function syncClientsFromServer() {
    try {
        const response = await fetch('/api/clients');
        if (!response.ok) throw new Error('Failed to load clients');
        const clients = await response.json();
        appStorage.setItem('clients', JSON.stringify(Array.isArray(clients) ? clients : []));
    } catch (error) {
        console.error('Не удалось синхронизировать клиентов из MySQL:', error);
        if (!appStorage.getItem('clients')) {
            appStorage.setItem('clients', JSON.stringify([]));
        }
    }
}

async function syncManagersFromServer() {
    try {
        const response = await fetch('/api/managers');
        if (!response.ok) throw new Error('Failed to load managers');
        const managers = await response.json();
        appStorage.setItem('managers', JSON.stringify(Array.isArray(managers) ? managers : []));
    } catch (error) {
        console.error('Не удалось синхронизировать менеджеров из MySQL:', error);
        if (!appStorage.getItem('managers')) {
            appStorage.setItem('managers', JSON.stringify([]));
        }
    }
}

function getManagers() {
    const managers = JSON.parse(appStorage.getItem('managers')) || [];
    let requiresSave = false;
    managers.forEach(manager => {
        if (!manager) return;
        const legacySalary = manager.paymentValue ?? manager.salary ?? manager.baseSalary;
        if (!manager.paymentType) {
            if (legacySalary !== undefined && legacySalary !== null && legacySalary !== '') {
                manager.paymentType = 'fixed';
            } else {
                manager.paymentType = 'none';
            }
            requiresSave = true;
        }
        if (manager.paymentType === 'fixed' && (manager.paymentValue === undefined || manager.paymentValue === '') && legacySalary !== undefined && legacySalary !== null && legacySalary !== '') {
            manager.paymentValue = legacySalary;
            requiresSave = true;
        }
    });
    if (requiresSave) {
        saveManagers(managers);
    }
    return managers;
}

function saveManagers(managers) {
    appStorage.setItem('managers', JSON.stringify(managers));
}


function getManagerBaseSalary(manager) {
    if (!manager) return 0;
    const sources = [];
    if (manager.paymentType === 'fixed') {
        sources.push(manager.paymentValue);
    }
    sources.push(manager.salary, manager.baseSalary, manager.paymentValue);
    for (const value of sources) {
        if (value === undefined || value === null || value === '') continue;
        const num = parseFloat(value);
        if (!isNaN(num)) {
            return num;
        }
    }
    return 0;
}

function getManagerSalaryInputValue(manager) {
    if (!manager) return '';
    const sources = [];
    if (manager.paymentType === 'fixed') {
        sources.push(manager.paymentValue);
    }
    sources.push(manager.salary, manager.baseSalary, manager.paymentValue);
    for (const value of sources) {
        if (value === undefined || value === null || value === '') continue;
        return String(value);
    }
    return '';
}


function getPaymentSchedule(client) {
    const schedule = [];
    if (!client.paymentMonths || !client.paymentStartDate) return schedule;
    const amount = client.totalAmount ? Math.round(client.totalAmount / client.paymentMonths) : 0;
    for (let i = 0; i < client.paymentMonths; i++) {
        let date = new Date(client.paymentStartDate);
        date.setMonth(date.getMonth() + i);
        if (client.paymentAdjustments && client.paymentAdjustments[i]) {
            date = new Date(client.paymentAdjustments[i]);
        }
        schedule.push({
            date: date.toISOString().split('T')[0],
            amount,
            paid: client.paidMonths && client.paidMonths[i]
        });
    }
    return schedule;
}

function refetchCalendarEvents() {
    const calendarEl = document.getElementById('calendar');
    const calendar = calendarEl ? calendarEl._fullCalendar : null;
    if (calendar) {
        calendar.refetchEvents();
    }
}

function updateSubStageOptions(stage, select) {
    if (!select) return;
    select.innerHTML = '';
    if (!stage || !subStages[stage]) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Выберите задачу';
        select.appendChild(opt);
        return;
    }
    subStages[stage].forEach(sub => {
        const option = document.createElement('option');
        option.value = sub;
        option.textContent = sub;
        select.appendChild(option);
    });
}

function ensureUniqueId(baseId, existingIds) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = baseId || 'CLIENT';
    let prefixIndex = 0;
    while (existingIds.has(id)) {
        const prefix = alphabet[prefixIndex] || `X${prefixIndex}`;
        id = prefix + baseId;
        prefixIndex++;
    }
    existingIds.add(id);
    return id;
}

function generateClientId(firstName, middleName, lastName, phone, existingIds) {
    const letters = [lastName, firstName, middleName]
        .map(name => (name && name.trim() ? name.trim()[0].toUpperCase() : ''))
        .join('');
    const digits = (phone || '').replace(/\D/g, '').slice(-4);
    const ids = existingIds || new Set((JSON.parse(appStorage.getItem('clients')) || []).map(c => String(c.id)));
    return ensureUniqueId(letters + digits, ids);
}

window.generateClientId = generateClientId;

window.openClient = function(id, managerId) {
    const managerParam = managerId ? `&fromManager=${managerId}` : '';
    window.location.href = `client-card.html?id=${id}${managerParam}`;
};

function exportClientsToExcel() {
    const clients = JSON.parse(appStorage.getItem('clients') || '[]');
    const archivedClients = JSON.parse(appStorage.getItem('archivedClients')) || [];
    const allClients = clients.concat(archivedClients.map(c => ({ ...c, archived: true })));
    const managers = getManagers();
    const managerPayments = JSON.parse(appStorage.getItem('managerPayments')) || {};

    const clientData = allClients.map(c => ({
        'ID': c.id,
        'Имя': c.firstName,
        'Отчество': c.middleName,
        'Фамилия': c.lastName,
        'Телефон': c.phone,
        'Серия паспорта': c.passportSeries,
        'Номер паспорта': c.passportNumber,
        'Дата выдачи': c.passportIssueDate,
        'Место выдачи': c.passportIssuePlace,
        'Общая сумма': c.totalAmount,
        'Кол-во месяцев': c.paymentMonths,
        'Дата начала': c.paymentStartDate,
        'Оплаченные месяцы': (c.paidMonths || []).map(p => p ? 1 : 0).join(','),
        'Этап': c.stage,
        'Задача': c.subStage,
        'Арбитражный суд': c.courtTypes?.arbitration ? 'Да' : 'Нет',
        'Третейский суд': c.courtTypes?.tret ? 'Да' : 'Нет',
        'Ссылка на суд': c.arbitrLink,
        'Дата суда': c.courtDate,
        'Заметки': c.notes,
        'Избранный': c.favorite ? 'Да' : 'Нет',
        'Создан': c.createdAt,
        'Архивный': c.archived ? 'Да' : 'Нет',
        'Дата завершения': c.completedAt || '',
        'ID менеджера': c.managerId || '',
        'Процент менеджера': c.managerPercent || '',
        'Менеджер выплачено': c.managerPaidTotal || 0,
        'Менеджер оплачен полностью': c.managerFullyPaid ? 'Да' : 'Нет'
    }));

    const tasksData = allClients.flatMap(c =>
        (c.tasks || []).map(t => ({
            'ID клиента': c.id,
            'ID задачи': t.id,
            'Текст': t.text,
            'Дедлайн': t.deadline,
            'Выполнено': t.completed ? 'Да' : 'Нет',
            'Дата выполнения': t.completedAt || '',
            'Цвет': t.color || ''
        }))
    );

    const managerTasksData = managers.flatMap(m =>
        (m.tasks || []).map(t => ({
            'ID менеджера': m.id,
            'ID задачи': t.id,
            'Текст': t.text,
            'Дедлайн': t.deadline,
            'Выполнено': t.completed ? 'Да' : 'Нет',
            'Дата выполнения': t.completedAt || '',
            'Цвет': t.color || ''
        }))
    );

    const managersData = managers.map(m => {
        const mp = managerPayments[m.id] || {};
        return {
            'ID': m.id,
            'Имя': m.name || '',
            'Контакты': m.contacts || '',
            'Тип оплаты': m.paymentType || '',
            'Значение оплаты': m.paymentValue || '',
            'Зарплата': mp.salary || '',
            'Премия': mp.bonus || '',
            'Оплачено': mp.paid ? 'Да' : 'Нет'
        };
    });

    const managerPaymentsData = Object.entries(managerPayments).flatMap(([managerId, mp]) =>
        (mp.history || []).map(h => ({
            'ID менеджера': managerId,
            'ID клиента': h.clientId || '',
            'Сумма': h.amount,
            'Дата': h.date
        }))
    );

    const workbook = XLSX.utils.book_new();
    const wsClients = XLSX.utils.json_to_sheet(clientData);
    XLSX.utils.book_append_sheet(workbook, wsClients, 'Clients');

    if (tasksData.length > 0) {
        const wsTasks = XLSX.utils.json_to_sheet(tasksData);
        XLSX.utils.book_append_sheet(workbook, wsTasks, 'Tasks');
    }

    if (managerTasksData.length > 0) {
        const wsMTasks = XLSX.utils.json_to_sheet(managerTasksData);
        XLSX.utils.book_append_sheet(workbook, wsMTasks, 'ManagerTasks');
    }

    if (managersData.length > 0) {
        const wsManagers = XLSX.utils.json_to_sheet(managersData);
        XLSX.utils.book_append_sheet(workbook, wsManagers, 'Managers');
    }

    if (managerPaymentsData.length > 0) {
        const wsMP = XLSX.utils.json_to_sheet(managerPaymentsData);
        XLSX.utils.book_append_sheet(workbook, wsMP, 'ManagerPayments');
    }

    XLSX.writeFile(workbook, 'clients.xlsx');
}

function importClientsFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const clientsSheet = workbook.Sheets['Clients'] || workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(clientsSheet);
        const usedIds = new Set();
        const clients = [];
        const archivedClients = [];
        rows.forEach(row => {
            let id;
            if (row['ID']) {
                id = ensureUniqueId(String(row['ID']), usedIds);
            } else {
                id = generateClientId(
                    row['Имя'] || '',
                    row['Отчество'] || '',
                    row['Фамилия'] || '',
                    row['Телефон'] || '',
                    usedIds
                );
            }
            const obj = {
                id,
                firstName: row['Имя'] || '',
                middleName: row['Отчество'] || '',
                lastName: row['Фамилия'] || '',
                phone: row['Телефон'] || '',
                passportSeries: row['Серия паспорта'] || '',
                passportNumber: row['Номер паспорта'] || '',
                passportIssueDate: row['Дата выдачи'] || '',
                passportIssuePlace: row['Место выдачи'] || '',
                totalAmount: parseFloat(row['Общая сумма']) || 0,
                paymentMonths: parseInt(row['Кол-во месяцев']) || 0,
                paymentStartDate: row['Дата начала'] || '',
                paidMonths: row['Оплаченные месяцы'] ? String(row['Оплаченные месяцы']).split(',').map(v => v.trim() === '1') : [],
                stage: row['Этап'] || '',
                subStage: row['Задача'] || '',
                courtTypes: {
                    arbitration: row['Арбитражный суд'] === 'Да' || row['Арбитражный суд'] === true,
                    tret: row['Третейский суд'] === 'Да' || row['Третейский суд'] === true
                },
                arbitrLink: row['Ссылка на суд'] || '',
                courtDate: row['Дата суда'] || '',
                notes: row['Заметки'] || '',
                favorite: row['Избранный'] === 'Да' || row['Избранный'] === true,
                createdAt: row['Создан'] || new Date().toISOString(),
                managerId: row['ID менеджера'] || '',
                managerPercent: row['Процент менеджера'] || '',
                managerPaidTotal: parseFloat(row['Менеджер выплачено']) || 0,
                managerFullyPaid: row['Менеджер оплачен полностью'] === 'Да' || row['Менеджер оплачен полностью'] === true,
                managerPayments: [],
                tasks: [],
                completedAt: row['Дата завершения'] || ''
            };
            if (row['Архивный'] === 'Да') {
                archivedClients.push(obj);
            } else {
                clients.push(obj);
            }
        });

        const clientsById = {};
        [...clients, ...archivedClients].forEach(c => { clientsById[c.id] = c; });

        const tasksSheet = workbook.Sheets['Tasks'];
        if (tasksSheet) {
            const taskRows = XLSX.utils.sheet_to_json(tasksSheet);
            taskRows.forEach(row => {
                const clientId = row['ID клиента'];
                const client = clientsById[clientId];
                if (!client) return;
                if (!Array.isArray(client.tasks)) client.tasks = [];
                client.tasks.push({
                    id: row['ID задачи'] || Date.now() + Math.random(),
                    text: row['Текст'] || '',
                    deadline: row['Дедлайн'] || '',
                    completed: row['Выполнено'] === 'Да' || row['Выполнено'] === true,
                    completedAt: row['Дата выполнения'] || '',
                    color: row['Цвет'] || '#28a745'
                });
            });
        }

        const managers = [];
        const managerPayments = {};
        const managersSheet = workbook.Sheets['Managers'];
        if (managersSheet) {
            const managerRows = XLSX.utils.sheet_to_json(managersSheet);
            managerRows.forEach(row => {
                managers.push({
                    id: row['ID'],
                    name: row['Имя'] || '',
                    contacts: row['Контакты'] || '',
                    paymentType: row['Тип оплаты'] || '',
                    paymentValue: row['Значение оплаты'] || '',
                    tasks: []
                });
                managerPayments[row['ID']] = {
                    salary: row['Зарплата'] || '',
                    bonus: row['Премия'] || '',
                    paid: row['Оплачено'] === 'Да' || row['Оплачено'] === true,
                    history: []
                };
            });
        }

        const managerTasksSheet = workbook.Sheets['ManagerTasks'];
        if (managerTasksSheet) {
            const mtaskRows = XLSX.utils.sheet_to_json(managerTasksSheet);
            mtaskRows.forEach(row => {
                const mId = row['ID менеджера'];
                const manager = managers.find(m => String(m.id) === String(mId));
                if (!manager) return;
                manager.tasks = manager.tasks || [];
                manager.tasks.push({
                    id: row['ID задачи'] || Date.now() + Math.random(),
                    text: row['Текст'] || '',
                    deadline: row['Дедлайн'] || '',
                    completed: row['Выполнено'] === 'Да' || row['Выполнено'] === true,
                    completedAt: row['Дата выполнения'] || '',
                    color: row['Цвет'] || '#28a745'
                });
            });
        }

        const mpSheet = workbook.Sheets['ManagerPayments'];
        if (mpSheet) {
            const mpRows = XLSX.utils.sheet_to_json(mpSheet);
            mpRows.forEach(row => {
                const mId = row['ID менеджера'];
                const cId = row['ID клиента'];
                const amount = parseFloat(row['Сумма']) || 0;
                const date = row['Дата'] || '';
                if (!managerPayments[mId]) {
                    managerPayments[mId] = { history: [] };
                }
                managerPayments[mId].history = managerPayments[mId].history || [];
                managerPayments[mId].history.push({ clientId: cId, amount, date });
                const client = clientsById[cId];
                if (client) {
                    client.managerPayments = client.managerPayments || [];
                    client.managerPayments.push({ date, amount });
                    client.managerPaidTotal = (client.managerPaidTotal || 0) + amount;
                }
            });
        }

        appStorage.setItem('clients', JSON.stringify(clients));
        appStorage.setItem('archivedClients', JSON.stringify(archivedClients));
        if (managers.length > 0) {
            appStorage.setItem('managers', JSON.stringify(managers));
        }
        if (Object.keys(managerPayments).length > 0) {
            appStorage.setItem('managerPayments', JSON.stringify(managerPayments));
        }

        alert('Импорт завершён');
        window.location.reload();
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    document.addEventListener('hide.bs.modal', (event) => {
        const activeElement = document.activeElement;
        if (activeElement && event.target.contains(activeElement)) {
            activeElement.blur();
        }
    });

    document.body.classList.add('loaded');
    setupLinkTransitions();

    window.appLoadingOverlay?.show();
    try {
        await loadAppDataFromServer();
    } catch (error) {
        console.error('Не удалось синхронизировать клиентов с сервером:', error);
    } finally {
        window.dispatchEvent(new Event('app:hydrated'));
        window.appLoadingOverlay?.hide();
    }

    if (!appStorage.getItem('consultations')) {
        appStorage.setItem('consultations', JSON.stringify([]));
    }

    window.dispatchEvent(new Event('app-ready'));
    window.dispatchEvent(new Event('app:ready'));
    window.__crmAppReady = true;
});

function setupLinkTransitions() {
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || link.target === '_blank') {
            return;
        }
        link.addEventListener('click', function(e) {
            e.preventDefault();
            window.appLoadingOverlay?.show();
            document.body.classList.remove('loaded');
            window.setTimeout(() => {
                window.location.href = href;
            }, 300);
        });
    });
}

// Открытие/закрытие боковой панели
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
}

// Открытие ссылки на арбитр
function openArbitrLink() {
    const arbitrInput = document.getElementById('arbitrLink');
    const link = arbitrInput.value.trim();
    if (link) {
        window.open(link, '_blank');
    }
}

// Обновление атрибута title для кнопки арбитр
function updateArbitrButtonTitle(button, courtDate) {
    button.title = courtDate ? `Дата суда: ${new Date(courtDate).toLocaleDateString('ru-RU')}` : '';
}

// Показ клиентов с судом в текущем месяце
function displayCourtThisMonth() {
    const clients = JSON.parse(appStorage.getItem('clients') || '[]');
    const courtThisMonthDiv = document.getElementById('courtThisMonth');
    if (!courtThisMonthDiv) return;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const filteredClients = clients.filter(client => {
        if (!client.courtDate) return false;
        const courtDate = new Date(client.courtDate);
        return courtDate.getFullYear() === currentYear && courtDate.getMonth() === currentMonth;
    });

    filteredClients.sort((a, b) => Number(b.favorite) - Number(a.favorite));

    courtThisMonthDiv.innerHTML = '';
    if (filteredClients.length === 0) {
        courtThisMonthDiv.innerHTML = '<li class="list-group-item text-center">Нет судебных дел в этом месяце</li>';
        return;
    }

    filteredClients.forEach(client => {
        const li = document.createElement('li');
        li.className = 'court-item';
        const fullName = `${client.firstName} ${client.lastName}`;
        const courtDate = client.courtDate ? new Date(client.courtDate) : null;
        const dateText = courtDate ? courtDate.toLocaleDateString('ru-RU') : '';
        li.innerHTML = `
            <div class="court-row">
                <div class="court-name">${client.favorite ? '<i class="ri-star-fill favorite-icon"></i>' : ''}<span class="court-client-name">${fullName}</span>${getCourtTypeBadge(client)}</div>
                <div class="court-task">${client.subStage || ''}</div>
                <div class="court-date-pay">
                    <span class="court-date">${dateText}</span>
                    <button class="court-toggle" data-client="${client.id}" disabled title="Раздел в разработке"><i class="ri-more-2-line"></i></button>
                </div>
            </div>
            <div class="court-details">
                ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="client-link" onclick="event.stopPropagation();">Суд</a>` : ''}
            </div>
        `;

        if (courtDate) {
            const today = new Date();
            const courtDateNoTime = new Date(courtDate.getFullYear(), courtDate.getMonth(), courtDate.getDate());
            const todayNoTime = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            if (courtDateNoTime.getTime() === todayNoTime.getTime()) {
                li.classList.add('today');
            } else if (courtDateNoTime < todayNoTime) {
                li.classList.add('overdue');
            }
        }

        li.addEventListener('click', (event) => {
            if (!event.target.closest('.court-toggle') && !event.target.closest('a')) {
                window.location.href = `client-card.html?id=${client.id}`;
            }
        });

        courtThisMonthDiv.appendChild(li);
    });

}

// Отображение списка клиентов в боковой панели
function displayClientsList() {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const listDiv = document.getElementById('clientsList');
    if (!listDiv) return;

    clients.sort((a, b) => {
        const favDiff = Number(b.favorite) - Number(a.favorite);
        if (favDiff !== 0) return favDiff;
        const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
        const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
        return nameA.localeCompare(nameB, 'ru');
    });

    listDiv.innerHTML = '';
    if (clients.length === 0) {
        listDiv.innerHTML = '<p class="text-center">Нет клиентов</p>';
        return;
    }

    const ul = document.createElement('ul');
    ul.className = 'client-list';

    clients.forEach(client => {
        const li = document.createElement('li');
        li.className = 'client-card';

        const fullName = [client.lastName, client.firstName, client.middleName]
            .filter(Boolean)
            .join(' ')
            .trim() || 'Без имени';
        const schedule = getPaymentSchedule(client);
        const paidStates = schedule.map((item, index) => {
            if (Array.isArray(client.paidMonths) && typeof client.paidMonths[index] !== 'undefined') {
                return Boolean(client.paidMonths[index]);
            }
            return Boolean(item.paid);
        });
        const paymentsHtml = schedule.length
            ? schedule.map((_, index) => {
                const isPaid = paidStates[index];
                return `
                    <button
                        type="button"
                        class="payment-square${isPaid ? ' payment-square--filled' : ''}"
                        data-payment-index="${index}"
                        aria-pressed="${isPaid ? 'true' : 'false'}"
                        aria-label="Платёж ${index + 1}: ${isPaid ? 'оплачен' : 'не оплачен'}"
                    ></button>
                `;
            }).join('')
            : '<span class="client-card__payments-empty">—</span>';
        const hasCourtDate = Boolean(client.courtDate);
        const courtDateText = hasCourtDate ? new Date(client.courtDate).toLocaleDateString('ru-RU') : 'Нет даты';

        const favoriteIcon = client.favorite ? '<i class="ri-star-fill client-card__favorite" aria-hidden="true"></i>' : '';

        li.innerHTML = `
            <div class="client-card__inner${client.favorite ? ' client-card__inner--favorite' : ''}" data-client-id="${client.id}">
                <div class="client-card__header">
                    <div class="client-card__header-main">
                        <div class="client-card__name-row">
                            ${favoriteIcon}
                            <span class="client-card__name">${fullName}</span>
                            ${getCourtTypeBadge(client)}
                        </div>
                        <div class="client-card__meta">
                            <div class="client-card__payments" role="group" aria-label="Статус платежей">
                                <span class="client-card__payments-icon" aria-hidden="true"><i class="ri-money-ruble-circle-line"></i></span>
                                <div class="client-card__payments-track">
                                    ${paymentsHtml}
                                </div>
                            </div>
                            <div class="client-card__court"${hasCourtDate ? '' : ' data-empty="true"'}>
                                <i class="ri-gavel-line" aria-hidden="true"></i>
                                <span class="client-card__court-date">${courtDateText}</span>
                            </div>
                        </div>
                    </div>
                    <button class="client-card__toggle" type="button" aria-expanded="false" aria-label="Показать информацию о клиенте">
                        <i class="ri-arrow-down-s-line client-card__toggle-icon" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="client-card__details" hidden>
                    ${buildClientDetailsMarkup(client)}
                </div>
            </div>
        `;

        const inner = li.querySelector('.client-card__inner');
        const header = li.querySelector('.client-card__header');
        const toggleBtn = li.querySelector('.client-card__toggle');
        const details = li.querySelector('.client-card__details');
        const paymentSquares = li.querySelectorAll('.payment-square');

        const setExpanded = (expanded) => {
            toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            toggleBtn.setAttribute('aria-label', expanded ? 'Скрыть информацию о клиенте' : 'Показать информацию о клиенте');
            details.hidden = !expanded;
            inner.classList.toggle('client-card__inner--expanded', expanded);
        };

        const toggleDetails = () => {
            const shouldExpand = toggleBtn.getAttribute('aria-expanded') !== 'true';
            setExpanded(shouldExpand);
        };

        header.addEventListener('click', (event) => {
            if (event.target.closest('.payment-square')) return;
            if (event.target.closest('.client-card__payments')) return;
            if (event.target.closest('.client-card__toggle')) return;
            if (event.target.closest('a')) return;
            toggleDetails();
        });

        toggleBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleDetails();
        });

        paymentSquares.forEach(square => {
            square.addEventListener('click', (event) => {
                event.stopPropagation();
                const index = Number(square.dataset.paymentIndex);
                const willBePaid = !square.classList.contains('payment-square--filled');
                paidStates[index] = willBePaid;
                square.classList.toggle('payment-square--filled', willBePaid);
                square.setAttribute('aria-pressed', willBePaid ? 'true' : 'false');

                client.paidMonths = paidStates.slice();
                appStorage.setItem('clients', JSON.stringify(clients));
            });
        });

        ul.appendChild(li);
    });

    listDiv.appendChild(ul);
}

// Загрузка клиента для редактирования
function loadClientForEdit(clientId) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) {
        console.error('Клиент не найден:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('clientId').value = client.id;
    document.getElementById('firstName').value = client.firstName;
    document.getElementById('middleName').value = client.middleName || '';
    document.getElementById('lastName').value = client.lastName;
    document.getElementById('birthDate').value = client.birthDate || '';
    document.getElementById('phone').value = client.phone;
    document.getElementById('passportSeries').value = client.passportSeries || '';
    document.getElementById('passportNumber').value = client.passportNumber || '';
    document.getElementById('passportIssueDate').value = client.passportIssueDate || '';
    document.getElementById('passportIssuePlace').value = client.passportIssuePlace || '';
    document.getElementById('totalAmount').value = client.totalAmount || '';
    document.getElementById('paymentMonths').value = client.paymentMonths || '';
    document.getElementById('paymentStartDate').value = client.paymentStartDate || '';
    document.getElementById('arbitrLink').value = client.arbitrLink || '';
    document.getElementById('caseNumber').value = client.caseNumber || '';
    document.getElementById('stage').value = client.stage;
    updateSubStageOptions(client.stage, document.getElementById('subStage'));
    document.getElementById('subStage').value = client.subStage || '';
    document.getElementById('courtArbitrage').checked = client.courtTypes?.arbitration || false;
    document.getElementById('courtTret').checked = client.courtTypes?.tret || false;
    document.getElementById('courtDate').value = client.courtDate || '';
    document.getElementById('notes').value = client.notes || '';

    const favoriteBtn = document.getElementById('favoriteBtn');
    if (favoriteBtn) {
        favoriteBtn.dataset.favorite = client.favorite ? 'true' : 'false';
        favoriteBtn.innerHTML = client.favorite ? '<i class="ri-star-fill"></i>' : '<i class="ri-star-line"></i>';
    }

    const arbitrInput = document.getElementById('arbitrLink');
    const arbitrButton = document.getElementById('arbitrButton');
    arbitrButton.disabled = !arbitrInput.value.trim();
    updateArbitrButtonTitle(arbitrButton, client.courtDate);

    // Инициализация задач
    window.tasks = client.tasks || [];
    renderTaskList();
}

// Загрузка клиента для карточки
function setupClientCardInteractions() {
    const root = document.getElementById('clientCardRoot');
    if (!root || root.dataset.initialized) return;
    root.dataset.initialized = 'true';

    const editBtn = document.getElementById('editClientBtn');
    if (editBtn) editBtn.addEventListener('click', enterClientEditMode);

    const saveBtn = document.getElementById('saveClientBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveClientInlineChanges);

    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', cancelClientInlineChanges);

    const deleteBtn = document.getElementById('deleteClientBtn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', (event) => {
            event.preventDefault();
            const confirmationMessage = isClientEditing
                ? 'Вы редактируете клиента. Удалить без сохранения?'
                : 'Вы уверены, что хотите удалить этого клиента?';
            if (!confirm(confirmationMessage)) {
                return;
            }
            deleteClient({ skipConfirmation: true });
        });
    }

    const toggleHistoryBtn = document.getElementById('toggleTaskHistoryBtn');
    const historySection = document.getElementById('completedTasksSection');
    if (toggleHistoryBtn && historySection) {
        toggleHistoryBtn.addEventListener('click', () => {
            const expanded = toggleHistoryBtn.getAttribute('aria-expanded') === 'true';
            const nextState = !expanded;
            toggleHistoryBtn.setAttribute('aria-expanded', String(nextState));
            historySection.classList.toggle('is-open', nextState);
        });
    }

    const hideHistoryBtn = document.getElementById('hideTaskHistoryBtn');
    if (hideHistoryBtn && historySection && toggleHistoryBtn) {
        hideHistoryBtn.addEventListener('click', () => {
            historySection.classList.remove('is-open');
            toggleHistoryBtn.setAttribute('aria-expanded', 'false');
        });
    }

    document.getElementById('clientPrevBtn')?.addEventListener('click', () => navigateClient(-1));
    document.getElementById('clientNextBtn')?.addEventListener('click', () => navigateClient(1));

    const switcher = document.getElementById('clientSwitcher');
    if (switcher) {
        switcher.addEventListener('change', () => {
            const selectedId = switcher.value;
            if (selectedId && selectedId !== String(currentClientId)) {
                if (isClientEditing) {
                    alert('Сохраните или отмените изменения перед переключением клиента.');
                    switcher.value = currentClientId || '';
                    return;
                }
                loadClientCard(selectedId);
            }
        });
    }

    document.getElementById('openCourtLinkBtn')?.addEventListener('click', () => {
        const input = document.getElementById('clientCourtLinkInput');
        if (!input) return;
        const link = (input.value || '').trim();
        if (link) window.open(link, '_blank');
    });

    document.getElementById('clientStageSelect')?.addEventListener('change', (event) => handleStageChange(event.target.value));
    document.getElementById('clientSubStageSelect')?.addEventListener('change', (event) => handleSubStageChange(event.target.value));
    document.getElementById('clientCourtDateInput')?.addEventListener('change', (event) => handleCourtDateChange(event.target.value));
    document.getElementById('clientCourtLinkInput')?.addEventListener('change', (event) => handleCourtLinkChange(event.target.value));
    document.getElementById('courtTypeArbitrationToggle')?.addEventListener('click', () => toggleCourtType('arbitration'));
    document.getElementById('courtTypeTretToggle')?.addEventListener('click', () => toggleCourtType('tret'));
    document.getElementById('finManagerPaidToggle')?.addEventListener('change', (event) => toggleExtraPayment('finManagerPaid', event.target.checked));
    document.getElementById('courtDepositPaidToggle')?.addEventListener('change', (event) => toggleExtraPayment('courtDepositPaid', event.target.checked));
}

function formatClientFullName(client) {
    if (!client) return '';
    return [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ').trim();
}

function formatClientDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('ru-RU');
}

function updateClientSwitcherOptions() {
    const switcher = document.getElementById('clientSwitcher');
    if (!switcher) return;
    switcher.innerHTML = '';
    clientsCache.forEach((client, index) => {
        const option = document.createElement('option');
        const name = formatClientFullName(client) || client.id;
        option.value = client.id;
        option.textContent = name;
        if (index === currentClientIndex) option.selected = true;
        switcher.appendChild(option);
    });
    switcher.disabled = clientsCache.length === 0;
    const prevBtn = document.getElementById('clientPrevBtn');
    const nextBtn = document.getElementById('clientNextBtn');
    if (prevBtn) prevBtn.disabled = currentClientIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentClientIndex >= clientsCache.length - 1;
}

function navigateClient(step) {
    if (isClientEditing) {
        alert('Сохраните или отмените изменения перед переключением клиента.');
        return;
    }
    if (!Array.isArray(clientsCache) || clientsCache.length === 0) return;
    const targetIndex = currentClientIndex + step;
    if (targetIndex < 0 || targetIndex >= clientsCache.length) return;
    const client = clientsCache[targetIndex];
    if (client) {
        loadClientCard(client.id);
    }
}

function setClientEditMode(enabled) {
    const root = document.getElementById('clientCardRoot');
    if (!root) return;
    isClientEditing = enabled;
    root.classList.toggle('is-editing', enabled);
    const inputs = root.querySelectorAll('.client-field__input, #clientFirstNameInput, #clientMiddleNameInput, #clientLastNameInput');
    inputs.forEach(input => {
        if (input.dataset.static === 'true') {
            input.setAttribute('disabled', 'disabled');
            return;
        }
        if (enabled) {
            input.removeAttribute('disabled');
        } else {
            input.setAttribute('disabled', 'disabled');
        }
    });
    const notes = document.getElementById('clientNotes');
    if (notes) {
        if (enabled) {
            notes.removeAttribute('readonly');
        } else {
            notes.setAttribute('readonly', 'readonly');
        }
    }
}

function applyClientValuesToInputs(client) {
    const firstNameInput = document.getElementById('clientFirstNameInput');
    if (firstNameInput) firstNameInput.value = client.firstName || '';
    const middleNameInput = document.getElementById('clientMiddleNameInput');
    if (middleNameInput) middleNameInput.value = client.middleName || '';
    const lastNameInput = document.getElementById('clientLastNameInput');
    if (lastNameInput) lastNameInput.value = client.lastName || '';
    const phoneInput = document.getElementById('clientPhoneInput');
    if (phoneInput) phoneInput.value = client.phone || '';
    const totalInput = document.getElementById('clientTotalAmountInput');
    if (totalInput) totalInput.value = client.totalAmount ?? '';
    const monthsInput = document.getElementById('clientPaymentMonthsInput');
    if (monthsInput) monthsInput.value = client.paymentMonths ?? '';
    const startInput = document.getElementById('clientPaymentStartInput');
    if (startInput) startInput.value = client.paymentStartDate || '';
    const notes = document.getElementById('clientNotes');
    if (notes) notes.value = client.notes || '';
    const caseNumberInput = document.getElementById('clientCaseNumberInput');
    if (caseNumberInput) caseNumberInput.value = client.caseNumber || '';
}

function enterClientEditMode() {
    if (!currentClientData) return;
    applyClientValuesToInputs(currentClientData);
    setClientEditMode(true);
}

function saveClientInlineChanges() {
    if (!isClientEditing || !currentClientData) return;
    const firstName = (document.getElementById('clientFirstNameInput')?.value || '').trim();
    const middleName = (document.getElementById('clientMiddleNameInput')?.value || '').trim();
    const lastName = (document.getElementById('clientLastNameInput')?.value || '').trim();
    const phone = (document.getElementById('clientPhoneInput')?.value || '').trim();
    const totalValue = document.getElementById('clientTotalAmountInput')?.value;
    const monthsValue = document.getElementById('clientPaymentMonthsInput')?.value;
    const paymentStart = document.getElementById('clientPaymentStartInput')?.value || '';
    const caseNumber = (document.getElementById('clientCaseNumberInput')?.value || '').trim();
    const notes = document.getElementById('clientNotes')?.value || '';

    const totalAmount = totalValue === '' ? 0 : Number(totalValue);
    const paymentMonths = monthsValue === '' ? 0 : parseInt(monthsValue, 10);

    if (Number.isNaN(totalAmount) || Number.isNaN(paymentMonths)) {
        alert('Проверьте введённые суммы и количество месяцев.');
        return;
    }

    const previousPaid = Array.isArray(currentClientData.paidMonths) ? currentClientData.paidMonths.slice() : [];
    const newPaid = [];
    for (let i = 0; i < paymentMonths; i++) {
        newPaid[i] = Boolean(previousPaid[i]);
    }

    currentClientData.firstName = firstName;
    currentClientData.middleName = middleName;
    currentClientData.lastName = lastName;
    currentClientData.phone = phone;
    currentClientData.totalAmount = totalAmount;
    currentClientData.paymentMonths = paymentMonths;
    currentClientData.paymentStartDate = paymentStart;
    currentClientData.paidMonths = newPaid;
    currentClientData.caseNumber = caseNumber;
    currentClientData.notes = notes;

    commitCurrentClient();
    setClientEditMode(false);
    loadClientCard(currentClientId);
}

function cancelClientInlineChanges() {
    if (!isClientEditing) return;
    setClientEditMode(false);
    loadClientCard(currentClientId);
}

function commitCurrentClient() {
    if (!Array.isArray(clientsCache) || currentClientIndex === -1 || !currentClientData) return;
    clientsCache[currentClientIndex] = currentClientData;
    appStorage.setItem('clients', JSON.stringify(clientsCache));
    refetchCalendarEvents();
}

function updateStageSummary(client) {
    const stageEl = document.getElementById('clientStageSummary');
    if (!stageEl) return;
    if (client.stage) {
        stageEl.textContent = client.subStage ? `${client.stage} · ${client.subStage}` : client.stage;
    } else {
        stageEl.textContent = 'Этап не назначен';
    }
}

function handleStageChange(stage) {
    if (!currentClientData) return;
    currentClientData.stage = stage || '';
    if (!currentClientData.stage || !(subStages[currentClientData.stage] || []).includes(currentClientData.subStage)) {
        currentClientData.subStage = '';
    }
    const subStageSelect = document.getElementById('clientSubStageSelect');
    if (subStageSelect) {
        updateSubStageOptions(currentClientData.stage, subStageSelect);
        subStageSelect.value = currentClientData.subStage || '';
    }
    commitCurrentClient();
    updateStageSummary(currentClientData);
    renderCompletedTasks(currentClientData);
}

function handleSubStageChange(subStage) {
    if (!currentClientData) return;
    currentClientData.subStage = subStage || '';
    commitCurrentClient();
    updateStageSummary(currentClientData);
    renderCompletedTasks(currentClientData);
}

function handleCourtDateChange(value) {
    if (!currentClientData) return;
    currentClientData.courtDate = value || '';
    commitCurrentClient();
    const dateEl = document.getElementById('nextCourtDate');
    if (dateEl) dateEl.textContent = formatClientDate(currentClientData.courtDate);
}

function handleCourtLinkChange(value) {
    if (!currentClientData) return;
    currentClientData.arbitrLink = value ? value.trim() : '';
    commitCurrentClient();
}

function setCourtTypeButtonState(button, active) {
    if (!button) return;
    const isActive = Boolean(active);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    button.classList.toggle('is-active', isActive);
}

function isCourtTypeActive(type) {
    const id = type === 'arbitration' ? 'courtTypeArbitrationToggle' : 'courtTypeTretToggle';
    const button = document.getElementById(id);
    return button?.getAttribute('aria-pressed') === 'true';
}

function toggleCourtType(type) {
    if (!currentClientData) return;
    const id = type === 'arbitration' ? 'courtTypeArbitrationToggle' : 'courtTypeTretToggle';
    const button = document.getElementById(id);
    if (!button || button.hasAttribute('disabled')) return;
    const nextState = button.getAttribute('aria-pressed') !== 'true';
    setCourtTypeButtonState(button, nextState);
    handleCourtTypeChange();
}

function handleCourtTypeChange() {
    if (!currentClientData) return;
    const arbitration = isCourtTypeActive('arbitration');
    const tret = isCourtTypeActive('tret');
    currentClientData.courtTypes = {
        arbitration: Boolean(arbitration),
        tret: Boolean(tret)
    };
    commitCurrentClient();
    updateClientStatusTags(currentClientData);
}

function toggleExtraPayment(field, value) {
    if (!currentClientData) return;
    currentClientData[field] = Boolean(value);
    commitCurrentClient();
    renderClientPayments(currentClientData);
    updateClientStatusTags(currentClientData);
}

function updateExtraPaymentTile(tileId, statusId, paid) {
    const tile = document.getElementById(tileId);
    if (tile) tile.dataset.paid = paid ? 'true' : 'false';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.textContent = paid ? 'Оплачен' : 'Не оплачен';
}

function updateClientStatusTags(client) {
    const container = document.getElementById('clientStatusTags');
    if (!container) return;
    const tags = [];
    const managers = getManagers();
    if (client.managerId) {
        const manager = managers.find(m => String(m.id) === String(client.managerId));
        const managerName = manager ? manager.name : 'Менеджер назначен';
        tags.push(`
            <span class="client-status-chip" title="Закреплённый менеджер: ${escapeHtml(managerName)}">
                <span>${escapeHtml(managerName)}</span>
            </span>
        `);
    } else {
        tags.push(`
            <span class="client-status-chip client-status-chip--alert" title="Менеджер не назначен">
                <span>Нет менеджера</span>
            </span>
        `);
    }

    const courtBadge = getCourtTypeBadge(client);
    if (courtBadge) {
        tags.push(`
            <span class="client-status-chip" title="Тип суда">
                <span>${escapeHtml(courtBadge)}</span>
            </span>
        `);
    }

    container.innerHTML = tags.join('');
}

function updateTaskHint(client) {
    const hint = document.getElementById('clientTasksHint');
    if (!hint) return;
    const activeCount = (window.tasks || []).filter(task => !task.completed).length;
    hint.textContent = activeCount > 0 ? `Активных задач: ${activeCount}` : 'Активных задач нет';
    if (client && client.stage) {
        hint.dataset.stage = client.stage;
    }
}

function handleMonthlyPaymentToggle(index, checked, amount) {
    if (!currentClientData) return;
    currentClientData.paidMonths = currentClientData.paidMonths || [];
    currentClientData.paidMonths[index] = checked;
    if (checked) {
        recordManagerPayment(currentClientData, amount, new Date().toISOString().split('T')[0], { type: 'month', index });
    } else {
        removeManagerPayment(currentClientData, { type: 'month', index });
    }
    commitCurrentClient();
}

function loadClientCard(clientId) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const index = clients.findIndex(c => String(c.id) === String(clientId));
    if (index === -1) {
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    clientsCache = clients;
    currentClientIndex = index;
    currentClientData = clientsCache[currentClientIndex];
    currentClientId = String(currentClientData.id);

    const url = new URL(window.location.href);
    url.searchParams.set('id', currentClientId);
    window.history.replaceState({}, '', url);

    setClientEditMode(false);

    updateClientSwitcherOptions();

    const fullName = formatClientFullName(currentClientData);
    const nameHeading = document.getElementById('clientNameHeading');
    if (nameHeading) nameHeading.textContent = fullName || '—';

    const dealInfoEl = document.getElementById('dealInfo');
    if (dealInfoEl) {
        if (currentClientData.caseNumber) {
            dealInfoEl.textContent = `Дело №${currentClientData.caseNumber}`;
            dealInfoEl.classList.remove('text-muted');
        } else {
            dealInfoEl.textContent = '—';
            dealInfoEl.classList.add('text-muted');
        }
    }

    const phoneDisplay = document.getElementById('clientPhoneDisplay');
    if (phoneDisplay) phoneDisplay.textContent = currentClientData.phone || '—';
    const idDisplay = document.getElementById('clientIdDisplay');
    if (idDisplay) idDisplay.textContent = currentClientData.id || '—';
    const caseNumberDisplay = document.getElementById('clientCaseNumberDisplay');
    if (caseNumberDisplay) caseNumberDisplay.textContent = currentClientData.caseNumber || '—';
    const totalDisplay = document.getElementById('clientTotalAmountDisplay');
    if (totalDisplay) totalDisplay.textContent = currentClientData.totalAmount ? formatCurrencyDisplay(currentClientData.totalAmount) : '—';
    const monthsDisplay = document.getElementById('clientPaymentMonthsDisplay');
    if (monthsDisplay) monthsDisplay.textContent = currentClientData.paymentMonths ? `${currentClientData.paymentMonths} мес.` : '—';
    const startDisplay = document.getElementById('clientPaymentStartDisplay');
    if (startDisplay) startDisplay.textContent = currentClientData.paymentStartDate ? formatClientDate(currentClientData.paymentStartDate) : '—';

    applyClientValuesToInputs(currentClientData);

    const notes = document.getElementById('clientNotes');
    if (notes) {
        notes.value = currentClientData.notes || '';
        notes.setAttribute('readonly', 'readonly');
    }

    const courtDateEl = document.getElementById('nextCourtDate');
    if (courtDateEl) courtDateEl.textContent = formatClientDate(currentClientData.courtDate);

    const courtDateInput = document.getElementById('clientCourtDateInput');
    if (courtDateInput) courtDateInput.value = currentClientData.courtDate || '';
    const courtLinkInput = document.getElementById('clientCourtLinkInput');
    if (courtLinkInput) courtLinkInput.value = currentClientData.arbitrLink || '';

    setCourtTypeButtonState(document.getElementById('courtTypeArbitrationToggle'), Boolean(currentClientData.courtTypes?.arbitration));
    setCourtTypeButtonState(document.getElementById('courtTypeTretToggle'), Boolean(currentClientData.courtTypes?.tret));

    const stageSelect = document.getElementById('clientStageSelect');
    const subStageSelect = document.getElementById('clientSubStageSelect');
    if (stageSelect) {
        stageSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Выберите этап';
        stageSelect.appendChild(placeholder);
        stageOrder.forEach(stage => {
            const option = document.createElement('option');
            option.value = stage;
            option.textContent = stage;
            stageSelect.appendChild(option);
        });
        stageSelect.value = currentClientData.stage || '';
    }
    if (subStageSelect) {
        updateSubStageOptions(currentClientData.stage, subStageSelect);
        subStageSelect.value = currentClientData.subStage || '';
    }
    updateStageSummary(currentClientData);

    const financeBtn = document.getElementById('financeBtn');
    if (financeBtn && !financeBtn.dataset.bound) {
        financeBtn.classList.add('disabled');
        financeBtn.removeAttribute('href');
        financeBtn.addEventListener('click', (e) => e.preventDefault());
        financeBtn.dataset.bound = 'true';
    }

    renderClientManager(currentClientData);
    renderClientPayments(currentClientData);

    window.tasks = currentClientData.tasks || [];
    renderTaskList();
    renderCompletedTasks(currentClientData);
    updateTaskHint(currentClientData);
}

function renderClientPayments(client) {
    const grid = document.getElementById('paymentScheduleGrid');
    if (!grid) return;
    const totalEl = document.getElementById('paymentSummaryTotal');
    if (totalEl) totalEl.textContent = client.totalAmount ? formatCurrencyDisplay(client.totalAmount) : '—';
    const schedule = getPaymentSchedule(client);
    const monthlyEl = document.getElementById('paymentSummaryMonthly');
    const monthlyAmount = schedule.length > 0 ? schedule[0].amount : 0;
    if (monthlyEl) {
        monthlyEl.textContent = monthlyAmount ? formatCurrencyDisplay(monthlyAmount) : '—';
    }

    grid.innerHTML = '';
    if (schedule.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.textContent = 'Нет ежемесячных платежей';
        grid.appendChild(empty);
    } else {
        schedule.forEach((payment, index) => {
            const tile = document.createElement('label');
            tile.className = `payment-tile${payment.paid ? ' payment-tile--paid' : ''}`;
            const dateText = formatClientDate(payment.date);
            tile.innerHTML = `
                <input type="checkbox" ${payment.paid ? 'checked' : ''}>
                <span class="payment-tile__date">${dateText}</span>
                <span class="payment-tile__amount">${formatCurrencyDisplay(payment.amount)}</span>
                <span class="payment-tile__status">${payment.paid ? 'Оплачен' : 'Не оплачен'}</span>
            `;
            const checkbox = tile.querySelector('input');
            checkbox.id = `paidMonth${index}`;
            checkbox.addEventListener('change', () => {
                const statusEl = tile.querySelector('.payment-tile__status');
                if (statusEl) statusEl.textContent = checkbox.checked ? 'Оплачен' : 'Не оплачен';
                tile.classList.toggle('payment-tile--paid', checkbox.checked);
                handleMonthlyPaymentToggle(index, checkbox.checked, payment.amount);
            });
            grid.appendChild(tile);
        });
    }

    const finToggle = document.getElementById('finManagerPaidToggle');
    if (finToggle) finToggle.checked = Boolean(client.finManagerPaid);
    const depositToggle = document.getElementById('courtDepositPaidToggle');
    if (depositToggle) depositToggle.checked = Boolean(client.courtDepositPaid);

    updateExtraPaymentTile('finManagerTile', 'finManagerStatus', Boolean(client.finManagerPaid));
    updateExtraPaymentTile('courtDepositTile', 'courtDepositStatus', Boolean(client.courtDepositPaid));
    updateClientStatusTags(client);
}

function saveClientData(client) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const idx = clients.findIndex(c => String(c.id) === String(client.id));
    if (idx !== -1) {
        clients[idx] = client;
        appStorage.setItem('clients', JSON.stringify(clients));
    }
}

function recordManagerPayment(client, amount, date, info = {}) {
    if (!client || !client.managerId || !client.managerPercent) return;
    const percent = parseFloat(client.managerPercent);
    if (isNaN(percent) || percent <= 0) return;
    const totalDue = Math.round((client.totalAmount || 0) * percent / 100);
    client.managerPaidTotal = client.managerPaidTotal || 0;
    const remaining = totalDue - client.managerPaidTotal;
    if (remaining <= 0) {
        client.managerFullyPaid = true;
        saveClientData(client);
        return;
    }
    let salary = Math.round((amount * percent) / 100);
    if (salary > remaining) salary = remaining;
    const store = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const managerData = store[client.managerId] || {};
    const history = managerData.history || [];
    history.push({ clientId: client.id, amount: salary, date });
    store[client.managerId] = { ...managerData, history };
    appStorage.setItem('managerPayments', JSON.stringify(store));

    client.managerPayments = client.managerPayments || [];
    client.managerPayments.push({ ...info, date, amount: salary });
    client.managerPaidTotal += salary;
    if (client.managerPaidTotal >= totalDue) {
        client.managerFullyPaid = true;
    }
    saveClientData(client);
}

function clientHasPaymentForMonth(client, month) {
    const schedule = getPaymentSchedule(client);
    const hasMonthly = schedule.some(p => p.date.slice(0,7) === month && p.paid);
    const hasExtra = (client.extraPayments || []).some(p => p.date && p.date.slice(0,7) === month && p.paid);
    return hasMonthly || hasExtra;
}

function removeManagerPayment(client, info = {}) {
    if (!client || !client.managerPayments) return;
    const idx = client.managerPayments.findIndex(p => p.type === info.type && p.index === info.index);
    if (idx === -1) return;
    const payment = client.managerPayments.splice(idx, 1)[0];
    if (!client.managerId) return;
    const store = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const managerData = store[client.managerId] || {};
    const history = managerData.history || [];
    const hIdx = history.findIndex(h => h.clientId === client.id && h.amount === payment.amount && h.date === payment.date);
    if (hIdx !== -1) {
        history.splice(hIdx, 1);
        store[client.managerId] = { ...managerData, history };
        appStorage.setItem('managerPayments', JSON.stringify(store));
    }
    client.managerPaidTotal = (client.managerPaidTotal || 0) - (payment.amount || 0);
    if (client.managerPaidTotal < 0) client.managerPaidTotal = 0;
    const percent = parseFloat(client.managerPercent);
    const totalDue = isNaN(percent) ? 0 : Math.round((client.totalAmount || 0) * percent / 100);
    if (client.managerPaidTotal < totalDue) {
        client.managerFullyPaid = false;
    }
    saveClientData(client);
}

function renderFinanceMetrics(client) {
    const schedule = getPaymentSchedule(client);
    const extra = (client.extraPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const paidSchedule = schedule.reduce((sum, p) => p.paid ? sum + p.amount : sum, 0);
    const total = client.totalAmount || 0;
    const paid = paidSchedule + extra;
    const remaining = total - paidSchedule;
    const overdue = schedule
        .filter(p => !p.paid && new Date(p.date) < new Date())
        .reduce((sum, p) => sum + p.amount, 0);
    const percent = total ? Math.round((paid / total) * 100) : 0;
    const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };
    setText('totalAmount', total);
    setText('paidAmount', paid);
    setText('remainingAmount', remaining);
    setText('overdueAmount', overdue);
    setText('remainingTotal', remaining);
    setText('paidPercent', `${percent}%`);
}

function renderFinanceHistory(client) {
    const tbody = document.getElementById('historyBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const schedule = getPaymentSchedule(client);
    schedule.forEach(p => {
        const status = p.paid ? 'проведён' : (new Date(p.date) < new Date() ? 'просрочен' : 'ожидается');
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(p.date).toLocaleDateString('ru-RU')}</td><td>${p.amount}</td><td class="${statusClass(status)}">${status}</td><td></td>`;
        tbody.appendChild(tr);
    });
    (client.extraPayments || []).forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(p.date).toLocaleDateString('ru-RU')}</td><td>${p.amount}</td><td class="${statusClass('проведён')}">проведён</td><td>${p.comment || ''}</td>`;
        tbody.appendChild(tr);
    });
}

function statusClass(status) {
    if (status === 'проведён') return 'text-success';
    if (status === 'ожидается') return 'text-warning';
    if (status === 'просрочен') return 'text-danger';
    return '';
}

function renderPlannedPayments(client) {
    const tbody = document.getElementById('plannedBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const schedule = getPaymentSchedule(client);
    schedule.forEach((p, idx) => {
        if (!p.paid && new Date(p.date) >= new Date()) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${new Date(p.date).toLocaleDateString('ru-RU')}</td><td>${p.amount}</td><td><button class="btn btn-sm btn-success" data-action="pay" data-idx="${idx}">Оплачено</button> <button class="btn btn-sm btn-secondary ms-2" data-action="delay" data-idx="${idx}">Перенос</button></td>`;
            tbody.appendChild(tr);
        }
    });
    tbody.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.idx);
            if (this.dataset.action === 'pay') {
                client.paidMonths[idx] = true;
            } else if (this.dataset.action === 'delay') {
                const current = new Date(schedule[idx].date);
                current.setMonth(current.getMonth() + 1);
                if (!client.paymentAdjustments) client.paymentAdjustments = {};
                client.paymentAdjustments[idx] = current.toISOString().split('T')[0];
            }
            saveClientData(client);
            renderFinanceMetrics(client);
            renderFinanceHistory(client);
            renderPlannedPayments(client);
            renderClientCharts(client);
        });
    });
}

function renderClientCharts(client) {
    const schedule = getPaymentSchedule(client);
    const paidSchedule = schedule.filter(p => p.paid).reduce((sum, p) => sum + p.amount, 0);
    const extra = (client.extraPayments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const paid = paidSchedule + extra;
    const total = client.totalAmount || 0;
    const remaining = total - paid;

    const expCtx = document.getElementById('clientExpenseChart');
    if (expCtx) {
        if (clientExpenseChart) clientExpenseChart.destroy();
        clientExpenseChart = new Chart(expCtx, {
            type: 'doughnut',
            data: {
                labels: ['Оплачено', 'Остаток'],
                datasets: [{
                    data: [paid, remaining],
                    backgroundColor: ['#6555FF', '#C1C6FF']
                }]
            },
            options: {
                plugins: {
                    legend: { position: 'bottom' }
                },
                cutout: '70%'
            }
        });
    }

    const transCtx = document.getElementById('clientTransactionsChart');
    if (transCtx) {
        if (clientTransactionsChart) clientTransactionsChart.destroy();
        const labels = schedule.map(p => new Date(p.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }));
        const paidData = schedule.map(p => p.paid ? p.amount : 0);
        const unpaidData = schedule.map(p => !p.paid ? p.amount : 0);
        clientTransactionsChart = new Chart(transCtx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Оплачено', data: paidData, backgroundColor: '#6555FF' },
                    { label: 'Ожидается', data: unpaidData, backgroundColor: '#C1C6FF' }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function loadFinancePage(clientId) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) {
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }
    const name = [client.firstName, client.lastName].filter(Boolean).join(' ');
    const titleEl = document.getElementById('financeTitle');
    if (titleEl) titleEl.textContent = `Финансы - ${name}`;
    const back = document.getElementById('backBtn');
    if (back) back.href = `client-card.html?id=${client.id}`;
    renderFinanceMetrics(client);
    renderFinanceHistory(client);
    renderPlannedPayments(client);
    renderClientCharts(client);
    const addBtn = document.getElementById('addPaymentBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const date = prompt('Дата платежа (ГГГГ-ММ-ДД):', new Date().toISOString().split('T')[0]);
            if (!date) return;
            const amount = parseFloat(prompt('Сумма:', '0'));
            if (isNaN(amount)) return;
            const comment = prompt('Комментарий:', '') || '';
            if (!client.extraPayments) client.extraPayments = [];
            client.extraPayments.push({ date, amount, paid: true, comment });
            recordManagerPayment(client, amount, date, { type: 'extra', index: client.extraPayments.length - 1 });
            saveClientData(client);
            renderFinanceMetrics(client);
            renderFinanceHistory(client);
            renderPlannedPayments(client);
            renderClientCharts(client);
        });
    }
}
// Обновление клиента
function updateClient() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    if (!clientId) {
        console.error('Клиент не найден: отсутствует ID');
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const existingClient = clients.find(c => String(c.id) === String(clientId));
    if (!existingClient) {
        console.error('Клиент не найден в appStorage:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const paymentMonths = parseInt(document.getElementById('paymentMonths').value) || 0;
    let paidMonths = existingClient.paidMonths || [];
    if (paidMonths.length > paymentMonths) {
        paidMonths = paidMonths.slice(0, paymentMonths);
    } else if (paidMonths.length < paymentMonths) {
        paidMonths = paidMonths.concat(new Array(paymentMonths - paidMonths.length).fill(false));
    }

    const updatedClient = {
        id: existingClient.id,
        firstName: document.getElementById('firstName').value.trim(),
        middleName: document.getElementById('middleName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        birthDate: document.getElementById('birthDate').value,
        phone: document.getElementById('phone').value.trim(),
        passportSeries: document.getElementById('passportSeries').value.trim(),
        passportNumber: document.getElementById('passportNumber').value.trim(),
        passportIssueDate: document.getElementById('passportIssueDate').value,
        passportIssuePlace: document.getElementById('passportIssuePlace').value.trim(),
        totalAmount: parseInt(document.getElementById('totalAmount').value) || 0,
        paymentMonths: paymentMonths,
        paidMonths: paidMonths,
        paymentStartDate: document.getElementById('paymentStartDate').value,
        arbitrLink: document.getElementById('arbitrLink').value.trim(),
        caseNumber: document.getElementById('caseNumber').value.trim(),
        stage: document.getElementById('stage').value,
        subStage: document.getElementById('subStage').value,
        courtTypes: {
            arbitration: document.getElementById('courtArbitrage').checked,
            tret: document.getElementById('courtTret').checked
        },
        courtDate: document.getElementById('courtDate').value,
        notes: document.getElementById('notes').value.trim(),
        favorite: document.getElementById('favoriteBtn')?.dataset.favorite === 'true',
        tasks: window.tasks || existingClient.tasks || [],
        managerId: existingClient.managerId,
        managerPercent: existingClient.managerPercent,
        managerPaidTotal: existingClient.managerPaidTotal,
        managerFullyPaid: existingClient.managerFullyPaid,
        isFinManager: existingClient.isFinManager,
        finManagerName: existingClient.finManagerName,
        managerPayments: existingClient.managerPayments || [],
        finManagerPaid: existingClient.finManagerPaid || false,
        courtDepositPaid: existingClient.courtDepositPaid || false,
        paymentAdjustments: existingClient.paymentAdjustments || {},
        extraPayments: existingClient.extraPayments || [],
        createdAt: existingClient.createdAt // Сохраняем исходную дату создания
    };

    // Валидация
    if (!updatedClient.firstName || !updatedClient.lastName) {
        console.error('Валидация не пройдена: имя и фамилия обязательны');
        alert('Имя и фамилия обязательны!');
        return;
    }
    if (updatedClient.arbitrLink && !updatedClient.arbitrLink.match(/^https?:\/\/.+/)) {
        console.error('Валидация не пройдена: некорректная ссылка на арбитр');
        alert('Введите корректную ссылку на арбитр (или оставьте пустой)!');
        return;
    }
    if (!updatedClient.stage) {
        console.error('Валидация не пройдена: этап обязателен');
        alert('Выберите этап!');
        return;
    }

    const index = clients.findIndex(c => String(c.id) === String(clientId));
    if (index !== -1) {
        clients[index] = updatedClient;
        appStorage.setItem('clients', JSON.stringify(clients));
        const returnUrl = document.referrer || `client-card.html?id=${clientId}`;
        window.location.href = returnUrl;
    } else {
        console.error('Клиент не найден в appStorage:', clientId);
        alert('Клиент не найден!');
        const returnUrl = document.referrer || `client-card.html?id=${clientId}`;
        window.location.href = returnUrl;
    }
}

// Удаление клиента
function deleteClient(options = {}) {
    const { skipConfirmation = false } = options;
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    if (!clientId) {
        console.error('Клиент не найден: отсутствует ID');
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex === -1) {
        console.error('Клиент не найден в appStorage:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    if (!skipConfirmation && !confirm('Вы уверены, что хотите удалить этого клиента?')) {
        return;
    }

    clients.splice(clientIndex, 1);
    appStorage.setItem('clients', JSON.stringify(clients));
    window.location.href = 'index.html';
}

// Сохранение клиента
function saveClient() {
    const getInputValue = (id, { trim = true } = {}) => {
        const element = document.getElementById(id);
        if (!element) return '';
        const value = element.value ?? '';
        return trim ? value.trim() : value;
    };

    const firstName = getInputValue('firstName');
    const middleName = getInputValue('middleName');
    const lastName = getInputValue('lastName');
    const phone = getInputValue('phone');
    const paymentMonthsValue = parseInt(getInputValue('paymentMonths', { trim: false }), 10) || 0;
    const paidMonths = new Array(paymentMonthsValue).fill(false);
    if (phone && !/^\d{10,12}$/.test(phone)) {
        alert('Номер телефона должен содержать 10-12 цифр!');
        return;
    }
    const tasks = Array.isArray(window.tasks) ? window.tasks : [];
    const client = {
        id: generateClientId(firstName, middleName, lastName, phone),
        firstName,
        middleName,
        lastName,
        birthDate: getInputValue('birthDate', { trim: false }),
        phone,
        totalAmount: parseInt(getInputValue('totalAmount', { trim: false }), 10) || 0,
        paymentMonths: paymentMonthsValue,
        paymentStartDate: getInputValue('paymentStartDate', { trim: false }),
        paidMonths,
        arbitrLink: getInputValue('arbitrLink'),
        caseNumber: getInputValue('caseNumber'),
        stage: getInputValue('stage', { trim: false }),
        subStage: getInputValue('subStage', { trim: false }),
        courtDate: getInputValue('courtDate', { trim: false }),
        notes: '',
        favorite: document.getElementById('favoriteBtn')?.dataset.favorite === 'true',
        createdAt: new Date().toISOString(),
        tasks,
        finManagerPaid: false,
        courtDepositPaid: false,
        paymentAdjustments: {},
        extraPayments: [],
        managerPayments: [],
        managerPaidTotal: 0,
        managerFullyPaid: false
    };

    // Валидация
    if (!client.firstName || !client.lastName || !client.middleName) {
        console.error('Валидация не пройдена: ФИО обязательно');
        alert('ФИО обязательно для заполнения!');
        return;
    }

    if (!client.totalAmount || client.totalAmount <= 0) {
        alert('Укажите общую сумму сделки');
        return;
    }

    if (!client.paymentStartDate) {
        alert('Укажите дату первого платежа');
        return;
    }

    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    clients.push(client);
    appStorage.setItem('clients', JSON.stringify(clients));
    window.location.href = 'index.html';
}

// Поиск клиентов
function searchClients() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const list = document.getElementById('searchSuggestions');
    if (!list) return;
    list.innerHTML = '';

    if (!query) {
        list.classList.add('d-none');
        return;
    }

    const filteredClients = clients.filter(client => {
        const firstName = (client.firstName || '').toLowerCase();
        const lastName = (client.lastName || '').toLowerCase();
        const matchesName = firstName.startsWith(query) || lastName.startsWith(query);
        const matchesCaseNumber = client.caseNumber && client.caseNumber.toLowerCase().includes(query);
        return matchesName || matchesCaseNumber;
    }).sort((a, b) => Number(b.favorite) - Number(a.favorite));

    if (filteredClients.length === 0) {
        list.classList.add('d-none');
        return;
    }

    filteredClients.forEach(client => {
        const item = document.createElement('li');
        item.className = 'list-group-item clickable-item';
        item.innerHTML = `${client.favorite ? '<i class="ri-star-fill favorite-icon"></i>' : ''}${client.firstName} ${client.lastName}${getCourtTypeBadge(client)}`;
        item.onclick = () => { window.location.href = `client-card.html?id=${client.id}`; };
        list.appendChild(item);
    });
    list.classList.remove('d-none');
}

// Генерация PDF договора (заглушка)
function generateContractPDF() {
    alert('Генерация договора временно недоступна. Функционал будет доработан позже.');
}

function renderDayActions(dateStr) {
    const list = document.getElementById('dayActionsList');
    if (!list) return;
    list.dataset.currentDate = dateStr || '';
    const selectedDateLabel = document.getElementById('tasksSelectedDate');
    if (selectedDateLabel && dateStr) {
        const parts = dateStr.split('-').map(Number);
        if (parts.length === 3 && !parts.some(Number.isNaN)) {
            const [year, month, day] = parts;
            const formattedDate = new Date(year, month - 1, day);
            const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(formattedDate);
            const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(formattedDate);
            const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
            const todayStr = new Date().toISOString().split('T')[0];
            if (dateStr === todayStr) {
                selectedDateLabel.textContent = `Сегодня · ${dayMonth}`;
            } else {
                selectedDateLabel.textContent = `${capitalizedWeekday}, ${dayMonth}`;
            }
        }
    }

    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
    const managers = getManagers();

    const clientTasks = clients
        .filter(client => client.tasks && Array.isArray(client.tasks))
        .flatMap(client => client.tasks
            .filter(task => task.deadline === dateStr && !task.completed)
            .map(task => ({ ...task, clientId: client.id, clientName: `${client.firstName} ${client.lastName}`, type: 'client' }))
        );
    const managerTasks = managers
        .filter(m => m.tasks && Array.isArray(m.tasks))
        .flatMap(m => m.tasks
            .filter(task => task.deadline === dateStr && !task.completed)
            .map(task => ({ ...task, managerId: m.id, managerName: m.name, type: 'manager' }))
        );
    const tasks = [...clientTasks, ...managerTasks];
    const payments = clients
        .flatMap(client => getPaymentSchedule(client)
            .map((p, idx) => ({ client, payment: p, idx }))
            .filter(p => p.payment.date === dateStr && !p.payment.paid)
        );
    const consults = consultations.filter(consult => consult.date === dateStr);
    const courts = clients.filter(client => client.courtDate === dateStr);

    list.innerHTML = '';
    if (consults.length === 0 && tasks.length === 0 && courts.length === 0 && payments.length === 0) {
        list.innerHTML = '<li class="list-group-item text-center">Нет событий</li>';
        return;
    }

    consults.forEach(consult => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.style.borderLeft = '5px solid #0d6efd';
        li.innerHTML = `
            <span class="consultation-item" onclick="showConsultationDetails(${consult.id})">Консультация: ${consult.name}</span>
            <div class="d-flex gap-1">
                <button class="small-square-btn" onclick="convertToClient(${consult.id}, '${dateStr}')" title="Преобразовать в клиента"><i class="ri-add-line"></i></button>
                <button class="small-square-btn btn-delete" onclick="deleteConsultation(${consult.id}, '${dateStr}')" title="Удалить консультацию"><i class="ri-close-line"></i></button>
            </div>`;
        list.appendChild(li);
    });

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.style.borderLeft = `5px solid ${task.color || '#28a745'}`;
        const textSpan = document.createElement('span');
        textSpan.className = 'task-text';
        textSpan.textContent = task.type === 'manager'
            ? `${task.text} (${task.managerName})`
            : `${task.text} (${task.clientName})`;
        textSpan.onclick = function() { this.classList.toggle('expanded'); };
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-primary';
        btn.textContent = 'Выполнено';
        btn.onclick = () => {
            if (task.type === 'manager') {
                completeManagerTaskFromCalendar(task.managerId, task.id, `${dateStr}`);
            } else {
                completeTaskFromCalendar(task.clientId, task.id, `${dateStr}`);
            }
        };
        li.appendChild(textSpan);
        li.appendChild(btn);
        list.appendChild(li);
    });

    payments.forEach(p => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `Оплата: ${p.client.firstName} ${p.client.lastName} (${p.payment.amount} ₽) <button class="btn btn-sm btn-primary" onclick="confirmPayment('${p.client.id}', ${p.idx}, '${dateStr}')">Оплатил</button>`;
        list.appendChild(li);
    });

    courts.forEach(client => {
        const li = document.createElement('li');
        li.className = 'list-group-item clickable-item d-flex justify-content-between align-items-center';
        li.style.borderLeft = '5px solid #fd7e14';
        const stageClass = stageColorClasses[client.stage] || '';
        const stageBadge = client.stage ? `<span class="stage-badge ${stageClass}">${client.stage}${client.subStage ? ' - ' + client.subStage : ''}</span>` : '';
        li.innerHTML = `${client.firstName} ${client.lastName}${stageBadge}`;
        li.onclick = () => { window.location.href = `client-card.html?id=${client.id}`; };
        list.appendChild(li);
    });
}

function confirmPayment(clientId, paymentIndex, dateStr) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client || !client.paidMonths || paymentIndex >= client.paidMonths.length) return;
    client.paidMonths[paymentIndex] = true;
    appStorage.setItem('clients', JSON.stringify(clients));
    if (dateStr) {
        renderDayActions(dateStr);
    }
    renderDebtorsList();
    refetchCalendarEvents();
}

function getDebtors() {
    const today = new Date().toISOString().split('T')[0];
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    return clients.flatMap(client =>
        getPaymentSchedule(client)
            .map((p, idx) => ({ client, payment: p, idx }))
            .filter(p => !p.payment.paid && p.payment.date < today)
    );
}

function renderDebtorsList() {
    const list = document.getElementById('debtorsModalList');
    if (!list) return;
    const debtors = getDebtors();
    list.innerHTML = '';
    if (debtors.length === 0) {
        list.innerHTML = '<li class="list-group-item text-center">Нет должников</li>';
        return;
    }
    debtors.forEach(d => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `${d.client.firstName} ${d.client.lastName} — ${new Date(d.payment.date).toLocaleDateString('ru-RU')} <button class="btn btn-sm btn-primary" onclick="confirmPayment('${d.client.id}', ${d.idx}, '${d.payment.date}')">Оплатил</button>`;
        list.appendChild(li);
    });
}

function openDebtorsModal() {
    renderDebtorsList();
    const modalEl = document.getElementById('debtorsModal');
    if (!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
}

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) {
        console.error('Элемент #calendar не найден');
        return;
    }
    if (!window.FullCalendar) {
        console.error('FullCalendar не загружен!');
        return;
    }
    const monthLabel = document.getElementById('calendarMonthLabel');
    const yearLabel = document.getElementById('calendarYearLabel');
    const viewToggle = document.getElementById('calendarViewToggle');
    const prevBtn = document.getElementById('calendarPrev');
    const nextBtn = document.getElementById('calendarNext');
    const calendarCard = calendarEl.closest('.calendar-card');
    let selectedDayEl = null;
    let selectedDateStr = new Date().toISOString().split('T')[0];
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ru',
        firstDay: 1,
        headerToolbar: false,
        buttonText: {
            today: 'Сегодня',
            month: 'Месяц',
            week: 'Неделя',
            day: 'День'
        },
        views: {
            listWeek: {
                listDayFormat: { weekday: 'long' },
                listDaySideFormat: { day: 'numeric', month: 'long' }
            }
        },
        noEventsContent: 'Нет событий',
        eventDisplay: 'dot',
        events: function(info, successCallback, failureCallback) {
            const clients = JSON.parse(appStorage.getItem('clients')) || [];
            const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
            const clientEvents = clients
                .filter(client => client.courtDate)
                .map(client => ({
                    title: `${client.firstName} ${client.lastName} (${client.stage}${client.subStage ? ' - ' + client.subStage : ''})`,
                    start: client.courtDate,
                    backgroundColor: '#fd7e14',
                    borderColor: '#fd7e14',
                    extendedProps: { type: 'client', clientId: client.id }
                }));
            // --- задачи клиентов ---
            const taskEvents = clients
                .filter(client => client.tasks && Array.isArray(client.tasks))
                .flatMap(client => client.tasks
                    .filter(task => task.deadline && !task.completed)
                    .map(task => ({
                        title: `Задача: ${task.text} (${client.firstName} ${client.lastName})`,
                        start: task.deadline,
                        backgroundColor: task.color || '#dc3545',
                        borderColor: task.color || '#dc3545',
                        extendedProps: { type: 'task', clientId: client.id, taskId: task.id }
                    }))
                );
            // --- задачи менеджеров ---
            const managers = getManagers();
            const managerTaskEvents = managers
                .filter(m => m.tasks && Array.isArray(m.tasks))
                .flatMap(m => m.tasks
                    .filter(task => task.deadline && !task.completed)
                    .map(task => ({
                        title: `Задача менеджеру: ${task.text} (${m.name})`,
                        start: task.deadline,
                        backgroundColor: task.color || '#dc3545',
                        borderColor: task.color || '#dc3545',
                        extendedProps: { type: 'manager-task', managerId: m.id, taskId: task.id }
                    }))
                );
            const consultationEvents = consultations
                .filter(consult => consult.date)
                .map(consult => ({
                    title: `Консультация: ${consult.name}`,
                    start: consult.date,
                    backgroundColor: '#0d6efd',
                    extendedProps: { type: 'consultation', consultId: consult.id }
                }));
            const paymentEvents = clients
                .flatMap(client => getPaymentSchedule(client)
                    .map((p, idx) => ({ client, payment: p, idx }))
                    .filter(p => !p.payment.paid)
                    .map(p => ({
                        title: `Оплата: ${p.client.firstName} ${p.client.lastName}`,
                        start: p.payment.date,
                        backgroundColor: '#198754',
                        extendedProps: { type: 'payment', clientId: p.client.id, paymentIndex: p.idx }
                    }))
                );
            const allEvents = [...clientEvents, ...taskEvents, ...managerTaskEvents, ...consultationEvents, ...paymentEvents];
            successCallback(allEvents);
        },
        eventContent: function(arg) {
            return {
                html: `<div class="calendar-event"><span class="event-dot" style="background-color: ${arg.event.backgroundColor};"></span><span class="event-text">${arg.event.title}</span></div>`
            };
        },
        dateClick: function(info) {
            selectedDateStr = info.dateStr;
            highlightDay(selectedDateStr);
            renderDayActions(info.dateStr);
        },
        eventClick: function(info) {
            const clickedDate = (info.event.startStr || info.event.start?.toISOString() || '').split('T')[0];
            if (clickedDate) {
                selectedDateStr = clickedDate;
                highlightDay(selectedDateStr);
                renderDayActions(clickedDate);
            }
        },
        datesSet: function() {
            const view = calendar.view;
            const start = view.currentStart;
            const end = view.currentEnd;
            const selectedDate = new Date(`${selectedDateStr}T00:00:00`);
            if (!Number.isNaN(selectedDate.getTime())) {
                if (!(selectedDate >= start && selectedDate < end)) {
                    selectedDateStr = start.toISOString().split('T')[0];
                    renderDayActions(selectedDateStr);
                }
            }
            updateCalendarHeader();
            requestAnimationFrame(() => highlightDay(selectedDateStr));
            markDaysWithEvents();
        }
    });
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            calendar.prev();
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            calendar.next();
        });
    }
    if (viewToggle) {
        viewToggle.addEventListener('click', () => {
            const isMonth = calendar.view.type === 'dayGridMonth';
            calendar.changeView(isMonth ? 'listWeek' : 'dayGridMonth');
        });
    }
    calendar.render();
    updateCalendarHeader();
    highlightDay(selectedDateStr);
    markDaysWithEvents();
    calendar.on('eventsSet', markDaysWithEvents);

    calendarEl.addEventListener('click', event => {
        if (calendar.view.type !== 'listWeek') return;
        const row = event.target.closest('tr');
        if (!row || !row.classList.contains('fc-list-day')) return;
        const dateStr = row.getAttribute('data-date');
        if (dateStr) {
            event.preventDefault();
            selectedDateStr = dateStr;
            highlightDay(dateStr);
            renderDayActions(dateStr);
        }
    });

    function highlightDay(dateStr) {
        if (selectedDayEl) {
            selectedDayEl.classList.remove('selected-day');
        }
        const viewType = calendar.view.type;
        if (viewType === 'listWeek') {
            selectedDayEl = calendarEl.querySelector(`.fc-list-day[data-date="${dateStr}"]`);
        } else {
            selectedDayEl = calendarEl.querySelector(`.fc-daygrid-day[data-date="${dateStr}"]`);
        }
        if (selectedDayEl) {
            selectedDayEl.classList.add('selected-day');
        }
    }

    function updateCalendarHeader() {
        const view = calendar.view;
        const startDate = view.currentStart;
        if (monthLabel) {
            if (view.type === 'listWeek') {
                const endDate = new Date(view.currentEnd.getTime() - 1);
                const startLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(startDate);
                const endLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(endDate);
                monthLabel.textContent = `${startLabel} — ${endLabel}`;
            } else {
                const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(startDate);
                monthLabel.textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);
            }
        }
        if (yearLabel) {
            if (view.type === 'listWeek') {
                const endDate = new Date(view.currentEnd.getTime() - 1);
                const startYear = new Intl.DateTimeFormat('ru-RU', { year: 'numeric' }).format(startDate);
                const endYear = new Intl.DateTimeFormat('ru-RU', { year: 'numeric' }).format(endDate);
                yearLabel.textContent = startYear === endYear ? startYear : `${startYear} / ${endYear}`;
            } else {
                yearLabel.textContent = new Intl.DateTimeFormat('ru-RU', { year: 'numeric' }).format(startDate);
            }
        }
        if (viewToggle) {
            const isWeek = view.type === 'listWeek';
            viewToggle.textContent = isWeek ? 'месяц' : 'неделя';
            viewToggle.classList.toggle('is-active', isWeek);
        }
        if (calendarCard) {
            calendarCard.classList.toggle('is-week-view', view.type === 'listWeek');
        }
    }

    function markDaysWithEvents() {
        if (calendar.view.type !== 'dayGridMonth') {
            return;
        }
        const dayCells = calendarEl.querySelectorAll('.fc-daygrid-day');
        dayCells.forEach(cell => {
            const dateStr = cell.getAttribute('data-date');
            const events = calendar.getEvents().filter(ev => ev.startStr === dateStr);
            const frame = cell.querySelector('.fc-daygrid-day-frame');
            const oldDots = frame.querySelector('.event-dots');
            if (oldDots) oldDots.remove();
            if (events.length === 0) return;
            const colors = [...new Set(events.map(ev => ev.backgroundColor))];
            const container = document.createElement('div');
            container.className = 'event-dots';
            colors.forEach(color => {
                const dot = document.createElement('span');
                dot.className = 'event-dot';
                dot.style.backgroundColor = color;
                container.appendChild(dot);
            });
            frame.appendChild(container);
        });
    }
    // Сохраняем ссылку для обновления событий
    calendarEl._fullCalendar = calendar;
}

function showClientsForDate(dateStr) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
    const filteredClients = clients.filter(client => client.courtDate === dateStr);
    const filteredConsultations = consultations.filter(consult => consult.date === dateStr);
    const managerList = getManagers();
    const clientTasks = clients
        .filter(client => client.tasks && Array.isArray(client.tasks))
        .flatMap(client => client.tasks
            .filter(task => task.deadline === dateStr && !task.completed)
            .map(task => ({ ...task, clientId: client.id, clientName: `${client.firstName} ${client.lastName}`, type: 'client' }))
        );
    const managerTasks = managerList
        .filter(m => m.tasks && Array.isArray(m.tasks))
        .flatMap(m => m.tasks
            .filter(task => task.deadline === dateStr && !task.completed)
            .map(task => ({ ...task, managerId: m.id, managerName: m.name, type: 'manager' }))
        );
    const filteredTasks = [...clientTasks, ...managerTasks];

    const modal = document.getElementById('dayClientsModal');
    const modalTitle = document.getElementById('dayClientsModalLabel');
    const clientsList = document.getElementById('dayClientsList');
    const consultationsList = document.getElementById('dayConsultationsList');
    const tasksList = document.getElementById('dayTasksList');
    const consultDate = document.getElementById('consultDate');

    if (modalTitle) {
        modalTitle.textContent = `События на ${new Date(dateStr).toLocaleDateString('ru-RU')}`;
    }
    if (consultDate) {
        consultDate.value = dateStr;
    }
    if (clientsList) {
        clientsList.innerHTML = '';
        if (filteredClients.length === 0) {
            clientsList.innerHTML = '<li class="list-group-item text-center">Нет клиентов</li>';
        } else {
            filteredClients.forEach(client => {
                const li = document.createElement('li');
                li.className = `list-group-item clickable-item d-flex justify-content-between align-items-center`;
                const stageClass = stageColorClasses[client.stage] || '';
                const stageBadge = client.stage ? `<span class="stage-badge ${stageClass}">${client.stage}${client.subStage ? ' - ' + client.subStage : ''}</span>` : '';
                li.innerHTML = `${client.firstName} ${client.lastName}${stageBadge}`;
                li.onclick = () => {
                    window.location.href = `client-card.html?id=${client.id}`;
                };
                clientsList.appendChild(li);
            });
        }
    }
    if (tasksList) {
        tasksList.innerHTML = '';
        if (filteredTasks.length === 0) {
            tasksList.innerHTML = '<li class="list-group-item text-center">Нет задач</li>';
        } else {
            filteredTasks.forEach((task, idx) => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.style.borderLeft = `5px solid ${task.color || '#28a745'}`;
                const owner = task.type === 'manager' ? task.managerName : task.clientName;
                li.innerHTML = `${task.text} (${owner}) <span class="badge" style="background-color:${task.color || '#28a745'}">${task.deadline}</span>`;
                tasksList.appendChild(li);
            });
        }
    }
    if (consultationsList) {
        consultationsList.innerHTML = '';
        if (filteredConsultations.length === 0) {
            consultationsList.innerHTML = '<li class="list-group-item text-center">Нет консультаций</li>';
        } else {
            filteredConsultations.forEach(consult => {
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex justify-content-between align-items-center';
                li.style.borderLeft = '5px solid #0d6efd';
                li.innerHTML = `
                    <span class="consultation-item" onclick="showConsultationDetails(${consult.id})">Консультация: ${consult.name}</span>
                    <div class="d-flex gap-1">
                        <button class="small-square-btn" onclick="convertToClient(${consult.id}, '${dateStr}')" title="Преобразовать в клиента"><i class="ri-add-line"></i></button>
                        <button class="small-square-btn btn-delete" onclick="deleteConsultation(${consult.id}, '${dateStr}')" title="Удалить консультацию"><i class="ri-close-line"></i></button>
                    </div>
                `;
                consultationsList.appendChild(li);
            });
        }
    }

    if (modal) {
        let modalInstance = bootstrap.Modal.getInstance(modal);
        if (!modalInstance) {
            modalInstance = new bootstrap.Modal(modal);
        }
        if (!modal.classList.contains('show')) {
            modalInstance.show();
        }
    }
}


// Завершение клиента
function completeClient(clientId) {
    // Получаем текущих клиентов
    var clients = JSON.parse(appStorage.getItem('clients')) || [];
    var archivedClients = JSON.parse(appStorage.getItem('archivedClients')) || [];
    var clientIndex = -1;
    for (var i = 0; i < clients.length; i++) {
        if (String(clients[i].id) === String(clientId)) {
            clientIndex = i;
            break;
        }
    }
    if (clientIndex === -1) return;

    // Помечаем завершение и сохраняем дату
    clients[clientIndex].stage = 'Завершение';
    clients[clientIndex].subStage = '';
    clients[clientIndex].completedAt = new Date().toISOString();

    // Переносим клиента в архив
    archivedClients.push(clients[clientIndex]);
    clients.splice(clientIndex, 1);

    appStorage.setItem('clients', JSON.stringify(clients));
    appStorage.setItem('archivedClients', JSON.stringify(archivedClients));

    showToast('Клиент перемещён в архив!');
    displayClientsList();
}

// Отображение завершённых клиентов в модальном окне
function populateArchivedClientsList() {
    const listEl = document.getElementById('archivedClientsList');
    if (!listEl) return;
    const archivedClients = JSON.parse(appStorage.getItem('archivedClients')) || [];
    listEl.innerHTML = '';
    if (archivedClients.length === 0) {
        listEl.innerHTML = '<li class="list-group-item">Архив пуст</li>';
    } else {
        archivedClients.forEach(client => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <span>${client.firstName} ${client.lastName}</span>
                <button class="btn btn-sm btn-danger" onclick="deleteArchivedClient('${client.id}')">Удалить</button>
            `;
            listEl.appendChild(li);
        });
    }
}

function showArchivedClients() {
    populateArchivedClientsList();
    const modalEl = document.getElementById('archivedClientsModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.show();
    }
}

function deleteArchivedClient(clientId) {
    const archivedClients = JSON.parse(appStorage.getItem('archivedClients')) || [];
    const index = archivedClients.findIndex(c => String(c.id) === String(clientId));
    if (index === -1) return;
    if (confirm('Удалить этого клиента из архива?')) {
        archivedClients.splice(index, 1);
        appStorage.setItem('archivedClients', JSON.stringify(archivedClients));
        populateArchivedClientsList();
        showToast('Клиент удалён из архива');
    }
}
window.deleteArchivedClient = deleteArchivedClient;

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    document.body.appendChild(toast);
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Управление задачами ---
function addTask() {
    const textInput = document.getElementById('taskText');
    const deadlineInput = document.getElementById('taskDeadline');
    const colorInput = document.getElementById('taskColor');
    const text = textInput ? textInput.value.trim() : '';
    const deadline = deadlineInput ? deadlineInput.value : '';
    const color = colorInput ? colorInput.value : '#28a745';
    if (!text) {
        alert('Введите текст задачи!');
        return;
    }
    const task = {
        id: Date.now(),
        text,
        color,
        deadline,
        completed: false
    };
    window.tasks.push(task);
    if (currentClientData) {
        currentClientData.tasks = window.tasks;
        commitCurrentClient();
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        const clients = JSON.parse(appStorage.getItem('clients')) || [];
        const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
        if (clientIndex !== -1) {
            clients[clientIndex].tasks = window.tasks;
            appStorage.setItem('clients', JSON.stringify(clients));
        }
    }
    renderTaskList();
    renderCompletedTasks(currentClientData);
    updateTaskHint(currentClientData);
    if (textInput) textInput.value = '';
    if (deadlineInput) deadlineInput.value = '';
    if (colorInput) colorInput.value = '#28a745';
}
function renderTaskList() {
    const list = document.getElementById('taskList');
    if (!list) return;
    list.innerHTML = '';
    const activeTasks = (window.tasks || []).filter(task => !task.completed);
    if (activeTasks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-muted';
        empty.textContent = 'Нет активных задач';
        list.appendChild(empty);
    } else {
        activeTasks.forEach((task, idx) => {
            const item = document.createElement('div');
            item.className = 'client-task-item';
            const color = task.color || '#7066ff';
            item.style.borderLeftColor = color;
            const deadlineText = task.deadline ? `Дедлайн: ${formatClientDate(task.deadline)}` : 'Без срока';
            item.innerHTML = `
                <div class="client-task-item__info">
                    <span class="client-task-item__title" onclick="this.classList.toggle('expanded')" title="${escapeHtml(task.text)}">${escapeHtml(task.text)}</span>
                    <span class="client-task-item__meta">${deadlineText}</span>
                </div>
                <div class="client-task-item__actions">
                    <button type="button" class="client-task-item__action client-task-item__action--complete" onclick="completeTask(${idx})">Выполнено</button>
                    <button type="button" class="client-task-item__action client-task-item__action--delete" onclick="removeTask(${idx})">Удалить</button>
                </div>
            `;
            list.appendChild(item);
        });
    }
    updateTaskHint(currentClientData);
}
function removeTask(idx) {
    window.tasks.splice(idx, 1);
    if (currentClientData) {
        currentClientData.tasks = window.tasks;
        commitCurrentClient();
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        const clients = JSON.parse(appStorage.getItem('clients')) || [];
        const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
        if (clientIndex !== -1) {
            clients[clientIndex].tasks = window.tasks;
            appStorage.setItem('clients', JSON.stringify(clients));
        }
    }
    renderTaskList();
    renderCompletedTasks(currentClientData);
    updateTaskHint(currentClientData);
}

function completeTask(idx) {
    const task = window.tasks[idx];
    if (!task) return;
    task.completed = true;
    task.completedAt = new Date().toISOString();
    if (currentClientData) {
        advanceClientStage(currentClientData);
        currentClientData.tasks = window.tasks;
        commitCurrentClient();
        const stageSelect = document.getElementById('clientStageSelect');
        const subStageSelect = document.getElementById('clientSubStageSelect');
        if (stageSelect) stageSelect.value = currentClientData.stage || '';
        if (subStageSelect) {
            updateSubStageOptions(currentClientData.stage, subStageSelect);
            subStageSelect.value = currentClientData.subStage || '';
        }
        updateStageSummary(currentClientData);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        const clients = JSON.parse(appStorage.getItem('clients')) || [];
        const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
        if (clientIndex === -1) return;
        advanceClientStage(clients[clientIndex]);
        clients[clientIndex].tasks = window.tasks;
        appStorage.setItem('clients', JSON.stringify(clients));
    }
    renderTaskList();
    renderCompletedTasks(currentClientData);
    updateTaskHint(currentClientData);
}

function renderCompletedTasks() {
    const list = document.getElementById('completedTaskList');
    const stageInfo = document.getElementById('completedTasksStage');
    const historySection = document.getElementById('completedTasksSection');
    const toggleBtn = document.getElementById('toggleTaskHistoryBtn');
    const client = currentClientData;
    if (stageInfo && client) {
        stageInfo.textContent = client.stage ? `Этап: ${client.stage}${client.subStage ? ' · ' + client.subStage : ''}` : 'Этап не назначен';
    }
    if (!list || !historySection || !toggleBtn) return;
    list.innerHTML = '';
    const history = (window.tasks || []).filter(task => task.completed);
    if (history.length === 0) {
        toggleBtn.disabled = true;
        historySection.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        const emptyItem = document.createElement('li');
        emptyItem.className = 'client-task-history__empty text-muted';
        emptyItem.textContent = 'Нет выполненных задач';
        list.appendChild(emptyItem);
        return;
    }
    toggleBtn.disabled = false;
    history.forEach(task => {
        const li = document.createElement('li');
        li.style.borderLeftColor = task.color || '#7066ff';
        const completedDate = task.completedAt ? formatClientDate(task.completedAt) : '';
        const meta = completedDate ? ` (${completedDate})` : '';
        li.textContent = `${task.text}${meta}`;
        list.appendChild(li);
    });
}

window.showCompletedTasks = function() {
    renderCompletedTasks(currentClientData);
    const historySection = document.getElementById('completedTasksSection');
    const toggleBtn = document.getElementById('toggleTaskHistoryBtn');
    if (historySection) historySection.classList.add('is-open');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
};

function advanceClientStage(client) {
    const stages = Object.keys(subStages);
    const currentStageIndex = stages.indexOf(client.stage);
    const currentSubStages = subStages[client.stage] || [];
    const currentSubIndex = currentSubStages.indexOf(client.subStage);
    if (currentSubIndex !== -1 && currentSubIndex < currentSubStages.length - 1) {
        client.subStage = currentSubStages[currentSubIndex + 1];
    } else if (currentStageIndex !== -1 && currentStageIndex < stages.length - 1) {
        const nextStage = stages[currentStageIndex + 1];
        client.stage = nextStage;
        client.subStage = subStages[nextStage] ? subStages[nextStage][0] : '';
    }
}

window.completeTaskFromCalendar = function(clientId, taskId, dateStr) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex === -1) return;
    const tasks = clients[clientIndex].tasks || [];
    const tIndex = tasks.findIndex(t => t.id === taskId);
    if (tIndex === -1) return;
    tasks[tIndex].completed = true;
    tasks[tIndex].completedAt = new Date().toISOString();
    advanceClientStage(clients[clientIndex]);
    clients[clientIndex].tasks = tasks;
    appStorage.setItem('clients', JSON.stringify(clients));
    renderDayActions(dateStr);
    if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
        document.getElementById('calendar')._fullCalendar.refetchEvents();
    }
};

window.addManagerTask = function(managerId) {
    const textEl = document.getElementById(`managerTaskText${managerId}`);
    const deadlineEl = document.getElementById(`managerTaskDeadline${managerId}`);
    const colorEl = document.getElementById(`managerTaskColor${managerId}`);
    const text = textEl.value.trim();
    const deadline = deadlineEl.value;
    const color = colorEl.value;
    if (!text) return;
    const managers = getManagers();
    const manager = managers.find(m => String(m.id) === String(managerId));
    if (!manager) return;
    const task = { id: Date.now(), text, deadline, color, completed: false };
    manager.tasks = manager.tasks || [];
    manager.tasks.push(task);
    saveManagers(managers);
    textEl.value = '';
    deadlineEl.value = '';
    renderManagerTaskList(managerId);
};

function renderManagerTaskList(managerId) {
    const managers = getManagers();
    const manager = managers.find(m => String(m.id) === String(managerId));
    const list = document.getElementById(`managerTaskList${managerId}`);
    if (!list || !manager) return;
    list.innerHTML = '';
    (manager.tasks || []).forEach(task => {
        if (task.completed) return;
        const li = document.createElement('li');
        li.className = 'manager-task-item';
        li.style.setProperty('--task-accent-color', task.color || '#7066ff');
        const textWithDeadline = `${task.text}${task.deadline ? ' (' + task.deadline + ')' : ''}`;
        li.innerHTML = `
            <button type="button" class="manager-task-item__text" onclick="this.classList.toggle('expanded')" title="${textWithDeadline}">${textWithDeadline}</button>
            <div class="manager-task-item__actions">
                <button type="button" class="manager-task-item__action manager-task-item__action--complete" onclick="completeManagerTask(${managerId}, ${task.id})">Выполнено</button>
                <button type="button" class="manager-task-item__action manager-task-item__action--delete" onclick="removeManagerTask(${managerId}, ${task.id})">Удалить</button>
            </div>`;
        list.appendChild(li);
    });
}

window.removeManagerTask = function(managerId, taskId) {
    const managers = getManagers();
    const manager = managers.find(m => String(m.id) === String(managerId));
    if (!manager || !manager.tasks) return;
    const idx = manager.tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) manager.tasks.splice(idx, 1);
    saveManagers(managers);
    renderManagerTaskList(managerId);
};

window.completeManagerTask = function(managerId, taskId) {
    const managers = getManagers();
    const manager = managers.find(m => String(m.id) === String(managerId));
    if (!manager || !manager.tasks) return;
    const task = manager.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.completed = true;
    task.completedAt = new Date().toISOString();
    saveManagers(managers);
    renderManagerTaskList(managerId);
};

window.completeManagerTaskFromCalendar = function(managerId, taskId, dateStr) {
    const managers = getManagers();
    const mIndex = managers.findIndex(m => String(m.id) === String(managerId));
    if (mIndex === -1) return;
    const tasks = managers[mIndex].tasks || [];
    const tIndex = tasks.findIndex(t => t.id === taskId);
    if (tIndex === -1) return;
    tasks[tIndex].completed = true;
    tasks[tIndex].completedAt = new Date().toISOString();
    saveManagers(managers);
    renderDayActions(dateStr);
    if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
        document.getElementById('calendar')._fullCalendar.refetchEvents();
    }
};

function completeSubStage() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex === -1) return;
    const client = clients[clientIndex];
    if (!Array.isArray(client.tasks)) client.tasks = [];
    if (client.subStage) {
        client.tasks.push({
            id: Date.now(),
            text: client.subStage,
            color: '#28a745',
            completed: true,
            completedAt: new Date().toISOString()
        });
    }
    advanceClientStage(client);
    appStorage.setItem('clients', JSON.stringify(clients));
    const stageSelect = document.getElementById('stage');
    const subStageSelect = document.getElementById('subStage');
    if (stageSelect && subStageSelect) {
        stageSelect.value = client.stage;
        updateSubStageOptions(client.stage, subStageSelect);
        subStageSelect.value = client.subStage || '';
        if (window.updateCompleteBtnVisibility) {
            window.updateCompleteBtnVisibility();
        }
    }
    window.tasks = client.tasks;
    renderTaskList();
    renderCompletedTasks();
}

// --- Для add-client.html ---
// window.saveClient = function() { ... } уже реализовано и сохраняет задачи в appStorage

// --- Для календаря ---
// Модальное окно для добавления задачи через select
function showAddTaskModal(dateStr) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const managers = getManagers();
    if (clients.length === 0 && managers.length === 0) {
        alert('Нет объектов для добавления задачи!');
        return;
    }
    let modalDiv = document.createElement('div');
    modalDiv.className = 'modal fade crm-modal';
    const dateTitle = dateStr ? ` на ${new Date(dateStr).toLocaleDateString('ru-RU')}` : '';
    const ownerOptions = [
        clients.length ? `<optgroup label="Клиенты">${clients.map(c => `<option value="client-${c.id}">${c.firstName} ${c.lastName}</option>`).join('')}</optgroup>` : '',
        managers.length ? `<optgroup label="Менеджеры">${managers.map(m => `<option value="manager-${m.id}">${m.name}</option>`).join('')}</optgroup>` : ''
    ].join('');
    modalDiv.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Добавить задачу${dateTitle}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="calendarTaskOwner" class="form-label">Кому</label>
                        <select id="calendarTaskOwner" class="form-select">
                            ${ownerOptions}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="calendarTaskText" class="form-label">Текст задачи</label>
                        <input type="text" class="form-control" id="calendarTaskText" placeholder="Введите задачу">
                    </div>
                    <div class="mb-3">
                        <label for="calendarTaskColor" class="form-label">Цвет</label>
                        <input type="color" id="calendarTaskColor" class="form-control form-control-color" value="#28a745">
                    </div>
                    <div class="mb-3">
                        <label for="calendarTaskDate" class="form-label">Дата</label>
                        <input type="date" class="form-control" id="calendarTaskDate" value="${dateStr ? dateStr : ''}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" id="calendarTaskSaveBtn">Сохранить</button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalDiv);
    const modalInstance = new bootstrap.Modal(modalDiv);
    modalInstance.show();

    document.getElementById('calendarTaskSaveBtn').onclick = function() {
        const ownerValue = document.getElementById('calendarTaskOwner').value;
        const [ownerType, ownerId] = ownerValue.split('-');
        const text = document.getElementById('calendarTaskText').value.trim();
        const color = document.getElementById('calendarTaskColor').value;
        const date = document.getElementById('calendarTaskDate').value || dateStr;
        if (!text) {
            alert('Введите текст задачи!');
            return;
        }
        if (!date) {
            alert('Выберите дату задачи!');
            return;
        }
        const task = { id: Date.now(), text, color, deadline: date, completed: false };
        if (ownerType === 'client') {
            const client = clients.find(c => String(c.id) === String(ownerId));
            if (!client) { alert('Клиент не найден!'); return; }
            if (!Array.isArray(client.tasks)) client.tasks = [];
            client.tasks.push(task);
            appStorage.setItem('clients', JSON.stringify(clients));
        } else if (ownerType === 'manager') {
            const manager = managers.find(m => String(m.id) === String(ownerId));
            if (!manager) { alert('Менеджер не найден!'); return; }
            manager.tasks = manager.tasks || [];
            manager.tasks.push(task);
            saveManagers(managers);
        }
        modalInstance.hide();
        renderDayActions(date);
        if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
            document.getElementById('calendar')._fullCalendar.refetchEvents();
        }
    };

    modalDiv.addEventListener('hidden.bs.modal', () => {
        modalDiv.remove();
        if (dateStr) {
            renderDayActions(dateStr);
        }
    });
}

// Сохранение консультации
window.saveConsultation = function() {
    const nameInput = document.getElementById('consultName');
    const phoneInput = document.getElementById('consultPhone');
    const dateInput = document.getElementById('consultDate');
    const notesInput = document.getElementById('consultNotes');

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const date = dateInput.value;
    const notes = notesInput.value.trim();

    if (!name || !phone || !date) {
        alert('Заполните все поля и выберите дату консультации!');
        return;
    }

    const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
    consultations.push({ id: Date.now(), name, phone, date, notes });
    appStorage.setItem('consultations', JSON.stringify(consultations));

    const modalEl = document.getElementById('addConsultationModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modalEl.addEventListener(
        'hidden.bs.modal',
        () => {
            renderDayActions(date);
            if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
                document.getElementById('calendar')._fullCalendar.refetchEvents();
            }
            document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
            document.body.classList.remove('modal-open');
        },
        { once: true }
    );
    modalInstance.hide();

    nameInput.value = '';
    phoneInput.value = '';
    notesInput.value = '';
};

// --- вернуть функцию назначения консультации ---
window.convertToClient = function(consultId, dateStr) {
    const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
    const consult = consultations.find(c => c.id === consultId);
    if (!consult) return;
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const existingIds = new Set(clients.map(c => String(c.id)));
    clients.push({
        id: generateClientId(consult.name, '', '', consult.phone, existingIds),
        firstName: consult.name,
        middleName: '',
        lastName: '',
        birthDate: '',
        phone: consult.phone,
        passportSeries: '',
        passportNumber: '',
        passportIssueDate: '',
        passportIssuePlace: '',
        totalAmount: 0,
        paymentMonths: 0,
        paidMonths: [],
        arbitrLink: '',
        caseNumber: '',
        stage: '',
        subStage: '',
        courtDate: dateStr,
        notes: '',
        favorite: false,
        createdAt: new Date().toISOString(),
        tasks: [],
        finManagerPaid: false,
        courtDepositPaid: false,
        extraPayments: [],
        managerPayments: [],
        managerPaidTotal: 0,
        managerFullyPaid: false
    });
    appStorage.setItem('clients', JSON.stringify(clients));
    // Удалить консультацию
    const idx = consultations.findIndex(c => c.id === consultId);
    if (idx !== -1) {
        consultations.splice(idx, 1);
        appStorage.setItem('consultations', JSON.stringify(consultations));
    }
    renderDayActions(dateStr);
    refetchCalendarEvents();
};

window.deleteConsultation = function(consultId, dateStr) {
    const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
    const idx = consultations.findIndex(c => c.id === consultId);
    if (idx !== -1) {
        consultations.splice(idx, 1);
        appStorage.setItem('consultations', JSON.stringify(consultations));
        renderDayActions(dateStr);
        refetchCalendarEvents();
    }
};

// ------------------ Работа с менеджерами ------------------
function renderClientManager(client) {
    const block = document.getElementById('clientManagerIndicator');
    if (!block) return;
    const managers = getManagers();
    if (client.managerId) {
        const manager = managers.find(m => String(m.id) === String(client.managerId));
        const badges = [];
        if (client.managerPercent) {
            badges.push(`
                <span class="client-manager-badge" title="Процент менеджера">
                    <i class="ri-percent-line" aria-hidden="true"></i>
                    <span>${client.managerPercent}%</span>
                </span>
            `);
        }
        if (client.managerFullyPaid) {
            badges.push(`
                <span class="client-manager-badge client-manager-badge--success" title="Вознаграждение выплачено">
                    <i class="ri-check-line" aria-hidden="true"></i>
                </span>
            `);
        }
        if (client.isFinManager) {
            badges.push(`
                <span class="client-manager-badge" title="Финансовый управляющий">
                    <i class="ri-bank-card-line" aria-hidden="true"></i>
                </span>
            `);
        }
        block.innerHTML = `
            <div class="client-manager-indicator__header">
                <span class="client-manager-indicator__icon" aria-hidden="true">
                    <i class="ri-user-settings-line"></i>
                </span>
                <div class="client-manager-indicator__main">
                    <strong>${escapeHtml(manager ? manager.name : 'Менеджер')}</strong>
                </div>
            </div>
            ${badges.length ? `<div class="client-manager-indicator__badges">${badges.join('')}</div>` : ''}
            <button type="button" class="client-manager-indicator__hint" title="Изменить менеджера во вкладке «Менеджеры»">
                <i class="ri-exchange-line" aria-hidden="true"></i>
                <span class="visually-hidden">Изменить менеджера во вкладке «Менеджеры»</span>
            </button>
        `;
    } else {
        block.innerHTML = `
            <div class="client-manager-indicator__header">
                <span class="client-manager-indicator__icon client-manager-indicator__icon--empty" aria-hidden="true">
                    <i class="ri-user-unfollow-line"></i>
                </span>
                <div class="client-manager-indicator__main">
                    <strong>Менеджер не назначен</strong>
                </div>
            </div>
            <button type="button" class="client-manager-indicator__hint" title="Назначьте менеджера во вкладке «Менеджеры»">
                <i class="ri-exchange-line" aria-hidden="true"></i>
                <span class="visually-hidden">Назначьте менеджера во вкладке «Менеджеры»</span>
            </button>
        `;
    }
    updateClientStatusTags(client);
}

window.openAssignManagerForClient = function(clientId) {
    const select = document.getElementById('managerSelect');
    if (!select) return;
    select.innerHTML = '';
    const managers = getManagers();
    managers.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        select.appendChild(option);
    });
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    document.getElementById('managerPercent').value = client?.managerPercent || '';
    document.getElementById('isFinManager').checked = client?.isFinManager || false;
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('assignManagerModal'));
    modal.show();
};

window.saveClientManager = function(clientId) {
    const managerId = document.getElementById('managerSelect').value;
    const percent = document.getElementById('managerPercent').value;
    const isFU = document.getElementById('isFinManager').checked;
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (client) {
        client.managerId = managerId;
        client.managerPercent = percent;
        client.isFinManager = isFU;
        client.managerPaidTotal = 0;
        client.managerFullyPaid = false;
        appStorage.setItem('clients', JSON.stringify(clients));
        renderClientManager(client);
    }
    renderManagersPage();
    bootstrap.Modal.getInstance(document.getElementById('assignManagerModal')).hide();
};

function renderManagersPage() {
    const list = document.getElementById('managersList');
    if (!list) return;
    const managers = getManagers();
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    list.innerHTML = '';
    list.classList.toggle('manager-list--empty', managers.length === 0);
    if (managers.length === 0) {
        list.innerHTML = `
            <div class="manager-empty-state">
                <div class="manager-empty-state__icon"><i class="ri-team-line" aria-hidden="true"></i></div>
                <h2 class="manager-empty-state__title">Добавьте первого менеджера</h2>
                <p class="manager-empty-state__text">Создайте карточку менеджера, чтобы назначить клиентов и отслеживать выплаты по их сделкам.</p>
                <button type="button" class="manager-empty-state__action" onclick="openCreateManagerModal()">
                    <i class="ri-add-line" aria-hidden="true"></i>
                    <span>Создать менеджера</span>
                </button>
            </div>
        `;
        return;
    }
    managers.forEach(manager => {
        const card = document.createElement('div');
        card.className = 'manager-card mb-5';
        card.id = `managerCard${manager.id}`;
        const managerClients = clients.filter(c => String(c.managerId) === String(manager.id));
        let clientMonthlyIncome = 0;
        let totalRemaining = 0;
        let clientsWithPercent = 0;
        let totalPercentValue = 0;
        const clientItemsArr = managerClients.length
            ? managerClients.map(c => {
                const months = c.paymentMonths || 0;
                const total = c.totalAmount || 0;
                const percent = c.managerPercent ? parseFloat(c.managerPercent) : 0;
                const paid = c.managerPaidTotal || 0;
                const managerShare = total * percent / 100;
                const remainingForClient = percent > 0 ? Math.max(0, managerShare - paid) : 0;
                if (percent > 0) {
                    clientsWithPercent += 1;
                    totalPercentValue += percent;
                    const monthly = months ? total / months : 0;
                    const incomePerMonth = monthly * percent / 100;
                    if (!c.managerFullyPaid) {
                        clientMonthlyIncome += incomePerMonth;
                    }
                    if (remainingForClient > 0) {
                        totalRemaining += remainingForClient;
                    }
                }
                const percentText = c.managerFullyPaid ? 'оплачен' : `${percent || 0}%`;
                const remainingText = remainingForClient.toFixed(2);
                const paidClass = c.managerFullyPaid ? 'manager-client-item--paid' : '';
                const finManagerInfo = c.finManagerName ? `<span class="manager-client-meta__item">ФУ: ${c.finManagerName}</span>` : '';
                return `
                    <li class="manager-client-item ${paidClass}">
                        <div class="manager-client-item__body">
                            <button type="button" class="manager-client-link" onclick="openClient('${c.id}', '${manager.id}')">${c.firstName} ${c.lastName}</button>
                            <div class="manager-client-meta">
                                <span class="manager-client-meta__item">Процент: ${percentText}</span>
                                <span class="manager-client-meta__item">Остаток: ${remainingText}</span>
                                ${finManagerInfo}
                            </div>
                        </div>
                        <div class="manager-client-item__actions">
                            <button type="button" class="tile-icon-button" onclick="openEditAssignedClient(${manager.id}, '${c.id}')" title="Редактировать"><i class="ri-edit-line"></i></button>
                            <button type="button" class="tile-icon-button tile-icon-button--danger" onclick="removeClientFromManager(${manager.id}, '${c.id}')" title="Удалить"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </li>
                `;
            })
            : ['<li class="manager-client-item manager-client-item--empty">Клиенты пока не назначены</li>'];
        const clientItems = clientItemsArr.join('');
        const paymentsStore = JSON.parse(appStorage.getItem('managerPayments')) || {};
        const history = paymentsStore[manager.id]?.history || [];
        const currentMonth = new Date().toISOString().slice(0,7);
        const paidClientThisMonth = history
            .filter(p => p.clientId && p.date && p.date.slice(0,7) === currentMonth)
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        clientMonthlyIncome = Math.max(0, clientMonthlyIncome - paidClientThisMonth);
        const salaryPaid = history
            .filter(p => p.type === 'salary' && p.date && p.date.slice(0,7) === currentMonth)
            .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        const baseSalary = getManagerBaseSalary(manager);
        const salaryRemaining = Math.max(0, baseSalary - salaryPaid);
        const lastSalary = history.filter(p => p.type === 'salary').sort((a,b) => b.date.localeCompare(a.date))[0];
        const lastSalaryDate = lastSalary ? lastSalary.date : null;
        const clientsCount = managerClients.length;
        const clientWord = clientsCount === 1 ? 'клиент' : (clientsCount >= 2 && clientsCount <= 4 ? 'клиента' : 'клиентов');
        const namesPreview = managerClients.slice(0, 2).map(c => `${c.firstName} ${c.lastName}`).join(', ');
        const restCount = clientsCount > 2 ? ` и ещё ${clientsCount - 2}` : '';
        const collapsedContent = clientsCount
            ? `<div class="manager-clients-summary-count">${clientsCount} ${clientWord}</div>${namesPreview ? `<div class="manager-clients-summary-names">${namesPreview}${restCount}</div>` : ''}`
            : '<div class="manager-clients-summary-empty">Клиенты пока не назначены</div>';
        const averagePercent = clientsWithPercent > 0 ? totalPercentValue / clientsWithPercent : 0;
        card.innerHTML = `
            <div class="manager-card__grid">
                <section class="manager-tile manager-tile--info">
                    <div class="manager-tile__header">
                        <div class="manager-tile__title-group">
                            <h2 class="manager-tile__title">${manager.name}</h2>
                            ${manager.contacts ? `<div class="manager-tile__subtitle">${manager.contacts}</div>` : ''}
                        </div>
                        <div class="manager-tile__actions">
                            <button type="button" class="tile-icon-button" onclick="openEditManager(${manager.id})" title="Редактировать менеджера"><i class="ri-edit-line"></i></button>
                            <button type="button" class="tile-icon-button tile-icon-button--danger" onclick="removeManager(${manager.id})" title="Удалить менеджера"><i class="ri-delete-bin-line"></i></button>
                        </div>
                    </div>
                    <div class="manager-tile__body manager-tile__body--red">
                        <div class="manager-stats">
                            <div class="manager-stat">
                                <span class="manager-stat__label">Клиенты</span>
                                <span class="manager-stat__value">${clientsCount}</span>
                            </div>
                            <div class="manager-stat">
                                <span class="manager-stat__label">Средний %</span>
                                <span class="manager-stat__value">${averagePercent.toFixed(1)}%</span>
                            </div>
                            <div class="manager-stat">
                                <span class="manager-stat__label">Общий %</span>
                                <span class="manager-stat__value">${totalPercentValue.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="manager-tile__footer">
                        <div class="manager-meta">
                            <div class="manager-meta__row"><span>Оклад</span><span>${baseSalary.toFixed(2)}</span></div>
                            <div class="manager-meta__row"><span>Ежемесячно от клиентов</span><span>${clientMonthlyIncome.toFixed(2)}</span></div>
                            <div class="manager-meta__row"><span>Остаток зарплаты</span><span>${salaryRemaining.toFixed(2)}</span></div>
                            <div class="manager-meta__row"><span>Последняя з/п</span><span>${lastSalaryDate ? new Date(lastSalaryDate).toLocaleDateString('ru-RU') : '-'}</span></div>
                            <div class="manager-meta__row"><span>Остаток по клиентам</span><span>${totalRemaining.toFixed(2)}</span></div>
                        </div>
                    </div>
                </section>
                <section class="manager-tile manager-tile--clients">
                    <div class="manager-tile__header">
                        <div class="manager-tile__title">Клиенты</div>
                        <button type="button" class="manager-clients-toggle" id="toggleClientsBtn${manager.id}" onclick="toggleManagerClients(${manager.id})" aria-expanded="false">Показать</button>
                    </div>
                    <div class="manager-tile__body manager-tile__body--blue">
                        <div class="manager-clients-summary" id="managerClientsCollapsed${manager.id}">${collapsedContent}</div>
                        <ul class="manager-clients-list" id="managerClientsList${manager.id}" style="display:none;">${clientItems}</ul>
                    </div>
                    <div class="manager-tile__footer">
                        <button type="button" class="manager-tile__button" onclick="openAssignClientToManager(${manager.id})">Привязать клиента</button>
                    </div>
                </section>
                <section class="manager-tile manager-tile--tasks">
                    <div class="manager-tile__header">
                        <div class="manager-tile__title">Задачи</div>
                        <button type="button" class="tile-icon-button" onclick="openManagerPayments(${manager.id})" title="Выплаты"><i class="ri-wallet-line"></i></button>
                    </div>
                    <div class="manager-tile__body manager-tile__body--green">
                        <div class="manager-task-form">
                            <input type="text" id="managerTaskText${manager.id}" class="manager-task-form__input" placeholder="Новая задача">
                            <div class="manager-task-form__row">
                                <input type="date" id="managerTaskDeadline${manager.id}" class="manager-task-form__input">
                                <input type="color" id="managerTaskColor${manager.id}" class="manager-task-form__color" value="#7066ff">
                            </div>
                            <button type="button" class="manager-tile__button manager-tile__button--light" onclick="addManagerTask(${manager.id})">Добавить задачу</button>
                        </div>
                        <ul class="manager-task-list" id="managerTaskList${manager.id}"></ul>
                    </div>
                </section>
            </div>
        `;
        list.appendChild(card);
        renderManagerTaskList(manager.id);
    });
}

window.openCreateManagerModal = function() {
    editingManagerId = null;
    document.getElementById('managerName').value = '';
    document.getElementById('managerContacts').value = '';
    document.getElementById('managerPayValue').value = '';
    const salaryWrapper = document.getElementById('managerSalaryWrapper');
    const hasSalaryChk = document.getElementById('managerHasSalary');
    if (hasSalaryChk) hasSalaryChk.checked = false;
    if (salaryWrapper) salaryWrapper.style.display = 'none';
    const modalEl = document.getElementById('managerModal');
    modalEl.querySelector('.modal-title').textContent = 'Новый менеджер';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};

window.openEditManager = function(managerId) {
    const managers = getManagers();
    const manager = managers.find(m => String(m.id) === String(managerId));
    if (!manager) return;
    editingManagerId = managerId;
    document.getElementById('managerName').value = manager.name;
    document.getElementById('managerContacts').value = manager.contacts || '';
    const salaryValue = getManagerSalaryInputValue(manager);
    const hasSalary = manager.paymentType === 'fixed' || salaryValue !== '';
    const salaryChk = document.getElementById('managerHasSalary');
    const salaryWrapper = document.getElementById('managerSalaryWrapper');
    if (salaryChk) salaryChk.checked = hasSalary;
    if (salaryWrapper) salaryWrapper.style.display = hasSalary ? '' : 'none';
    document.getElementById('managerPayValue').value = hasSalary ? salaryValue : '';
    const modalEl = document.getElementById('managerModal');
    modalEl.querySelector('.modal-title').textContent = 'Редактировать менеджера';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};

window.saveManager = function() {
    const name = document.getElementById('managerName').value.trim();
    const contacts = document.getElementById('managerContacts').value.trim();
    const hasSalary = document.getElementById('managerHasSalary').checked;
    const value = hasSalary ? document.getElementById('managerPayValue').value.trim() : '';
    if (!name) return;
    const managers = getManagers();
    if (editingManagerId) {
        const manager = managers.find(m => String(m.id) === String(editingManagerId));
        if (manager) {
            manager.name = name;
            manager.contacts = contacts;
            manager.paymentType = hasSalary ? 'fixed' : 'none';
            manager.paymentValue = hasSalary ? value : '';
            manager.salary = hasSalary ? value : '';
            manager.baseSalary = hasSalary ? value : '';
        }
    } else {
        managers.push({
            id: Date.now(),
            name,
            contacts,
            paymentType: hasSalary ? 'fixed' : 'none',
            paymentValue: hasSalary ? value : '',
            salary: hasSalary ? value : '',
            baseSalary: hasSalary ? value : ''
        });
    }
    saveManagers(managers);
    renderManagersPage();
    bootstrap.Modal.getInstance(document.getElementById('managerModal')).hide();
    editingManagerId = null;
};

window.removeManager = function(managerId) {
    if (!confirm('Удалить менеджера?')) return;
    const managers = getManagers().filter(m => String(m.id) !== String(managerId));
    saveManagers(managers);
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    clients.forEach(c => {
        if (String(c.managerId) === String(managerId)) {
            delete c.managerId;
            delete c.managerPercent;
            delete c.managerPaidTotal;
            delete c.managerFullyPaid;
        }
    });
    appStorage.setItem('clients', JSON.stringify(clients));
    const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
    delete payments[managerId];
    appStorage.setItem('managerPayments', JSON.stringify(payments));
    renderManagersPage();
};

window.openAssignClientToManager = function(managerId) {
    currentManagerId = managerId;
    currentClientId = null;
    const select = document.getElementById('assignClientSelect');
    if (!select) return;
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    select.innerHTML = '';
    clients.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.firstName} ${c.lastName}`;
        select.appendChild(option);
    });
    select.disabled = false;
    document.getElementById('assignClientPercent').value = '';
    document.getElementById('assignClientFU').checked = false;
    document.getElementById('assignClientFUName').value = '';
    const modalEl = document.getElementById('assignClientModal');
    modalEl.querySelector('.modal-title').textContent = 'Добавить клиента';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};

window.openEditAssignedClient = function(managerId, clientId) {
    currentManagerId = managerId;
    currentClientId = clientId;
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) return;
    const select = document.getElementById('assignClientSelect');
    select.innerHTML = `<option value="${client.id}">${client.firstName} ${client.lastName}</option>`;
    select.disabled = true;
    document.getElementById('assignClientPercent').value = client.managerPercent || '';
    document.getElementById('assignClientFU').checked = !!client.isFinManager;
    document.getElementById('assignClientFUName').value = client.finManagerName || '';
    const modalEl = document.getElementById('assignClientModal');
    modalEl.querySelector('.modal-title').textContent = 'Редактировать клиента';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
};

window.saveAssignedClient = function() {
    const clientId = currentClientId || document.getElementById('assignClientSelect').value;
    const percent = document.getElementById('assignClientPercent').value;
    const isFU = document.getElementById('assignClientFU').checked;
    const fuName = document.getElementById('assignClientFUName').value.trim();
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (client) {
        client.managerId = currentManagerId;
        client.managerPercent = percent;
        client.isFinManager = isFU;
        client.finManagerName = fuName;
        if (!currentClientId) {
            client.managerPaidTotal = 0;
            client.managerFullyPaid = false;
        }
        appStorage.setItem('clients', JSON.stringify(clients));
    }
    renderManagersPage();
    const modal = bootstrap.Modal.getInstance(document.getElementById('assignClientModal'));
    modal.hide();
    currentClientId = null;
};

window.removeClientFromManager = function(managerId, clientId) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (client && String(client.managerId) === String(managerId)) {
        delete client.managerId;
        delete client.managerPercent;
        client.managerPaidTotal = 0;
        client.managerFullyPaid = false;
        client.isFinManager = false;
        client.finManagerName = '';
        client.managerPayments = [];
        appStorage.setItem('clients', JSON.stringify(clients));
        const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
        const mp = payments[managerId];
        if (mp && mp.history) {
            mp.history = mp.history.filter(p => p.clientId !== clientId);
            payments[managerId] = mp;
            appStorage.setItem('managerPayments', JSON.stringify(payments));
        }
    }
    renderManagersPage();
};

window.toggleManagerClients = function(managerId) {
    const list = document.getElementById(`managerClientsList${managerId}`);
    const collapsed = document.getElementById(`managerClientsCollapsed${managerId}`);
    const btn = document.getElementById(`toggleClientsBtn${managerId}`);
    const body = btn ? btn.closest('.manager-tile')?.querySelector('.manager-tile__body--blue') : null;
    if (!list || !collapsed || !btn) return;
    const isHidden = list.style.display === 'none';
    if (isHidden) {
        list.style.display = '';
        collapsed.style.display = 'none';
        btn.textContent = 'Скрыть';
        btn.setAttribute('aria-expanded', 'true');
        btn.classList.add('is-open');
        if (body) body.classList.add('is-open');
    } else {
        list.style.display = 'none';
        collapsed.style.display = '';
        btn.textContent = 'Показать';
        btn.setAttribute('aria-expanded', 'false');
        btn.classList.remove('is-open');
        if (body) body.classList.remove('is-open');
    }
};

window.openManagerPayments = function(managerId) {
    currentManagerId = managerId;
    const salaryDateInput = document.getElementById('managerSalaryDate');
    if (salaryDateInput) salaryDateInput.value = '';
    renderManagerPayments();
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('managerPaymentsModal'));
    modal.show();
};

function renderManagerPayments() {
    const body = document.getElementById('managerPaymentsBody');
    const clientsBody = document.getElementById('managerPaymentsClientsBody');
    if (!body || !clientsBody) return;
    const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const data = payments[currentManagerId] || {};
    const history = data.history || [];
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const salaryDateInput = document.getElementById('managerSalaryDate');
    if (salaryDateInput && !salaryDateInput.value) {
        salaryDateInput.value = new Date().toISOString().split('T')[0];
    }
    updateManagerSalaryUI(history);
    const currentMonth = new Date().toISOString().slice(0,7);
    clientsBody.innerHTML = '';
    const managerClients = clients.filter(c => String(c.managerId) === String(currentManagerId));
    if (managerClients.length === 0) {
        clientsBody.innerHTML = '<tr><td colspan="4" class="text-center">Нет клиентов</td></tr>';
    } else {
        managerClients.forEach(c => {
            const percent = parseFloat(c.managerPercent) || 0;
            const total = c.totalAmount || 0;
            const totalDue = total * percent / 100;
            const paid = c.managerPaidTotal || 0;
            const remaining = Math.max(0, totalDue - paid);
            const tr = document.createElement('tr');
            if (remaining <= 0) tr.classList.add('client-percent-paid');
            const canIssue = remaining > 0 && clientHasPaymentForMonth(c, currentMonth);
            const btnDisabled = canIssue ? '' : 'disabled';
            tr.innerHTML = `<td>${c.firstName} ${c.lastName}</td><td>${percent}</td><td>${remaining.toFixed(2)}</td><td><button class="btn btn-sm btn-primary" ${btnDisabled} onclick="issueClientPercent('${c.id}')">Выдать %</button></td>`;
            clientsBody.appendChild(tr);
        });
    }
    body.innerHTML = '';
    let hasPayments = false;
    const indexedHistory = history.map((p, idx) => ({ ...p, idx }))
        .filter(p => p.date);
    indexedHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    const grouped = indexedHistory.reduce((acc, p) => {
        const month = p.date.slice(0, 7);
        acc[month] = acc[month] || { items: [], total: 0 };
        acc[month].items.push(p);
        acc[month].total += parseFloat(p.amount) || 0;
        return acc;
    }, {});
    const months = Object.keys(grouped).sort().reverse();
    months.forEach(month => {
        const group = grouped[month];
        const collapseId = `mpMonth${month}`;
        const header = document.createElement('tr');
        header.classList.add('table-secondary');
        header.setAttribute('data-bs-toggle', 'collapse');
        header.setAttribute('data-bs-target', `#${collapseId}`);
        header.style.cursor = 'pointer';
        header.innerHTML = `<td colspan="4"><strong>${month} — ${group.total.toFixed(2)}</strong></td>`;
        body.appendChild(header);

        const detailRow = document.createElement('tr');
        detailRow.id = collapseId;
        detailRow.className = 'collapse';
        const detailCell = document.createElement('td');
        detailCell.colSpan = 4;
        const innerTable = document.createElement('table');
        innerTable.className = 'table table-sm mb-0';
        const innerBody = document.createElement('tbody');
        group.items.forEach(p => {
            hasPayments = true;
            const client = clients.find(c => String(c.id) === String(p.clientId));
            const name = client ? `${client.firstName} ${client.lastName}` : (p.type === 'salary' ? 'Зарплата' : '');
            const tr = document.createElement('tr');
            if (p.early) tr.classList.add('table-warning');
            const early = p.early ? ' (раньше)' : '';
            tr.innerHTML = `<td>${p.date}</td><td>${name}</td><td>${p.amount}${early}</td><td><button class="btn btn-sm btn-danger" data-index="${p.idx}">Удалить</button></td>`;
            innerBody.appendChild(tr);
        });
        innerTable.appendChild(innerBody);
        detailCell.appendChild(innerTable);
        detailRow.appendChild(detailCell);
        body.appendChild(detailRow);
    });
    if (!hasPayments) {
        body.innerHTML = '<tr><td colspan="4" class="text-center">Нет платежей</td></tr>';
    } else {
        body.querySelectorAll('button[data-index]').forEach(btn => {
            btn.addEventListener('click', function() {
                const idx = parseInt(this.dataset.index, 10);
                deleteManagerPayment(idx);
            });
        });
    }
}

function updateManagerSalaryUI(historyOverride) {
    const amountInput = document.getElementById('managerSalaryAmount');
    const dateInput = document.getElementById('managerSalaryDate');
    const button = document.getElementById('issueManagerSalaryBtn');
    const remainingEl = document.getElementById('managerSalaryRemaining');
    const manager = getManagers().find(m => String(m.id) === String(currentManagerId));
    if (!manager) {
        if (remainingEl) remainingEl.textContent = '0.00';
        if (button) button.disabled = true;
        if (amountInput) {
            amountInput.value = '';
            amountInput.placeholder = 'Нет оклада';
        }
        return;
    }
    let selectedDate = dateInput?.value;
    if (!selectedDate) {
        selectedDate = new Date().toISOString().split('T')[0];
        if (dateInput) dateInput.value = selectedDate;
    }
    const month = selectedDate.slice(0, 7);
    let history = historyOverride;
    if (!Array.isArray(history)) {
        const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
        history = payments[currentManagerId]?.history || [];
    }
    const baseSalary = getManagerBaseSalary(manager);
    const salaryPaid = history
        .filter(p => p.type === 'salary' && p.date && p.date.slice(0, 7) === month)
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    const remaining = Math.max(0, baseSalary - salaryPaid);
    if (remainingEl) remainingEl.textContent = remaining.toFixed(2);
    if (amountInput) {
        const currentVal = parseFloat(amountInput.value);
        if (!amountInput.value || isNaN(currentVal) || currentVal > remaining) {
            amountInput.value = remaining > 0 ? remaining.toFixed(2) : '';
        }
        amountInput.placeholder = baseSalary > 0 ? `до ${remaining.toFixed(2)}` : 'Нет оклада';
        if (remaining > 0) {
            amountInput.setAttribute('max', remaining.toFixed(2));
        } else {
            amountInput.removeAttribute('max');
        }
    }
    if (button) {
        const shouldDisable = remaining <= 0 || baseSalary <= 0;
        button.disabled = shouldDisable;
        if (shouldDisable) {
            if (baseSalary <= 0) {
                button.title = 'Укажите оклад в карточке менеджера';
            } else {
                button.title = 'Оклад за выбранный месяц уже выплачен';
            }
        } else {
            button.removeAttribute('title');
        }
    }
}

window.issueManagerSalary = function() {
    const amountInput = document.getElementById('managerSalaryAmount');
    const dateInput = document.getElementById('managerSalaryDate');
    if (!amountInput || !dateInput) return;
    let rawAmount = parseFloat(amountInput.value);
    if (isNaN(rawAmount) || rawAmount <= 0) {
        alert('Введите сумму выплаты');
        return;
    }
    rawAmount = Math.round(rawAmount * 100) / 100;
    let date = dateInput.value;
    if (!date) {
        date = new Date().toISOString().split('T')[0];
        dateInput.value = date;
    }
    const manager = getManagers().find(m => String(m.id) === String(currentManagerId));
    if (!manager) return;
    const baseSalary = getManagerBaseSalary(manager);
    if (baseSalary <= 0) {
        alert('Для выплаты укажите оклад в карточке менеджера');
        return;
    }
    const month = date.slice(0, 7);
    const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const existing = payments[currentManagerId] || {};
    const history = existing.history || [];
    const salaryPaid = history
        .filter(p => p.type === 'salary' && p.date && p.date.slice(0, 7) === month)
        .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    let remaining = Math.max(0, baseSalary - salaryPaid);
    if (remaining <= 0) {
        alert('Оклад за выбранный месяц уже выплачен');
        updateManagerSalaryUI(history);
        return;
    }
    let amount = Math.min(rawAmount, remaining);
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) {
        alert('Сумма выплаты должна быть больше нуля');
        return;
    }
    history.push({ type: 'salary', amount, date });
    payments[currentManagerId] = { ...existing, history };
    appStorage.setItem('managerPayments', JSON.stringify(payments));
    renderManagerPayments();
    renderManagersPage();
};

window.issueClientPercent = function(clientId) {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) return;
    const percent = parseFloat(client.managerPercent) || 0;
    const total = client.totalAmount || 0;
    const months = client.paymentMonths || 0;
    let amount = months ? (total / months) * percent / 100 : (total * percent / 100);
    amount = Math.round(amount);
    const totalDue = Math.round(total * percent / 100);
    const paid = client.managerPaidTotal || 0;
    const remaining = totalDue - paid;
    if (remaining <= 0) return;
    if (amount > remaining) amount = remaining;
    const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const existing = payments[currentManagerId] || {};
    const history = existing.history || [];
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.slice(0,7);
    if (!clientHasPaymentForMonth(client, currentMonth)) {
        alert('Клиент не оплатил за текущий месяц');
        return;
    }
    const already = history.some(p => String(p.clientId) === String(clientId) && p.date && p.date.slice(0,7) === currentMonth);
    if (already) {
        if (!confirm('Получить процент заранее?')) return;
    }
    history.push({ clientId, amount, date: today, early: already });
    payments[currentManagerId] = { ...existing, history };
    appStorage.setItem('managerPayments', JSON.stringify(payments));
    client.managerPaidTotal = paid + amount;
    if (client.managerPaidTotal >= totalDue) client.managerFullyPaid = true;
    client.managerPayments = client.managerPayments || [];
    client.managerPayments.push({ date: today, amount, early: already });
    saveClientData(client);
    renderManagerPayments();
    renderManagersPage();
};

window.openAddManagerPayment = function(clientId) {
    const select = document.getElementById('managerPaymentClient');
    const clients = JSON.parse(appStorage.getItem('clients') || '[]');
    const currentMonth = new Date().toISOString().slice(0,7);
    if (select) {
        select.innerHTML = '';
        clients
            .filter(c => String(c.managerId) === String(currentManagerId))
            .filter(c => {
                const percent = parseFloat(c.managerPercent);
                if (isNaN(percent) || percent <= 0) return false;
                const totalDue = Math.round((c.totalAmount || 0) * percent / 100);
                const paid = c.managerPaidTotal || 0;
                if (paid >= totalDue) return false;
                return clientHasPaymentForMonth(c, currentMonth);
            })
            .forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.firstName} ${c.lastName}`;
                select.appendChild(opt);
            });
        if (clientId) select.value = String(clientId);
    }
    const dateInput = document.getElementById('managerPaymentDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('managerPaymentAmount').value = '';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addManagerPaymentModal'));
    modal.show();
};

// Legacy alias to avoid ReferenceError in older markup
window['САА'] = window.openAddManagerPayment;
// Additional legacy alias for older markup variants
window['СТ'] = window.openAddManagerPayment;

window.saveManagerPayment = function() {
    const clientId = document.getElementById('managerPaymentClient').value;
    const amount = document.getElementById('managerPaymentAmount').value;
    const date = document.getElementById('managerPaymentDate').value;
    if (!clientId || !amount || !date) return;
    const clients = JSON.parse(appStorage.getItem('clients') || '[]');
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) return;
    const month = date.slice(0,7);
    if (!clientHasPaymentForMonth(client, month)) {
        alert('Клиент не оплатил за указанный месяц');
        return;
    }
    const percent = parseFloat(client.managerPercent);
    const totalDue = isNaN(percent) ? 0 : Math.round((client.totalAmount || 0) * percent / 100);
    client.managerPaidTotal = client.managerPaidTotal || 0;
    let amt = parseFloat(amount);
    const remaining = totalDue - client.managerPaidTotal;
    if (amt > remaining) amt = remaining;
    if (amt <= 0) return;
    const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const existing = payments[currentManagerId] || {};
    const history = existing.history || [];
    history.push({ clientId, amount: amt, date });
    payments[currentManagerId] = { ...existing, history };
    appStorage.setItem('managerPayments', JSON.stringify(payments));
    client.managerPaidTotal += amt;
    if (client.managerPaidTotal >= totalDue) {
        client.managerFullyPaid = true;
    }
    client.managerPayments = client.managerPayments || [];
    client.managerPayments.push({ date, amount: amt });
    saveClientData(client);
    bootstrap.Modal.getInstance(document.getElementById('addManagerPaymentModal')).hide();
    renderManagerPayments();
    renderManagersPage();
};

window.deleteManagerPayment = function(index) {
    const payments = JSON.parse(appStorage.getItem('managerPayments')) || {};
    const data = payments[currentManagerId] || {};
    if (!data.history) return;
    const removed = data.history.splice(index, 1)[0];
    payments[currentManagerId] = data;
    appStorage.setItem('managerPayments', JSON.stringify(payments));
    if (removed && removed.clientId) {
        const clients = JSON.parse(appStorage.getItem('clients')) || [];
        const client = clients.find(c => String(c.id) === String(removed.clientId));
        if (client) {
            client.managerPaidTotal = (client.managerPaidTotal || 0) - (removed.amount || 0);
            if (client.managerPaidTotal < 0) client.managerPaidTotal = 0;
            const percent = parseFloat(client.managerPercent);
            const totalDue = isNaN(percent) ? 0 : Math.round((client.totalAmount || 0) * percent / 100);
            client.managerFullyPaid = client.managerPaidTotal >= totalDue;
            if (client.managerPayments) {
                const pIdx = client.managerPayments.findIndex(p => p.date === removed.date && p.amount === removed.amount);
                if (pIdx !== -1) client.managerPayments.splice(pIdx, 1);
            }
            saveClientData(client);
        }
    }
    renderManagerPayments();
    renderManagersPage();
};

window.showConsultationDetails = function(consultId) {
    const consultations = JSON.parse(appStorage.getItem('consultations')) || [];
    const consult = consultations.find(c => c.id === consultId);
    if (!consult) return;
    const nameEl = document.getElementById('consultDetailName');
    const phoneEl = document.getElementById('consultDetailPhone');
    const notesEl = document.getElementById('consultDetailNotes');
    if (nameEl) nameEl.textContent = consult.name;
    if (phoneEl) phoneEl.textContent = consult.phone;
    if (notesEl) notesEl.textContent = consult.notes || '';
    const modalEl = document.getElementById('consultDetailsModal');
    if (modalEl) {
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
    }
};

window.openClientsModal = function() {
    const clients = JSON.parse(appStorage.getItem('clients')) || [];
    const list = document.getElementById('clientsModalList');
    if (list) {
        list.innerHTML = '';
        if (clients.length === 0) {
            list.innerHTML = '<li class="list-group-item text-center">Нет клиентов</li>';
        } else {
            clients.forEach(client => {
                const li = document.createElement('li');
                li.className = 'list-group-item clickable-item';
                li.textContent = `${client.firstName} ${client.lastName}`;
                li.onclick = () => { window.location.href = `client-card.html?id=${client.id}`; };
                list.appendChild(li);
            });
        }
    }
    const modalEl = document.getElementById('clientsModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
    modal.show();
};

window.showUpdates = function() {
    const list = document.getElementById('updatesList');
    if (list) {
        list.innerHTML = '';
        const updates = loadAppUpdates();
        if (updates.length === 0) {
            list.innerHTML = '<li class="list-group-item text-center">Список обновлений пока пуст.</li>';
        } else {
            updates.forEach(u => {
                const li = document.createElement('li');
                li.className = 'list-group-item';
                li.innerHTML = `<strong>${u.date}:</strong> ${u.text}`;
                list.appendChild(li);
            });
        }
    }
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('updatesModal'));
    modal.show();
};
    

