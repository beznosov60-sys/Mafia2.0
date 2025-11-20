(function() {
    function initClientCardPage() {
        const root = document.getElementById('clientCardRoot');
        if (!root) {
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        const fromManager = urlParams.get('fromManager');
        setupClientCardInteractions();
        if (!clientId) {
            alert('Клиент не найден!');
            window.location.href = 'index.html';
            return;
        }
        currentClientId = clientId;
        loadClientCard(clientId);
        if (fromManager) {
            const backLink = document.getElementById('backLink');
            if (backLink) {
                backLink.href = `managers.html#managerCard${fromManager}`;
            }
        }
    }

    if (window.__crmAppReady) {
        initClientCardPage();
    } else {
        window.addEventListener('app-ready', initClientCardPage, { once: true });
    }
})();
