(function() {
    function initEditClientPage() {
        if (!document.getElementById('clientId')) {
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        if (!clientId) {
            alert('Клиент не найден!');
            window.location.href = 'index.html';
            return;
        }

        loadClientForEdit(clientId);
        bindFormInteractions();
    }

    function bindFormInteractions() {
        const arbitrInput = document.getElementById('arbitrLink');
        const arbitrButton = document.getElementById('arbitrButton');
        const courtDateInput = document.getElementById('courtDate');
        const stageSelect = document.getElementById('stage');
        const subStageSelect = document.getElementById('subStage');
        const completeSubStageBtn = document.getElementById('completeSubStageBtn');
        const favoriteBtn = document.getElementById('favoriteBtn');
        const completeBtn = document.getElementById('completeClientBtn');

        if (arbitrButton && arbitrInput) {
            arbitrButton.addEventListener('click', openArbitrLink);
            const updateButton = () => {
                arbitrButton.disabled = !arbitrInput.value.trim();
                updateArbitrButtonTitle(arbitrButton, courtDateInput?.value || '');
            };
            arbitrInput.addEventListener('input', updateButton);
            courtDateInput?.addEventListener('input', updateButton);
            updateButton();
        }

        if (stageSelect && subStageSelect) {
            stageSelect.addEventListener('change', () => updateSubStageOptions(stageSelect.value, subStageSelect));
            updateSubStageOptions(stageSelect.value, subStageSelect);
        }

        if (completeSubStageBtn) {
            completeSubStageBtn.addEventListener('click', completeSubStage);
            subStageSelect?.addEventListener('change', () => {
                completeSubStageBtn.disabled = !subStageSelect.value;
            });
            completeSubStageBtn.disabled = !subStageSelect?.value;
        }

        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => {
                const fav = favoriteBtn.dataset.favorite === 'true';
                favoriteBtn.dataset.favorite = (!fav).toString();
                favoriteBtn.innerHTML = fav ? '<i class="ri-star-line"></i>' : '<i class="ri-star-fill"></i>';
            });
        }

        if (stageSelect && subStageSelect && completeBtn) {
            window.updateCompleteBtnVisibility = () => {
                const shouldShow = stageSelect.value === 'Завершение' && subStageSelect.value === 'ждем доки от суда';
                completeBtn.style.display = shouldShow ? 'block' : 'none';
            };
            stageSelect.addEventListener('change', window.updateCompleteBtnVisibility);
            subStageSelect.addEventListener('change', window.updateCompleteBtnVisibility);
            window.updateCompleteBtnVisibility();
        }

        window.completeClientFromEdit = function completeClientFromEdit() {
            const clientIdVal = document.getElementById('clientId')?.value.trim();
            if (!clientIdVal) {
                return;
            }
            if (confirm('Завершить клиента?')) {
                if (typeof completeClient === 'function') {
                    completeClient(clientIdVal);
                    window.location.href = 'index.html';
                } else {
                    alert('Функция завершения не найдена!');
                }
            }
        };
    }

    if (window.__crmAppReady) {
        initEditClientPage();
    } else {
        window.addEventListener('app-ready', initEditClientPage, { once: true });
    }
})();
