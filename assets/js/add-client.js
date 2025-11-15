(function() {
    function initAddClientPage() {
        const stepContainer = document.getElementById('step1');
        if (!stepContainer) {
            return;
        }

        setupStepNavigation();
        setupPassportToggle();
        setupPaymentMonths();
        setupStageSelect();
        setupArbitrationLink();
    }

    function setupStepNavigation() {
        const steps = Array.from(document.querySelectorAll('.form-step'));
        const indicators = Array.from(document.querySelectorAll('.step-indicator .step'));
        if (steps.length === 0 || indicators.length === 0) {
            return;
        }

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
            showStep(1);
        });
        document.getElementById('toStep3')?.addEventListener('click', (event) => {
            event.preventDefault();
            showStep(2);
        });
        document.getElementById('backToStep1')?.addEventListener('click', (event) => {
            event.preventDefault();
            showStep(0);
        });
        document.getElementById('backToStep2')?.addEventListener('click', (event) => {
            event.preventDefault();
            showStep(1);
        });
    }

    function setupPassportToggle() {
        const toggleBtn = document.getElementById('addPassportBtn');
        const passportFields = document.getElementById('passportFields');
        if (!toggleBtn || !passportFields) {
            return;
        }
        toggleBtn.addEventListener('click', (event) => {
            event.preventDefault();
            passportFields.classList.toggle('d-none');
        });
    }

    function setupPaymentMonths() {
        const monthsInput = document.getElementById('paymentMonths');
        if (!monthsInput) {
            return;
        }
        const container = document.getElementById('paidMonthsContainer');
        const rebuild = () => {
            const months = parseInt(monthsInput.value, 10) || 0;
            if (!container) {
                return;
            }
            container.innerHTML = '';
            for (let i = 1; i <= months; i += 1) {
                const wrapper = document.createElement('div');
                wrapper.className = 'form-check form-check-inline';
                wrapper.innerHTML = `
                    <input class="form-check-input" type="checkbox" id="paidMonth${i}">
                    <label class="form-check-label" for="paidMonth${i}">Месяц ${i}</label>
                `;
                container.appendChild(wrapper);
            }
        };
        monthsInput.addEventListener('input', rebuild);
        rebuild();
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
        window.addEventListener('app:ready', initAddClientPage, { once: true });
    }
})();
