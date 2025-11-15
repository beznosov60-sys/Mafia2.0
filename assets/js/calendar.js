(function() {
    function initCalendarPage() {
        const calendarElement = document.getElementById('calendar');
        if (!calendarElement) {
            return;
        }

        if (!window.FullCalendar) {
            console.error('FullCalendar не загружен!');
        }

        initCalendar();
        renderDayActions(new Date().toISOString().split('T')[0]);
        bindToolbarActions();
    }

    function bindToolbarActions() {
        const debtorsBtn = document.getElementById('calendarDebtorsBtn');
        const clientsBtn = document.getElementById('dayClientBtn');
        const taskBtn = document.getElementById('dayTaskBtn');
        const consultBtn = document.getElementById('dayConsultBtn');

        debtorsBtn?.addEventListener('click', () => {
            openDebtorsModal();
        });
        clientsBtn?.addEventListener('click', () => {
            openClientsModal();
        });
        taskBtn?.addEventListener('click', () => {
            const currentDate = document.getElementById('dayActionsList')?.dataset.currentDate;
            showAddTaskModal(currentDate);
        });
        consultBtn?.addEventListener('click', () => {
            const modalEl = document.getElementById('addConsultationModal');
            if (!modalEl) {
                return;
            }
            const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
            const currentDate = document.getElementById('dayActionsList')?.dataset.currentDate;
            if (currentDate) {
                const dateInput = document.getElementById('consultDate');
                if (dateInput) {
                    dateInput.value = currentDate;
                }
            }
            modal.show();
        });
    }

    if (window.__crmAppReady) {
        initCalendarPage();
    } else {
        window.addEventListener('app:ready', initCalendarPage, { once: true });
    }
})();
