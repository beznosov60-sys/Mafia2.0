(function() {
    function initAddClientPage() {
        const stepContainer = document.getElementById('step1');
        if (!stepContainer) {
            return;
        }

        setupStepNavigation();
        setupStageSelect();
        setupArbitrationLink();
    }

    function setupStepNavigation() {
        const steps = Array.from(document.querySelectorAll('.form-step'));
        const indicators = Array.from(document.querySelectorAll('.step-indicator .step'));
        if (steps.length === 0 || indicators.length === 0) {
            return;
        }

        const validateStep = (index) => {
            if (index === 0) {
                return validateRequiredFields(['lastName', 'firstName', 'middleName']);
            }
            return true;
        };

        const showStep = (index) => {
            steps.forEach((step, i) => {
                step.classList.toggle('active', i === index);
                if (indicators[i]) {
                    indicators[i].classList.toggle('active', i === index);
                }
            });
        };

        document.getElementById('toStep2')?.addEventListener('click', (event) => {
            event.preventDefault();
            if (!validateStep(0)) {
                return;
            }
            showStep(1);
        });
        document.getElementById('backToStep1')?.addEventListener('click', (event) => {
            event.preventDefault();
            showStep(0);
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
