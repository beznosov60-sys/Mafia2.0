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

function getCourtTypeBadge(client) {
    const types = client.courtTypes || {};
    if (types.arbitration && types.tret) return '<span class="court-badge">АС/ТС</span>';
    if (types.arbitration) return '<span class="court-badge">АС</span>';
    if (types.tret) return '<span class="court-badge">ТС</span>';
    return '';
}

const originalSetItem = localStorage.setItem.bind(localStorage);
async function syncClientsFromServer() {
    try {
        const res = await fetch('/api/clients');
        const clients = await res.json();
        originalSetItem('clients', JSON.stringify(clients));
    } catch (e) {
        console.error('Не удалось загрузить клиентов с сервера', e);
        if (!localStorage.getItem('clients')) {
            originalSetItem('clients', JSON.stringify([]));
        }
    }
}

localStorage.setItem = function(key, value) {
    originalSetItem(key, value);
    if (key === 'clients') {
        fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: value
        }).catch(err => console.error('Не удалось сохранить клиентов на сервер', err));
    }
};


function getPaymentSchedule(client) {
    const schedule = [];
    if (!client.paymentMonths || !client.paymentStartDate) return schedule;
    const amount = client.totalAmount ? Math.round(client.totalAmount / client.paymentMonths) : 0;
    for (let i = 0; i < client.paymentMonths; i++) {
        const date = new Date(client.paymentStartDate);
        date.setMonth(date.getMonth() + i);
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

function exportClientsToExcel() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const worksheet = XLSX.utils.json_to_sheet(clients);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');
    XLSX.writeFile(workbook, 'clients.xlsx');
}

function importClientsFromExcel(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const clients = XLSX.utils.sheet_to_json(sheet);
        localStorage.setItem('clients', JSON.stringify(clients));
        alert('Импорт завершён');
        window.location.reload();
    };
    reader.readAsArrayBuffer(file);
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM загружен, инициализация...');
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
        document.getElementById('searchInput')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                searchClients();
            }
        });
        // Инициализация панели
        document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
        document.getElementById('sidebarClose')?.addEventListener('click', toggleSidebar);
        displayClientsList();
        document.getElementById('exportBtn')?.addEventListener('click', exportClientsToExcel);
        document.getElementById('importTrigger')?.addEventListener('click', () => document.getElementById('importFile')?.click());
        document.getElementById('importFile')?.addEventListener('change', importClientsFromExcel);
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
        const historyToggle = document.getElementById('historyToggle');
        const completeSubStageBtn = document.getElementById('completeSubStageBtn');
        const paymentMonthsInput = document.getElementById('paymentMonths');
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
        historyToggle?.addEventListener('click', openHistoryModal);
        completeSubStageBtn?.addEventListener('click', completeSubStage);
        if (completeSubStageBtn) {
            function updateSubStageButton() {
                completeSubStageBtn.disabled = !subStageSelect.value;
            }
            subStageSelect.addEventListener('change', updateSubStageButton);
            updateSubStageButton();
        }
        paymentMonthsInput?.addEventListener('input', function() {
            const months = parseInt(this.value) || 0;
            const container = document.getElementById('paidMonthsContainer');
            container.innerHTML = '';
            for (let i = 1; i <= months; i++) {
                container.innerHTML += `
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="checkbox" id="paidMonth${i}">
                    <label class="form-check-label" for="paidMonth${i}">Месяц ${i}</label>
                </div>`;
            }
        });
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
        if (stageSelect && completeBtn && subStageSelect) {
            stageSelect.addEventListener('change', updateCompleteBtnVisibility);
            subStageSelect.addEventListener('change', updateCompleteBtnVisibility);
            updateCompleteBtnVisibility();
        }
        window.completeClientFromEdit = function() {
            const clientIdVal = parseInt(document.getElementById('clientId').value);
            if (!clientIdVal) return;
            if (confirm('Завершить клиента?')) {
                if (window.completeClient) {
                    window.completeClient(clientIdVal);
                } else {
                    alert('Функция завершения не найдена!');
                }
            }
        };
        initTaskList(clientId);
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
    // Загрузка карточки клиента (только на client-card.html)
    if (window.location.pathname.includes('client-card.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        if (clientId) {
            loadClientCard(clientId);
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
        li.className = 'list-group-item clickable-item';
        const fullName = `${client.firstName} ${client.lastName}`;
        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>${client.favorite ? '<i class="ri-star-fill favorite-icon"></i>' : ''}${fullName}${getCourtTypeBadge(client)}</div>
                <button class="btn btn-sm btn-outline-primary toggle-details" data-client="${client.id}"><i class="ri-arrow-down-s-line"></i></button>
            </div>
            <div class="client-details mt-2">
                ${client.subStage ? `<div class="task-info mb-2">${client.subStage}</div>` : ''}
                <div class="client-actions">
                    <button class="client-btn client-btn-payments" onclick="showPaymentsModal(${client.id})">Платежи</button>
                    ${client.courtDate ? `<span class="ms-2">${new Date(client.courtDate).toLocaleDateString('ru-RU')}</span>` : ''}
                    ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="client-link ms-2">Суд</a>` : ''}
                </div>
            </div>
        `;
        li.onclick = (event) => {
            if (!event.target.closest('a') && !event.target.closest('.toggle-details') && !event.target.closest('.client-details')) {
                window.location.href = `client-card.html?id=${client.id}`;
            }
        };
        courtThisMonthDiv.appendChild(li);
    });

    courtThisMonthDiv.addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.toggle-details');
        if (toggleBtn) {
            event.stopPropagation();
            const details = toggleBtn.closest('li').querySelector('.client-details');
            const isOpen = details.classList.toggle('open');
            toggleBtn.classList.toggle('open', isOpen);
            if (isOpen) {
                details.style.maxHeight = '0px';
                requestAnimationFrame(() => {
                    details.style.maxHeight = details.scrollHeight + 'px';
                });
            } else {
                details.style.maxHeight = '0';
            }
        }
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
    ul.className = 'list-group';

    clients.forEach(client => {
        const li = document.createElement('li');
        li.className = 'list-group-item clickable-item';
        li.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <span>${client.firstName} ${client.lastName}${getCourtTypeBadge(client)}</span>
                <div>
                    ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="arbitr-icon" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</a>` : `<span class="arbitr-icon disabled" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</span>`}
                    <button class="toggle-details" data-client="${client.id}"><i class="ri-arrow-down-s-line"></i></button>
                </div>
            </div>
            <div class="client-details">
                ${client.subStage ? `<ul class="task-info mb-0"><li>${client.subStage}</li></ul>` : '<span></span>'}
                <div class="client-actions">
                    <button class="client-btn client-btn-payments" onclick="showPaymentsModal(${client.id})">Платежи</button>
                    ${client.stage === 'Завершение' && client.subStage === 'ждем доки от суда' ? `<button class="client-btn client-btn-complete" onclick="completeClient(${client.id})">Завершить</button>` : ''}
                </div>
            </div>
        `;
        li.onclick = (event) => {
            if (!event.target.closest('a') && !event.target.closest('.toggle-details') && !event.target.closest('.client-details')) {
                window.location.href = `client-card.html?id=${client.id}`;
            }
        };
        ul.appendChild(li);
    });

    ul.addEventListener('click', (event) => {
        const toggleBtn = event.target.closest('.toggle-details');
        if (toggleBtn) {
            event.stopPropagation();
            const details = toggleBtn.closest('li').querySelector('.client-details');
            const isOpen = details.classList.toggle('open');
            toggleBtn.classList.toggle('open', isOpen);
            if (isOpen) {
                details.style.maxHeight = '0px';
                requestAnimationFrame(() => {
                    details.style.maxHeight = details.scrollHeight + 'px';
                });
            } else {
                details.style.maxHeight = '0';
            }
        }
    });

    listDiv.appendChild(ul);
}

// Инициализация чекбоксов оплаты для edit-client.html
function initPaymentMonthsCheckboxes(paidMonths) {
    const paymentMonths = paidMonths ? paidMonths.length : 0;
    const container = document.getElementById('paidMonthsContainer');
    container.innerHTML = '';
    for (let i = 1; i <= paymentMonths; i++) {
        container.innerHTML += `
            <div class="form-check form-check-inline">
                <input class="form-check-input" type="checkbox" id="paidMonth${i}" ${paidMonths[i-1] ? 'checked' : ''}>
                <label class="form-check-label" for="paidMonth${i}">Месяц ${i}</label>
            </div>
        `;
    }
}

// Загрузка клиента для редактирования
function loadClientForEdit(clientId) {
    console.log('Загрузка клиента с ID:', clientId);
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === parseInt(clientId));
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

    initPaymentMonthsCheckboxes(client.paidMonths);
    // Инициализация задач
    window.tasks = client.tasks || [];
    renderTaskList();
}

// Загрузка клиента для карточки
function loadClientCard(clientId) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === parseInt(clientId));
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
    tbody.innerHTML = '';
    if (schedule.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center">Нет данных</td></tr>';
        return;
    }
    schedule.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(p.date).toLocaleDateString('ru-RU')}</td><td>${p.amount}</td><td>${p.paid ? 'Оплачен' : 'Не оплачен'}</td>`;
        tbody.appendChild(tr);
    });
}

// Обновление клиента
function updateClient() {
    console.log('Обновление клиента');
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = parseInt(urlParams.get('id'));
    if (!clientId) {
        console.error('Клиент не найден: отсутствует ID');
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const existingClient = clients.find(c => c.id === clientId);
    if (!existingClient) {
        console.error('Клиент не найден в localStorage:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const paymentMonths = parseInt(document.getElementById('paymentMonths').value) || 0;
    const paidMonths = [];
    for (let i = 1; i <= paymentMonths; i++) {
        const checkbox = document.getElementById(`paidMonth${i}`);
        paidMonths.push(checkbox ? checkbox.checked : false);
    }

    const updatedClient = {
        id: clientId,
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

    const index = clients.findIndex(c => c.id === clientId);
    if (index !== -1) {
        clients[index] = updatedClient;
        localStorage.setItem('clients', JSON.stringify(clients));
        console.log('Клиент обновлен:', updatedClient);
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
    console.log('Удаление клиента');
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = parseInt(urlParams.get('id'));
    if (!clientId) {
        console.error('Клиент не найден: отсутствует ID');
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => c.id === clientId);
    if (clientIndex === -1) {
        console.error('Клиент не найден в localStorage:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
        return;
    }

    if (confirm('Вы уверены, что хотите удалить этого клиента?')) {
        clients.splice(clientIndex, 1);
        localStorage.setItem('clients', JSON.stringify(clients));
        console.log('Клиент удален:', clientId);
        const returnUrl = document.referrer || 'index.html';
        window.location.href = returnUrl;
    }
}

// Сохранение клиента
function saveClient() {
    console.log('Сохранение клиента');
    const client = {
        id: Date.now(),
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
        courtDepositPaid: false
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
    console.log('Клиент сохранен:', client);
    window.location.href = 'index.html';
}

// Поиск клиентов
function searchClients() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '';

    if (!query) {
        resultsDiv.innerHTML = '<li class="list-group-item text-center">Введите имя или номер дела</li>';
        return;
    }

    const filteredClients = clients.filter(client =>
        client.firstName.toLowerCase().includes(query) ||
        client.lastName.toLowerCase().includes(query) ||
        (client.caseNumber && client.caseNumber.toLowerCase().includes(query))
    ).sort((a, b) => Number(b.favorite) - Number(a.favorite));

    if (filteredClients.length === 0) {
        resultsDiv.innerHTML = '<li class="list-group-item text-center">Клиенты не найдены</li>';
        return;
    }

    filteredClients.forEach(client => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item clickable-item d-flex justify-content-between align-items-center';
        const stageClass = stageColorClasses[client.stage] || '';
        const stageBadge = client.stage ? `<span class="stage-badge ${stageClass}">${client.stage}${client.subStage ? ' - ' + client.subStage : ''}</span>` : '';
        listItem.innerHTML = `
            ${client.favorite ? '<i class="ri-star-fill favorite-icon"></i>' : ''}${client.firstName} ${client.lastName}${getCourtTypeBadge(client)}${stageBadge}
            <div>
                <button class="client-btn client-btn-payments me-2" onclick="showPaymentsModal(${client.id})" title="Общая сумма: ${client.totalAmount || 0} руб.">Платежи</button>
                ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="arbitr-icon" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</a>` : `<span class="arbitr-icon disabled" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</span>`}
            </div>
        `;
        listItem.onclick = (event) => {
            if (!event.target.closest('a') && !event.target.closest('button')) {
                window.location.href = `client-card.html?id=${client.id}`;
            }
        };
        resultsDiv.appendChild(listItem);
    });
}

// Генерация PDF договора (заглушка)
function generateContractPDF() {
    console.log('Функция generateContractPDF временно на заглушке');
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
        li.innerHTML = `Консультация: ${consult.name} <button class="btn btn-sm btn-primary" onclick="convertToClient(${consult.id}, '${dateStr}')">Преобразовать в клиента</button>`;
        list.appendChild(li);
    });

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `list-group-item d-flex justify-content-between align-items-center task-${task.priority}`;
        li.innerHTML = `${task.text} (${task.clientName}) <button class="btn btn-sm btn-primary" onclick="completeTaskFromCalendar(${task.clientId}, ${task.id}, '${dateStr}')">Выполнено</button>`;
        list.appendChild(li);
    });

    payments.forEach(p => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center';
        li.innerHTML = `Оплата: ${p.client.firstName} ${p.client.lastName} (${p.payment.amount} ₽) <button class="btn btn-sm btn-primary" onclick="confirmPayment(${p.client.id}, ${p.idx}, '${dateStr}')">Оплатил</button>`;
        list.appendChild(li);
    });

    courts.forEach(client => {
        const li = document.createElement('li');
        li.className = 'list-group-item clickable-item d-flex justify-content-between align-items-center';
        const stageClass = stageColorClasses[client.stage] || '';
        const stageBadge = client.stage ? `<span class="stage-badge ${stageClass}">${client.stage}${client.subStage ? ' - ' + client.subStage : ''}</span>` : '';
        li.innerHTML = `${client.firstName} ${client.lastName}${stageBadge}`;
        li.onclick = () => { window.location.href = `client-card.html?id=${client.id}`; };
        list.appendChild(li);
    });
}

function confirmPayment(clientId, paymentIndex, dateStr) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === clientId);
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
        li.innerHTML = `${d.client.firstName} ${d.client.lastName} — ${new Date(d.payment.date).toLocaleDateString('ru-RU')} <button class="btn btn-sm btn-primary" onclick="confirmPayment(${d.client.id}, ${d.idx}, '${d.payment.date}')">Оплатил</button>`;
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
                        backgroundColor: '#0d6efd',
                        extendedProps: { type: 'client', clientId: client.id }
                    }));
            // --- ДОБАВИТЬ задачи как события ---
            const taskEvents = clients
                .filter(client => client.tasks && Array.isArray(client.tasks))
                .flatMap(client => client.tasks
                    .filter(task => task.deadline)
                    .map(task => ({
                        title: `Задача: ${task.text} (${client.firstName} ${client.lastName})`,
                        start: task.deadline,
                        backgroundColor: task.priority === 'high' ? '#ff0000' : (task.priority === 'medium' ? '#ffc107' : '#28a745'),
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
            renderDayActions(info.dateStr);
        },
        eventClick: function(info) {
            renderDayActions(info.event.startStr);
        }
    });
    calendar.render();
    markDaysWithEvents();
    calendar.on('eventsSet', markDaysWithEvents);

    function markDaysWithEvents() {
        const dayCells = document.querySelectorAll('.fc-daygrid-day');
        dayCells.forEach(cell => {
            const dateStr = cell.getAttribute('data-date');
            const hasEvent = calendar.getEvents().some(ev => ev.startStr === dateStr);
            cell.classList.toggle('fc-has-events', hasEvent);
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
                li.className = `list-group-item d-flex justify-content-between align-items-center task-${task.priority}`;
                li.innerHTML = `${task.text} (${task.clientName}) <span class="badge bg-${task.priority === 'high' ? 'danger' : (task.priority === 'medium' ? 'warning' : 'success')}">${task.deadline}</span>`;
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
                li.innerHTML = `
                    ${consult.name} (Тел: ${consult.phone})
                    <button class="btn btn-sm btn-primary" onclick="convertToClient(${consult.id}, '${dateStr}')">Преобразовать в клиента</button>
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
        if (clients[i].id === clientId) {
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
function showArchivedClients() {
    const listEl = document.getElementById('archivedClientsList');
    if (!listEl) return;
    const archivedClients = JSON.parse(localStorage.getItem('archivedClients')) || [];
    listEl.innerHTML = '';
    if (archivedClients.length === 0) {
        listEl.innerHTML = '<li class="list-group-item">Архив пуст</li>';
    } else {
        archivedClients.forEach(client => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = `${client.firstName} ${client.lastName}`;
            listEl.appendChild(li);
        });
    }
    const modalEl = document.getElementById('archivedClientsModal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

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

// --- Для edit-client.html ---
// Инициализация задач для клиента
function initTaskList(clientId) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === parseInt(clientId));
    window.tasks = client && Array.isArray(client.tasks) ? client.tasks : [];
    renderTaskList();
    renderCompletedTasks();
}
function addTask() {
    const text = document.getElementById('taskText').value.trim();
    const priorityEl = document.getElementById('taskPriority');
    const priority = priorityEl ? priorityEl.value : 'medium';
    const deadline = document.getElementById('taskDeadline').value;
    if (!text) {
        alert('Введите текст задачи!');
        return;
    }
    const task = {
        id: Date.now(),
        text,
        priority,
        deadline,
        completed: false
    };
    window.tasks.push(task);
      renderTaskList();
      renderCompletedTasks();
    document.getElementById('taskText').value = '';
    document.getElementById('taskDeadline').value = '';
    // Сохраняем задачи в клиенте
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = parseInt(urlParams.get('id'));
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => c.id === clientId);
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
        li.className = `list-group-item d-flex justify-content-between align-items-center task-${task.priority}`;
        li.innerHTML = `
            ${task.text} (${task.deadline ? task.deadline : 'Без срока'})
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
    const clientId = parseInt(urlParams.get('id'));
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => c.id === clientId);
    if (clientIndex !== -1) {
        clients[clientIndex].tasks = window.tasks;
        localStorage.setItem('clients', JSON.stringify(clients));
    }
}

function completeTask(idx) {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = parseInt(urlParams.get('id'));
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => c.id === clientId);
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
    const clientId = parseInt(urlParams.get('id'));
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === clientId);
    if (stageInfo && client) {
        stageInfo.textContent = client.stage ? `Этап: ${client.stage}${client.subStage ? ' - ' + client.subStage : ''}` : '';
    }
    if (!list) return;
    list.innerHTML = '';
    window.tasks.filter(t => t.completed).forEach(task => {
        const li = document.createElement('li');
        li.className = `list-group-item task-${task.priority}`;
        li.textContent = `${task.text} (${task.completedAt ? new Date(task.completedAt).toLocaleDateString('ru-RU') : ''})`;
        list.appendChild(li);
    });
}

function openHistoryModal() {
    renderCompletedTasks();
    const modalEl = document.getElementById('historyModal');
    if (!modalEl) return;
    const modal = new bootstrap.Modal(modalEl);
    modal.show();
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
    const clientIndex = clients.findIndex(c => c.id === clientId);
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
    const clientId = parseInt(urlParams.get('id'));
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientIndex = clients.findIndex(c => c.id === clientId);
    if (clientIndex === -1) return;
    const client = clients[clientIndex];
    if (!Array.isArray(client.tasks)) client.tasks = [];
    if (client.subStage) {
        client.tasks.push({
            id: Date.now(),
            text: client.subStage,
            priority: 'medium',
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
                        <label for="calendarTaskPriority" class="form-label">Приоритет</label>
                        <select id="calendarTaskPriority" class="form-select">
                            <option value="low">Низкая</option>
                            <option value="medium">Средняя</option>
                            <option value="high">Высокая</option>
                        </select>
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
        const clientId = parseInt(document.getElementById('calendarTaskClient').value);
        const text = document.getElementById('calendarTaskText').value.trim();
        const priority = document.getElementById('calendarTaskPriority').value;
        const date = document.getElementById('calendarTaskDate').value || dateStr;
        if (!text) {
            alert('Введите текст задачи!');
            return;
        }
        if (!date) {
            alert('Выберите дату задачи!');
            return;
        }
        let client = clients.find(c => c.id === clientId);
        if (!client) {
            alert('Клиент не найден!');
            return;
        }
        let task = {
            id: Date.now(),
            text,
            priority,
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
    const client = clients.find(c => c.id === clientId);
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

// Сохранение консультации
window.saveConsultation = function() {
    const nameInput = document.getElementById('consultName');
    const phoneInput = document.getElementById('consultPhone');
    const dateInput = document.getElementById('consultDate');

    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const date = dateInput.value;

    if (!name || !phone || !date) {
        alert('Заполните все поля и выберите дату консультации!');
        return;
    }

    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
    consultations.push({ id: Date.now(), name, phone, date });
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
};

// --- вернуть функцию назначения консультации ---
window.convertToClient = function(consultId, dateStr) {
    const consultations = JSON.parse(localStorage.getItem('consultations')) || [];
    const consult = consultations.find(c => c.id === consultId);
    if (!consult) return;
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    clients.push({
        id: Date.now(),
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
        courtDepositPaid: false
    });
    localStorage.setItem('clients', JSON.stringify(clients));
    // Удалить консультацию
    const idx = consultations.findIndex(c => c.id === consultId);
    if (idx !== -1) {
        consultations.splice(idx, 1);
        localStorage.setItem('consultations', JSON.stringify(consultations));
    }
    renderDayActions(dateStr);
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
    

