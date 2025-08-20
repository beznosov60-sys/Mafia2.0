document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, инициализация...');
    // Инициализация данных
    if (!localStorage.getItem('clients')) {
        localStorage.setItem('clients', JSON.stringify([]));
    }
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
        document.getElementById('sidebarRefresh')?.addEventListener('click', displayClientsByMonth);
        document.getElementById('stageFilter')?.addEventListener('change', displayClientsByMonth);
        displayClientsByMonth();
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
        const documentsCheckbox = document.getElementById('documentsCollected');
        const documentsIcon = document.getElementById('documentsIcon');
        arbitrButton.addEventListener('click', openArbitrLink);
        arbitrInput.addEventListener('input', () => {
            arbitrButton.disabled = !arbitrInput.value.trim();
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        courtDateInput.addEventListener('input', () => {
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        documentsCheckbox.addEventListener('change', () => {
            documentsIcon.textContent = documentsCheckbox.checked ? '✅' : '☐';
        });
        initTaskList(clientId);
    }
    // Инициализация кнопки арбитр и чекбокса документов на add-client.html
    if (window.location.pathname.includes('add-client.html')) {
        const arbitrInput = document.getElementById('arbitrLink');
        const arbitrButton = document.getElementById('arbitrButton');
        const courtDateInput = document.getElementById('courtDate');
        const documentsCheckbox = document.getElementById('documentsCollected');
        const documentsIcon = document.getElementById('documentsIcon');
        arbitrButton.addEventListener('click', openArbitrLink);
        arbitrInput.addEventListener('input', () => {
            arbitrButton.disabled = !arbitrInput.value.trim();
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        courtDateInput.addEventListener('input', () => {
            updateArbitrButtonTitle(arbitrButton, courtDateInput.value);
        });
        documentsCheckbox.addEventListener('change', () => {
            documentsIcon.textContent = documentsCheckbox.checked ? '✅' : '☐';
        });
    }
    // Инициализация календаря (только на calendar.html)
    if (window.location.pathname.includes('calendar.html')) {
        initCalendar();
        document.getElementById('addConsultationBtn')?.addEventListener('click', () => {
            const modal = new bootstrap.Modal(document.getElementById('addConsultationModal'));
            modal.show();
        });
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
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item clickable-item d-flex justify-content-between align-items-center';
        listItem.innerHTML = `
            ${client.favorite ? '<span class="favorite-icon">★</span>' : ''}${client.firstName} ${client.lastName} ${client.documentsCollected ? '<span class="documents-icon">✅</span>' : ''}
            <div>
                <button class="btn btn-sm btn-info me-2" onclick="showPaymentsModal(${client.id})" title="Общая сумма: ${client.totalAmount || 0} руб.">Платежи</button>
                ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="arbitr-icon" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</a>` : `<span class="arbitr-icon disabled" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</span>`}
            </div>
        `;
        listItem.onclick = (event) => {
            if (!event.target.closest('a') && !event.target.closest('button')) {
                window.location.href = `edit-client.html?id=${client.id}`;
            }
        };
        courtThisMonthDiv.appendChild(listItem);
    });
}

// Отображение клиентов по месяцам в боковой панели
function displayClientsByMonth() {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const clientsByMonthDiv = document.getElementById('clientsByMonth');
    if (!clientsByMonthDiv) return;

    const stageFilter = document.getElementById('stageFilter').value;

    // Фильтрация по этапу
    let filteredClients = clients;
    if (stageFilter) {
        filteredClients = clients.filter(client => client.stage === stageFilter);
    }

    // Сортировка: избранные сначала, затем по фамилии и имени
    filteredClients.sort((a, b) => {
        const favDiff = Number(b.favorite) - Number(a.favorite);
        if (favDiff !== 0) return favDiff;
        const nameA = `${a.lastName} ${a.firstName}`.toLowerCase();
        const nameB = `${b.lastName} ${b.firstName}`.toLowerCase();
        return nameA.localeCompare(nameB, 'ru');
    });

    // Сгруппировка по месяцам
    const groupedClients = {};
    const months = [
        'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
    ];

    filteredClients.forEach(client => {
        let key = 'Без даты суда';
        let sortKey = '9999-99';
        if (client.courtDate) {
            const courtDate = new Date(client.courtDate);
            key = `${months[courtDate.getMonth()]} ${courtDate.getFullYear()}`;
            sortKey = `${courtDate.getFullYear()}-${courtDate.getMonth().toString().padStart(2, '0')}`;
        }
        if (!groupedClients[key]) {
            groupedClients[key] = { clients: [], sortKey };
        }
        groupedClients[key].clients.push(client);
    });

    clientsByMonthDiv.innerHTML = '';
    Object.keys(groupedClients).sort((a, b) => {
        const sortKeyA = groupedClients[a].sortKey;
        const sortKeyB = groupedClients[b].sortKey;
        return sortKeyB.localeCompare(sortKeyA);
    }).forEach(month => {
        const monthGroup = document.createElement('div');
        monthGroup.className = 'month-group';
        monthGroup.innerHTML = `<h6>${month}</h6>`;
        const ul = document.createElement('ul');
        ul.className = 'list-group';
        groupedClients[month].clients.forEach(client => {
            const li = document.createElement('li');
            li.className = 'list-group-item clickable-item d-flex justify-content-between align-items-center';
            li.draggable = true;
            li.dataset.clientId = client.id;
            li.innerHTML = `
                ${client.favorite ? '<span class="favorite-icon">★</span>' : ''}${client.firstName} ${client.lastName} ${client.documentsCollected ? '<span class="documents-icon">✅</span>' : ''}
                <div class="d-flex flex-wrap align-items-center">
                    <button class="btn btn-sm btn-info me-2" onclick="showPaymentsModal(${client.id})" title="Общая сумма: ${client.totalAmount || 0} руб.">Платежи</button>
                    ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="arbitr-icon" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</a>` : `<span class="arbitr-icon disabled" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</span>`}
                    ${client.stage === 'Завершение' ? `<button class="btn btn-complete ms-2" onclick="completeClient(${client.id})">Завершить</button>` : ''}
                </div>
            `;
            li.onclick = (event) => {
                if (!event.target.closest('a') && !event.target.closest('button')) {
                    window.location.href = `edit-client.html?id=${client.id}`;
                }
            };
            li.addEventListener('dragstart', (event) => {
                event.dataTransfer.setData('text/plain', client.id);
                li.classList.add('dragging');
            });
            li.addEventListener('dragend', (event) => {
                li.classList.remove('dragging');
            });
            ul.appendChild(li);
        });
        ul.addEventListener('dragover', (event) => {
            event.preventDefault();
        });
        ul.addEventListener('drop', (event) => {
            event.preventDefault();
            const clientId = event.dataTransfer.getData('text/plain');
            const targetMonth = month === 'Без даты суда' ? null : month;
            updateClientStageOnDrop(clientId, targetMonth, ul);
        });
        monthGroup.appendChild(ul);
        clientsByMonthDiv.appendChild(monthGroup);
    });

    if (Object.keys(groupedClients).length === 0) {
        clientsByMonthDiv.innerHTML = '<p class="text-center">Нет клиентов</p>';
    }
}

// Обновление этапа клиента при перетаскивании
function updateClientStageOnDrop(clientId, targetMonth, targetUl) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === parseInt(clientId));
    if (!client) return;

    const stageModal = document.createElement('div');
    stageModal.className = 'modal fade';
    stageModal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Выберите новый этап для ${client.firstName} ${client.lastName}</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <select class="form-select" id="newStage">
                        <option value="" disabled selected>Выберите этап</option>
                        <option value="Договор">Договор</option>
                        <option value="Заявление">Заявление</option>
                        <option value="В суде">В суде</option>
                        <option value="Ждёт решение">Ждёт решение</option>
                        <option value="Завершение">Завершение</option>
                    </select>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-success" onclick="applyNewStage(${clientId})">Сохранить</button>
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Отмена</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(stageModal);
    const modalInstance = new bootstrap.Modal(stageModal);
    modalInstance.show();

    window.applyNewStage = function(clientId) {
        const newStage = document.getElementById('newStage').value;
        if (!newStage) {
            alert('Выберите этап!');
            return;
        }
        const clients = JSON.parse(localStorage.getItem('clients')) || [];
        const clientIndex = clients.findIndex(c => c.id === parseInt(clientId));
        if (clientIndex !== -1) {
            clients[clientIndex].stage = newStage;
            localStorage.setItem('clients', JSON.stringify(clients));
            displayClientsByMonth();
            modalInstance.hide();
        }
    };
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
    document.getElementById('arbitrLink').value = client.arbitrLink || '';
    document.getElementById('caseNumber').value = client.caseNumber || '';
    document.getElementById('stage').value = client.stage;
    document.getElementById('courtDate').value = client.courtDate || '';
    document.getElementById('notes').value = client.notes || '';
    document.getElementById('documentsCollected').checked = client.documentsCollected || false;
    document.getElementById('documentsIcon').textContent = client.documentsCollected ? '✅' : '☐';

    const favoriteBtn = document.getElementById('favoriteBtn');
    if (favoriteBtn) {
        favoriteBtn.dataset.favorite = client.favorite ? 'true' : 'false';
        favoriteBtn.textContent = client.favorite ? '★' : '☆';
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
        arbitrLink: document.getElementById('arbitrLink').value.trim(),
        caseNumber: document.getElementById('caseNumber').value.trim(),
        stage: document.getElementById('stage').value,
        courtDate: document.getElementById('courtDate').value,
        notes: document.getElementById('notes').value.trim(),
        documentsCollected: document.getElementById('documentsCollected').checked,
        favorite: document.getElementById('favoriteBtn')?.dataset.favorite === 'true',
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
        window.location.href = 'index.html';
    } else {
        console.error('Клиент не найден в localStorage:', clientId);
        alert('Клиент не найден!');
        window.location.href = 'index.html';
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
        window.location.href = 'index.html';
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
        paidMonths: new Array(parseInt(document.getElementById('paymentMonths').value) || 0).fill(false),
        arbitrLink: document.getElementById('arbitrLink').value.trim(),
        caseNumber: document.getElementById('caseNumber').value.trim(),
        stage: document.getElementById('stage').value,
        courtDate: document.getElementById('courtDate').value,
        notes: document.getElementById('notes').value.trim(),
        documentsCollected: document.getElementById('documentsCollected').checked,
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
        listItem.innerHTML = `
            ${client.favorite ? '<span class="favorite-icon">★</span>' : ''}${client.firstName} ${client.lastName} ${client.documentsCollected ? '<span class="documents-icon">✅</span>' : ''}
            <div>
                <button class="btn btn-sm btn-info me-2" onclick="showPaymentsModal(${client.id})" title="Общая сумма: ${client.totalAmount || 0} руб.">Платежи</button>
                ${client.arbitrLink ? `<a href="${client.arbitrLink}" target="_blank" class="arbitr-icon" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</a>` : `<span class="arbitr-icon disabled" title="${client.courtDate ? `Дата суда: ${new Date(client.courtDate).toLocaleDateString('ru-RU')}` : ''}">◉</span>`}
            </div>
        `;
        listItem.onclick = (event) => {
            if (!event.target.closest('a') && !event.target.closest('button')) {
                window.location.href = `edit-client.html?id=${client.id}`;
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

function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    const debugEl = document.getElementById('calendarDebug');
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
                    title: `${client.firstName} ${client.lastName} (${client.stage})`,
                    start: client.courtDate,
                    backgroundColor: client.documentsCollected ? '#28a745' : '#dc3545',
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
            const allEvents = [...clientEvents, ...taskEvents, ...consultationEvents];
            successCallback(allEvents);
        },
        eventContent: function(arg) {
            // Показываем точку и текст задачи
            return { html: `<div class="event-dot" style="background-color: ${arg.event.backgroundColor}; display:inline-block; margin-right:4px;"></div><span style="font-size:0.9em">${arg.event.title}</span>` };
        },
        dateClick: function(info) {
            showClientsForDate(info.dateStr);
        },
        eventClick: function(info) {
            showClientsForDate(info.event.startStr);
        }
    });
    calendar.render();
    // Сохраняем ссылку для обновления событий
    calendarEl._fullCalendar = calendar;
    if (debugEl) {
        const events = calendar.getEvents();
        debugEl.textContent = `Загружено событий: ${events.length}`;
        debugEl.style.display = 'block';
    }
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
                li.innerHTML = `${client.firstName} ${client.lastName} (${client.stage}) ${client.documentsCollected ? '<span class="documents-icon">✅</span>' : ''}`;
                li.onclick = () => {
                    window.location.href = `edit-client.html?id=${client.id}`;
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
                    <button class="btn btn-sm btn-success" onclick="convertToClient(${consult.id}, '${dateStr}')">Преобразовать в клиента</button>
                `;
                consultationsList.appendChild(li);
            });
        }
    }

    // Кнопка добавить задачу
    const addTaskBtn = document.getElementById('addTaskBtn');
    if (addTaskBtn) {
        addTaskBtn.onclick = function() {
            showAddTaskModal(dateStr);
        };
    }

    if (modal) {
        const modalInstance = new bootstrap.Modal(modal);
        modalInstance.show();
    }
}

// Модальное окно для добавления задачи (простая реализация через prompt)
function showAddTaskModal(dateStr) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    if (clients.length === 0) {
        alert('Нет клиентов для добавления задачи!');
        return;
    }
    let modalDiv = document.createElement('div');
    modalDiv.className = 'modal fade';
    modalDiv.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Добавить задачу на ${new Date(dateStr).toLocaleDateString('ru-RU')}</h5>
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
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-success" id="calendarTaskSaveBtn">Сохранить</button>
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
        if (!text) {
            alert('Введите текст задачи!');
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
            deadline: dateStr,
            completed: false
        };
        if (!Array.isArray(client.tasks)) client.tasks = [];
        client.tasks.push(task);
        localStorage.setItem('clients', JSON.stringify(clients));
        modalInstance.hide();
        // Не вызываем showClientsForDate здесь!
        // modalDiv.remove(); // удалится ниже
        if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
            document.getElementById('calendar')._fullCalendar.refetchEvents();
        }
    };

    modalDiv.addEventListener('hidden.bs.modal', () => {
        modalDiv.remove();
        showClientsForDate(dateStr);
    });
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
    clients[clientIndex].completedAt = new Date().toISOString();

    // Переносим клиента в архив
    archivedClients.push(clients[clientIndex]);
    clients.splice(clientIndex, 1);

    localStorage.setItem('clients', JSON.stringify(clients));
    localStorage.setItem('archivedClients', JSON.stringify(archivedClients));

    showToast('Клиент перемещён в архив!');
    displayClientsByMonth();
}

// Для будущего: функция отображения архива
function displayArchivedClients() {
    const archivedClients = JSON.parse(localStorage.getItem('archivedClients')) || [];
    // ...реализация вывода архива по вашему желанию...
}

// --- Для edit-client.html ---
// Инициализация задач для клиента
function initTaskList(clientId) {
    const clients = JSON.parse(localStorage.getItem('clients')) || [];
    const client = clients.find(c => c.id === parseInt(clientId));
    window.tasks = client && Array.isArray(client.tasks) ? client.tasks : [];
    renderTaskList();
}
function addTask() {
    const text = document.getElementById('taskText').value.trim();
    const priority = document.getElementById('taskPriority').value;
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
        const li = document.createElement('li');
        li.className = `list-group-item d-flex justify-content-between align-items-center task-${task.priority}`;
        li.innerHTML = `
            ${task.text} (${task.deadline ? task.deadline : 'Без срока'}) 
            <button class="btn btn-sm btn-danger" onclick="removeTask(${idx})">Удалить</button>
        `;
        list.appendChild(li);
    });
}
function removeTask(idx) {
    window.tasks.splice(idx, 1);
    renderTaskList();
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
    modalDiv.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Добавить задачу на ${new Date(dateStr).toLocaleDateString('ru-RU')}</h5>
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
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-success" id="calendarTaskSaveBtn">Сохранить</button>
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
        if (!text) {
            alert('Введите текст задачи!');
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
            deadline: dateStr,
            completed: false
        };
        if (!Array.isArray(client.tasks)) client.tasks = [];
        client.tasks.push(task);
        localStorage.setItem('clients', JSON.stringify(clients));
        modalInstance.hide();
        // Не вызываем showClientsForDate здесь!
        // modalDiv.remove(); // удалится ниже
        if (window.FullCalendar && document.getElementById('calendar')._fullCalendar) {
            document.getElementById('calendar')._fullCalendar.refetchEvents();
        }
    };

    modalDiv.addEventListener('hidden.bs.modal', () => {
        modalDiv.remove();
        showClientsForDate(dateStr);
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
    if (client.paymentMonths && client.paymentMonths > 0) {
        for (let i = 0; i < client.paymentMonths; i++) {
            paymentsTableBody.innerHTML += `
                <tr>
                    <td>Месяц ${i + 1}</td>
                    <td>${client.paymentStartDate ? new Date(client.paymentStartDate).toLocaleDateString('ru-RU') : '-'}</td>
                    <td>${client.totalAmount ? Math.round(client.totalAmount / client.paymentMonths) : '-'}</td>
                    <td>${client.paidMonths && client.paidMonths[i] ? 'Оплачен' : 'Не оплачен'}</td>
                </tr>
            `;
        }
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
            showClientsForDate(date);
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
        courtDate: dateStr,
        notes: '',
        documentsCollected: false,
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
    showClientsForDate(dateStr);
};
    

