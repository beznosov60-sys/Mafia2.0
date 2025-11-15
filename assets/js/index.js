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
        const container = document.querySelector('.icon-buttons');
        if (buttons.length === 0 || !container) {
            return;
        }

        let activeButton = null;
        let hoverIntentTimer = null;

        function expandAllButtons() {
            buttons.forEach(button => {
                button.classList.add('is-expanded');
            });
        }

        function collapseAllButtons() {
            buttons.forEach(button => {
                if (button === activeButton) {
                    button.classList.add('is-expanded');
                    return;
                }
                button.classList.remove('is-expanded');
            });
        }

        function clearActiveButton() {
            if (!activeButton) {
                return;
            }
            activeButton.classList.remove('is-active');
            activeButton = null;
            collapseAllButtons();
        }

        function setActiveButton(button) {
            if (activeButton === button) {
                clearActiveButton();
                return;
            }

            if (activeButton) {
                activeButton.classList.remove('is-active', 'is-expanded');
            }

            activeButton = button;
            activeButton.classList.add('is-active', 'is-expanded');
            buttons.forEach(otherButton => {
                if (otherButton !== activeButton) {
                    otherButton.classList.remove('is-expanded', 'is-active');
                }
            });
        }

        buttons.forEach(button => {
            button.addEventListener('pointerenter', () => {
                if (activeButton) {
                    return;
                }
                window.clearTimeout(hoverIntentTimer);
                hoverIntentTimer = window.setTimeout(expandAllButtons, 30);
            });

            button.addEventListener('focus', () => {
                if (activeButton) {
                    return;
                }
                expandAllButtons();
            });

            button.addEventListener('click', () => {
                setActiveButton(button);
            });

            button.addEventListener('blur', () => {
                if (activeButton) {
                    return;
                }
                window.requestAnimationFrame(() => {
                    if (!container.matches(':hover') && document.activeElement !== button) {
                        collapseAllButtons();
                    }
                });
            });
        });

        container.addEventListener('pointerleave', () => {
            if (activeButton) {
                return;
            }
            window.clearTimeout(hoverIntentTimer);
            collapseAllButtons();
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                clearActiveButton();
            }
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
