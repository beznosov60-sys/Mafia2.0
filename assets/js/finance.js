(function() {
    function initFinancePage() {
        if (!document.body.classList.contains('finance-page') && !document.getElementById('financeTitle')) {
            return;
        }
        const urlParams = new URLSearchParams(window.location.search);
        const clientId = urlParams.get('id');
        if (!clientId) {
            alert('Клиент не найден!');
            window.location.href = 'index.html';
            return;
        }
        loadFinancePage(clientId);
    }

    if (window.__crmAppReady) {
        initFinancePage();
    } else {
        window.addEventListener('app:ready', initFinancePage, { once: true });
    }
})();
