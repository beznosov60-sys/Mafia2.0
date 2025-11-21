(function() {
    function initAddClientPage() {
        const form = document.getElementById('clientForm');
        if (!form) {
            return;
        }

        setupFormValidation(form);
        setupStageSelect();
        setupArbitrationLink();
    }

    function setupFormValidation(form) {
        const requiredFields = ['lastName', 'firstName', 'middleName', 'totalAmount', 'paymentStartDate'];

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!validateRequiredFields(requiredFields)) {
                return;
            }
            saveClient();
        });

        requiredFields.forEach((id) => {
            const field = document.getElementById(id);
            field?.addEventListener('input', () => field.classList.remove('is-invalid'));
        });
    }

    function setupStageSelect() {
        const stageSelect = document.getElementById('stage');
        const subStageSelect = document.getElementById('subStage');
        if (!stageSelect || !subStageSelect) {
            return;
        }
        stageSelect.addEventListener('change', () => {
            updateSubStageOptions(stageSelect.value, subStageSelect);
        });
        updateSubStageOptions(stageSelect.value, subStageSelect);
    }

    function validateRequiredFields(ids) {
        let isValid = true;
        ids.forEach((id) => {
            const field = document.getElementById(id);
            if (!field) {
                return;
            }
            const hasValue = Boolean(field.value.trim());
            field.classList.toggle('is-invalid', !hasValue);
            if (!hasValue) {
                isValid = false;
                field.focus();
            }
        });
        return isValid;
    }

    function setupArbitrationLink() {
        const arbitrInput = document.getElementById('arbitrLink');
        const arbitrButton = document.getElementById('arbitrButton');
        const courtDateInput = document.getElementById('courtDate');
        if (!arbitrInput || !arbitrButton) {
            return;
        }
        arbitrButton.addEventListener('click', openArbitrLink);
        const updateButton = () => {
            arbitrButton.disabled = !arbitrInput.value.trim();
            updateArbitrButtonTitle(arbitrButton, courtDateInput?.value || '');
        };
        arbitrInput.addEventListener('input', updateButton);
        courtDateInput?.addEventListener('input', updateButton);
        updateButton();
    }

    if (window.__crmAppReady) {
        initAddClientPage();
    } else {
        window.addEventListener('app-ready', initAddClientPage, { once: true });
    }
})();
