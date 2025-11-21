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
        const addClientBtn = document.querySelector('.add-client-btn');
        const buttons = Array.from(document.querySelectorAll('.icon-buttons .circle-btn'));
        const container = document.querySelector('.icon-buttons');
        if (buttons.length === 0 || !container) {
            return;
        }

        let activeButton = null;
        let hoveredButton = null;
        let collapseTimeout = null;

        function updateButtonStates() {
            buttons.forEach((button) => {
                const isActive = button === activeButton;
                const shouldExpand = isActive || (!activeButton && button === hoveredButton);

                button.classList.toggle('is-active', isActive);
                button.classList.toggle('is-expanded', shouldExpand);
            });
        }

        function setActiveButton(button) {
            if (activeButton && activeButton !== button) {
                return;
            }

            if (activeButton === button) {
                activeButton = null;
            } else {
                activeButton = button;
                hoveredButton = button;
            }
            updateButtonStates();
        }

        function setHoveredButton(button) {
            if (hoveredButton === button) {
                return;
            }
            hoveredButton = button;
            updateButtonStates();
        }

        function scheduleHoverClear(button) {
            clearTimeout(collapseTimeout);
            collapseTimeout = setTimeout(() => {
                if (!activeButton) {
                    clearHoveredButton(button || hoveredButton);
                }
            }, 140);
        }

        function clearHoveredButton(button) {
            if (hoveredButton !== button) {
                return;
            }
            hoveredButton = null;
            updateButtonStates();
        }

        function resetButtonState() {
            clearTimeout(collapseTimeout);
            activeButton = null;
            hoveredButton = null;
            updateButtonStates();
        }

        buttons.forEach((button) => {
            button.addEventListener('mouseenter', () => {
                clearTimeout(collapseTimeout);
                if (!activeButton) {
                    setHoveredButton(button);
                }
            });

            button.addEventListener('mouseleave', () => {
                if (!activeButton) {
                    scheduleHoverClear(button);
                }

                if (button.dataset.bsToggle === 'modal' || button.dataset.bsToggle === 'dropdown') {
                    button.blur();
                }
            });

            button.addEventListener('focus', () => {
                clearTimeout(collapseTimeout);
                if (!activeButton) {
                    setHoveredButton(button);
                }
            });

            button.addEventListener('blur', () => {
                if (!activeButton) {
                    scheduleHoverClear(button);
                }
            });

            button.addEventListener('click', () => {
                const toggleType = button.dataset.bsToggle;
                const isTransientToggle = toggleType === 'modal' || toggleType === 'dropdown';

                if (isTransientToggle) {
                    resetButtonState();
                    button.blur();
                    return;
                }

                setActiveButton(button);
            });
        });

        container.addEventListener('mouseleave', () => {
            if (!activeButton) {
                scheduleHoverClear();
            }
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('show.bs.modal', resetButtonState);
            modal.addEventListener('hidden.bs.modal', resetButtonState);
        });

        document.addEventListener('sidebar:closed', resetButtonState);

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                resetButtonState();
            }
        });
    }

    function setupSidebarHandling() {
        const toggle = document.getElementById('sidebarToggle');
        const close = document.getElementById('sidebarClose');
        const sidebar = document.getElementById('sidebar');

        function closeSidebar() {
            toggleSidebar(false);
        }

        function isClickOutside(event) {
            return !sidebar?.contains(event.target) && !event.target.closest('#sidebarToggle');
        }

        if (toggle) {
            toggle.addEventListener('click', () => toggleSidebar());
        }
        if (close) {
            close.addEventListener('click', closeSidebar);
        }
        document.addEventListener('click', (event) => {
            if (!sidebar || !sidebar.classList.contains('open')) {
                return;
            }
            if (!isClickOutside(event)) {
                return;
            }
            closeSidebar();
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
        window.addEventListener('app-ready', initIndexPage, { once: true });
    }
})();
