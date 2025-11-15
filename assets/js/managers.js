(function() {
    function initManagersPage() {
        const root = document.getElementById('managersRoot') || document.getElementById('createManagerBtn');
        if (!root) {
            return;
        }
        renderManagersPage();
        bindActions();
    }

    function bindActions() {
        document.getElementById('createManagerBtn')?.addEventListener('click', openCreateManagerModal);
        document.getElementById('saveManagerBtn')?.addEventListener('click', saveManager);
        document.getElementById('saveAssignedClientBtn')?.addEventListener('click', saveAssignedClient);
        document.getElementById('saveManagerPaymentBtn')?.addEventListener('click', saveManagerPayment);
        document.getElementById('issueManagerSalaryBtn')?.addEventListener('click', issueManagerSalary);
        document.getElementById('managerSalaryDate')?.addEventListener('change', () => updateManagerSalaryUI());
        const hasSalaryCheckbox = document.getElementById('managerHasSalary');
        if (hasSalaryCheckbox) {
            hasSalaryCheckbox.addEventListener('change', (event) => {
                const wrapper = document.getElementById('managerSalaryWrapper');
                if (wrapper) {
                    wrapper.style.display = event.target.checked ? '' : 'none';
                }
            });
        }
    }

    if (window.__crmAppReady) {
        initManagersPage();
    } else {
        window.addEventListener('app:ready', initManagersPage, { once: true });
    }
})();
