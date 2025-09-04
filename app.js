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

let currentManagerId = null;
let currentClientId = null;
let summaryExpenseChart = null;
let summaryTransactionsChart = null;
let clientExpenseChart = null;
let clientTransactionsChart = null;

function getCourtTypeBadge(client) {
    const types = client.courtTypes || {};
    if (types.arbitration && types.tret) return '<span class="court-badge">АС/ТС</span>';
    if (types.arbitration) return '<span class="court-badge">АС</span>';
    if (types.tret) return '<span class="court-badge">ТС</span>';
    return '';
}

// Ранее клиенты синхронизировались с сервером. Теперь хранение происходит
// только в localStorage, поэтому при первом запуске инициализируем пустой
// список клиентов, если он отсутствует.
async function syncClientsFromServer() {
    if (!localStorage.getItem('clients')) {
        localStorage.setItem('clients', JSON.stringify([]));
    }
}

async function syncManagersFromServer() {
    if (!localStorage.getItem('managers')) {
        localStorage.setItem('managers', JSON.stringify([]));
    }
}

function getManagers() {
    return JSON.parse(localStorage.getItem('managers')) || [];
}

function saveManagers(managers) {
    localStorage.setItem('managers', JSON.stringify(managers));
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
    const ids = existingIds || new Set((JSON.parse(localStorage.getItem('clients')) || []).map(c => String(c.id)));
    return ensureUniqueId(letters + digits, ids);
}

window.generateClientId = generateClientId;

function exportClientsToExcel() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const managers = getManagers();
    const managerPayments = JSON.parse(localStorage.getItem('managerPayments')) || {};

    const clientData = clients.map(c => ({
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
        'ID менеджера': c.managerId || '',
        'Процент менеджера': c.managerPercent || '',
        'Менеджер выплачено': c.managerPaidTotal || 0,
        'Менеджер оплачен полностью': c.managerFullyPaid ? 'Да' : 'Нет'
    }));

    const tasksData = clients.flatMap(c =>
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
        const clients = rows.map(row => {
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
            return {
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
                tasks: []
            };
        });

        const clientsById = {};
        clients.forEach(c => { clientsById[c.id] = c; });

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
                    paymentValue: row['Значение оплаты'] || ''
                });
                managerPayments[row['ID']] = {
                    salary: row['Зарплата'] || '',
                    bonus: row['Премия'] || '',
                    paid: row['Оплачено'] === 'Да' || row['Оплачено'] === true,
                    history: []
                };
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

        localStorage.setItem('clients', JSON.stringify(clients));
        if (managers.length > 0) {
            localStorage.setItem('managers', JSON.stringify(managers));
        }
        if (Object.keys(managerPayments).length > 0) {
            localStorage.setItem('managerPayments', JSON.stringify(managerPayments));
        }

        alert('Импорт завершён');
        window.location.reload();
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    document.body.classList.add('loaded');
    document.querySelectorAll('a').forEach(link => {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || link.target === '_blank') return;
        link.addEventListener('click', function(e) {
            e.preventDefault();
            document.body.classList.remove('loaded');
            setTimeout(() => {
                window.location.href = href;
            }, 300);
        });
    });
    document.getElementById('showArchivedBtn')?.addEventListener('click', showArchivedClients);
    await syncClientsFromServer();
    if (!localStorage.getItem('consultations')) {
        localStorage.setItem('consultations', JSON.stringify([]));
    }
    // Показ клиентов с судом в текущем месяце и привязка поиска (только на index.html)
    if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
        displayCourtThisMonth();
        document.getElementById('searchButton')?.addEventListener('click', searchClients);
        const searchInput = document.getElementById('searchInput');
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                searchClients();
            }
        });
        searchInput?.addEventListener('input', searchClients);
        // Инициализация панели
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
        document.getElementById('sidebarClose')?.addEventListener('click', toggleSidebar);
        displayClientsList();
        document.getElementById('exportOption')?.addEventListener('click', exportClientsToExcel);
        document.getElementById('importOption')?.addEventListener('click', () => document.getElementById('importFile')?.click());
        document.getElementById('importFile')?.addEventListener('change', importClientsFromExcel);

        const floatingMenu = document.querySelector('.floating-menu');
        if (floatingMenu) {
            let hideTimeout;
            const showMenu = () => {
                clearTimeout(hideTimeout);
                floatingMenu.classList.add('open');
            };
            const hideMenu = () => {
                hideTimeout = setTimeout(() => floatingMenu.classList.remove('open'), 200);
            };
            floatingMenu.addEventListener('mouseenter', showMenu);
            floatingMenu.addEventListener('mouseleave', hideMenu);
        }

        const floatingOptions = document.querySelectorAll('.floating-option');
        floatingOptions.forEach(btn => {
            if (btn.id !== 'globalFinanceBtn') {
                btn.disabled = true;
            }
        });
        document.getElementById('globalFinanceBtn')?.addEventListener('click', openFinanceModal);
        document.getElementById('btnTotalEarnings')?.addEventListener('click', showTotalEarnings);
        document.getElementById('btnClientPayments')?.addEventListener('click', manageClientPayments);
        document.getElementById('btnAllPayments')?.addEventListener('click', showAllPayments);
        document.getElementById('btnUnpaid')?.addEventListener('click', showUnpaidClients);

        document.addEventListener('click', (e) => {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return;
            if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !e.target.closest('#sidebarToggle')) {
                sidebar.classList.remove('open');
            }
        });
    }
    // Страница финансов клиента
    if (window.location.pathname.includes('finance.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        if (clientId) {
            loadFinancePage(clientId);
        } else {
            alert('Клиент не найден!');
            window.location.href = 'index.html';
        }
    }
    // Загрузка данных для редактирования (только на edit-client.html)
    if (window.location.pathname.includes('edit-client.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        if (clientId) {
            loadClientForEdit(clientId);
        } else {
            alert('Клиент не найден!');
            window.location.href = 'index.html';
        }
        const arbitrInput = document.getElementById('arbitrLink');
        const arbitrButton = document.getElementById('arbitrButton');
        const courtDateInput = document.getElementById('courtDate');
        const stageSelect = document.getElementById('stage');
        const subStageSelect = document.getElementById('subStage');
        const completeSubStageBtn = document.getElementById('completeSubStageBtn');
        const favoriteBtn = document.getElementById('favoriteBtn');
        const completeBtn = document.getElementById('completeClientBtn');
        arbitrButton.addEventListener('click', openArbitrLink);
        arbitrInput.addEventListener('input', () => {
            arbitrButton.disabled = !arbitrInput.value.trim();
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        courtDateInput.addEventListener('input', () => {
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        stageSelect.addEventListener('change', () => updateSubStageOptions(stageSelect.value, subStageSelect));
        updateSubStageOptions(stageSelect.value, subStageSelect);
        completeSubStageBtn?.addEventListener('click', completeSubStage);
        if (completeSubStageBtn) {
            function updateSubStageButton() {
                completeSubStageBtn.disabled = !subStageSelect.value;
            }
            subStageSelect.addEventListener('change', updateSubStageButton);
            updateSubStageButton();
        }
        favoriteBtn?.addEventListener('click', function() {
            const fav = favoriteBtn.dataset.favorite === 'true';
            favoriteBtn.dataset.favorite = (!fav).toString();
            favoriteBtn.innerHTML = fav ? '<i class="ri-star-line"></i>' : '<i class="ri-star-fill"></i>';
        });
        function updateCompleteBtnVisibility() {
            if (!completeBtn) return;
            completeBtn.style.display =
                stageSelect.value === 'Завершение' && subStageSelect.value === 'ждем доки от суда'
                    ? 'block'
                    : 'none';
        }
        window.updateCompleteBtnVisibility = updateCompleteBtnVisibility;
        if (stageSelect && completeBtn && subStageSelect) {
            stageSelect.addEventListener('change', updateCompleteBtnVisibility);
            subStageSelect.addEventListener('change', updateCompleteBtnVisibility);
            updateCompleteBtnVisibility();
        }
        window.completeClientFromEdit = function() {
            const clientIdVal = document.getElementById('clientId').value.trim();
            if (!clientIdVal) return;
            if (confirm('Завершить клиента?')) {
                if (window.completeClient) {
                    window.completeClient(clientIdVal);
                    window.location.href = 'index.html';
                } else {
                    alert('Функция завершения не найдена!');
                }
            }
        };
    }
    // Инициализация кнопки арбитр и чекбокса документов на add-client.html
    if (window.location.pathname.includes('add-client.html')) {
        const arbitrInput = document.getElementById('arbitrLink');
        const arbitrButton = document.getElementById('arbitrButton');
        const courtDateInput = document.getElementById('courtDate');
        const stageSelect = document.getElementById('stage');
        const subStageSelect = document.getElementById('subStage');
        arbitrButton.addEventListener('click', openArbitrLink);
        arbitrInput.addEventListener('input', () => {
            arbitrButton.disabled = !arbitrInput.value.trim();
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        courtDateInput.addEventListener('input', () => {
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        stageSelect.addEventListener('change', () => updateSubStageOptions(stageSelect.value, subStageSelect));
        updateSubStageOptions(stageSelect.value, subStageSelect);
    }
    // Инициализация календаря (только на calendar.html)
    if (window.location.pathname.includes('calendar.html')) {
        initCalendar();
        renderDayActions(new Date().toISOString().split('T')[0]);
    }
    if (window.location.pathname.includes('managers.html')) {
        renderManagersPage();
        document.getElementById('createManagerBtn')?.addEventListener('click', openCreateManagerModal);
        document.getElementById('saveManagerBtn')?.addEventListener('click', saveManager);
        document.getElementById('saveAssignedClientBtn')?.addEventListener('click', saveAssignedClient);
        document.getElementById('issueManagerSalaryBtn')?.addEventListener('click', issueManagerSalary);
        document.getElementById('saveManagerPaymentBtn')?.addEventListener('click', saveManagerPayment);
    }
    // Загрузка карточки клиента (только на client-card.html)
    if (window.location.pathname.includes('client-card.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        if (clientId) {
            currentClientId = clientId;
            loadClientCard(clientId);
            document.getElementById('assignManagerBtn')?.addEventListener('click', () => openAssignManagerForClient(clientId));
            document.getElementById('saveClientManager')?.addEventListener('click', () => saveClientManager(clientId));
        } else {
            alert('Клиент не найден!');
            window.location.href = 'index.html';
        }
    }
    // Проверка наличия клиентов
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    if (clients.length === 0) {
        // Можно убрать или оставить для отладки
        // console.warn('Нет клиентов в базе. Добавьте клиента для теста.');
    }
    // Проверка sidebar
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (!sidebarToggle && (window.location.pathname.includes('index.html') || window.location.pathname === '/')) {
        // console.warn('Кнопка sidebarToggle не найдена');
    }
    // Проверка поиска
    const searchButton = document.getElementById('searchButton');
    if (!searchButton && (window.location.pathname.includes('index.html') || window.location.pathname === '/')) {
        // console.warn('Кнопка поиска не найдена');
    }
});

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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
                    <button class="court-payments-btn" onclick="event.stopPropagation(); showPaymentsModal('${client.id}')">Платежи</button>
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
            if (!event.target.closest('.court-toggle') && !event.target.closest('.court-payments-btn') && !event.target.closest('a')) {
                window.location.href = `client-card.html?id=${client.id}`;
            }
        });

        courtThisMonthDiv.appendChild(li);
    });

}

// Отображение списка клиентов в боковой панели
function displayClientsList() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
        li.className = 'client-card clickable-item';
        li.innerHTML = `
            <div class="client-summary">
                <div class="client-info">
                    <div class="client-name">${client.firstName} ${client.lastName}${getCourtTypeBadge(client)}</div>
                </div>
                <button class="btn btn-sm btn-outline-primary toggle-details"><i class="ri-arrow-down-s-line"></i></button>
            </div>
            <div class="client-details">
                <div class="d-flex justify-content-between align-items-center flex-wrap w-100">
                    <div class="task-info">${client.subStage || ''}</div>
                    <button class="client-btn client-btn-payments ms-auto">Платеж</button>
                </div>
                <div class="client-actions mt-2">
                    ${client.courtDate ? `<span class="client-date"><i class="ri-calendar-line"></i>${new Date(client.courtDate).toLocaleDateString('ru-RU')}</span>` : ''}
                    ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="client-link">Суд</a>` : ''}
                </div>
            </div>
        `;

        li.querySelector('.client-btn-payments').addEventListener('click', (e) => {
            e.stopPropagation();
            showPaymentsModal(client.id);
        });

        li.querySelector('.toggle-details').addEventListener('click', (e) => {
            e.stopPropagation();
            const details = li.querySelector('.client-details');
            const isOpen = details.classList.toggle('open');
            e.currentTarget.classList.toggle('open', isOpen);
        });

        li.addEventListener('click', () => {
            window.location.href = `client-card.html?id=${client.id}`;
        });

        ul.appendChild(li);
    });

    listDiv.appendChild(ul);
}

// Загрузка клиента для редактирования
function loadClientForEdit(clientId) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
function loadClientCard(clientId) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) {
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const fullName = [client.firstName, client.middleName, client.lastName].filter(Boolean).join(' ');
    document.getElementById('clientName').textContent = fullName;
    const courtBadgeEl = document.getElementById('courtTypeBadge');
    if (courtBadgeEl) {
        const types = client.courtTypes || {};
        let text = '';
        if (types.arbitration && types.tret) text = 'АС/ТС';
        else if (types.arbitration) text = 'АС';
        else if (types.tret) text = 'ТС';
        courtBadgeEl.textContent = text;
        courtBadgeEl.style.display = text ? 'inline-block' : 'none';
    }
    document.getElementById('dealInfo').textContent = client.caseNumber ? `Дело №${client.caseNumber}` : '';
    document.getElementById('clientPhone').textContent = client.phone || '';
    document.getElementById('clientStage').textContent = client.stage || '';
    renderClientManager(client);
    document.getElementById('nextCourtDate').textContent = client.courtDate ? new Date(client.courtDate).toLocaleDateString('ru-RU') : '—';
    document.getElementById('activeAccount').textContent = client.totalAmount ? `${client.totalAmount} ₽` : '0 ₽';
    const monthly = client.paymentMonths ? Math.round((client.totalAmount || 0) / client.paymentMonths) : 0;
    document.getElementById('monthlyPayment').textContent = client.paymentMonths ? `${monthly} ₽ / ${client.paymentMonths} мес.` : '—';
    document.getElementById('clientNotes').value = client.notes || '';
    if (client.arbitrLink) {
        const linkBlock = document.getElementById('clientLinkBlock');
        const linkEl = document.getElementById('clientLink');
        linkEl.href = client.arbitrLink;
        linkEl.textContent = client.arbitrLink;
        linkBlock.classList.remove('d-none');
    }
    document.getElementById('editClientBtn').onclick = () => {
        window.location.href = `edit-client.html?id=${client.id}`;
    };
    const financeBtn = document.getElementById('financeBtn');
    if (financeBtn) {
        financeBtn.classList.add('disabled');
        financeBtn.removeAttribute('href');
        financeBtn.addEventListener('click', (e) => e.preventDefault());
    }
    window.tasks = client.tasks || [];
    renderTaskList();
    renderClientPayments(client);
    const taskCollapseEl = document.getElementById('clientTasksCollapse');
    const taskToggle = document.querySelector('[data-bs-target="#clientTasksCollapse"]');
    if (taskCollapseEl && taskToggle) {
        taskCollapseEl.addEventListener('shown.bs.collapse', () => taskToggle.textContent = 'Скрыть');
        taskCollapseEl.addEventListener('hidden.bs.collapse', () => taskToggle.textContent = 'Показать');
        if (window.tasks.length > 0) {
            const collapse = new bootstrap.Collapse(taskCollapseEl, {toggle: false});
            collapse.show();
        }
    }
    const payCollapseEl = document.getElementById('paymentScheduleCollapse');
    const payToggle = document.querySelector('[data-bs-target="#paymentScheduleCollapse"]');
    if (payCollapseEl && payToggle) {
        payCollapseEl.addEventListener('shown.bs.collapse', () => payToggle.textContent = 'Скрыть');
        payCollapseEl.addEventListener('hidden.bs.collapse', () => payToggle.textContent = 'Показать');
    }
}

function renderClientPayments(client) {
    const tbody = document.getElementById('paymentScheduleBody');
    if (!tbody) return;
    const schedule = getPaymentSchedule(client);
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(client.id));
    tbody.innerHTML = '';
    if (schedule.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Нет данных</td></tr>';
    } else {
        schedule.forEach((p, idx) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(p.date).toLocaleDateString('ru-RU')}</td>
                <td>${p.amount}</td>
                <td>
                    <input type="checkbox" id="paidMonth${idx}" ${p.paid ? 'checked' : ''}>
                    <label for="paidMonth${idx}">${p.paid ? 'Оплачен' : 'Не оплачен'}</label>
                </td>`;
            tbody.appendChild(tr);
        });
    }

    // Добавляем прочие платежи
    const extraHeader = document.createElement('tr');
    extraHeader.className = 'table-secondary';
    extraHeader.innerHTML = '<td colspan="3" class="text-center">Прочие платежи</td>';
    tbody.appendChild(extraHeader);

    const extraRow = (label, id, checked, amount) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${label}</td>
            <td>${amount}</td>
            <td>
                <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                <label for="${id}">${checked ? 'Оплачен' : 'Не оплачен'}</label>
            </td>`;
        tbody.appendChild(tr);
    };
    extraRow('Финансовый управляющий', 'finManagerPaid', client.finManagerPaid, 17000);
    extraRow('Депозит в суд', 'courtDepositPaid', client.courtDepositPaid, 25000);

    // Обработчики чекбоксов
    schedule.forEach((p, idx) => {
        const cb = document.getElementById(`paidMonth${idx}`);
        if (cb) {
            cb.onchange = function() {
                client.paidMonths[idx] = this.checked;
                if (clientIndex !== -1) {
                    clients[clientIndex].paidMonths = client.paidMonths;
                    if (this.checked) {
                        recordManagerPayment(client, schedule[idx].amount, new Date().toISOString().split('T')[0], { type: 'month', index: idx });
                    } else {
                        removeManagerPayment(client, { type: 'month', index: idx });
                    }
                    localStorage.setItem('clients', JSON.stringify(clients));
                }
                this.nextElementSibling.textContent = this.checked ? 'Оплачен' : 'Не оплачен';
            };
        }
    });
    const finCb = document.getElementById('finManagerPaid');
    if (finCb) {
        finCb.onchange = function() {
            client.finManagerPaid = this.checked;
            if (clientIndex !== -1) {
                clients[clientIndex].finManagerPaid = this.checked;
                localStorage.setItem('clients', JSON.stringify(clients));
            }
            this.nextElementSibling.textContent = this.checked ? 'Оплачен' : 'Не оплачен';
        };
    }
    const depositCb = document.getElementById('courtDepositPaid');
    if (depositCb) {
        depositCb.onchange = function() {
            client.courtDepositPaid = this.checked;
            if (clientIndex !== -1) {
                clients[clientIndex].courtDepositPaid = this.checked;
                localStorage.setItem('clients', JSON.stringify(clients));
            }
            this.nextElementSibling.textContent = this.checked ? 'Оплачен' : 'Не оплачен';
        };
    }
}

function saveClientData(client) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const idx = clients.findIndex(c => String(c.id) === String(client.id));
    if (idx !== -1) {
        clients[idx] = client;
        localStorage.setItem('clients', JSON.stringify(clients));
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
    const store = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const managerData = store[client.managerId] || {};
    const history = managerData.history || [];
    history.push({ clientId: client.id, amount: salary, date });
    store[client.managerId] = { ...managerData, history };
    localStorage.setItem('managerPayments', JSON.stringify(store));

    client.managerPayments = client.managerPayments || [];
    client.managerPayments.push({ ...info, date, amount: salary });
    client.managerPaidTotal += salary;
    if (client.managerPaidTotal >= totalDue) {
        client.managerFullyPaid = true;
    }
    saveClientData(client);
}

function removeManagerPayment(client, info = {}) {
    if (!client || !client.managerPayments) return;
    const idx = client.managerPayments.findIndex(p => p.type === info.type && p.index === info.index);
    if (idx === -1) return;
    const payment = client.managerPayments.splice(idx, 1)[0];
    if (!client.managerId) return;
    const store = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const managerData = store[client.managerId] || {};
    const history = managerData.history || [];
    const hIdx = history.findIndex(h => h.clientId === client.id && h.amount === payment.amount && h.date === payment.date);
    if (hIdx !== -1) {
        history.splice(hIdx, 1);
        store[client.managerId] = { ...managerData, history };
        localStorage.setItem('managerPayments', JSON.stringify(store));
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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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

    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const existingClient = clients.find(c => String(c.id) === String(clientId));
    if (!existingClient) {
        console.error('Клиент не найден в localStorage:', clientId);
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
        courtDate: document.getElementById('courtDate').value,
        notes: document.getElementById('notes').value.trim(),
        favorite: document.getElementById('favoriteBtn')?.dataset.favorite === 'true',
        tasks: window.tasks || existingClient.tasks || [],
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
        localStorage.setItem('clients', JSON.stringify(clients));
        const returnUrl = document.referrer || `client-card.html?id=${clientId}`;
        window.location.href = returnUrl;
    } else {
        console.error('Клиент не найден в localStorage:', clientId);
        alert('Клиент не найден!');
        const returnUrl = document.referrer || `client-card.html?id=${clientId}`;
        window.location.href = returnUrl;
    }
}

// Удаление клиента
function deleteClient() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    if (!clientId) {
        console.error('Клиент не найден: отсутствует ID');
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex === -1) {
        console.error('Клиент не найден в localStorage:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    if (confirm('Вы уверены, что хотите удалить этого клиента?')) {
        clients.splice(clientIndex, 1);
        localStorage.setItem('clients', JSON.stringify(clients));
        window.location.href = 'index.html';
    }
}

// Сохранение клиента
function saveClient() {
    const firstName = document.getElementById('firstName').value.trim();
    const middleName = document.getElementById('middleName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const client = {
        id: generateClientId(firstName, middleName, lastName, phone),
        firstName,
        middleName,
        lastName,
        birthDate: document.getElementById('birthDate').value,
        phone,
        passportSeries: document.getElementById('passportSeries').value.trim(),
        passportNumber: document.getElementById('passportNumber').value.trim(),
        passportIssueDate: document.getElementById('passportIssueDate').value,
        passportIssuePlace: document.getElementById('passportIssuePlace').value.trim(),
        totalAmount: parseInt(document.getElementById('totalAmount').value) || 0,
        paymentMonths: parseInt(document.getElementById('paymentMonths').value) || 0,
        paymentStartDate: document.getElementById('paymentStartDate').value,
        paidMonths: new Array(parseInt(document.getElementById('paymentMonths').value) || 0).fill(false),
        arbitrLink: document.getElementById('arbitrLink').value.trim(),
        caseNumber: document.getElementById('caseNumber').value.trim(),
        stage: document.getElementById('stage').value,
        subStage: document.getElementById('subStage').value,
        courtDate: document.getElementById('courtDate').value,
        notes: document.getElementById('notes').value.trim(),
        favorite: document.getElementById('favoriteBtn')?.dataset.favorite === 'true',
        createdAt: new Date().toISOString(),
        tasks: window.tasks || [],
        finManagerPaid: false,
        courtDepositPaid: false,
        paymentAdjustments: {},
        extraPayments: [],
        managerPayments: [],
        managerPaidTotal: 0,
        managerFullyPaid: false
    };

    // Валидация
    if (!client.firstName || !client.lastName) {
        console.error('Валидация не пройдена: имя и фамилия обязательны');
        alert('Имя и фамилия обязательны!');
        return;
    }

    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    clients.push(client);
    localStorage.setItem('clients', JSON.stringify(clients));
    window.location.href = 'index.html';
}

// Поиск клиентов
function searchClients() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const list = document.getElementById('searchSuggestions');
    if (!list) return;
    list.innerHTML = '';

    if (!query) {
        list.classList.add('d-none');
        return;
    }

    const filteredClients = clients.filter(client =>
        client.firstName.toLowerCase().includes(query) ||
        client.lastName.toLowerCase().includes(query) ||
        (client.caseNumber && client.caseNumber.toLowerCase().includes(query))
    ).sort((a, b) => Number(b.favorite) - Number(a.favorite));

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

    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];

    const tasks = clients
        .filter(client => client.tasks && Array.isArray(client.tasks))
        .flatMap(client => client.tasks
            .filter(task => task.deadline === dateStr && !task.completed)
            .map(task => ({ ...task, clientId: client.id, clientName: `${client.firstName} ${client.lastName}` }))
        );
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
        textSpan.textContent = `${task.text} (${task.clientName})`;
        textSpan.onclick = function() { this.classList.toggle('expanded'); };
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-primary';
        btn.textContent = 'Выполнено';
        btn.onclick = () => completeTaskFromCalendar(task.clientId, task.id, `${dateStr}`);
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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client || !client.paidMonths || paymentIndex >= client.paidMonths.length) return;
    client.paidMonths[paymentIndex] = true;
    localStorage.setItem('clients', JSON.stringify(clients));
    if (dateStr) {
        renderDayActions(dateStr);
    }
    renderDebtorsList();
    refetchCalendarEvents();
}

function getDebtors() {
    const today = new Date().toISOString().split('T')[0];
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
    let selectedDayEl = null;
    const calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'ru',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },
        buttonText: {
            today: 'Сегодня',
            month: 'Месяц',
            week: 'Неделя',
            day: 'День'
        },
        eventDisplay: 'dot',
        events: function(info, successCallback, failureCallback) {
            const clients = JSON.parse(localStorage.getItem('clients')) || [];
            const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
            const clientEvents = clients
                .filter(client => client.courtDate)
                .map(client => ({
                    title: `${client.firstName} ${client.lastName} (${client.stage}${client.subStage ? ' - ' + client.subStage : ''})`,
                    start: client.courtDate,
                    backgroundColor: '#fd7e14',
                    borderColor: '#fd7e14',
                    extendedProps: { type: 'client', clientId: client.id }
                }));
            // --- ДОБАВИТЬ задачи как события ---
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
            const allEvents = [...clientEvents, ...taskEvents, ...consultationEvents, ...paymentEvents];
            successCallback(allEvents);
        },
        eventContent: function(arg) {
            return {
                html: `<div class="calendar-event"><span class="event-dot" style="background-color: ${arg.event.backgroundColor};"></span><span class="event-text">${arg.event.title}</span></div>`
            };
        },
        dateClick: function(info) {
            highlightDay(info.dayEl);
            renderDayActions(info.dateStr);
        },
        eventClick: function(info) {
            const dayEl = info.el.closest('.fc-daygrid-day');
            if (dayEl) highlightDay(dayEl);
            renderDayActions(info.event.startStr);
        }
    });
    calendar.render();
    highlightDay(calendarEl.querySelector('.fc-daygrid-day.fc-day-today'));
    markDaysWithEvents();
    calendar.on('eventsSet', markDaysWithEvents);

    function highlightDay(dayEl) {
        if (selectedDayEl) {
            selectedDayEl.classList.remove('selected-day');
        }
        selectedDayEl = dayEl;
        if (selectedDayEl) {
            selectedDayEl.classList.add('selected-day');
        }
    }

    function markDaysWithEvents() {
        const dayCells = document.querySelectorAll('.fc-daygrid-day');
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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
    const filteredClients = clients.filter(client => client.courtDate === dateStr);
    const filteredConsultations = consultations.filter(consult => consult.date === dateStr);
    const filteredTasks = clients
        .filter(client => client.tasks && Array.isArray(client.tasks))
        .flatMap(client => client.tasks
            .filter(task => task.deadline === dateStr && !task.completed)
            .map(task => ({ ...task, clientId: client.id, clientName: `${client.firstName} ${client.lastName}` }))
        );

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
                li.innerHTML = `${task.text} (${task.clientName}) <span class="badge" style="background-color:${task.color || '#28a745'}">${task.deadline}</span>`;
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
    var clients = JSON.parse(localStorage.getItem('clients')) || [];
    var archivedClients = JSON.parse(localStorage.getItem('archivedClients')) || [];
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

    localStorage.setItem('clients', JSON.stringify(clients));
    localStorage.setItem('archivedClients', JSON.stringify(archivedClients));

    showToast('Клиент перемещён в архив!');
    displayClientsList();
}

// Отображение завершённых клиентов в модальном окне
function populateArchivedClientsList() {
    const listEl = document.getElementById('archivedClientsList');
    if (!listEl) return;
    const archivedClients = JSON.parse(localStorage.getItem('archivedClients')) || [];
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
    const archivedClients = JSON.parse(localStorage.getItem('archivedClients')) || [];
    const index = archivedClients.findIndex(c => String(c.id) === String(clientId));
    if (index === -1) return;
    if (confirm('Удалить этого клиента из архива?')) {
        archivedClients.splice(index, 1);
        localStorage.setItem('archivedClients', JSON.stringify(archivedClients));
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
    const text = document.getElementById('taskText').value.trim();
    const deadline = document.getElementById('taskDeadline').value;
    const colorInput = document.getElementById('taskColor');
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
    renderTaskList();
    renderCompletedTasks();
    document.getElementById('taskText').value = '';
    document.getElementById('taskDeadline').value = '';
    if (colorInput) colorInput.value = '#28a745';
    // Сохраняем задачи в клиенте
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex !== -1) {
        clients[clientIndex].tasks = window.tasks;
        localStorage.setItem('clients', JSON.stringify(clients));
    }
}
function renderTaskList() {
    const list = document.getElementById('taskList');
    if (!list) return;
    list.innerHTML = '';
    window.tasks.forEach((task, idx) => {
        if (task.completed) return;
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-start task-item';
        li.style.borderLeft = `5px solid ${task.color || '#28a745'}`;
        const textWithDeadline = `${task.text} (${task.deadline ? task.deadline : 'Без срока'})`;
        li.innerHTML = `
            <span class="task-text" onclick="this.classList.toggle('expanded')" title="${textWithDeadline}">${textWithDeadline}</span>
            <div>
                <button class="client-btn client-btn-complete me-2" onclick="completeTask(${idx})">Выполнено</button>
                <button class="btn btn-sm btn-danger" onclick="removeTask(${idx})">Удалить</button>
            </div>
        `;
        list.appendChild(li);
    });
}
function removeTask(idx) {
    window.tasks.splice(idx, 1);
    renderTaskList();
    renderCompletedTasks();
    // Сохраняем задачи в клиенте
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex !== -1) {
        clients[clientIndex].tasks = window.tasks;
        localStorage.setItem('clients', JSON.stringify(clients));
    }
}

function completeTask(idx) {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex === -1) return;
    const task = window.tasks[idx];
    if (!task) return;
    task.completed = true;
    task.completedAt = new Date().toISOString();
    advanceClientStage(clients[clientIndex]);
    clients[clientIndex].tasks = window.tasks;
    localStorage.setItem('clients', JSON.stringify(clients));
    const stageSelect = document.getElementById('stage');
    const subStageSelect = document.getElementById('subStage');
    if (stageSelect && subStageSelect) {
        stageSelect.value = clients[clientIndex].stage;
        updateSubStageOptions(stageSelect.value, subStageSelect);
        subStageSelect.value = clients[clientIndex].subStage || '';
    }
    renderTaskList();
    renderCompletedTasks();
}

function renderCompletedTasks() {
    const list = document.getElementById('completedTaskList');
    const stageInfo = document.getElementById('currentStageInfo');
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (stageInfo && client) {
        stageInfo.textContent = client.stage ? `Этап: ${client.stage}${client.subStage ? ' - ' + client.subStage : ''}` : '';
    }
    if (!list) return;
    list.innerHTML = '';
    window.tasks.filter(t => t.completed).forEach(task => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.style.borderLeft = `5px solid ${task.color || '#28a745'}`;
        li.textContent = `${task.text} (${task.completedAt ? new Date(task.completedAt).toLocaleDateString('ru-RU') : ''})`;
        list.appendChild(li);
    });
}

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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => String(c.id) === String(clientId));
    if (clientIndex === -1) return;
    const tasks = clients[clientIndex].tasks || [];
    const tIndex = tasks.findIndex(t => t.id === taskId);
    if (tIndex === -1) return;
    tasks[tIndex].completed = true;
    tasks[tIndex].completedAt = new Date().toISOString();
    advanceClientStage(clients[clientIndex]);
    clients[clientIndex].tasks = tasks;
    localStorage.setItem('clients', JSON.stringify(clients));
    renderDayActions(dateStr);
    if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
        document.getElementById('calendar')._fullCalendar.refetchEvents();
    }
};

function completeSubStage() {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('id');
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
    localStorage.setItem('clients', JSON.stringify(clients));
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
// window.saveClient = function() { ... } уже реализовано и сохраняет задачи в localStorage

// --- Для календаря ---
// Модальное окно для добавления задачи через select
function showAddTaskModal(dateStr) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    if (clients.length === 0) {
        alert('Нет клиентов для добавления задачи!');
        return;
    }
    let modalDiv = document.createElement('div');
    modalDiv.className = 'modal fade';
    const dateTitle = dateStr ? ` на ${new Date(dateStr).toLocaleDateString('ru-RU')}` : '';
    modalDiv.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Добавить задачу${dateTitle}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="calendarTaskClient" class="form-label">Клиент</label>
                        <select id="calendarTaskClient" class="form-select">
                            ${clients.map(c => `<option value="${c.id}">${c.firstName} ${c.lastName}</option>`).join('')}
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
        const clientId = document.getElementById('calendarTaskClient').value;
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
        let client = clients.find(c => String(c.id) === String(clientId));
        if (!client) {
            alert('Клиент не найден!');
            return;
        }
        let task = {
            id: Date.now(),
            text,
            color,
            deadline: date,
            completed: false
        };
        if (!Array.isArray(client.tasks)) client.tasks = [];
        client.tasks.push(task);
        localStorage.setItem('clients', JSON.stringify(clients));
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

// Показ модального окна платежей
window.showPaymentsModal = function(clientId) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    const paymentsTableBody = document.getElementById('paymentsTableBody');
    if (!client || !paymentsTableBody) return;

    paymentsTableBody.innerHTML = '';

    // Месячные платежи
    const schedule = getPaymentSchedule(client);
    if (schedule.length > 0) {
        schedule.forEach((p, i) => {
            paymentsTableBody.innerHTML += `
                <tr>
                    <td>Месяц ${i + 1}</td>
                    <td>${new Date(p.date).toLocaleDateString('ru-RU')}</td>
                    <td>${p.amount}</td>
                    <td>${p.paid ? 'Оплачен' : 'Не оплачен'}</td>
                </tr>
            `;
        });
    } else {
        paymentsTableBody.innerHTML += '<tr><td colspan="4" class="text-center">Нет данных о платежах</td></tr>';
    }

    // --- Категория: Прочие платежи ---
    paymentsTableBody.innerHTML += `
        <tr class="table-secondary">
            <td colspan="4" style="text-align:center;font-weight:bold;">Прочие платежи</td>
        </tr>
        <tr>
            <td>Финансовый управляющий</td>
            <td>-</td>
            <td>17000</td>
            <td>
                <input type="checkbox" id="finManagerPaid${client.id}" ${client.finManagerPaid ? 'checked' : ''}>
                <label for="finManagerPaid${client.id}">${client.finManagerPaid ? 'Оплачен' : 'Не оплачен'}</label>
            </td>
        </tr>
        <tr>
            <td>Депозит в суд</td>
            <td>-</td>
            <td>25000</td>
            <td>
                <input type="checkbox" id="courtDepositPaid${client.id}" ${client.courtDepositPaid ? 'checked' : ''}>
                <label for="courtDepositPaid${client.id}">${client.courtDepositPaid ? 'Оплачен' : 'Не оплачен'}</label>
            </td>
        </tr>
    `;

    setTimeout(() => {
        document.getElementById(`finManagerPaid${client.id}`).onchange = function() {
            client.finManagerPaid = this.checked;
            localStorage.setItem('clients', JSON.stringify(clients));
            this.nextElementSibling.textContent = this.checked ? 'Оплачен' : 'Не оплачен';
        };
        document.getElementById(`courtDepositPaid${client.id}`).onchange = function() {
            client.courtDepositPaid = this.checked;
            localStorage.setItem('clients', JSON.stringify(clients));
            this.nextElementSibling.textContent = this.checked ? 'Оплачен' : 'Не оплачен';
        };
    }, 100);

const modal = new bootstrap.Modal(document.getElementById('paymentsModal'));
    modal.show();
};

function openFinanceModal() {
    const modalEl = document.getElementById('financeSummaryModal');
    if (!modalEl) return;
    document.getElementById('financeMenu')?.style.setProperty('display', 'flex');
    const content = document.getElementById('financeContent');
    if (content) content.style.display = 'none';
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function showFinanceSection(html) {
    const menu = document.getElementById('financeMenu');
    const content = document.getElementById('financeContent');
    if (!menu || !content) return;
    content.innerHTML = `<button class="btn btn-secondary mb-3" id="financeBackBtn">&larr; Назад</button>` + html;
    menu.style.display = 'none';
    content.style.display = 'block';
    document.getElementById('financeBackBtn').onclick = () => {
        content.style.display = 'none';
        menu.style.display = 'flex';
    };
}

function showTotalEarnings() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    let total = 0;
    clients.forEach(client => {
        const schedule = getPaymentSchedule(client);
        schedule.forEach(p => { if (p.paid) total += p.amount; });
        (client.extraPayments || []).forEach(p => { if (p.paid) total += p.amount; });
        if (client.finManagerPaid) total -= 17000;
        if (client.courtDepositPaid) total -= 25000;
    });
    showFinanceSection(`<h5>Общий заработок</h5><p class="h4">${total} ₽</p>`);
}

function manageClientPayments() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const rows = clients.map(c => {
        const schedule = getPaymentSchedule(c);
        const paid = schedule.reduce((sum,p)=>p.paid?sum+p.amount:sum,0) + (c.extraPayments||[]).reduce((s,p)=>s+p.amount,0);
        return `<tr><td>${c.firstName} ${c.lastName}</td><td>${paid}</td><td><button class="btn btn-primary btn-sm add-payment" data-id="${c.id}">Добавить</button></td></tr>`;
    }).join('') || '<tr><td colspan="3" class="text-center">Нет клиентов</td></tr>';
    showFinanceSection(`<table class="table table-sm"><thead><tr><th>Клиент</th><th>Оплачено</th><th></th></tr></thead><tbody>${rows}</tbody></table>`);
    document.querySelectorAll('.add-payment').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const date = prompt('Дата платежа (ГГГГ-ММ-ДД):', new Date().toISOString().split('T')[0]);
            if (!date) return;
            const amount = parseFloat(prompt('Сумма:', '0'));
            if (isNaN(amount)) return;
            const comment = prompt('Комментарий:', '') || '';
            const clients = JSON.parse(localStorage.getItem('clients')) || [];
            const client = clients.find(c => String(c.id) === String(id));
            if (!client.extraPayments) client.extraPayments = [];
            client.extraPayments.push({ date, amount, paid: true, comment });
            recordManagerPayment(client, amount, date, { type: 'extra', index: client.extraPayments.length - 1 });
            localStorage.setItem('clients', JSON.stringify(clients));
            manageClientPayments();
        });
    });
}

function showAllPayments() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const rows = [];
    clients.forEach(c => {
        const name = `${c.firstName} ${c.lastName}`.trim();
        getPaymentSchedule(c).forEach(p => {
            rows.push(`<tr><td>${new Date(p.date).toLocaleDateString('ru-RU')}</td><td>${name}</td><td>${p.amount}</td><td>${p.paid ? 'Оплачен' : 'Ожидается'}</td></tr>`);
        });
        (c.extraPayments||[]).forEach(p => {
            rows.push(`<tr><td>${new Date(p.date).toLocaleDateString('ru-RU')}</td><td>${name}</td><td>${p.amount}</td><td>${p.paid ? 'Оплачен' : 'Ожидается'}</td></tr>`);
        });
    });
    const body = rows.join('') || '<tr><td colspan="4" class="text-center">Нет данных</td></tr>';
    showFinanceSection(`<table class="table table-sm"><thead><tr><th>Дата</th><th>Клиент</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>${body}</tbody></table>`);
}

function showUnpaidClients() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const items = clients
        .filter(c => !c.finManagerPaid || !c.courtDepositPaid)
        .map(c => `<li class="list-group-item">${c.firstName} ${c.lastName}<br><small>ФУ: ${c.finManagerPaid ? 'оплачен' : 'не оплачен'}, депозит: ${c.courtDepositPaid ? 'оплачен' : 'не оплачен'}</small></li>`)
        .join('') || '<li class="list-group-item text-center">Все оплатили</li>';
    showFinanceSection(`<ul class="list-group">${items}</ul>`);
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

    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
    consultations.push({ id: Date.now(), name, phone, date, notes });
    localStorage.setItem('consultations', JSON.stringify(consultations));

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
    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
    const consult = consultations.find(c => c.id === consultId);
    if (!consult) return;
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
    localStorage.setItem('clients', JSON.stringify(clients));
    // Удалить консультацию
    const idx = consultations.findIndex(c => c.id === consultId);
    if (idx !== -1) {
        consultations.splice(idx, 1);
        localStorage.setItem('consultations', JSON.stringify(consultations));
    }
    renderDayActions(dateStr);
    refetchCalendarEvents();
};

window.deleteConsultation = function(consultId, dateStr) {
    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
    const idx = consultations.findIndex(c => c.id === consultId);
    if (idx !== -1) {
        consultations.splice(idx, 1);
        localStorage.setItem('consultations', JSON.stringify(consultations));
        renderDayActions(dateStr);
        refetchCalendarEvents();
    }
};

// ------------------ Работа с менеджерами ------------------
function renderClientManager(client) {
    const block = document.getElementById('clientManagerBlock');
    if (!block) return;
    const managers = getManagers();
    if (client.managerId) {
        const m = managers.find(m => String(m.id) === String(client.managerId));
        if (m) {
            const percentText = client.managerFullyPaid ? ' (оплачен)' : (client.managerPercent ? ' (' + client.managerPercent + '%)' : '');
            block.innerHTML = `<span class="text-muted small d-block">Ответственный менеджер</span><span class="text-success"><span class="green-dot"></span>${m.name}${percentText}${client.finManagerName ? ' ФУ: ' + client.finManagerName : (client.isFinManager ? ' ФУ' : '')}</span>`;
            return;
        }
    }
    block.innerHTML = `<span class="text-muted small d-block">Ответственный менеджер</span><span class="text-danger"><span class="red-dot"></span> Менеджер не назначен</span>`;
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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (client) {
        client.managerId = managerId;
        client.managerPercent = percent;
        client.isFinManager = isFU;
        client.managerPaidTotal = 0;
        client.managerFullyPaid = false;
        localStorage.setItem('clients', JSON.stringify(clients));
        renderClientManager(client);
    }
    renderManagersPage();
    bootstrap.Modal.getInstance(document.getElementById('assignManagerModal')).hide();
};

function renderManagersPage() {
    const list = document.getElementById('managersList');
    if (!list) return;
    const managers = getManagers();
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    list.innerHTML = '';
    managers.forEach(manager => {
        const card = document.createElement('div');
        card.className = 'mb-4 p-3 border rounded';
        const managerClients = clients.filter(c => String(c.managerId) === String(manager.id));
        let monthlyIncome = 0;
        let totalIncome = 0;
        managerClients.forEach(c => {
            const months = c.paymentMonths || 0;
            const total = c.totalAmount || 0;
            const percent = c.managerPercent ? parseFloat(c.managerPercent) : 0;
            if (!c.managerFullyPaid && percent > 0) {
                const monthly = months ? total / months : 0;
                const incomePerMonth = monthly * percent / 100;
                monthlyIncome += incomePerMonth;
                totalIncome += incomePerMonth * months;
            }
        });
        const rows = managerClients.length
            ? managerClients.map(c => {
                const percentCell = c.managerFullyPaid ? 'оплачен' : (c.managerPercent || '');
                return `<tr><td>${c.firstName} ${c.lastName}</td><td>${percentCell}</td><td>${c.finManagerName || ''}</td></tr>`;
            }).join('')
            : '<tr><td colspan="3" class="text-center">Нет клиентов</td></tr>';
        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div class="d-flex align-items-center">
                    <i class="ri-user-line me-2"></i>
                    <h5 class="mb-0">${manager.name}</h5>
                </div>
                <div class="btn-group">
                    <button class="btn btn-outline-secondary btn-sm" onclick="openManagerPayments(${manager.id})" title="Выплаты">
                        <i class="ri-wallet-line"></i>
                    </button>
                </div>
            </div>
            <div class="text-muted small mb-2">Ежемесячно: ${monthlyIncome.toFixed(2)} | Всего: ${totalIncome.toFixed(2)}</div>
            <table class="table mb-2">
                <thead><tr><th>Клиент</th><th>%</th><th>ФУ</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
            <button class="btn btn-primary btn-sm" onclick="openAssignClientToManager(${manager.id})">Добавить клиента</button>
        `;
        list.appendChild(card);
    });
}

window.openCreateManagerModal = function() {
    document.getElementById('managerName').value = '';
    document.getElementById('managerContacts').value = '';
    document.getElementById('managerPayValue').value = '';
    document.getElementById('payTypePercent').checked = true;
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('managerModal'));
    modal.show();
};

window.saveManager = function() {
    const name = document.getElementById('managerName').value.trim();
    const contacts = document.getElementById('managerContacts').value.trim();
    const type = document.querySelector('input[name="managerPayType"]:checked').value;
    const value = document.getElementById('managerPayValue').value.trim();
    if (!name) return;
    const managers = getManagers();
    managers.push({ id: Date.now(), name, contacts, paymentType: type, paymentValue: value });
    saveManagers(managers);
    renderManagersPage();
    bootstrap.Modal.getInstance(document.getElementById('managerModal')).hide();
};

window.openAssignClientToManager = function(managerId) {
    currentManagerId = managerId;
    const select = document.getElementById('assignClientSelect');
    if (!select) return;
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    select.innerHTML = '';
    clients.forEach(c => {
        const option = document.createElement('option');
        option.value = c.id;
        option.textContent = `${c.firstName} ${c.lastName}`;
        select.appendChild(option);
    });
    document.getElementById('assignClientPercent').value = '';
    document.getElementById('assignClientFU').checked = false;
    document.getElementById('assignClientFUName').value = '';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('assignClientModal'));
    modal.show();
};

window.saveAssignedClient = function() {
    const clientId = document.getElementById('assignClientSelect').value;
    const percent = document.getElementById('assignClientPercent').value;
    const isFU = document.getElementById('assignClientFU').checked;
    const fuName = document.getElementById('assignClientFUName').value.trim();
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (client) {
        client.managerId = currentManagerId;
        client.managerPercent = percent;
        client.isFinManager = isFU;
        client.finManagerName = fuName;
        client.managerPaidTotal = 0;
        client.managerFullyPaid = false;
        localStorage.setItem('clients', JSON.stringify(clients));
    }
    renderManagersPage();
    const modal = bootstrap.Modal.getInstance(document.getElementById('assignClientModal'));
    modal.hide();
};

window.issueManagerSalary = function() {
    const salary = parseFloat(document.getElementById('managerSalary').value) || 0;
    const bonus = parseFloat(document.getElementById('managerBonus').value) || 0;
    const amount = salary + bonus;
    if (amount <= 0) return;
    const date = new Date().toISOString().split('T')[0];
    const payments = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const existing = payments[currentManagerId] || {};
    const history = existing.history || [];
    history.push({ clientId: null, amount, date, type: 'salary' });
    payments[currentManagerId] = {
        ...existing,
        salary,
        bonus,
        paid: true,
        month: date.slice(0, 7),
        history
    };
    localStorage.setItem('managerPayments', JSON.stringify(payments));
    renderManagerPayments();
};

window.openManagerPayments = function(managerId) {
    currentManagerId = managerId;
    const payments = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const data = payments[managerId] || {};
    document.getElementById('managerSalary').value = data.salary || '';
    document.getElementById('managerBonus').value = data.bonus || '';
    document.getElementById('managerPaid').checked = !!data.paid;
    renderManagerPayments();
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('managerPaymentsModal'));
    modal.show();
};

function renderManagerPayments() {
    const body = document.getElementById('managerPaymentsBody');
    if (!body) return;
    const payments = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const data = payments[currentManagerId] || {};
    const history = data.history || [];
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const month = new Date().toISOString().slice(0,7);
    body.innerHTML = '';
    let hasPayments = false;
    history.forEach((p, idx) => {
        if (p.date && p.date.slice(0,7) === month) {
            hasPayments = true;
            const client = clients.find(c => String(c.id) === String(p.clientId));
            const name = client ? `${client.firstName} ${client.lastName}` : (p.type === 'salary' ? 'Зарплата' : '');
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${p.date}</td><td>${name}</td><td>${p.amount}</td><td><button class="btn btn-sm btn-danger" data-index="${idx}">Удалить</button></td>`;
            body.appendChild(tr);
        }
    });
    if (!hasPayments) {
        body.innerHTML = '<tr><td colspan="4" class="text-center">Нет платежей</td></tr>';
        return;
    }
    body.querySelectorAll('button[data-index]').forEach(btn => {
        btn.addEventListener('click', function() {
            const idx = parseInt(this.dataset.index, 10);
            deleteManagerPayment(idx);
        });
    });
}

window.openAddManagerPayment = function() {
    const select = document.getElementById('managerPaymentClient');
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    if (select) {
        select.innerHTML = '';
        clients
            .filter(c => String(c.managerId) === String(currentManagerId))
            .filter(c => {
                const percent = parseFloat(c.managerPercent);
                if (isNaN(percent) || percent <= 0) return false;
                const totalDue = Math.round((c.totalAmount || 0) * percent / 100);
                const paid = c.managerPaidTotal || 0;
                return paid < totalDue;
            })
            .forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = `${c.firstName} ${c.lastName}`;
                select.appendChild(opt);
            });
    }
    const dateInput = document.getElementById('managerPaymentDate');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    document.getElementById('managerPaymentAmount').value = '';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addManagerPaymentModal'));
    modal.show();
};

window.saveManagerPayment = function() {
    const clientId = document.getElementById('managerPaymentClient').value;
    const amount = document.getElementById('managerPaymentAmount').value;
    const date = document.getElementById('managerPaymentDate').value;
    if (!clientId || !amount || !date) return;
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => String(c.id) === String(clientId));
    if (!client) return;
    const percent = parseFloat(client.managerPercent);
    const totalDue = isNaN(percent) ? 0 : Math.round((client.totalAmount || 0) * percent / 100);
    client.managerPaidTotal = client.managerPaidTotal || 0;
    let amt = parseFloat(amount);
    const remaining = totalDue - client.managerPaidTotal;
    if (amt > remaining) amt = remaining;
    if (amt <= 0) return;
    const payments = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const existing = payments[currentManagerId] || {};
    const history = existing.history || [];
    history.push({ clientId, amount: amt, date });
    payments[currentManagerId] = { ...existing, history };
    localStorage.setItem('managerPayments', JSON.stringify(payments));
    client.managerPaidTotal += amt;
    if (client.managerPaidTotal >= totalDue) {
        client.managerFullyPaid = true;
    }
    client.managerPayments = client.managerPayments || [];
    client.managerPayments.push({ date, amount: amt });
    saveClientData(client);
    bootstrap.Modal.getInstance(document.getElementById('addManagerPaymentModal')).hide();
    renderManagerPayments();
};

window.deleteManagerPayment = function(index) {
    const payments = JSON.parse(localStorage.getItem('managerPayments')) || {};
    const data = payments[currentManagerId] || {};
    if (!data.history) return;
    const removed = data.history.splice(index, 1)[0];
    payments[currentManagerId] = data;
    localStorage.setItem('managerPayments', JSON.stringify(payments));
    if (removed && removed.clientId) {
        const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
};

window.showConsultationDetails = function(consultId) {
    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
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
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
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
    

