(function() {
    function initIndexPage() {
        if (!document.body.classList.contains('home-screen')) {
            return;
        }

        setupCircleButtonInteractions();
        setupSidebarHandling();
        setupSearch();
        setupImportExport();
        setupArchivedModal();
        setupUpdates();

        displayCourtThisMonth();
        displayClientsList();
    }

    function setupCircleButtonInteractions() {
        const buttons = Array.from(document.querySelectorAll('.icon-buttons .circle-btn'));
        if (buttons.length === 0) {
            return;
        }

        let activeButton = null;
        let animationLocked = false;
        let pendingButton = null;

        function requestExpand(button) {
            if (animationLocked && activeButton !== button) {
                pendingButton = button;
                return;
            }
            if (activeButton && activeButton !== button) {
                collapse(activeButton);
            }
            if (activeButton === button && button.classList.contains('is-expanded')) {
                return;
            }
            activeButton = button;
            animationLocked = true;
            button.classList.add('is-expanded');
            button.addEventListener('transitionend', handleUnlock, { once: true });
        }

        function collapse(button) {
            if (!button.classList.contains('is-expanded')) {
                return;
            }
            animationLocked = true;
            button.classList.remove('is-expanded');
            button.addEventListener('transitionend', handleUnlock, { once: true });
        }

        function handleUnlock(event) {
            if (event.propertyName !== 'width') {
                event.target.addEventListener('transitionend', handleUnlock, { once: true });
                return;
            }
            animationLocked = false;
            if (!event.target.classList.contains('is-expanded')) {
                if (activeButton === event.target) {
                    activeButton = null;
                }
            }
            if (pendingButton) {
                const buttonToExpand = pendingButton;
                pendingButton = null;
                requestExpand(buttonToExpand);
            }
        }

        buttons.forEach(button => {
            const handlePointerLeave = () => {
                collapse(button);
                if (pendingButton === button) {
                    pendingButton = null;
                }
            };
            button.addEventListener('pointerenter', () => requestExpand(button));
            button.addEventListener('focus', () => requestExpand(button));
            button.addEventListener('pointerleave', handlePointerLeave);
            button.addEventListener('blur', () => {
                collapse(button);
                if (pendingButton === button) {
                    pendingButton = null;
                }
            });
        });
    }

    function setupSidebarHandling() {
        const toggle = document.getElementById('sidebarToggle');
        const close = document.getElementById('sidebarClose');
        const sidebar = document.getElementById('sidebar');

        if (toggle) {
            toggle.addEventListener('click', toggleSidebar);
        }
        if (close) {
            close.addEventListener('click', toggleSidebar);
        }
        document.addEventListener('click', (event) => {
            if (!sidebar || !sidebar.classList.contains('open')) {
                return;
            }
            if (sidebar.contains(event.target) || event.target.closest('#sidebarToggle')) {
                return;
            }
            sidebar.classList.remove('open');
        });
    }

    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.getElementById('searchButton');

        searchButton?.addEventListener('click', searchClients);
        searchInput?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                searchClients();
            }
        });
        searchInput?.addEventListener('input', searchClients);
    }

    function setupImportExport() {
        const exportOption = document.getElementById('exportOption');
        const importOption = document.getElementById('importOption');
        const importFile = document.getElementById('importFile');

        exportOption?.addEventListener('click', exportClientsToExcel);
        importOption?.addEventListener('click', () => importFile?.click());
        importFile?.addEventListener('change', importClientsFromExcel);
    }

    function setupArchivedModal() {
        const button = document.getElementById('showArchivedBtn');
        if (!button) {
            return;
        }
        button.addEventListener('click', showArchivedClients);
    }

    function setupUpdates() {
        const updatesBtn = document.getElementById('updatesBtn');
        updatesBtn?.addEventListener('click', showUpdates);
    }

    if (window.__crmAppReady) {
        initIndexPage();
    } else {
        window.addEventListener('app:ready', initIndexPage, { once: true });
    }
})();
