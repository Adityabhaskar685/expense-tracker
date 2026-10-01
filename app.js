(() => {
    'use strict';

    const DEFAULT_CATS = {
        food: { name: 'Food', emoji: '🍔' },
        transport: { name: 'Transport', emoji: '🚗' },
        shopping: { name: 'Shopping', emoji: '🛍️' },
        bills: { name: 'Bills', emoji: '💡' },
        entertainment: { name: 'Fun', emoji: '🎬' },
        health: { name: 'Health', emoji: '⚕️' },
        education: { name: 'Education', emoji: '🎓' },
        fuel: { name: 'Fuel', emoji: '⛽' },
        vehicle: { name: 'Vehicle', emoji: '🔧' },
        other: { name: 'Other', emoji: '📦' }
    };

    const TAB_COUNT = 6;

    const VEHICLE_TYPES = {
        car: { name: 'Car', emoji: '🚗' },
        bike: { name: 'Bike', emoji: '🏍️' },
        scooter: { name: 'Scooter', emoji: '🛵' },
        truck: { name: 'Truck', emoji: '🚚' },
        other: { name: 'Other', emoji: '🚙' }
    };

    const FUEL_TYPES = {
        petrol: { name: 'Petrol', unit: 'L' },
        diesel: { name: 'Diesel', unit: 'L' },
        cng: { name: 'CNG', unit: 'kg' },
        lpg: { name: 'LPG', unit: 'L' },
        electric: { name: 'Electric', unit: 'kWh' }
    };

    const COST_TYPES = {
        service: { name: 'Service', emoji: '🔧' },
        repair: { name: 'Repair', emoji: '🛠️' },
        insurance: { name: 'Insurance', emoji: '🛡️' },
        tyres: { name: 'Tyres', emoji: '🛞' },
        parking: { name: 'Parking', emoji: '🅿️' },
        toll: { name: 'Toll', emoji: '🛣️' },
        wash: { name: 'Wash', emoji: '🧽' },
        registration: { name: 'Registration / PUC', emoji: '📄' },
        fine: { name: 'Fine', emoji: '🚨' },
        other: { name: 'Other', emoji: '📦' }
    };

    const DEFAULT_BUDGETS = {
        food: 5000,
        transport: 2000,
        shopping: 3000,
        bills: 2500,
        entertainment: 1500,
        health: 2000,
        education: 5000,
        other: 1000
    };

    const STORAGE = {
        categories: 'expenseCats',
        transactions: 'expenseTxs',
        budgets: 'expenseBudgets',
        recurring: 'expenseRec',
        incomes: 'expenseIncome',
        dark: 'dark',
        backendUrl: 'backendUrl',
        vehicles: 'vehicles',
        fuelLogs: 'vehicleFuel',
        vehicleCosts: 'vehicleCosts',
        reminders: 'vehicleReminders',
        activeVehicle: 'activeVehicle'
    };

    const state = {
        categories: {},
        transactions: [],
        budgets: {},
        recurring: [],
        incomes: [],
        vehicles: [],
        fuelLogs: [],
        vehicleCosts: [],
        reminders: [],
        activeVehicle: '',
        vehicleLogLimit: 30,
        vehicleView: 'overview',
        receipt: { field: '', existingId: '', blob: null, removed: false, previewUrl: '' },
        filters: { period: 'month', search: '', category: 'all', month: startOfMonth(new Date()) },
        chartMonths: 6,
        analysisView: 'overview',
        charts: {},
        currentTab: 0,
        fabOpen: false,
        txMode: 'add',
        incomeMode: 'add',
        fuelMode: 'add',
        vcostMode: 'add',
        txRenderLimit: 100,
        calendarDate: new Date(),
        calendarDay: 0,
        deferredPrompt: null,
        heightRaf: 0,
        lastScrollY: 0,
        touch: null,
        datePicker: {
            input: null,
            date: new Date(),
            selected: '',
            lastValue: '',
            lastTap: 0
        }
    };

    const $ = id => document.getElementById(id);

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        loadState();
        if (localStorage.getItem(STORAGE.dark) === 'true') {
            document.body.classList.add('dark');
        }
        bindEvents();
        processRecurring();
        render(0);
        setSliderHeight();
        registerServiceWorker();
        scheduleReceiptCleanup();
    }

    function bindEvents() {
        document.addEventListener('click', handleDocumentClick);

        document.querySelectorAll('[data-tab]').forEach(button => {
            button.addEventListener('click', () => switchTab(Number(button.dataset.tab)));
        });

        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', event => {
                if (event.target === modal && modal.id !== 'datePickerModal') {
                    closeModal(modal.id);
                }
            });
        });

        document.querySelectorAll('.js-date-input').forEach(input => {
            input.addEventListener('click', () => openDatePicker(input));
            input.addEventListener('keydown', event => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openDatePicker(input);
                }
            });
        });

        $('searchBox').addEventListener('input', event => {
            state.filters.search = event.target.value.trim().toLowerCase();
            state.txRenderLimit = 100;
            render(1);
        });
        $('categoryFilter').addEventListener('change', event => {
            state.filters.category = event.target.value;
            state.txRenderLimit = 100;
            render(1);
        });
        $('chartRange').addEventListener('change', event => {
            const months = Number(event.target.value);
            state.chartMonths = Number.isFinite(months) ? months : 6;
            renderAnalysis();
        });

        $('fabMain').addEventListener('click', toggleFabMenu);
        $('saveTxBtn').addEventListener('click', singleFlight(saveTransaction));
        $('quickAddBtn').addEventListener('click', quickAddTransaction);
        $('parseTxBtn').addEventListener('click', parseSmsTransaction);
        $('saveBudgetsBtn').addEventListener('click', saveBudgets);
        $('addRecBtn').addEventListener('click', addRecurring);
        $('addCatBtn').addEventListener('click', addCategory);
        $('saveIncomeBtn').addEventListener('click', saveIncomeRecord);
        $('syncBtn').addEventListener('click', syncData);
        $('saveVehicleBtn').addEventListener('click', saveVehicle);
        $('deleteVehicleBtn').addEventListener('click', () => deleteVehicle($('vehicleId').value));
        $('saveFuelBtn').addEventListener('click', singleFlight(saveFuelLog));
        $('saveVcostBtn').addEventListener('click', singleFlight(saveVehicleCost));
        $('saveReminderBtn').addEventListener('click', saveReminder);
        $('fuelVehicle').addEventListener('change', updateFuelUnitLabels);
        ['fuelQty', 'fuelPrice', 'fuelTotal'].forEach(id => {
            $(id).addEventListener('input', () => autoFillFuel(id));
        });
        $('installBtn').addEventListener('click', installApp);
        $('receiptCameraInput').addEventListener('change', handleReceiptFile);
        $('receiptFileInput').addEventListener('change', handleReceiptFile);

        window.addEventListener('resize', scheduleSliderHeight);
        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('touchstart', handleTouchStart, { passive: true });
        window.addEventListener('touchend', handleTouchEnd, { passive: true });
        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            state.deferredPrompt = event;
            $('installBtn').style.display = 'block';
        });
    }

    // Saves await IndexedDB for bill images, so a double tap could otherwise save twice.
    function singleFlight(fn) {
        let running = false;
        return async (...args) => {
            if (running) return;
            running = true;
            try {
                await fn(...args);
            } finally {
                running = false;
            }
        };
    }

    function handleDocumentClick(event) {
        const closeButton = event.target.closest('[data-close]');
        if (closeButton) {
            closeModal(closeButton.dataset.close);
            return;
        }

        const periodButton = event.target.closest('[data-period]');
        if (periodButton) {
            // Re-entering "Month" starts from the current month again.
            if (periodButton.dataset.period === 'month' && state.filters.period !== 'month') {
                state.filters.month = startOfMonth(new Date());
            }
            state.filters.period = periodButton.dataset.period;
            state.txRenderLimit = 100;
            render(1);
            return;
        }

        const dateButton = event.target.closest('[data-picker-date]');
        if (dateButton) {
            handleDatePickerTap(dateButton.dataset.pickerDate, event);
            return;
        }

        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;

        const { action, id } = actionButton.dataset;
        const actions = {
            'open-calendar': openCalendarView,
            'calendar-day': () => {
                state.calendarDay = Number(id);
                renderCalendar();
            },
            'calendar-prev': () => changeCalendarMonth(-1),
            'calendar-next': () => changeCalendarMonth(1),
            'open-budget': () => openModal('budgetModal'),
            'open-recurring': () => openModal('recModal'),
            'toggle-dark': toggleDark,
            'open-categories': () => openModal('catModal'),
            'export-json': exportJSON,
            'import-json': importData,
            'open-sync': () => openModal('syncModal'),
            'open-parse': () => openModal('parseModal'),
            'open-income': () => openIncomeModal(),
            'open-quick': () => openModal('quickAddModal'),
            'open-transaction': () => openTransactionModal(),
            'tx-edit': () => openTransactionModal(id),
            'tx-delete': () => deleteTransaction(id),
            'income-edit': () => openIncomeModal(id),
            'income-delete': () => deleteIncomeRecord(id),
            'rec-delete': () => deleteRecurring(id),
            'cat-delete': () => deleteCategory(id),
            'date-prev': () => changeDatePickerMonth(-1),
            'date-next': () => changeDatePickerMonth(1),
            'date-today': () => selectDateForInput(formatInputDate(Date.now())),
            'date-clear': () => selectDateForInput(''),
            'load-more': loadMoreTransactions,
            'open-vehicle': () => openVehicleModal(),
            'vehicle-edit': () => openVehicleModal(state.activeVehicle),
            'vehicle-select': () => selectVehicle(id),
            'open-fuel': () => openFuelModal(),
            'fuel-edit': () => openFuelModal(id),
            'fuel-delete': () => deleteFuelLog(id),
            'open-vcost': () => openVehicleCostModal(),
            'vcost-edit': () => openVehicleCostModal(id),
            'vcost-delete': () => deleteVehicleCost(id),
            'open-reminder': openReminderModal,
            'reminder-done': () => completeReminder(id),
            'reminder-delete': () => deleteReminder(id),
            'analysis-view': () => {
                state.analysisView = id;
                renderAnalysis();
            },
            'history-month': () => changeHistoryMonth(Number(id)),
            'vehicle-view': () => {
                state.vehicleView = id;
                renderVehicle();
            },
            'import-fuelio': importFuelio,
            'receipt-camera': () => $('receiptCameraInput').click(),
            'receipt-upload': () => $('receiptFileInput').click(),
            'receipt-remove': removeReceiptDraft,
            'receipt-preview': () => viewReceipt(''),
            'receipt-view': () => viewReceipt(id),
            'vehicle-more': () => {
                state.vehicleLogLimit += 30;
                renderVehicle();
            }
        };

        if (actions[action]) actions[action]();
    }

    function loadState() {
        const storedCategories = loadObject(STORAGE.categories, {});
        state.categories = normalizeCategories({ ...DEFAULT_CATS, ...storedCategories });

        const storedBudgets = loadObject(STORAGE.budgets, {});
        state.budgets = { ...DEFAULT_BUDGETS, ...normalizeNumberMap(storedBudgets) };
        Object.keys(state.categories).forEach(id => {
            if (!(id in state.budgets)) state.budgets[id] = 0;
        });

        state.transactions = loadArray(STORAGE.transactions).map(normalizeTransaction).filter(Boolean);
        state.recurring = loadArray(STORAGE.recurring).map(normalizeRecurring).filter(Boolean);
        state.incomes = loadArray(STORAGE.incomes).map(normalizeIncome).filter(Boolean);
        loadVehicleState({
            vehicles: loadArray(STORAGE.vehicles),
            fuelLogs: loadArray(STORAGE.fuelLogs),
            vehicleCosts: loadArray(STORAGE.vehicleCosts),
            reminders: loadArray(STORAGE.reminders)
        });
        state.activeVehicle = localStorage.getItem(STORAGE.activeVehicle) || '';
        ensureActiveVehicle();
        sortRecords();
        if (reconcileVehicleTransactions()) persistCore();
    }

    function loadVehicleState(data) {
        if (Array.isArray(data.vehicles)) {
            state.vehicles = data.vehicles.map(normalizeVehicle).filter(Boolean);
        }
        const vehicleIds = new Set(state.vehicles.map(vehicle => vehicle.id));
        const belongs = record => record && vehicleIds.has(record.vehicleId);
        if (Array.isArray(data.fuelLogs)) {
            state.fuelLogs = data.fuelLogs.map(normalizeFuelLog).filter(belongs);
        }
        if (Array.isArray(data.vehicleCosts)) {
            state.vehicleCosts = data.vehicleCosts.map(normalizeVehicleCost).filter(belongs);
        }
        if (Array.isArray(data.reminders)) {
            state.reminders = data.reminders.map(normalizeReminder).filter(belongs);
        }
    }

    function loadArray(key) {
        const value = safeParse(localStorage.getItem(key), []);
        return Array.isArray(value) ? value : [];
    }

    function loadObject(key, fallback) {
        const value = safeParse(localStorage.getItem(key), fallback);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    }

    function safeParse(value, fallback) {
        if (!value) return fallback;
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }

    function normalizeCategories(input) {
        return Object.entries(input).reduce((acc, [rawId, rawValue]) => {
            const id = String(rawId || '').trim();
            if (!id || !rawValue || typeof rawValue !== 'object') return acc;
            const name = String(rawValue.name || id).trim();
            const emoji = String(rawValue.emoji || '🏷️').trim() || '🏷️';
            acc[id] = { name, emoji };
            return acc;
        }, {});
    }

    function normalizeNumberMap(input) {
        return Object.entries(input || {}).reduce((acc, [key, value]) => {
            const number = Number(value);
            acc[String(key)] = Number.isFinite(number) && number >= 0 ? number : 0;
            return acc;
        }, {});
    }

    function normalizeTransaction(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const amount = Number(raw.amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return {
            id: String(raw.id || makeId()),
            amount,
            merchant: String(raw.merchant || raw.description || 'Expense').trim() || 'Expense',
            category: String(raw.category || 'other'),
            paymentMethod: String(raw.paymentMethod || raw.payment || 'cash'),
            date: normalizeDate(raw.date),
            source: String(raw.source || 'manual'),
            notes: raw.notes ? String(raw.notes) : '',
            receiptId: raw.receiptId ? String(raw.receiptId) : ''
        };
    }

    function normalizeIncome(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const amount = Number(raw.amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        return {
            id: String(raw.id || makeId()),
            amount,
            source: String(raw.source || 'Income').trim() || 'Income',
            date: normalizeDate(raw.date)
        };
    }

    function normalizeRecurring(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const amount = Number(raw.amount);
        if (!Number.isFinite(amount) || amount <= 0) return null;
        const frequency = ['daily', 'weekly', 'monthly'].includes(raw.frequency) ? raw.frequency : 'monthly';
        return {
            id: String(raw.id || makeId()),
            amount,
            description: String(raw.description || 'Recurring').trim() || 'Recurring',
            category: String(raw.category || 'other'),
            frequency,
            nextDue: normalizeDate(raw.nextDue),
            day: clamp(Math.round(Number(raw.day)) || new Date(normalizeDate(raw.nextDue)).getDate(), 1, 31)
        };
    }

    function normalizeVehicle(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const name = String(raw.name || '').trim();
        if (!name) return null;
        return {
            id: String(raw.id || makeId()),
            name,
            type: VEHICLE_TYPES[raw.type] ? raw.type : 'car',
            fuelType: FUEL_TYPES[raw.fuelType] ? raw.fuelType : 'petrol',
            startOdometer: toPositive(raw.startOdometer)
        };
    }

    function normalizeFuelLog(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const quantity = toPositive(raw.quantity);
        const total = toPositive(raw.total);
        const odometer = toPositive(raw.odometer);
        if (!quantity || !odometer) return null;
        return {
            id: String(raw.id || makeId()),
            vehicleId: String(raw.vehicleId || ''),
            date: normalizeDate(raw.date),
            odometer,
            quantity,
            price: toPositive(raw.price) || (total ? roundTo(total / quantity, 2) : 0),
            total,
            full: raw.full !== false,
            missed: Boolean(raw.missed),
            station: String(raw.station || '').trim(),
            paymentMethod: String(raw.paymentMethod || 'upi'),
            txId: raw.txId ? String(raw.txId) : '',
            receiptId: raw.receiptId ? String(raw.receiptId) : ''
        };
    }

    function normalizeVehicleCost(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const amount = toPositive(raw.amount);
        if (!amount) return null;
        return {
            id: String(raw.id || makeId()),
            vehicleId: String(raw.vehicleId || ''),
            type: COST_TYPES[raw.type] ? raw.type : 'other',
            title: String(raw.title || '').trim(),
            amount,
            date: normalizeDate(raw.date),
            odometer: toPositive(raw.odometer),
            paymentMethod: String(raw.paymentMethod || 'upi'),
            txId: raw.txId ? String(raw.txId) : '',
            receiptId: raw.receiptId ? String(raw.receiptId) : ''
        };
    }

    function normalizeReminder(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const title = String(raw.title || '').trim();
        const dueDate = toPositive(raw.dueDate);
        const dueOdometer = toPositive(raw.dueOdometer);
        if (!title || (!dueDate && !dueOdometer)) return null;
        return {
            id: String(raw.id || makeId()),
            vehicleId: String(raw.vehicleId || ''),
            title,
            dueDate,
            dueOdometer,
            repeatMonths: Math.round(toPositive(raw.repeatMonths)),
            repeatKm: toPositive(raw.repeatKm)
        };
    }

    function toPositive(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function normalizeDate(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : Date.now();
    }

    function saveItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            showToast('Storage full: export a backup and remove old data');
        }
    }

    function persistCore() {
        saveItem(STORAGE.categories, JSON.stringify(state.categories));
        saveItem(STORAGE.transactions, JSON.stringify(state.transactions));
        saveItem(STORAGE.budgets, JSON.stringify(state.budgets));
        saveItem(STORAGE.recurring, JSON.stringify(state.recurring));
        scheduleReceiptCleanup();
    }

    function persistIncome() {
        saveItem(STORAGE.incomes, JSON.stringify(state.incomes));
    }

    function persistVehicles() {
        saveItem(STORAGE.vehicles, JSON.stringify(state.vehicles));
        saveItem(STORAGE.fuelLogs, JSON.stringify(state.fuelLogs));
        saveItem(STORAGE.vehicleCosts, JSON.stringify(state.vehicleCosts));
        saveItem(STORAGE.reminders, JSON.stringify(state.reminders));
        saveItem(STORAGE.activeVehicle, state.activeVehicle);
        scheduleReceiptCleanup();
    }

    function persistAll() {
        persistCore();
        persistIncome();
        persistVehicles();
    }

    function sortRecords() {
        state.transactions.sort((a, b) => b.date - a.date);
        state.incomes.sort((a, b) => b.date - a.date);
    }

    function switchTab(index) {
        const nextTab = clamp(Number(index), 0, TAB_COUNT - 1);
        if (Number.isNaN(nextTab)) return;
        state.currentTab = nextTab;
        $('mainSlider').style.transform = `translate3d(-${(nextTab * 100) / TAB_COUNT}%, 0, 0)`;
        document.querySelectorAll('.nav-item').forEach((item, i) => {
            item.classList.toggle('active', i === nextTab);
        });
        render(nextTab);
        window.scrollTo(0, 0);
    }

    function render(tabIndex = state.currentTab) {
        if (tabIndex === 0) renderHome();
        if (tabIndex === 1) renderHistory();
        if (tabIndex === 2) renderAnalysis();
        if (tabIndex === 3) renderPlan();
        if (tabIndex === 4) renderVehicle();
        if (tabIndex === 5) scheduleSliderHeight();
    }

    function renderHome() {
        const stats = getStats();
        $('statMonth').textContent = formatCurrency(stats.monthTotal);
        $('statToday').textContent = formatCurrency(stats.dayTotal);
        renderMonthlySummary();
        renderBudgetOverview(stats.monthTotal);
        renderTransactionList('recentList', state.transactions, { limit: 5, actions: false });
        renderHomeReminders();
        scheduleSliderHeight();
    }

    function renderMonthlySummary() {
        const now = new Date();
        let html = '';
        for (let i = 2; i >= 0; i -= 1) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1).getTime();
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
            const total = state.transactions
                .filter(tx => tx.date >= start && tx.date < end)
                .reduce((sum, tx) => sum + tx.amount, 0);
            const label = new Date(now.getFullYear(), now.getMonth() - i, 1)
                .toLocaleDateString('en-IN', { month: 'short' });
            html += `<div class="mini-card"><div class="mini-label">${escapeHtml(label)}</div><div class="mini-value">${formatCurrency(Math.round(total))}</div></div>`;
        }
        $('monthlySummary').innerHTML = html;
    }

    function renderBudgetOverview(monthTotal) {
        const totalBudget = Object.values(state.budgets).reduce((sum, value) => sum + Number(value || 0), 0);
        const percent = totalBudget > 0 ? Math.min((monthTotal / totalBudget) * 100, 100) : 0;
        $('budgetOverview').innerHTML = `
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:6px;display:flex;justify-content:space-between;gap:8px">
                <span>Spent: ${formatCurrency(monthTotal)}</span>
                <span>Limit: ${formatCurrency(totalBudget)}</span>
            </div>
            <div class="progress"><div style="width:${percent.toFixed(2)}%;background:${percent > 90 ? 'var(--danger)' : 'var(--accent)'}"></div></div>
        `;
    }

    function renderHistory() {
        const now = new Date();
        let filtered = [...state.transactions];
        populateHistoryCategoryFilter();

        let periodStart = 0;
        let periodEnd = Infinity;
        if (state.filters.period === 'today') {
            periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        } else if (state.filters.period === 'month') {
            const month = state.filters.month;
            periodStart = month.getTime();
            periodEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime();
        }
        const inPeriod = item => item.date >= periodStart && item.date < periodEnd;
        filtered = filtered.filter(inPeriod);
        renderHistoryMonthNav();
        if (state.filters.category !== 'all') {
            filtered = filtered.filter(tx => tx.category === state.filters.category);
        }
        if (state.filters.search) {
            filtered = filtered.filter(tx => {
                const category = state.categories[tx.category]?.name || tx.category;
                return `${tx.merchant} ${category} ${tx.paymentMethod} ${tx.notes || ''}`
                    .toLowerCase()
                    .includes(state.filters.search);
            });
        }

        $('periodChips').innerHTML = ['all', 'month', 'today'].map(period => {
            const label = period.charAt(0).toUpperCase() + period.slice(1);
            const active = state.filters.period === period ? ' active' : '';
            return `<button class="chip${active}" data-period="${period}" type="button">${label}</button>`;
        }).join('');

        renderIncomeList(state.incomes.filter(income => (
            inPeriod(income) && income.source.toLowerCase().includes(state.filters.search)
        )));
        renderHistorySummary(filtered);
        renderTransactionList('txList', filtered, { actions: true, paged: true });
        scheduleSliderHeight();
    }

    function startOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function renderHistoryMonthNav() {
        const nav = $('historyMonthNav');
        nav.hidden = state.filters.period !== 'month';
        if (nav.hidden) return;
        const month = state.filters.month;
        const isCurrent = month.getTime() === startOfMonth(new Date()).getTime();
        nav.innerHTML = `
            <button class="btn btn-s" data-action="history-month" data-id="-1" type="button" aria-label="Previous month">←</button>
            <div style="font-weight:800;text-align:center">${escapeHtml(month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }))}</div>
            <button class="btn btn-s" data-action="history-month" data-id="1" type="button" aria-label="Next month"${isCurrent ? ' disabled style="opacity:0.3"' : ''}>→</button>
        `;
    }

    function changeHistoryMonth(delta) {
        const month = state.filters.month;
        const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
        if (next > startOfMonth(new Date())) return;
        state.filters.month = next;
        state.txRenderLimit = 100;
        renderHistory();
    }

    function populateHistoryCategoryFilter() {
        const select = $('categoryFilter');
        const current = state.filters.category;
        select.innerHTML = [
            '<option value="all">All categories</option>',
            ...Object.entries(state.categories).map(([id, category]) => (
                `<option value="${escapeAttr(id)}">${escapeHtml(category.emoji)} ${escapeHtml(category.name)}</option>`
            ))
        ].join('');
        if (current !== 'all' && !state.categories[current]) {
            state.filters.category = 'all';
        }
        select.value = state.filters.category;
    }

    function renderHistorySummary(list) {
        const total = list.reduce((sum, tx) => sum + tx.amount, 0);
        const label = list.length === 1 ? 'expense' : 'expenses';
        $('historySummary').textContent = `${list.length} ${label} • ${formatCurrency(total)}`;
    }

    function renderTransactionList(containerId, list, options = {}) {
        const { limit = 0, actions = true, paged = false } = options;
        const effectiveLimit = paged ? state.txRenderLimit : limit;
        const data = effectiveLimit ? list.slice(0, effectiveLimit) : list;
        const container = $(containerId);

        if (!data.length) {
            container.innerHTML = '<div class="empty">No transactions found</div>';
            return;
        }

        const rows = data.map(tx => {
            const category = state.categories[tx.category] || { name: 'Unknown', emoji: '❓' };
            const actionHtml = actions ? `
                <div class="tx-actions">
                    ${receiptButton(tx.receiptId)}
                    <button class="icon-btn" data-action="tx-edit" data-id="${escapeAttr(tx.id)}" type="button" aria-label="Edit transaction">✎</button>
                    <button class="icon-btn" data-action="tx-delete" data-id="${escapeAttr(tx.id)}" type="button" style="color:var(--danger)" aria-label="Delete transaction">🗑</button>
                </div>
            ` : '';
            return `
                <div class="tx-item">
                    <div class="tx-emoji">${escapeHtml(category.emoji)}</div>
                    <div class="tx-info">
                        <div class="tx-merchant">${escapeHtml(tx.merchant)}</div>
                        <div class="tx-meta">${formatDisplayDate(tx.date)} • ${escapeHtml(tx.paymentMethod.toUpperCase())}</div>
                    </div>
                    <div class="tx-amount">${formatCurrency(tx.amount)}</div>
                    ${actions ? '' : receiptButton(tx.receiptId)}
                    ${actionHtml}
                </div>
            `;
        }).join('');

        const more = paged && list.length > effectiveLimit
            ? '<button class="btn btn-s" data-action="load-more" type="button">Load more</button>'
            : '';
        container.innerHTML = rows + more;
    }

    function renderIncomeList(incomes) {
        const container = $('incomeList');
        if (!incomes.length) {
            container.innerHTML = '<div class="empty">No income records</div>';
            return;
        }

        container.innerHTML = incomes.map(income => `
            <div class="tx-item">
                <div class="tx-emoji">💰</div>
                <div class="tx-info">
                    <div class="tx-merchant">${escapeHtml(income.source)}</div>
                    <div class="tx-meta">${formatDisplayDate(income.date)}</div>
                </div>
                <div class="tx-amount">${formatCurrency(income.amount)}</div>
                <div class="tx-actions">
                    <button class="icon-btn" data-action="income-edit" data-id="${escapeAttr(income.id)}" type="button" aria-label="Edit income">✎</button>
                    <button class="icon-btn" data-action="income-delete" data-id="${escapeAttr(income.id)}" type="button" style="color:var(--danger)" aria-label="Delete income">🗑</button>
                </div>
            </div>
        `).join('');
    }

    const ANALYSIS_VIEWS = {
        overview: '📋 Overview',
        categories: '🏷️ Categories',
        patterns: '🔍 Patterns',
        monthly: '📅 Monthly',
        yearly: '📆 Yearly'
    };

    const ANALYSIS_CHART_KEYS = ['aTrend', 'aIncomeExpense', 'aCategory', 'aCategoryTrend', 'aWeekday', 'aPayment', 'aNet', 'aYearly'];

    const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#94a3b8', '#84cc16'];

    const INCOME_COLOR = '#10b981';
    const EXPENSE_COLOR = '#f43f5e';

    function renderAnalysis() {
        $('chartRange').value = String(state.chartMonths);
        if (!ANALYSIS_VIEWS[state.analysisView]) state.analysisView = 'overview';
        $('analysisViews').innerHTML = Object.entries(ANALYSIS_VIEWS).map(([id, label]) => {
            const active = id === state.analysisView ? ' active' : '';
            return `<button class="chip${active}" data-action="analysis-view" data-id="${id}" type="button">${label}</button>`;
        }).join('');

        const range = getAnalysisRange();
        const yearly = state.analysisView === 'yearly';
        $('chartRange').disabled = yearly;
        $('analysisSummary').textContent = yearly
            ? 'All years'
            : `${range.label} • ${formatCurrency(Math.round(sumAmount(rangeItems(state.transactions, range))))} spent`;

        ANALYSIS_CHART_KEYS.forEach(destroyChart);
        const renderers = {
            overview: renderAnalysisOverview,
            categories: renderAnalysisCategories,
            patterns: renderAnalysisPatterns,
            monthly: renderAnalysisMonthly,
            yearly: renderAnalysisYearly
        };
        renderers[state.analysisView](range);
        if (!window.Chart) {
            $('analysisContent').insertAdjacentHTML('afterbegin', '<div class="filter-summary" style="margin:0 2px 12px">Charts need one online load so Chart.js can be cached.</div>');
        }
        scheduleSliderHeight();
        setTimeout(scheduleSliderHeight, 80);
    }

    // chartMonths 0 means "All time": from the month of the oldest record.
    function getAnalysisRange() {
        const now = new Date();
        let months = Number(state.chartMonths);
        if (!months) {
            const dates = [...state.transactions, ...state.incomes].map(item => item.date);
            const earliest = dates.length ? new Date(Math.min(...dates)) : now;
            months = (now.getFullYear() - earliest.getFullYear()) * 12 + now.getMonth() - earliest.getMonth() + 1;
        }
        months = clamp(months, 1, 120);
        const labelFormat = months > 12 ? { month: 'short', year: '2-digit' } : { month: 'short' };
        const buckets = [];
        for (let i = months - 1; i >= 0; i -= 1) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.push({
                start: start.getTime(),
                end: new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime(),
                label: start.toLocaleDateString('en-IN', labelFormat),
                longLabel: start.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
            });
        }
        let label = `Last ${months} months`;
        if (!Number(state.chartMonths)) label = 'All time';
        else if (months === 1) label = 'This month';
        return { months, start: buckets[0].start, end: buckets[buckets.length - 1].end, buckets, label };
    }

    function rangeItems(list, range) {
        return list.filter(item => item.date >= range.start && item.date < range.end);
    }

    function sumAmount(list) {
        return list.reduce((sum, item) => sum + item.amount, 0);
    }

    function formatSigned(value) {
        const rounded = Math.round(value);
        return `${rounded < 0 ? '-' : ''}${formatCurrency(Math.abs(rounded))}`;
    }

    function groupTotals(list, keyOf) {
        return list.reduce((acc, item) => {
            const key = keyOf(item);
            if (!acc[key]) acc[key] = { total: 0, count: 0 };
            acc[key].total += item.amount;
            acc[key].count += 1;
            return acc;
        }, {});
    }

    function doughnutConfig(labels, data) {
        return {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: CHART_COLORS,
                    borderColor: document.body.classList.contains('dark') ? '#27272a' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: { plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }
        };
    }

    function categoryLabel(id) {
        const category = state.categories[id];
        return category ? `${category.emoji} ${category.name}` : `❓ ${id}`;
    }

    function renderAnalysisOverview(range) {
        const txs = rangeItems(state.transactions, range);
        const spent = sumAmount(txs);
        const income = sumAmount(rangeItems(state.incomes, range));
        const net = income - spent;
        const days = Math.max(Math.ceil((Math.min(Date.now(), range.end) - range.start) / 86400000), 1);
        const biggest = txs.reduce((max, tx) => (!max || tx.amount > max.amount ? tx : max), null);
        const topCategory = Object.entries(groupTotals(txs, tx => tx.category)).sort((a, b) => b[1].total - a[1].total)[0];
        const notes = [
            topCategory ? `Top category: ${categoryLabel(topCategory[0])} (${formatCurrency(Math.round(topCategory[1].total))})` : '',
            biggest ? `Biggest: ${biggest.merchant} on ${formatDisplayDate(biggest.date)}` : ''
        ].filter(Boolean);
        const daily = range.months === 1;

        $('analysisContent').innerHTML = `
            <div class="card">
                <div class="card-title">Summary</div>
                ${statTiles([
                    ['Spent', formatCurrency(Math.round(spent))],
                    ['Income', formatCurrency(Math.round(income))],
                    ['Net', formatSigned(net)],
                    ['Savings rate', income ? `${formatNumber((net / income) * 100, 0)}%` : '–'],
                    ['Daily avg', formatCurrency(Math.round(spent / days))],
                    ['Monthly avg', formatCurrency(Math.round(spent / range.months))],
                    ['Transactions', String(txs.length)],
                    ['Avg / txn', txs.length ? formatCurrency(Math.round(spent / txs.length)) : '–'],
                    ['Biggest', biggest ? formatCurrency(biggest.amount) : '–']
                ])}
                ${notes.length ? `<div class="chart-caption" style="margin:12px 0 0">${notes.map(escapeHtml).join('<br>')}</div>` : ''}
            </div>
            <div class="card">
                <div class="card-title">${daily ? 'Daily Spending' : 'Spending Trend'}</div>
                <canvas id="achartTrend"></canvas>
            </div>
            <div class="card">
                <div class="card-title">Income vs Expense</div>
                <canvas id="achartIncomeExpense"></canvas>
            </div>
        `;

        let trendLabels;
        let trendData;
        if (daily) {
            const now = new Date();
            const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            trendLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
            trendData = Array(daysInMonth).fill(0);
            txs.forEach(tx => {
                trendData[new Date(tx.date).getDate() - 1] += tx.amount;
            });
        } else {
            trendLabels = range.buckets.map(bucket => bucket.label);
            trendData = range.buckets.map(bucket => sumAmount(rangeItems(txs, bucket)));
        }
        makeChart('aTrend', 'achartTrend', barChartConfig(trendLabels, [
            { label: 'Spent', data: trendData.map(Math.round), backgroundColor: '#10b981' }
        ]));
        makeChart('aIncomeExpense', 'achartIncomeExpense', barChartConfig(range.buckets.map(bucket => bucket.label), [
            { label: 'Income', data: range.buckets.map(bucket => Math.round(sumAmount(rangeItems(state.incomes, bucket)))), backgroundColor: INCOME_COLOR },
            { label: 'Expense', data: range.buckets.map(bucket => Math.round(sumAmount(rangeItems(txs, bucket)))), backgroundColor: EXPENSE_COLOR }
        ]));
    }

    function renderAnalysisCategories(range) {
        const txs = rangeItems(state.transactions, range);
        const grand = sumAmount(txs);
        const entries = Object.entries(groupTotals(txs, tx => tx.category)).sort((a, b) => b[1].total - a[1].total);
        const top = entries.slice(0, 8);
        const rest = entries.slice(8).reduce((sum, [, value]) => sum + value.total, 0);
        const showTrend = range.months > 1 && entries.length > 0;

        $('analysisContent').innerHTML = `
            <div class="card">
                <div class="card-title">Category Breakdown</div>
                ${entries.length ? '<canvas id="achartCategory" style="margin-bottom:12px"></canvas>' : ''}
                ${statTable(['Category', 'Txns', 'Total', 'Avg/mo', 'Budget', 'Share'], entries.map(([id, value]) => {
                    const perMonth = value.total / range.months;
                    const budget = Number(state.budgets[id] || 0);
                    return [
                        categoryLabel(id),
                        String(value.count),
                        formatNumber(Math.round(value.total)),
                        formatNumber(Math.round(perMonth)),
                        budget > 0 ? `${formatNumber((perMonth / budget) * 100, 0)}%` : '–',
                        `${formatNumber((value.total / grand) * 100, 1)}%`
                    ];
                }))}
                ${entries.length ? '<div class="chart-caption" style="margin:10px 0 0">Budget = average monthly spend as a share of the category\'s monthly budget.</div>' : ''}
            </div>
            ${showTrend ? `
                <div class="card">
                    <div class="card-title">Top Categories by Month</div>
                    <canvas id="achartCategoryTrend"></canvas>
                </div>
            ` : ''}
        `;
        if (!entries.length) return;

        makeChart('aCategory', 'achartCategory', doughnutConfig(
            [...top.map(([id]) => categoryLabel(id)), ...(rest ? ['Others'] : [])],
            [...top.map(([, value]) => Math.round(value.total)), ...(rest ? [Math.round(rest)] : [])]
        ));
        if (!showTrend) return;
        const trendIds = entries.slice(0, 5).map(([id]) => id);
        const datasets = trendIds.map((id, i) => ({
            label: state.categories[id]?.name || id,
            data: range.buckets.map(bucket => Math.round(sumAmount(rangeItems(txs, bucket).filter(tx => tx.category === id)))),
            backgroundColor: CHART_COLORS[i]
        }));
        if (entries.length > 5) {
            datasets.push({
                label: 'Others',
                data: range.buckets.map(bucket => Math.round(sumAmount(rangeItems(txs, bucket).filter(tx => !trendIds.includes(tx.category))))),
                backgroundColor: '#94a3b8'
            });
        }
        makeChart('aCategoryTrend', 'achartCategoryTrend', barChartConfig(range.buckets.map(bucket => bucket.label), datasets, true));
    }

    function renderAnalysisPatterns(range) {
        const txs = rangeItems(state.transactions, range);
        const grand = sumAmount(txs);
        // Monday-first week; getDay() is Sunday = 0.
        const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const weekdayTotals = Array(7).fill(0);
        txs.forEach(tx => {
            weekdayTotals[(new Date(tx.date).getDay() + 6) % 7] += tx.amount;
        });
        const busiest = weekdayTotals.indexOf(Math.max(...weekdayTotals));
        const weekend = weekdayTotals[5] + weekdayTotals[6];

        const payments = Object.entries(groupTotals(txs, tx => (tx.paymentMethod || 'other').toUpperCase()))
            .sort((a, b) => b[1].total - a[1].total);
        const merchants = {};
        txs.forEach(tx => {
            const key = tx.merchant.trim().toLowerCase();
            if (!merchants[key]) merchants[key] = { name: tx.merchant.trim(), total: 0, count: 0 };
            merchants[key].total += tx.amount;
            merchants[key].count += 1;
        });
        const topMerchants = Object.values(merchants).sort((a, b) => b.total - a.total).slice(0, 10);

        $('analysisContent').innerHTML = `
            <div class="card">
                <div class="card-title">Spending Habits</div>
                ${statTiles([
                    ['Busiest day', grand ? weekdays[busiest] : '–'],
                    ['Weekend share', grand ? `${formatNumber((weekend / grand) * 100, 0)}%` : '–'],
                    ['Top payment', payments[0] ? payments[0][0] : '–']
                ])}
            </div>
            <div class="card">
                <div class="card-title">By Day of Week</div>
                <canvas id="achartWeekday"></canvas>
            </div>
            <div class="card">
                <div class="card-title">By Payment Method</div>
                ${payments.length ? '<canvas id="achartPayment" style="margin-bottom:12px"></canvas>' : ''}
                ${statTable(['Method', 'Txns', 'Total', 'Share'], payments.map(([method, value]) => [
                    method,
                    String(value.count),
                    formatNumber(Math.round(value.total)),
                    `${formatNumber((value.total / grand) * 100, 1)}%`
                ]))}
            </div>
            <div class="card">
                <div class="card-title">Top Merchants</div>
                ${statTable(['Merchant', 'Txns', 'Total'], topMerchants.map(item => [
                    item.name.length > 28 ? `${item.name.slice(0, 27)}…` : item.name,
                    String(item.count),
                    formatNumber(Math.round(item.total))
                ]))}
            </div>
        `;
        makeChart('aWeekday', 'achartWeekday', barChartConfig(weekdays, [
            { label: 'Spent', data: weekdayTotals.map(Math.round), backgroundColor: weekdays.map((_, i) => (i >= 5 ? '#8b5cf6' : '#3b82f6')) }
        ]));
        if (payments.length) {
            makeChart('aPayment', 'achartPayment', doughnutConfig(payments.map(([method]) => method), payments.map(([, value]) => Math.round(value.total))));
        }
    }

    function renderAnalysisMonthly(range) {
        const rows = range.buckets.map(bucket => {
            const txs = rangeItems(state.transactions, bucket);
            const income = sumAmount(rangeItems(state.incomes, bucket));
            const spent = sumAmount(txs);
            return { ...bucket, income, spent, net: income - spent, count: txs.length };
        });
        const active = rows.filter(row => row.income || row.spent);
        const bestSaving = active.reduce((best, row) => (!best || row.net > best.net ? row : best), null);
        const highestSpend = active.reduce((max, row) => (!max || row.spent > max.spent ? row : max), null);

        $('analysisContent').innerHTML = `
            <div class="card">
                <div class="card-title">Highlights</div>
                ${statTiles([
                    ['Best savings', bestSaving ? `${bestSaving.label}: ${formatSigned(bestSaving.net)}` : '–'],
                    ['Highest spend', highestSpend ? `${highestSpend.label}: ${formatCurrency(Math.round(highestSpend.spent))}` : '–'],
                    ['Avg spend/mo', formatCurrency(Math.round(sumAmount(rows.map(row => ({ amount: row.spent }))) / range.months))]
                ])}
            </div>
            <div class="card">
                <div class="card-title">Net Savings per Month</div>
                <canvas id="achartNet"></canvas>
            </div>
            <div class="card">
                <div class="card-title">Month by Month</div>
                ${statTable(['Month', 'Income', 'Spent', 'Net', 'Txns'], [...active].reverse().map(row => [
                    row.longLabel,
                    formatNumber(Math.round(row.income)),
                    formatNumber(Math.round(row.spent)),
                    formatSigned(row.net).replace('₹', ''),
                    String(row.count)
                ]))}
            </div>
        `;
        makeChart('aNet', 'achartNet', barChartConfig(rows.map(row => row.label), [
            { label: 'Net', data: rows.map(row => Math.round(row.net)), backgroundColor: rows.map(row => (row.net < 0 ? EXPENSE_COLOR : INCOME_COLOR)) }
        ]));
    }

    function renderAnalysisYearly() {
        const now = new Date();
        const years = {};
        const bucket = date => {
            const year = new Date(date).getFullYear();
            if (!years[year]) years[year] = { income: 0, spent: 0, count: 0 };
            return years[year];
        };
        state.transactions.forEach(tx => {
            const item = bucket(tx.date);
            item.spent += tx.amount;
            item.count += 1;
        });
        state.incomes.forEach(income => {
            bucket(income.date).income += income.amount;
        });
        const list = Object.keys(years).sort();

        $('analysisContent').innerHTML = `
            <div class="card">
                <div class="card-title">Income vs Spending by Year</div>
                ${list.length ? '<canvas id="achartYearly"></canvas>' : '<div class="empty">No data yet</div>'}
            </div>
            <div class="card">
                <div class="card-title">Yearly Summary</div>
                ${statTable(['Year', 'Income', 'Spent', 'Net', 'Avg/mo', 'Txns'], [...list].reverse().map(year => {
                    const item = years[year];
                    const monthsElapsed = Number(year) === now.getFullYear() ? now.getMonth() + 1 : 12;
                    return [
                        year,
                        formatNumber(Math.round(item.income)),
                        formatNumber(Math.round(item.spent)),
                        formatSigned(item.income - item.spent).replace('₹', ''),
                        formatNumber(Math.round(item.spent / monthsElapsed)),
                        String(item.count)
                    ];
                }))}
            </div>
        `;
        makeChart('aYearly', 'achartYearly', barChartConfig(list, [
            { label: 'Income', data: list.map(year => Math.round(years[year].income)), backgroundColor: INCOME_COLOR },
            { label: 'Spent', data: list.map(year => Math.round(years[year].spent)), backgroundColor: EXPENSE_COLOR }
        ]));
    }

    function renderPlan() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const spent = getCategoryTotals(start);
        const budgetRows = Object.entries(state.budgets).map(([id, limit]) => {
            const category = state.categories[id];
            if (!category || Number(limit) <= 0) return '';
            const value = spent[id] || 0;
            const percent = limit > 0 ? Math.min((value / limit) * 100, 100) : 0;
            const color = percent > 90 ? 'var(--danger)' : 'var(--accent)';
            return `
                <div class="cat-item">
                    <div class="cat-top">
                        <span style="font-size:18px">${escapeHtml(category.emoji)}</span>
                        <span class="cat-name">${escapeHtml(category.name)}</span>
                        <span class="cat-val">${formatCurrency(value)} / ${formatCurrency(limit)}</span>
                    </div>
                    <div class="progress"><div style="width:${percent.toFixed(2)}%;background:${color}"></div></div>
                </div>
            `;
        }).join('');
        $('budgetList').innerHTML = budgetRows || '<div class="empty">No budgets set</div>';

        $('recList').innerHTML = state.recurring.length ? state.recurring.map(item => `
            <div class="tx-item">
                <div class="tx-info">
                    <div class="tx-merchant">${escapeHtml(item.description)}</div>
                    <div class="tx-meta">${escapeHtml(item.frequency)} • Next: ${formatDisplayDate(item.nextDue)}</div>
                </div>
                <div class="tx-amount">${formatCurrency(item.amount)}</div>
                <button class="icon-btn" data-action="rec-delete" data-id="${escapeAttr(item.id)}" type="button" style="color:var(--danger)" aria-label="Delete recurring">🗑</button>
            </div>
        `).join('') : '<div class="empty">No recurring payments set</div>';

        scheduleSliderHeight();
    }

    function openTransactionModal(id = '') {
        const linked = id ? findVehicleRecordByTx(id) : null;
        if (linked) {
            if (linked.kind === 'fuel') openFuelModal(linked.record.id);
            else openVehicleCostModal(linked.record.id);
            return;
        }
        state.txMode = id ? 'edit' : 'add';
        populateCategorySelect('txCategory');
        $('txModalTitle').textContent = id ? 'Edit Transaction' : 'Add Transaction';
        $('saveTxBtn').textContent = id ? 'Update' : 'Save Transaction';
        $('txId').value = id;

        if (id) {
            const tx = state.transactions.find(item => item.id === id);
            if (!tx) return;
            $('txAmount').value = tx.amount;
            $('txDate').value = formatInputDate(tx.date);
            $('txMerchant').value = tx.merchant;
            $('txCategory').value = state.categories[tx.category] ? tx.category : 'other';
            $('txPayment').value = tx.paymentMethod || 'cash';
        } else {
            $('txAmount').value = '';
            $('txDate').value = '';
            $('txMerchant').value = '';
            $('txCategory').value = 'other';
            $('txPayment').value = 'upi';
        }
        beginReceiptDraft('tx', id ? state.transactions.find(item => item.id === id)?.receiptId : '');
        closeFabMenu();
        openModal('txModal');
    }

    async function saveTransaction() {
        const amount = Number($('txAmount').value);
        const merchant = $('txMerchant').value.trim();
        if (!Number.isFinite(amount) || amount <= 0 || !merchant) {
            showToast('Fill amount & merchant');
            return;
        }

        const date = pickDate($('txDate').value, state.txMode === 'edit' ? state.transactions.find(item => item.id === $('txId').value)?.date : 0);
        const category = autoCategory($('txCategory').value, merchant);
        let receiptId;
        try {
            receiptId = await commitReceiptDraft();
        } catch {
            showToast('Could not save bill image');
            return;
        }
        const payload = {
            amount,
            merchant,
            category,
            paymentMethod: $('txPayment').value,
            date,
            receiptId
        };

        if (state.txMode === 'edit') {
            const tx = state.transactions.find(item => item.id === $('txId').value);
            if (!tx) return;
            Object.assign(tx, payload);
            showToast('Updated');
        } else {
            state.transactions.unshift({ id: makeId(), ...payload, source: 'manual', notes: '' });
            showToast('Saved');
        }

        sortRecords();
        persistCore();
        closeModal('txModal');
        render(state.currentTab);
    }

    function deleteTransaction(id) {
        const linked = findVehicleRecordByTx(id);
        if (!confirm(linked ? 'Delete transaction? The vehicle log entry will be removed too.' : 'Delete transaction?')) return;
        if (linked) {
            const key = linked.kind === 'fuel' ? 'fuelLogs' : 'vehicleCosts';
            state[key] = state[key].filter(item => item.id !== linked.record.id);
            persistVehicles();
        }
        state.transactions = state.transactions.filter(item => item.id !== id);
        persistCore();
        render(state.currentTab);
        showToast('Deleted');
    }

    function quickAddTransaction() {
        const text = $('quickInput').value.trim();
        // "150 lunch, 500 uber" → two expenses; commas inside numbers ("1,500") are kept.
        const parts = text.split(/\n|;|,\s+|,(?=\D)/).map(part => part.trim()).filter(Boolean);
        let added = 0;
        parts.forEach(part => {
            const amountMatch = part.match(/\d[\d,]*(?:\.\d{1,2})?/);
            const amount = amountMatch ? Number(amountMatch[0].replace(/,/g, '')) : 0;
            if (!(amount > 0)) return;
            const merchant = part.replace(amountMatch[0], '').replace(/[,\-:]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Quick Expense';
            state.transactions.unshift({
                id: makeId(),
                amount,
                merchant,
                category: autoCategory('other', part),
                paymentMethod: 'cash',
                date: Date.now(),
                source: 'quick',
                notes: part
            });
            added += 1;
        });
        if (!added) {
            showToast('No amount found');
            return;
        }
        sortRecords();
        persistCore();
        $('quickInput').value = '';
        closeModal('quickAddModal');
        showToast(added === 1 ? 'Added' : `Added ${added} expenses`);
        render(state.currentTab);
    }

    function parseSmsTransaction() {
        // Several SMS can be pasted at once, separated by a blank line.
        const messages = $('inParse').value.split(/\n\s*\n/).map(text => text.trim()).filter(Boolean);
        const parsed = messages.map(parseBankSms);
        const added = parsed.filter(item => item && !item.skip);
        const skipped = parsed.filter(item => item?.skip).length;
        if (!added.length) {
            showToast(skipped ? 'Card bill payment: not an expense or income' : 'Could not find amount');
            return;
        }

        added.forEach(item => {
            if (item.type === 'income') {
                state.incomes.unshift({ id: makeId(), amount: item.amount, source: item.party || 'SMS credit', date: item.date });
            } else {
                state.transactions.unshift({
                    id: makeId(),
                    amount: item.amount,
                    merchant: item.party || 'Parsed SMS',
                    category: autoCategory('other', `${item.party} ${item.text}`),
                    paymentMethod: item.paymentMethod,
                    date: item.date,
                    source: 'sms',
                    notes: item.text
                });
            }
        });
        sortRecords();
        persistCore();
        persistIncome();
        $('inParse').value = '';
        closeModal('parseModal');

        const incomeCount = added.filter(item => item.type === 'income').length;
        const expenseCount = added.length - incomeCount;
        if (added.length === 1) {
            const [item] = added;
            const label = item.type === 'income' ? 'Income' : 'Expense';
            showToast(`${label} ${formatCurrency(item.amount)}${item.party ? ` • ${item.party}` : ''}`);
        } else {
            const parts = [expenseCount ? `${expenseCount} expense${expenseCount > 1 ? 's' : ''}` : '', incomeCount ? `${incomeCount} income` : ''];
            showToast(`Added ${parts.filter(Boolean).join(', ')}${skipped ? `, ${skipped} skipped` : ''}`);
        }
        render(state.currentTab);
    }

    function parseBankSms(text) {
        const lower = text.toLowerCase();
        // A credit-card bill payment is a transfer, not income.
        if (/card/.test(lower) && /payment.{0,40}received|received.{0,40}payment/.test(lower)) return { skip: true };

        // Whichever keyword comes first decides: "debited ...; RAHUL credited" is a debit.
        const debitAt = lower.search(/\b(debited|debit|spent|sent|paid|withdrawn|withdrawal|purchased?|deducted)\b/);
        const creditAt = lower.search(/\b(credited|received|deposited|refund(?:ed)?)\b/);
        const type = creditAt >= 0 && (debitAt < 0 || creditAt < debitAt) ? 'income' : 'expense';

        // First currency amount that isn't the available balance or a limit.
        let amount = 0;
        for (const match of text.matchAll(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/gi)) {
            if (/bal|balance|limit|avl/.test(lower.slice(Math.max(0, match.index - 25), match.index))) continue;
            amount = Number(match[1].replace(/,/g, ''));
            break;
        }
        if (!amount) {
            const bare = text.match(/\b(?:debited|credited|sent|received|paid|spent)\s+(?:by|with|for|of)?\s*([\d,]+(?:\.\d{1,2})?)/i);
            amount = bare ? Number(bare[1].replace(/,/g, '')) : 0;
        }
        if (!(amount > 0)) return null;

        let paymentMethod = 'upi';
        if (/\bcard\b/.test(lower)) paymentMethod = 'card';
        else if (/\batm\b|withdrawn|withdrawal/.test(lower)) paymentMethod = 'cash';

        let party = findSmsParty(text, type);
        if (paymentMethod === 'cash' && (!party || /^atm$/i.test(party))) party = 'ATM withdrawal';
        return { type, amount, party, date: parseSmsDate(text), paymentMethod, text };
    }

    function findSmsParty(text, type) {
        const name = "([a-z0-9@._&'\\- ]{2,40}?)";
        const stop = "(?=\\s+(?:on|ref|refno|upi|via|avl|using|from|for|is|was|has|dated|thru|through|towards|by|in|at|to)\\b|[,;:(]|\\.(?:\\s|$)|\\s*$)";
        const patterns = type === 'income'
            ? [new RegExp(`\\bfrom\\s+(?:vpa\\s+)?${name}${stop}`, 'gi')]
            : [
                new RegExp(`\\b(?:to|at|towards)\\s+(?:vpa\\s+)?${name}${stop}`, 'gi'),
                new RegExp(`;\\s*${name}\\s+credited`, 'gi'),
                new RegExp(`\\binfo:?\\s*${name}${stop}`, 'gi')
            ];
        for (const pattern of patterns) {
            for (const match of text.matchAll(pattern)) {
                let party = match[1].trim().replace(/[.\-\s]+$/, '');
                // Skip the user's own account ("to your A/c XX1234", "from HDFC Bank A/C *1234").
                if (!party || /\b(a\/?c|acct|account|bank|card|your|you)\b|x{2,}|\*\d|^\d+$/i.test(party)) continue;
                if (party.includes('@')) party = party.split('@')[0].replace(/[._]+/g, ' ');
                if (party === party.toUpperCase() || party === party.toLowerCase()) {
                    party = party.toLowerCase().replace(/\b[a-z]/g, char => char.toUpperCase());
                }
                return party;
            }
        }
        return '';
    }

    function parseSmsDate(text) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        let parts = null;
        let match = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
        if (match) parts = [Number(match[1]), Number(match[2]), Number(match[3])];
        if (!parts && (match = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) {
            parts = [Number(match[3]), Number(match[2]), Number(match[1])];
        }
        if (!parts && (match = text.match(/\b(\d{1,2})[- ]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[- ,']*(\d{2,4})\b/i))) {
            parts = [Number(match[3]), months.indexOf(match[2].toLowerCase()) + 1, Number(match[1])];
        }
        if (!parts) return Date.now();

        const [rawYear, month, day] = parts;
        const year = rawYear < 100 ? 2000 + rawYear : rawYear;
        const date = new Date(year, month - 1, day, 12);
        const now = Date.now();
        const valid = date.getMonth() === month - 1 && date.getDate() === day
            && date.getTime() <= now + 86400000 && date.getTime() > now - 2 * 365 * 86400000;
        if (!valid) return now;
        return formatInputDate(date) === formatInputDate(now) ? now : date.getTime();
    }

    function autoCategory(selected, text) {
        if (selected && selected !== 'other') return selected;
        const lower = String(text || '').toLowerCase();
        for (const [id, category] of Object.entries(state.categories)) {
            if (id !== 'other' && lower.includes(category.name.toLowerCase())) return id;
        }
        if (/swiggy|zomato|restaurant|cafe|food|hotel|lunch|dinner/.test(lower)) return 'food';
        if (/fuel|petrol|diesel|cng|hpcl|bpcl|iocl|indian oil|shell/.test(lower)) return 'fuel';
        if (/uber|ola|rapido|metro|bus|cab/.test(lower)) return 'transport';
        if (/amazon|flipkart|myntra|shopping|store/.test(lower)) return 'shopping';
        if (/electric|water|broadband|bill|recharge/.test(lower)) return 'bills';
        if (/movie|netflix|prime|game|cinema/.test(lower)) return 'entertainment';
        if (/pharmacy|hospital|clinic|medical/.test(lower)) return 'health';
        if (/course|college|school|book/.test(lower)) return 'education';
        return 'other';
    }

    function openIncomeModal(id = '') {
        state.incomeMode = id ? 'edit' : 'add';
        $('incomeModalTitle').textContent = id ? 'Edit Income' : 'Add Income';
        $('saveIncomeBtn').textContent = id ? 'Update' : 'Save Income';
        $('incomeId').value = id;

        if (id) {
            const income = state.incomes.find(item => item.id === id);
            if (!income) return;
            $('incomeAmt').value = income.amount;
            $('incomeSource').value = income.source;
            $('incomeDate').value = formatInputDate(income.date);
        } else {
            $('incomeAmt').value = '';
            $('incomeSource').value = '';
            $('incomeDate').value = '';
        }
        closeFabMenu();
        openModal('incomeModal');
    }

    function saveIncomeRecord() {
        const amount = Number($('incomeAmt').value);
        const source = $('incomeSource').value.trim();
        if (!Number.isFinite(amount) || amount <= 0 || !source) {
            showToast('Enter amount & source');
            return;
        }

        const payload = {
            amount,
            source,
            date: pickDate($('incomeDate').value, state.incomeMode === 'edit' ? state.incomes.find(item => item.id === $('incomeId').value)?.date : 0)
        };

        if (state.incomeMode === 'edit') {
            const income = state.incomes.find(item => item.id === $('incomeId').value);
            if (!income) return;
            Object.assign(income, payload);
            showToast('Income updated');
        } else {
            state.incomes.unshift({ id: makeId(), ...payload });
            showToast('Income added');
        }

        sortRecords();
        persistIncome();
        closeModal('incomeModal');
        render(state.currentTab);
    }

    function deleteIncomeRecord(id) {
        if (!confirm('Delete income?')) return;
        state.incomes = state.incomes.filter(item => item.id !== id);
        persistIncome();
        render(state.currentTab);
        showToast('Income deleted');
    }

    function openModal(id) {
        if (id === 'budgetModal') renderBudgetInputs();
        if (id === 'catModal') renderCategoryManager();
        if (id === 'recModal') populateCategorySelect('inRecCat');
        if (id === 'syncModal') $('inBackend').value = localStorage.getItem(STORAGE.backendUrl) || '';
        $(id).classList.add('show');
        updateModalState();
    }

    function closeModal(id) {
        $(id).classList.remove('show');
        updateModalState();
    }

    function updateModalState() {
        document.body.classList.toggle('modal-open', Boolean(document.querySelector('.modal.show')));
    }

    function renderBudgetInputs() {
        $('budgetInputs').innerHTML = Object.entries(state.categories).map(([id, category]) => `
            <div class="fg" style="margin-bottom:8px">
                <label class="fl" style="font-weight:500">${escapeHtml(category.emoji)} ${escapeHtml(category.name)}</label>
                <input type="number" class="fi" style="padding:10px" data-budget-id="${escapeAttr(id)}" value="${Number(state.budgets[id] || 0)}" inputmode="decimal">
            </div>
        `).join('');
    }

    function saveBudgets() {
        document.querySelectorAll('[data-budget-id]').forEach(input => {
            state.budgets[input.dataset.budgetId] = Math.max(Number(input.value) || 0, 0);
        });
        persistCore();
        closeModal('budgetModal');
        render(3);
        showToast('Budgets saved');
    }

    function addRecurring() {
        const amount = Number($('inRecAmt').value);
        const description = $('inRecDesc').value.trim();
        const nextDue = parseInputDate($('inRecDate').value);
        if (!Number.isFinite(amount) || amount <= 0 || !description || !nextDue) {
            showToast('Fill recurring details');
            return;
        }

        state.recurring.push({
            id: makeId(),
            amount,
            description,
            category: $('inRecCat').value || 'other',
            frequency: $('inRecFreq').value,
            nextDue,
            day: new Date(nextDue).getDate()
        });
        persistCore();
        $('inRecAmt').value = '';
        $('inRecDesc').value = '';
        $('inRecDate').value = '';
        closeModal('recModal');
        render(3);
        showToast('Recurring added');
    }

    function deleteRecurring(id) {
        if (!confirm('Delete recurring payment?')) return;
        state.recurring = state.recurring.filter(item => item.id !== id);
        persistCore();
        render(3);
    }

    function processRecurring() {
        const today = Date.now();
        let changed = false;
        state.recurring.forEach(item => {
            // Catch up every occurrence missed while the app was closed, dated on its due day.
            for (let guard = 0; item.nextDue <= today && guard < 1000; guard += 1) {
                state.transactions.unshift({
                    id: makeId(),
                    amount: item.amount,
                    merchant: item.description,
                    category: item.category,
                    paymentMethod: 'auto',
                    date: item.nextDue,
                    source: 'recurring',
                    notes: ''
                });
                item.nextDue = nextRecurringDate(item.nextDue, item.frequency, item.day);
                changed = true;
            }
        });
        if (changed) {
            sortRecords();
            persistCore();
            showToast('Recurring processed');
        }
    }

    function nextRecurringDate(dateValue, frequency, day) {
        const date = new Date(dateValue);
        if (frequency === 'monthly') {
            // setMonth(+1) on the 31st overflows into the following month; clamp to the month's last day instead.
            const next = new Date(date.getFullYear(), date.getMonth() + 1, 1, date.getHours(), date.getMinutes());
            const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
            next.setDate(Math.min(day || date.getDate(), lastDay));
            return next.getTime();
        }
        if (frequency === 'weekly') date.setDate(date.getDate() + 7);
        else date.setDate(date.getDate() + 1);
        return date.getTime();
    }

    function renderCategoryManager() {
        $('catListMgr').innerHTML = Object.entries(state.categories).map(([id, category]) => {
            const canDelete = !Object.prototype.hasOwnProperty.call(DEFAULT_CATS, id);
            const deleteButton = canDelete
                ? `<button class="cat-del-btn" data-action="cat-delete" data-id="${escapeAttr(id)}" type="button" aria-label="Delete category">🗑</button>`
                : '';
            return `
                <div class="cat-manage-item">
                    <div class="cat-manage-emoji">${escapeHtml(category.emoji)}</div>
                    <div class="cat-manage-name">${escapeHtml(category.name)}</div>
                    ${deleteButton}
                </div>
            `;
        }).join('');
    }

    function addCategory() {
        const emoji = $('newCatEmoji').value.trim() || '🏷️';
        const name = $('newCatName').value.trim();
        if (!name) {
            showToast('Enter name');
            return;
        }
        const id = slugify(name) || `cat_${makeId()}`;
        const nameTaken = Object.values(state.categories).some(category => category.name.toLowerCase() === name.toLowerCase());
        if (state.categories[id] || nameTaken) {
            showToast('Category exists');
            return;
        }
        state.categories[id] = { name, emoji };
        state.budgets[id] = 0;
        persistCore();
        $('newCatEmoji').value = '';
        $('newCatName').value = '';
        renderCategoryManager();
        showToast('Category added');
    }

    function deleteCategory(id) {
        if (!state.categories[id] || DEFAULT_CATS[id]) return;
        if (!confirm('Delete category? Existing transactions will show as Unknown.')) return;
        delete state.categories[id];
        delete state.budgets[id];
        persistCore();
        renderCategoryManager();
        render(state.currentTab);
    }

    function populateCategorySelect(selectId) {
        const select = $(selectId);
        select.innerHTML = Object.entries(state.categories).map(([id, category]) => `
            <option value="${escapeAttr(id)}">${escapeHtml(category.emoji)} ${escapeHtml(category.name)}</option>
        `).join('');
    }

    function openCalendarView() {
        state.calendarDate = new Date();
        state.calendarDay = new Date().getDate();
        renderCalendar();
        openModal('calendarModal');
    }

    function changeCalendarMonth(delta) {
        const date = state.calendarDate;
        state.calendarDate = new Date(date.getFullYear(), date.getMonth() + delta, 1);
        state.calendarDay = 0;
        renderCalendar();
    }

    function renderCalendar() {
        const date = state.calendarDate;
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyTotals = {};

        state.transactions.forEach(tx => {
            const txDate = new Date(tx.date);
            if (txDate.getMonth() === month && txDate.getFullYear() === year) {
                const day = txDate.getDate();
                dailyTotals[day] = (dailyTotals[day] || 0) + tx.amount;
            }
        });

        $('calTitle').textContent = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            .map(day => `<div class="calendar-head">${day}</div>`).join('');
        for (let i = 0; i < firstDay; i += 1) html += '<div></div>';
        const today = new Date();
        for (let day = 1; day <= daysInMonth; day += 1) {
            const total = dailyTotals[day] || 0;
            const selected = day === state.calendarDay ? ' selected' : '';
            const isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate() ? ' today' : '';
            html += `
                <button class="calendar-day${selected}${isToday}" data-action="calendar-day" data-id="${day}" type="button"${total ? ` aria-label="${day}: ${escapeAttr(formatCurrency(total))}"` : ''}>
                    <div class="calendar-num">${day}</div>
                    <div class="calendar-total">${total ? escapeHtml(formatCompactCurrency(total)) : ''}</div>
                </button>
            `;
        }
        $('calendarGrid').innerHTML = html;

        const monthTotal = Object.values(dailyTotals).reduce((sum, value) => sum + value, 0);
        $('calendarMonthTotal').textContent = `Month total: ${formatCurrency(Math.round(monthTotal))}`;
        // Tapping a day lists its expenses with full amounts.
        if (!state.calendarDay) {
            $('calendarDayList').innerHTML = '<div class="date-hint">Tap a day to see its expenses</div>';
            return;
        }
        const dayStart = new Date(year, month, state.calendarDay).getTime();
        const dayEnd = new Date(year, month, state.calendarDay + 1).getTime();
        const dayTxs = state.transactions.filter(tx => tx.date >= dayStart && tx.date < dayEnd);
        $('calendarDayList').innerHTML = `<div class="filter-summary" style="margin:0 0 4px">${escapeHtml(formatDisplayDate(dayStart))} • ${formatCurrency(Math.round(dailyTotals[state.calendarDay] || 0))}</div><div id="calendarDayTxs"></div>`;
        renderTransactionList('calendarDayTxs', dayTxs, { actions: false });
    }

    function openDatePicker(input) {
        state.datePicker.input = input;
        state.datePicker.selected = input.value || formatInputDate(Date.now());
        state.datePicker.date = input.value ? new Date(parseInputDate(input.value)) : new Date();
        state.datePicker.lastValue = '';
        state.datePicker.lastTap = 0;
        $('datePickerHint').textContent = 'Tap once to preview, double tap any date to select it.';
        renderDatePicker();
        openModal('datePickerModal');
    }

    function changeDatePickerMonth(delta) {
        const date = state.datePicker.date;
        state.datePicker.date = new Date(date.getFullYear(), date.getMonth() + delta, 1);
        renderDatePicker();
    }

    function renderDatePicker() {
        const date = state.datePicker.date;
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = formatInputDate(Date.now());
        $('datePickerTitle').textContent = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

        let html = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
            .map(day => `<div class="date-head">${day}</div>`).join('');
        for (let i = 0; i < firstDay; i += 1) html += '<div></div>';
        for (let day = 1; day <= daysInMonth; day += 1) {
            const value = formatInputDate(new Date(year, month, day).getTime());
            const selected = value === state.datePicker.selected ? ' selected' : '';
            const isToday = value === today ? ' today' : '';
            html += `<button class="date-day${selected}${isToday}" data-picker-date="${value}" type="button"><span class="date-num">${day}</span></button>`;
        }
        $('datePickerGrid').innerHTML = html;
    }

    function handleDatePickerTap(value, event) {
        const now = Date.now();
        const isDoubleTap = event.detail >= 2 || (state.datePicker.lastValue === value && now - state.datePicker.lastTap < 520);
        state.datePicker.selected = value;
        state.datePicker.lastValue = value;
        state.datePicker.lastTap = now;

        if (isDoubleTap) {
            selectDateForInput(value);
            return;
        }

        $('datePickerHint').textContent = 'Double tap the highlighted date to select it.';
        renderDatePicker();
    }

    function selectDateForInput(value) {
        if (state.datePicker.input) state.datePicker.input.value = value;
        closeModal('datePickerModal');
    }

    function getVehicle(id) {
        return state.vehicles.find(vehicle => vehicle.id === id) || null;
    }

    function ensureActiveVehicle() {
        if (!getVehicle(state.activeVehicle)) {
            state.activeVehicle = state.vehicles[0]?.id || '';
        }
    }

    function fuelUnit(vehicle) {
        return FUEL_TYPES[vehicle?.fuelType]?.unit || 'L';
    }

    function fuelTxPayload(log) {
        const vehicle = getVehicle(log.vehicleId);
        const unit = fuelUnit(vehicle);
        return {
            amount: log.total,
            merchant: `${log.station || 'Fuel'} • ${vehicle?.name || 'Vehicle'}`,
            category: 'fuel',
            paymentMethod: log.paymentMethod,
            date: log.date,
            notes: `${formatNumber(log.quantity, 2)} ${unit} @ ₹${formatNumber(log.price, 2)} • ${formatNumber(log.odometer)} km`,
            receiptId: log.receiptId || ''
        };
    }

    function costTxPayload(cost) {
        const vehicle = getVehicle(cost.vehicleId);
        const type = COST_TYPES[cost.type] || COST_TYPES.other;
        return {
            amount: cost.amount,
            merchant: `${cost.title || type.name} • ${vehicle?.name || 'Vehicle'}`,
            category: 'vehicle',
            paymentMethod: cost.paymentMethod,
            date: cost.date,
            notes: `${type.name}${cost.odometer ? ` • ${formatNumber(cost.odometer)} km` : ''}`,
            receiptId: cost.receiptId || ''
        };
    }

    // Each fuel log / vehicle cost owns one expense transaction so budgets, history and analysis include it.
    function upsertLinkedTx(record, payload) {
        const tx = record.txId && state.transactions.find(item => item.id === record.txId);
        if (!(payload.amount > 0)) {
            // e.g. a fill-up imported without a price: keep it for mileage, but it is not an expense.
            removeLinkedTx(record.txId);
            record.txId = '';
            return;
        }
        if (tx) {
            Object.assign(tx, payload);
            return;
        }
        const id = makeId();
        state.transactions.unshift({ id, ...payload, source: 'vehicle' });
        record.txId = id;
    }

    function removeLinkedTx(txId) {
        if (!txId) return;
        state.transactions = state.transactions.filter(item => item.id !== txId);
    }

    function findVehicleRecordByTx(txId) {
        const fuel = state.fuelLogs.find(item => item.txId === txId);
        if (fuel) return { kind: 'fuel', record: fuel };
        const cost = state.vehicleCosts.find(item => item.txId === txId);
        return cost ? { kind: 'cost', record: cost } : null;
    }

    function reconcileVehicleTransactions() {
        const before = state.transactions.length;
        const linkedIds = new Set();
        state.fuelLogs.forEach(log => {
            upsertLinkedTx(log, fuelTxPayload(log));
            if (log.txId) linkedIds.add(log.txId);
        });
        state.vehicleCosts.forEach(cost => {
            upsertLinkedTx(cost, costTxPayload(cost));
            if (cost.txId) linkedIds.add(cost.txId);
        });
        state.transactions = state.transactions.filter(tx => tx.source !== 'vehicle' || linkedIds.has(tx.id));
        sortRecords();
        return state.transactions.length !== before || linkedIds.size > 0;
    }

    // Fuelio-style "full tank" method: mileage is measured between two full fill-ups, using every
    // litre added in between. A segment containing a "missed previous fill-up" entry is skipped.
    function getFuelStats(vehicleId) {
        const logs = state.fuelLogs
            .filter(log => log.vehicleId === vehicleId)
            .sort((a, b) => a.odometer - b.odometer || a.date - b.date);
        const economyById = {};
        const series = [];
        let lastFull = null;
        let segmentQty = 0;
        let segmentValid = true;
        let measuredDistance = 0;
        let measuredQty = 0;

        logs.forEach(log => {
            if (lastFull) {
                segmentQty += log.quantity;
                if (log.missed) segmentValid = false;
            }
            if (!log.full) return;
            const distance = lastFull ? log.odometer - lastFull.odometer : 0;
            if (lastFull && segmentValid && segmentQty > 0 && distance > 0) {
                const economy = distance / segmentQty;
                economyById[log.id] = economy;
                series.push({ date: log.date, value: economy, distance, quantity: segmentQty });
                measuredDistance += distance;
                measuredQty += segmentQty;
            }
            lastFull = log;
            segmentQty = 0;
            segmentValid = true;
        });

        const totalQty = logs.reduce((sum, log) => sum + log.quantity, 0);
        const totalCost = logs.reduce((sum, log) => sum + log.total, 0);
        // Only fill-ups with a known cost count towards the average price.
        const pricedQty = logs.filter(log => log.total > 0).reduce((sum, log) => sum + log.quantity, 0);
        return {
            logs,
            economyById,
            series,
            avgEconomy: measuredQty ? measuredDistance / measuredQty : 0,
            lastEconomy: series.length ? series[series.length - 1].value : 0,
            totalQty,
            totalCost,
            avgPrice: pricedQty ? totalCost / pricedQty : 0
        };
    }

    function getVehicleSummary(vehicleId) {
        const vehicle = getVehicle(vehicleId);
        const fuel = getFuelStats(vehicleId);
        const costs = state.vehicleCosts.filter(cost => cost.vehicleId === vehicleId);
        const odometers = [
            vehicle?.startOdometer || 0,
            ...fuel.logs.map(log => log.odometer),
            ...costs.map(cost => cost.odometer)
        ].filter(value => value > 0);
        const currentOdometer = odometers.length ? Math.max(...odometers) : 0;
        const distance = odometers.length ? currentOdometer - Math.min(...odometers) : 0;
        const otherCost = costs.reduce((sum, cost) => sum + cost.amount, 0);
        return {
            fuel,
            costs,
            currentOdometer,
            distance,
            otherCost,
            costPerKm: distance > 0 ? (fuel.totalCost + otherCost) / distance : 0
        };
    }

    function getReminderStatus(reminder, currentOdometer) {
        const now = Date.now();
        const dateOverdue = reminder.dueDate && reminder.dueDate <= now;
        const odoOverdue = reminder.dueOdometer && currentOdometer >= reminder.dueOdometer;
        if (dateOverdue || odoOverdue) return 'overdue';
        const dateSoon = reminder.dueDate && reminder.dueDate - now <= 7 * 86400000;
        const odoSoon = reminder.dueOdometer && reminder.dueOdometer - currentOdometer <= 500;
        return dateSoon || odoSoon ? 'soon' : 'ok';
    }

    function describeReminder(reminder) {
        const parts = [];
        if (reminder.dueDate) parts.push(formatDisplayDate(reminder.dueDate));
        if (reminder.dueOdometer) parts.push(`${formatNumber(reminder.dueOdometer)} km`);
        const repeat = [];
        if (reminder.repeatMonths) repeat.push(`${reminder.repeatMonths} mo`);
        if (reminder.repeatKm) repeat.push(`${formatNumber(reminder.repeatKm)} km`);
        return `Due ${parts.join(' or ')}${repeat.length ? ` • every ${repeat.join(' / ')}` : ''}`;
    }

    function renderReminderRows(reminders, { actions = true, showVehicle = false } = {}) {
        const odometers = {};
        const statusLabels = { overdue: 'Overdue', soon: 'Due soon' };
        return reminders.map(reminder => {
            if (!(reminder.vehicleId in odometers)) {
                odometers[reminder.vehicleId] = getVehicleSummary(reminder.vehicleId).currentOdometer;
            }
            const status = getReminderStatus(reminder, odometers[reminder.vehicleId]);
            const badge = statusLabels[status] ? `<span class="badge ${status}">${statusLabels[status]}</span>` : '';
            const vehicleName = showVehicle ? `${escapeHtml(getVehicle(reminder.vehicleId)?.name || '')} • ` : '';
            const actionHtml = actions ? `
                <div class="tx-actions">
                    <button class="icon-btn" data-action="reminder-done" data-id="${escapeAttr(reminder.id)}" type="button" style="color:var(--accent)" aria-label="Mark done">✓</button>
                    <button class="icon-btn" data-action="reminder-delete" data-id="${escapeAttr(reminder.id)}" type="button" style="color:var(--danger)" aria-label="Delete reminder">🗑</button>
                </div>
            ` : '';
            return `
                <div class="tx-item">
                    <div class="tx-emoji">⏰</div>
                    <div class="tx-info">
                        <div class="tx-merchant">${escapeHtml(reminder.title)}${badge}</div>
                        <div class="tx-meta">${vehicleName}${escapeHtml(describeReminder(reminder))}</div>
                    </div>
                    ${actionHtml}
                </div>
            `;
        }).join('');
    }

    function renderHomeReminders() {
        const due = state.reminders.filter(reminder => {
            const odometer = getVehicleSummary(reminder.vehicleId).currentOdometer;
            return getReminderStatus(reminder, odometer) !== 'ok';
        });
        $('homeReminderCard').hidden = !due.length;
        $('homeReminders').innerHTML = renderReminderRows(due, { actions: false, showVehicle: true });
    }

    function renderVehicle() {
        ensureActiveVehicle();
        const vehicle = getVehicle(state.activeVehicle);
        $('vehicleChips').innerHTML = [
            ...state.vehicles.map(item => {
                const active = item.id === state.activeVehicle ? ' active' : '';
                const emoji = VEHICLE_TYPES[item.type]?.emoji || '🚙';
                return `<button class="chip${active}" data-action="vehicle-select" data-id="${escapeAttr(item.id)}" type="button">${emoji} ${escapeHtml(item.name)}</button>`;
            }),
            '<button class="chip" data-action="open-vehicle" type="button">＋ Vehicle</button>'
        ].join('');
        $('vehicleEmpty').hidden = Boolean(vehicle);
        $('vehicleContent').hidden = !vehicle;
        if (!vehicle) {
            scheduleSliderHeight();
            return;
        }

        const summary = getVehicleSummary(vehicle.id);
        const { fuel } = summary;
        const unit = fuelUnit(vehicle);
        $('vehEconomy').textContent = fuel.avgEconomy ? `${formatNumber(fuel.avgEconomy, 1)} km/${unit}` : '–';
        $('vehCostKm').textContent = summary.costPerKm ? `₹${formatNumber(summary.costPerKm, 2)}` : '–';
        $('vehTitle').textContent = `${VEHICLE_TYPES[vehicle.type]?.emoji || '🚙'} ${vehicle.name} • ${FUEL_TYPES[vehicle.fuelType].name}`;

        const tiles = [
            ['Odometer', summary.currentOdometer ? `${formatNumber(summary.currentOdometer)} km` : '–'],
            ['Distance', `${formatNumber(summary.distance)} km`],
            ['Last mileage', fuel.lastEconomy ? `${formatNumber(fuel.lastEconomy, 1)}` : '–'],
            ['Fuel spend', formatCurrency(Math.round(fuel.totalCost))],
            ['Other costs', formatCurrency(Math.round(summary.otherCost))],
            [`Avg ₹/${unit}`, fuel.avgPrice ? formatNumber(fuel.avgPrice, 2) : '–'],
            [`Fuel (${unit})`, formatNumber(fuel.totalQty, 1)],
            ['Fill-ups', String(fuel.logs.length)],
            ['Services', String(summary.costs.filter(cost => cost.type === 'service').length)]
        ];
        $('vehSummary').innerHTML = tiles.map(([label, value]) => (
            `<div class="mini-card"><div class="mini-label">${escapeHtml(label)}</div><div class="mini-value">${escapeHtml(value)}</div></div>`
        )).join('');

        const reminders = state.reminders
            .filter(reminder => reminder.vehicleId === vehicle.id)
            .sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity) || (a.dueOdometer || Infinity) - (b.dueOdometer || Infinity));
        $('vehReminders').innerHTML = reminders.length
            ? renderReminderRows(reminders)
            : '<div class="empty">No reminders. Add one for service, insurance or PUC.</div>';

        renderVehicleLog(vehicle, summary);
        renderVehicleView(vehicle, summary);
        scheduleSliderHeight();
        setTimeout(scheduleSliderHeight, 80);
    }

    function renderVehicleLog(vehicle, summary) {
        const unit = fuelUnit(vehicle);
        const { economyById } = summary.fuel;
        const entries = [
            ...summary.fuel.logs.map(log => ({ kind: 'fuel', date: log.date, odometer: log.odometer, record: log })),
            ...summary.costs.map(cost => ({ kind: 'cost', date: cost.date, odometer: cost.odometer, record: cost }))
        ].sort((a, b) => b.date - a.date || b.odometer - a.odometer);

        if (!entries.length) {
            $('vehLog').innerHTML = '<div class="empty">No entries yet. Log your first fill-up.</div>';
            return;
        }

        const rows = entries.slice(0, state.vehicleLogLimit).map(({ kind, record }) => {
            let emoji;
            let title;
            let meta;
            let amount;
            if (kind === 'fuel') {
                emoji = '⛽';
                title = record.station || 'Fill-up';
                const economy = economyById[record.id];
                meta = [
                    formatDisplayDate(record.date),
                    `${formatNumber(record.odometer)} km`,
                    `${formatNumber(record.quantity, 2)} ${unit}${record.full ? '' : ' (partial)'}`,
                    economy ? `${formatNumber(economy, 1)} km/${unit}` : ''
                ];
                amount = record.total;
            } else {
                const type = COST_TYPES[record.type] || COST_TYPES.other;
                emoji = type.emoji;
                title = record.title || type.name;
                meta = [formatDisplayDate(record.date), record.title ? type.name : '', record.odometer ? `${formatNumber(record.odometer)} km` : ''];
                amount = record.amount;
            }
            const prefix = kind === 'fuel' ? 'fuel' : 'vcost';
            return `
                <div class="tx-item">
                    <div class="tx-emoji">${emoji}</div>
                    <div class="tx-info">
                        <div class="tx-merchant">${escapeHtml(title)}</div>
                        <div class="tx-meta">${escapeHtml(meta.filter(Boolean).join(' • '))}</div>
                    </div>
                    <div class="tx-amount">${amount ? formatCurrency(amount) : "–"}</div>
                    <div class="tx-actions">
                        ${receiptButton(record.receiptId)}
                        <button class="icon-btn" data-action="${prefix}-edit" data-id="${escapeAttr(record.id)}" type="button" aria-label="Edit entry">✎</button>
                        <button class="icon-btn" data-action="${prefix}-delete" data-id="${escapeAttr(record.id)}" type="button" style="color:var(--danger)" aria-label="Delete entry">🗑</button>
                    </div>
                </div>
            `;
        }).join('');
        const more = entries.length > state.vehicleLogLimit
            ? '<button class="btn btn-s" data-action="vehicle-more" type="button">Load more</button>'
            : '';
        $('vehLog').innerHTML = rows + more;
    }

    const VEHICLE_VIEWS = {
        overview: '📋 Overview',
        fuel: '⛽ Fuel',
        costs: '💸 Costs',
        monthly: '📅 Monthly',
        yearly: '📆 Yearly',
        compare: '🚗 Compare'
    };

    const VEHICLE_CHART_KEYS = ['vEconomy', 'vPrice', 'vCostType', 'vMonthlyCost', 'vDistance', 'vYearly', 'vCompare'];

    function renderVehicleView(vehicle, summary) {
        if (!VEHICLE_VIEWS[state.vehicleView]) state.vehicleView = 'overview';
        $('vehicleViews').innerHTML = Object.entries(VEHICLE_VIEWS).map(([id, label]) => {
            const active = id === state.vehicleView ? ' active' : '';
            return `<button class="chip${active}" data-action="vehicle-view" data-id="${id}" type="button">${label}</button>`;
        }).join('');
        document.querySelectorAll('[data-vview]').forEach(section => {
            section.hidden = section.dataset.vview !== state.vehicleView;
        });

        VEHICLE_CHART_KEYS.forEach(destroyChart);
        const renderers = {
            fuel: renderFuelStatsView,
            costs: renderCostStatsView,
            monthly: renderMonthlyStatsView,
            yearly: renderYearlyStatsView,
            compare: renderCompareView
        };
        if (renderers[state.vehicleView]) renderers[state.vehicleView](vehicle, summary);
    }

    function statTiles(tiles) {
        return `<div class="mini-grid">${tiles.map(([label, value]) => (
            `<div class="mini-card"><div class="mini-label">${escapeHtml(label)}</div><div class="mini-value">${escapeHtml(value)}</div></div>`
        )).join('')}</div>`;
    }

    function statTable(headers, rows) {
        if (!rows.length) return '<div class="empty">No data yet</div>';
        const head = headers.map(header => `<th>${escapeHtml(header)}</th>`).join('');
        const body = rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
        return `<div class="table-wrap"><table class="stat-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
    }

    function orDash(value, digits = 1, suffix = '') {
        return value ? `${formatNumber(value, digits)}${suffix}` : '–';
    }

    function makeChart(key, canvasId, config) {
        if (!window.Chart || !$(canvasId)) return;
        const isDark = document.body.classList.contains('dark');
        Chart.defaults.color = isDark ? '#a1a1aa' : '#6b7280';
        Chart.defaults.borderColor = isDark ? '#3f3f46' : '#e5e7eb';
        destroyChart(key);
        state.charts[key] = new Chart($(canvasId).getContext('2d'), config);
    }

    function lineChartConfig(labels, data, label, color) {
        return {
            type: 'line',
            data: {
                labels,
                datasets: [{ label, data, borderColor: color, backgroundColor: `${color}1f`, fill: true, tension: 0.3 }]
            },
            options: {
                plugins: { legend: { display: false } },
                responsive: true,
                scales: { y: { grid: { display: false } }, x: { grid: { display: false } } }
            }
        };
    }

    function barChartConfig(labels, datasets, stacked = false) {
        return {
            type: 'bar',
            data: { labels, datasets: datasets.map(set => ({ borderRadius: 4, ...set })) },
            options: {
                plugins: { legend: { display: datasets.length > 1, position: 'bottom' } },
                responsive: true,
                scales: {
                    y: { stacked, beginAtZero: true, grid: { display: false } },
                    x: { stacked, grid: { display: false } }
                }
            }
        };
    }

    // Buckets distance, fuel and costs by period. Distance between consecutive odometer readings
    // is credited to the period of the later reading.
    function groupVehiclePeriods(summary, keyOf) {
        const buckets = {};
        const bucket = date => {
            const key = keyOf(new Date(date));
            if (!buckets[key]) {
                buckets[key] = { distance: 0, quantity: 0, fuelCost: 0, otherCost: 0, fills: 0, segDistance: 0, segQuantity: 0 };
            }
            return buckets[key];
        };
        summary.fuel.logs.forEach(log => {
            const item = bucket(log.date);
            item.quantity += log.quantity;
            item.fuelCost += log.total;
            item.fills += 1;
        });
        summary.costs.forEach(cost => {
            bucket(cost.date).otherCost += cost.amount;
        });
        summary.fuel.series.forEach(point => {
            const item = bucket(point.date);
            item.segDistance += point.distance;
            item.segQuantity += point.quantity;
        });
        const readings = [
            ...summary.fuel.logs.map(log => ({ date: log.date, odometer: log.odometer })),
            ...summary.costs.filter(cost => cost.odometer).map(cost => ({ date: cost.date, odometer: cost.odometer }))
        ].sort((a, b) => a.odometer - b.odometer || a.date - b.date);
        readings.forEach((reading, i) => {
            if (i > 0) bucket(reading.date).distance += reading.odometer - readings[i - 1].odometer;
        });
        return buckets;
    }

    const monthKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = date => String(date.getFullYear());

    function renderFuelStatsView(vehicle, summary) {
        const unit = fuelUnit(vehicle);
        const { fuel } = summary;
        const economies = fuel.series.map(point => point.value);
        const priced = fuel.logs.filter(log => log.total > 0);
        const prices = priced.map(log => log.price).filter(Boolean);
        const gaps = fuel.logs.slice(1).map((log, i) => log.odometer - fuel.logs[i].odometer).filter(gap => gap > 0);
        const lastPriced = [...priced].sort((a, b) => b.date - a.date)[0];
        const series = fuel.series.slice(-24);
        const priceSeries = [...priced].sort((a, b) => a.date - b.date).slice(-24);

        $('vviewFuel').innerHTML = `
            <div class="card">
                <div class="card-title">Mileage (km/${escapeHtml(unit)})</div>
                ${statTiles([
                    ['Average', orDash(fuel.avgEconomy)],
                    ['Best', orDash(economies.length ? Math.max(...economies) : 0)],
                    ['Worst', orDash(economies.length ? Math.min(...economies) : 0)],
                    ['Last', orDash(fuel.lastEconomy)],
                    [`${unit}/100 km`, orDash(fuel.avgEconomy ? 100 / fuel.avgEconomy : 0, 2)],
                    ['Measured fills', String(fuel.series.length)]
                ])}
                <div class="chart-caption" style="margin-top:14px">${series.length ? 'Between full-tank fill-ups' : 'Log at least two full-tank fill-ups to see mileage.'}</div>
                <canvas id="vchartEconomy"></canvas>
            </div>
            <div class="card">
                <div class="card-title">Fuel Price (₹/${escapeHtml(unit)})</div>
                ${statTiles([
                    ['Average', orDash(fuel.avgPrice, 2)],
                    ['Lowest', orDash(prices.length ? Math.min(...prices) : 0, 2)],
                    ['Highest', orDash(prices.length ? Math.max(...prices) : 0, 2)],
                    ['Last', orDash(lastPriced?.price, 2)]
                ].concat([['Fuel ₹/km', orDash(summary.distance ? fuel.totalCost / summary.distance : 0, 2)], ['Total spend', formatCurrency(Math.round(fuel.totalCost))]]))}
                <canvas id="vchartPrice" style="margin-top:14px"></canvas>
            </div>
            <div class="card">
                <div class="card-title">Fill-ups</div>
                ${statTiles([
                    ['Count', String(fuel.logs.length)],
                    ['Full tank', String(fuel.logs.filter(log => log.full).length)],
                    ['Partial', String(fuel.logs.filter(log => !log.full).length)],
                    [`Avg ${unit}/fill`, orDash(fuel.logs.length ? fuel.totalQty / fuel.logs.length : 0, 2)],
                    ['Avg ₹/fill', priced.length ? formatCurrency(Math.round(fuel.totalCost / priced.length)) : '–'],
                    ['Avg km/fill', orDash(gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0, 0)]
                ])}
            </div>
        `;
        makeChart('vEconomy', 'vchartEconomy', lineChartConfig(
            series.map(point => formatDisplayDate(point.date)),
            series.map(point => roundTo(point.value, 2)),
            `km/${unit}`,
            '#10b981'
        ));
        makeChart('vPrice', 'vchartPrice', lineChartConfig(
            priceSeries.map(log => formatDisplayDate(log.date)),
            priceSeries.map(log => log.price),
            `₹/${unit}`,
            '#f59e0b'
        ));
    }

    function renderCostStatsView(vehicle, summary) {
        const totals = { fuel: summary.fuel.totalCost };
        const counts = { fuel: summary.fuel.logs.filter(log => log.total > 0).length };
        summary.costs.forEach(cost => {
            totals[cost.type] = (totals[cost.type] || 0) + cost.amount;
            counts[cost.type] = (counts[cost.type] || 0) + 1;
        });
        const entries = Object.entries(totals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
        const grand = entries.reduce((sum, [, value]) => sum + value, 0);
        const labelOf = type => (type === 'fuel' ? '⛽ Fuel' : `${COST_TYPES[type].emoji} ${COST_TYPES[type].name}`);

        const dates = [...summary.fuel.logs, ...summary.costs].map(item => item.date);
        const days = dates.length ? Math.max((Date.now() - Math.min(...dates)) / 86400000, 1) : 0;

        $('vviewCosts').innerHTML = `
            <div class="card">
                <div class="card-title">Running Cost</div>
                ${statTiles([
                    ['Total', formatCurrency(Math.round(grand))],
                    ['Per day', days ? formatCurrency(Math.round(grand / days)) : '–'],
                    ['Per month', days ? formatCurrency(Math.round((grand / days) * 30.44)) : '–'],
                    ['Per km', summary.distance ? `₹${formatNumber(grand / summary.distance, 2)}` : '–'],
                    ['Fuel / km', summary.distance ? `₹${formatNumber(summary.fuel.totalCost / summary.distance, 2)}` : '–'],
                    ['Other / km', summary.distance ? `₹${formatNumber(summary.otherCost / summary.distance, 2)}` : '–']
                ])}
            </div>
            <div class="card">
                <div class="card-title">By Type</div>
                ${entries.length ? '<canvas id="vchartCostType" style="margin-bottom:12px"></canvas>' : ''}
                ${statTable(['Type', 'Entries', 'Total', 'Share'], entries.map(([type, value]) => [
                    labelOf(type),
                    String(counts[type] || 0),
                    formatCurrency(Math.round(value)),
                    `${formatNumber((value / grand) * 100, 1)}%`
                ]))}
            </div>
        `;
        if (!entries.length) return;
        makeChart('vCostType', 'vchartCostType', {
            type: 'doughnut',
            data: {
                labels: entries.map(([type]) => labelOf(type)),
                datasets: [{
                    data: entries.map(([, value]) => Math.round(value)),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#94a3b8', '#84cc16'],
                    borderColor: document.body.classList.contains('dark') ? '#27272a' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: { plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }
        });
    }

    function renderMonthlyStatsView(vehicle, summary) {
        const unit = fuelUnit(vehicle);
        const buckets = groupVehiclePeriods(summary, monthKey);
        const now = new Date();
        const months = [];
        for (let i = 11; i >= 0; i -= 1) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ key: monthKey(date), label: date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) });
        }
        const empty = { distance: 0, quantity: 0, fuelCost: 0, otherCost: 0, segDistance: 0, segQuantity: 0 };
        const data = months.map(month => ({ ...month, ...(buckets[month.key] || empty) }));
        const thisMonth = data[data.length - 1];
        const active = data.filter(item => item.distance || item.fuelCost || item.otherCost || item.quantity);
        const avg = field => (active.length ? active.reduce((sum, item) => sum + item[field], 0) / active.length : 0);

        $('vviewMonthly').innerHTML = `
            <div class="card">
                <div class="card-title">This Month</div>
                ${statTiles([
                    ['Distance', `${formatNumber(thisMonth.distance)} km`],
                    ['Fuel', formatCurrency(Math.round(thisMonth.fuelCost))],
                    ['Other', formatCurrency(Math.round(thisMonth.otherCost))],
                    ['Avg km/mo', formatNumber(avg('distance'))],
                    ['Avg ₹/mo', formatCurrency(Math.round(avg('fuelCost') + avg('otherCost')))],
                    [`Avg ${unit}/mo`, formatNumber(avg('quantity'), 1)]
                ])}
            </div>
            <div class="card">
                <div class="card-title">Cost per Month</div>
                <canvas id="vchartMonthlyCost"></canvas>
            </div>
            <div class="card">
                <div class="card-title">Distance per Month</div>
                <canvas id="vchartDistance"></canvas>
            </div>
            <div class="card">
                <div class="card-title">Last 12 Months</div>
                ${statTable(['Month', 'km', unit, 'Fuel ₹', 'Other ₹', `km/${unit}`], [...active].reverse().map(item => [
                    item.label,
                    formatNumber(item.distance),
                    formatNumber(item.quantity, 1),
                    formatNumber(Math.round(item.fuelCost)),
                    formatNumber(Math.round(item.otherCost)),
                    orDash(item.segQuantity ? item.segDistance / item.segQuantity : 0)
                ]))}
            </div>
        `;
        const labels = data.map(item => item.label);
        makeChart('vMonthlyCost', 'vchartMonthlyCost', barChartConfig(labels, [
            { label: 'Fuel', data: data.map(item => Math.round(item.fuelCost)), backgroundColor: '#10b981' },
            { label: 'Other', data: data.map(item => Math.round(item.otherCost)), backgroundColor: '#3b82f6' }
        ], true));
        makeChart('vDistance', 'vchartDistance', barChartConfig(labels, [
            { label: 'km', data: data.map(item => Math.round(item.distance)), backgroundColor: '#8b5cf6' }
        ]));
    }

    function renderYearlyStatsView(vehicle, summary) {
        const unit = fuelUnit(vehicle);
        const buckets = groupVehiclePeriods(summary, yearKey);
        const years = Object.keys(buckets).sort();
        const rows = [...years].reverse().map(year => {
            const item = buckets[year];
            const total = item.fuelCost + item.otherCost;
            return [
                year,
                formatNumber(item.distance),
                formatNumber(item.quantity, 1),
                formatNumber(Math.round(total)),
                orDash(item.segQuantity ? item.segDistance / item.segQuantity : 0),
                item.distance ? formatNumber(total / item.distance, 2) : '–'
            ];
        });
        $('vviewYearly').innerHTML = `
            <div class="card">
                <div class="card-title">Cost per Year</div>
                ${years.length ? '<canvas id="vchartYearly"></canvas>' : '<div class="empty">No data yet</div>'}
            </div>
            <div class="card">
                <div class="card-title">Yearly Summary</div>
                ${statTable(['Year', 'km', unit, 'Total ₹', `km/${unit}`, '₹/km'], rows)}
            </div>
        `;
        makeChart('vYearly', 'vchartYearly', barChartConfig(years, [
            { label: 'Fuel', data: years.map(year => Math.round(buckets[year].fuelCost)), backgroundColor: '#10b981' },
            { label: 'Other', data: years.map(year => Math.round(buckets[year].otherCost)), backgroundColor: '#3b82f6' }
        ], true));
    }

    function renderCompareView() {
        const rows = state.vehicles.map(vehicle => {
            const summary = getVehicleSummary(vehicle.id);
            const total = summary.fuel.totalCost + summary.otherCost;
            return { vehicle, summary, total };
        });
        $('vviewCompare').innerHTML = `
            <div class="card">
                <div class="card-title">All Vehicles</div>
                ${statTable(['Vehicle', 'km', 'Mileage', '₹/km', 'Total ₹'], rows.map(({ vehicle, summary, total }) => [
                    `${VEHICLE_TYPES[vehicle.type]?.emoji || '🚙'} ${vehicle.name}`,
                    formatNumber(summary.distance),
                    summary.fuel.avgEconomy ? `${formatNumber(summary.fuel.avgEconomy, 1)} km/${fuelUnit(vehicle)}` : '–',
                    summary.costPerKm ? formatNumber(summary.costPerKm, 2) : '–',
                    formatNumber(Math.round(total))
                ]))}
            </div>
            <div class="card">
                <div class="card-title">Total Cost by Vehicle</div>
                <canvas id="vchartCompare"></canvas>
            </div>
        `;
        makeChart('vCompare', 'vchartCompare', barChartConfig(rows.map(row => row.vehicle.name), [
            { label: 'Fuel', data: rows.map(row => Math.round(row.summary.fuel.totalCost)), backgroundColor: '#10b981' },
            { label: 'Other', data: rows.map(row => Math.round(row.summary.otherCost)), backgroundColor: '#3b82f6' }
        ], true));
    }

    function selectVehicle(id) {
        if (!getVehicle(id)) return;
        state.activeVehicle = id;
        state.vehicleLogLimit = 30;
        persistVehicles();
        renderVehicle();
    }

    function populateOptions(selectId, map) {
        $(selectId).innerHTML = Object.entries(map).map(([id, item]) => (
            `<option value="${escapeAttr(id)}">${item.emoji ? `${escapeHtml(item.emoji)} ` : ''}${escapeHtml(item.name)}</option>`
        )).join('');
    }

    function populateVehicleSelect(selectId, selected) {
        $(selectId).innerHTML = state.vehicles.map(vehicle => (
            `<option value="${escapeAttr(vehicle.id)}">${escapeHtml(vehicle.name)}</option>`
        )).join('');
        $(selectId).value = getVehicle(selected) ? selected : state.vehicles[0]?.id || '';
    }

    function requireVehicle() {
        if (state.vehicles.length) return true;
        closeFabMenu();
        showToast('Add a vehicle first');
        openVehicleModal();
        return false;
    }

    function openVehicleModal(id = '') {
        const vehicle = id ? getVehicle(id) : null;
        populateOptions('vehicleType', VEHICLE_TYPES);
        populateOptions('vehicleFuel', FUEL_TYPES);
        $('vehicleModalTitle').textContent = vehicle ? 'Edit Vehicle' : 'Add Vehicle';
        $('saveVehicleBtn').textContent = vehicle ? 'Update' : 'Save Vehicle';
        $('deleteVehicleBtn').hidden = !vehicle;
        $('vehicleId').value = vehicle ? vehicle.id : '';
        $('vehicleName').value = vehicle ? vehicle.name : '';
        $('vehicleType').value = vehicle ? vehicle.type : 'car';
        $('vehicleFuel').value = vehicle ? vehicle.fuelType : 'petrol';
        $('vehicleStartOdo').value = vehicle && vehicle.startOdometer ? vehicle.startOdometer : '';
        openModal('vehicleModal');
    }

    function saveVehicle() {
        const name = $('vehicleName').value.trim();
        if (!name) {
            showToast('Enter vehicle name');
            return;
        }
        const payload = {
            name,
            type: $('vehicleType').value,
            fuelType: $('vehicleFuel').value,
            startOdometer: toPositive($('vehicleStartOdo').value)
        };
        const existing = getVehicle($('vehicleId').value);
        if (existing) {
            Object.assign(existing, payload);
            // Vehicle name/unit appear in linked expense descriptions.
            state.fuelLogs.filter(log => log.vehicleId === existing.id).forEach(log => upsertLinkedTx(log, fuelTxPayload(log)));
            state.vehicleCosts.filter(cost => cost.vehicleId === existing.id).forEach(cost => upsertLinkedTx(cost, costTxPayload(cost)));
            persistCore();
            showToast('Vehicle updated');
        } else {
            const vehicle = { id: makeId(), ...payload };
            state.vehicles.push(vehicle);
            state.activeVehicle = vehicle.id;
            showToast('Vehicle added');
        }
        persistVehicles();
        closeModal('vehicleModal');
        render(state.currentTab);
    }

    function deleteVehicle(id) {
        const vehicle = getVehicle(id);
        if (!vehicle) return;
        if (!confirm(`Delete ${vehicle.name}? All its fill-ups, costs and reminders (and their expenses) will be removed.`)) return;
        const removedTxIds = new Set([
            ...state.fuelLogs.filter(log => log.vehicleId === id).map(log => log.txId),
            ...state.vehicleCosts.filter(cost => cost.vehicleId === id).map(cost => cost.txId)
        ]);
        state.transactions = state.transactions.filter(tx => !removedTxIds.has(tx.id));
        state.vehicles = state.vehicles.filter(item => item.id !== id);
        state.fuelLogs = state.fuelLogs.filter(log => log.vehicleId !== id);
        state.vehicleCosts = state.vehicleCosts.filter(cost => cost.vehicleId !== id);
        state.reminders = state.reminders.filter(reminder => reminder.vehicleId !== id);
        ensureActiveVehicle();
        persistCore();
        persistVehicles();
        closeModal('vehicleModal');
        render(state.currentTab);
        showToast('Vehicle deleted');
    }

    function updateFuelUnitLabels() {
        const unit = fuelUnit(getVehicle($('fuelVehicle').value));
        $('fuelQtyLabel').textContent = unit === 'L' ? 'Litres' : unit;
        $('fuelPriceLabel').textContent = `₹ / ${unit}`;
        const odometer = getVehicleSummary($('fuelVehicle').value).currentOdometer;
        $('fuelOdo').placeholder = odometer ? `Last: ${formatNumber(odometer)}` : 'e.g. 12500';
    }

    // Any two of quantity / price / total fill in the third.
    function autoFillFuel(changed) {
        const qty = toPositive($('fuelQty').value);
        const price = toPositive($('fuelPrice').value);
        const total = toPositive($('fuelTotal').value);
        if (changed !== 'fuelTotal' && qty && price) {
            $('fuelTotal').value = roundTo(qty * price, 2);
        } else if (changed === 'fuelTotal' && total && price) {
            $('fuelQty').value = roundTo(total / price, 2);
        } else if (changed === 'fuelTotal' && total && qty) {
            $('fuelPrice').value = roundTo(total / qty, 2);
        }
    }

    function openFuelModal(id = '') {
        if (!requireVehicle()) return;
        const log = id ? state.fuelLogs.find(item => item.id === id) : null;
        if (id && !log) return;
        state.fuelMode = log ? 'edit' : 'add';
        populateVehicleSelect('fuelVehicle', log ? log.vehicleId : state.activeVehicle);
        $('fuelModalTitle').textContent = log ? 'Edit Fill-up' : 'Log Fill-up';
        $('saveFuelBtn').textContent = log ? 'Update' : 'Save Fill-up';
        $('fuelId').value = log ? log.id : '';
        $('fuelDate').value = log ? formatInputDate(log.date) : '';
        $('fuelOdo').value = log ? log.odometer : '';
        $('fuelQty').value = log ? log.quantity : '';
        const latestPriced = state.fuelLogs
            .filter(item => item.vehicleId === $('fuelVehicle').value && item.price > 0)
            .sort((a, b) => b.date - a.date)[0];
        $('fuelPrice').value = log ? log.price : (latestPriced?.price || '');
        $('fuelTotal').value = log ? log.total : '';
        $('fuelFull').checked = log ? log.full : true;
        $('fuelMissed').checked = log ? log.missed : false;
        $('fuelStation').value = log ? log.station : '';
        $('fuelPayment').value = log ? log.paymentMethod : 'upi';
        beginReceiptDraft('fuel', log ? log.receiptId : '');
        updateFuelUnitLabels();
        closeFabMenu();
        openModal('fuelModal');
    }

    async function saveFuelLog() {
        const vehicleId = $('fuelVehicle').value;
        const odometer = toPositive($('fuelOdo').value);
        const quantity = toPositive($('fuelQty').value);
        let price = toPositive($('fuelPrice').value);
        let total = toPositive($('fuelTotal').value);
        if (!total && quantity && price) total = roundTo(quantity * price, 2);
        if (!price && quantity && total) price = roundTo(total / quantity, 2);
        if (!getVehicle(vehicleId) || !odometer || !quantity || !total) {
            showToast('Fill odometer, quantity & cost');
            return;
        }
        const editing = state.fuelMode === 'edit' ? state.fuelLogs.find(item => item.id === $('fuelId').value) : null;
        const date = pickDate($('fuelDate').value, editing?.date);
        const outOfOrder = state.fuelLogs.some(item => item.vehicleId === vehicleId && item !== editing
            && ((item.date < date && item.odometer > odometer) || (item.date > date && item.odometer < odometer)));
        if (outOfOrder && !confirm('This odometer reading doesn\'t fit between your other fill-ups. Check the date and km. Save anyway?')) return;
        let receiptId;
        try {
            receiptId = await commitReceiptDraft();
        } catch {
            showToast('Could not save bill image');
            return;
        }

        const payload = {
            vehicleId,
            date,
            odometer,
            quantity,
            price,
            total,
            full: $('fuelFull').checked,
            missed: $('fuelMissed').checked,
            station: $('fuelStation').value.trim(),
            paymentMethod: $('fuelPayment').value,
            receiptId
        };

        let log;
        if (state.fuelMode === 'edit') {
            log = state.fuelLogs.find(item => item.id === $('fuelId').value);
            if (!log) return;
            Object.assign(log, payload);
            showToast('Fill-up updated');
        } else {
            log = { id: makeId(), ...payload, txId: '' };
            state.fuelLogs.push(log);
            showToast('Fill-up saved');
        }
        upsertLinkedTx(log, fuelTxPayload(log));
        state.activeVehicle = vehicleId;
        sortRecords();
        persistCore();
        persistVehicles();
        closeModal('fuelModal');
        render(state.currentTab);
    }

    function deleteFuelLog(id) {
        const log = state.fuelLogs.find(item => item.id === id);
        if (!log || !confirm('Delete fill-up? Its expense will be removed too.')) return;
        state.fuelLogs = state.fuelLogs.filter(item => item.id !== id);
        removeLinkedTx(log.txId);
        persistCore();
        persistVehicles();
        render(state.currentTab);
        showToast('Deleted');
    }

    function openVehicleCostModal(id = '') {
        if (!requireVehicle()) return;
        const cost = id ? state.vehicleCosts.find(item => item.id === id) : null;
        if (id && !cost) return;
        state.vcostMode = cost ? 'edit' : 'add';
        populateVehicleSelect('vcostVehicle', cost ? cost.vehicleId : state.activeVehicle);
        populateOptions('vcostType', COST_TYPES);
        $('vcostModalTitle').textContent = cost ? 'Edit Vehicle Cost' : 'Add Vehicle Cost';
        $('saveVcostBtn').textContent = cost ? 'Update' : 'Save Cost';
        $('vcostId').value = cost ? cost.id : '';
        $('vcostType').value = cost ? cost.type : 'service';
        $('vcostAmount').value = cost ? cost.amount : '';
        $('vcostTitle').value = cost ? cost.title : '';
        $('vcostDate').value = cost ? formatInputDate(cost.date) : '';
        $('vcostOdo').value = cost && cost.odometer ? cost.odometer : '';
        $('vcostPayment').value = cost ? cost.paymentMethod : 'upi';
        beginReceiptDraft('vcost', cost ? cost.receiptId : '');
        closeFabMenu();
        openModal('vcostModal');
    }

    async function saveVehicleCost() {
        const vehicleId = $('vcostVehicle').value;
        const amount = toPositive($('vcostAmount').value);
        if (!getVehicle(vehicleId) || !amount) {
            showToast('Enter amount');
            return;
        }
        let receiptId;
        try {
            receiptId = await commitReceiptDraft();
        } catch {
            showToast('Could not save bill image');
            return;
        }
        const payload = {
            vehicleId,
            type: $('vcostType').value,
            title: $('vcostTitle').value.trim(),
            amount,
            date: pickDate($('vcostDate').value, state.vcostMode === 'edit' ? state.vehicleCosts.find(item => item.id === $('vcostId').value)?.date : 0),
            odometer: toPositive($('vcostOdo').value),
            paymentMethod: $('vcostPayment').value,
            receiptId
        };

        let cost;
        if (state.vcostMode === 'edit') {
            cost = state.vehicleCosts.find(item => item.id === $('vcostId').value);
            if (!cost) return;
            Object.assign(cost, payload);
            showToast('Cost updated');
        } else {
            cost = { id: makeId(), ...payload, txId: '' };
            state.vehicleCosts.push(cost);
            showToast('Cost saved');
        }
        upsertLinkedTx(cost, costTxPayload(cost));
        state.activeVehicle = vehicleId;
        sortRecords();
        persistCore();
        persistVehicles();
        closeModal('vcostModal');
        render(state.currentTab);
    }

    function deleteVehicleCost(id) {
        const cost = state.vehicleCosts.find(item => item.id === id);
        if (!cost || !confirm('Delete cost? Its expense will be removed too.')) return;
        state.vehicleCosts = state.vehicleCosts.filter(item => item.id !== id);
        removeLinkedTx(cost.txId);
        persistCore();
        persistVehicles();
        render(state.currentTab);
        showToast('Deleted');
    }

    function openReminderModal() {
        if (!requireVehicle()) return;
        ['reminderTitle', 'reminderDate', 'reminderOdo', 'reminderRepeatMonths', 'reminderRepeatKm'].forEach(id => {
            $(id).value = '';
        });
        const odometer = getVehicleSummary(state.activeVehicle).currentOdometer;
        $('reminderOdo').placeholder = odometer ? `Now: ${formatNumber(odometer)}` : 'Optional';
        openModal('reminderModal');
    }

    function saveReminder() {
        const reminder = normalizeReminder({
            vehicleId: state.activeVehicle,
            title: $('reminderTitle').value,
            dueDate: parseInputDate($('reminderDate').value),
            dueOdometer: $('reminderOdo').value,
            repeatMonths: $('reminderRepeatMonths').value,
            repeatKm: $('reminderRepeatKm').value
        });
        if (!reminder || !getVehicle(reminder.vehicleId)) {
            showToast('Enter title and a due date or km');
            return;
        }
        state.reminders.push(reminder);
        persistVehicles();
        closeModal('reminderModal');
        render(state.currentTab);
        showToast('Reminder added');
    }

    function completeReminder(id) {
        const reminder = state.reminders.find(item => item.id === id);
        if (!reminder) return;
        if (!reminder.repeatMonths && !reminder.repeatKm) {
            state.reminders = state.reminders.filter(item => item.id !== id);
            showToast('Reminder completed');
        } else {
            const now = new Date();
            reminder.dueDate = reminder.repeatMonths
                ? new Date(now.getFullYear(), now.getMonth() + reminder.repeatMonths, now.getDate()).getTime()
                : 0;
            reminder.dueOdometer = reminder.repeatKm
                ? getVehicleSummary(reminder.vehicleId).currentOdometer + reminder.repeatKm
                : 0;
            showToast('Next reminder scheduled');
        }
        persistVehicles();
        render(state.currentTab);
    }

    function deleteReminder(id) {
        if (!confirm('Delete reminder?')) return;
        state.reminders = state.reminders.filter(item => item.id !== id);
        persistVehicles();
        render(state.currentTab);
    }

    // Bill images are too big for localStorage, so they live in IndexedDB keyed by receiptId.
    function receiptStore(mode, run) {
        if (!receiptStore.db) {
            receiptStore.db = new Promise((resolve, reject) => {
                const request = indexedDB.open('expenseReceipts', 1);
                request.onupgradeneeded = () => request.result.createObjectStore('receipts');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        return receiptStore.db.then(db => new Promise((resolve, reject) => {
            const request = run(db.transaction('receipts', mode).objectStore('receipts'));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        }));
    }

    // Images written this session are never swept, so a pending cleanup can't race a save/import.
    const freshReceiptIds = new Set();
    const getReceipt = id => receiptStore('readonly', store => store.get(id));
    const putReceipt = (id, blob) => {
        freshReceiptIds.add(id);
        return receiptStore('readwrite', store => store.put(blob, id));
    };
    const deleteReceipt = id => receiptStore('readwrite', store => store.delete(id));

    function referencedReceiptIds() {
        return new Set([...state.transactions, ...state.fuelLogs, ...state.vehicleCosts]
            .map(item => item.receiptId)
            .filter(Boolean));
    }

    // Removes images whose expense / vehicle entry was deleted.
    function scheduleReceiptCleanup() {
        clearTimeout(scheduleReceiptCleanup.timer);
        scheduleReceiptCleanup.timer = setTimeout(async () => {
            try {
                const used = referencedReceiptIds();
                const keys = await receiptStore('readonly', store => store.getAllKeys());
                await Promise.all(keys.filter(key => !used.has(key) && !freshReceiptIds.has(key)).map(deleteReceipt));
            } catch (error) {
                console.log('Receipt cleanup failed:', error);
            }
        }, 1000);
    }

    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();
            image.onload = () => {
                const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(image.naturalWidth * scale);
                canvas.height = Math.round(image.naturalHeight * scale);
                canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Compression failed'))), 'image/jpeg', 0.75);
            };
            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Unsupported image'));
            };
            image.src = url;
        });
    }

    // One draft at a time: only one form modal is open at once.
    function beginReceiptDraft(field, receiptId = '') {
        if (state.receipt.previewUrl) URL.revokeObjectURL(state.receipt.previewUrl);
        state.receipt = { field, existingId: receiptId, blob: null, removed: false, previewUrl: '' };
        renderReceiptField();
        if (!receiptId) return;
        getReceipt(receiptId).then(blob => {
            if (!blob || state.receipt.field !== field || state.receipt.existingId !== receiptId || state.receipt.blob) return;
            state.receipt.previewUrl = URL.createObjectURL(blob);
            renderReceiptField();
        }).catch(() => {});
    }

    function renderReceiptField() {
        const { field, previewUrl, existingId, blob, removed } = state.receipt;
        const container = field && $(`${field}Receipt`);
        if (!container) return;
        const hasImage = (blob || existingId) && !removed;
        const preview = hasImage ? `
            <div class="receipt-preview">
                ${previewUrl ? `<img src="${escapeAttr(previewUrl)}" alt="Bill preview" data-action="receipt-preview">` : ''}
                <span>${blob ? 'New bill attached' : 'Bill attached'}</span>
                <button class="icon-btn" data-action="receipt-remove" type="button" style="color:var(--danger)" aria-label="Remove bill">✕</button>
            </div>
        ` : '';
        container.innerHTML = `${preview}
            <div class="receipt-buttons">
                <button class="btn" data-action="receipt-camera" type="button">📷 ${hasImage ? 'Retake' : 'Camera'}</button>
                <button class="btn" data-action="receipt-upload" type="button">🖼️ ${hasImage ? 'Replace' : 'Upload'}</button>
            </div>
        `;
    }

    async function handleReceiptFile(event) {
        const input = event.target;
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !state.receipt.field) return;
        if (!file.type.startsWith('image/')) {
            showToast('Please choose an image');
            return;
        }
        try {
            const blob = await compressImage(file);
            if (state.receipt.previewUrl) URL.revokeObjectURL(state.receipt.previewUrl);
            Object.assign(state.receipt, { blob, removed: false, previewUrl: URL.createObjectURL(blob) });
            renderReceiptField();
        } catch {
            showToast('Could not read image');
        }
    }

    function removeReceiptDraft() {
        if (state.receipt.previewUrl) URL.revokeObjectURL(state.receipt.previewUrl);
        Object.assign(state.receipt, { blob: null, removed: true, previewUrl: '' });
        renderReceiptField();
    }

    // Returns the receiptId the saved record should point to. Old images are removed by cleanup.
    async function commitReceiptDraft() {
        const { blob, removed, existingId } = state.receipt;
        if (blob) {
            const id = `rcpt_${makeId()}`;
            await putReceipt(id, blob);
            return id;
        }
        return removed ? '' : existingId;
    }

    async function viewReceipt(id) {
        let url = state.receipt.previewUrl;
        if (id) {
            const blob = await getReceipt(id).catch(() => null);
            if (!blob) {
                showToast('Bill image not found');
                return;
            }
            if (viewReceipt.url) URL.revokeObjectURL(viewReceipt.url);
            viewReceipt.url = URL.createObjectURL(blob);
            url = viewReceipt.url;
        }
        if (!url) return;
        $('receiptImage').src = url;
        openModal('receiptModal');
    }

    function receiptButton(receiptId) {
        return receiptId
            ? `<button class="icon-btn" data-action="receipt-view" data-id="${escapeAttr(receiptId)}" type="button" aria-label="View bill">📎</button>`
            : '';
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
        });
    }

    async function exportReceipts() {
        const receipts = {};
        for (const id of referencedReceiptIds()) {
            const blob = await getReceipt(id).catch(() => null);
            if (blob) receipts[id] = await blobToDataUrl(blob);
        }
        return receipts;
    }

    async function importReceipts(receipts) {
        if (!receipts || typeof receipts !== 'object') return;
        for (const [id, dataUrl] of Object.entries(receipts)) {
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) continue;
            const blob = await (await fetch(dataUrl)).blob();
            await putReceipt(id, blob);
        }
    }

    async function exportJSON() {
        let receipts = {};
        try {
            receipts = await exportReceipts();
        } catch {
            showToast('Bill images could not be exported');
        }
        const data = { ...buildExportData(), receipts };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `expense_backup_${formatInputDate(Date.now())}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    }

    function buildExportData() {
        return {
            version: 3,
            exportedAt: new Date().toISOString(),
            transactions: state.transactions,
            budgets: state.budgets,
            recurring: state.recurring,
            categories: state.categories,
            incomes: state.incomes,
            vehicles: state.vehicles,
            fuelLogs: state.fuelLogs,
            vehicleCosts: state.vehicleCosts,
            reminders: state.reminders
        };
    }

    function importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async event => {
                try {
                    const data = JSON.parse(event.target.result);
                    await importReceipts(data.receipts).catch(() => showToast('Some bill images failed to import'));
                    applyImportedData(data);
                    showToast('Backup imported');
                    render(state.currentTab);
                } catch {
                    showToast('Invalid backup file');
                }
            };
            reader.readAsText(file);
        });
        input.click();
    }

    function applyImportedData(data) {
        if (!data || typeof data !== 'object') throw new Error('Invalid backup');
        if (data.categories && typeof data.categories === 'object') {
            state.categories = normalizeCategories({ ...DEFAULT_CATS, ...data.categories });
        }
        if (data.budgets && typeof data.budgets === 'object') {
            state.budgets = { ...DEFAULT_BUDGETS, ...normalizeNumberMap(data.budgets) };
        }
        Object.keys(state.categories).forEach(id => {
            if (!(id in state.budgets)) state.budgets[id] = 0;
        });
        if (Array.isArray(data.transactions)) {
            state.transactions = data.transactions.map(normalizeTransaction).filter(Boolean);
        }
        if (Array.isArray(data.recurring)) {
            state.recurring = data.recurring.map(normalizeRecurring).filter(Boolean);
        }
        if (Array.isArray(data.incomes)) {
            state.incomes = data.incomes.map(normalizeIncome).filter(Boolean);
        }
        loadVehicleState(data);
        ensureActiveVehicle();
        sortRecords();
        reconcileVehicleTransactions();
        persistAll();
    }

    // Fuelio exports one CSV per vehicle (Backup → CSV, e.g. "vehicle-1-sync.csv") made of
    // "## Vehicle", "## Log", "## CostCategories" and "## Costs" sections.
    function importFuelio() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv,text/plain';
        input.multiple = true;
        input.addEventListener('change', async () => {
            const files = [...(input.files || [])];
            if (!files.length) return;
            const totals = { vehicles: 0, fuel: 0, costs: 0, reminders: 0, skipped: 0 };
            let failed = 0;
            for (const file of files) {
                try {
                    const parsed = parseFuelioCsv(await file.text(), file.name.replace(/\.[^.]+$/, ''));
                    const result = mergeFuelioVehicle(parsed);
                    Object.keys(totals).forEach(key => {
                        totals[key] += result[key];
                    });
                } catch {
                    failed += 1;
                }
            }
            if (failed === files.length) {
                showToast('Not a Fuelio CSV export');
                return;
            }
            sortRecords();
            persistCore();
            persistVehicles();
            state.vehicleView = 'overview';
            switchTab(4);
            const skipped = totals.skipped ? `, ${totals.skipped} duplicates skipped` : '';
            showToast(`Imported ${totals.fuel} fill-ups, ${totals.costs} costs${skipped}`);
        });
        input.click();
    }

    function parseCsv(text) {
        const rows = [];
        let row = [];
        let cell = '';
        let quoted = false;
        for (let i = 0; i < text.length; i += 1) {
            const char = text[i];
            if (quoted) {
                if (char === '"' && text[i + 1] === '"') {
                    cell += '"';
                    i += 1;
                } else if (char === '"') {
                    quoted = false;
                } else {
                    cell += char;
                }
            } else if (char === '"') {
                quoted = true;
            } else if (char === ',') {
                row.push(cell);
                cell = '';
            } else if (char === '\n' || char === '\r') {
                if (char === '\r' && text[i + 1] === '\n') i += 1;
                row.push(cell);
                rows.push(row);
                row = [];
                cell = '';
            } else {
                cell += char;
            }
        }
        if (cell || row.length) {
            row.push(cell);
            rows.push(row);
        }
        return rows;
    }

    function parseFuelioCsv(text, fallbackName) {
        const sections = {};
        let current = null;
        parseCsv(text.replace(/^﻿/, '')).forEach(row => {
            const first = String(row[0] || '').trim();
            if (first.startsWith('##')) {
                current = { header: null, rows: [] };
                sections[first.replace(/^#+/, '').trim().toLowerCase()] = current;
                return;
            }
            if (!current || row.every(cell => !String(cell).trim())) return;
            if (!current.header) current.header = row.map(cell => String(cell).trim().toLowerCase());
            else current.rows.push(row);
        });
        if (!sections.log || !sections.log.header) throw new Error('Missing log section');

        // Columns are matched by name ("Odo (km)" → "odo") so column order/extra columns don't matter.
        const reader = section => {
            const header = section?.header || [];
            return (row, ...names) => {
                const index = header.findIndex(h => names.some(name => h === name || h.startsWith(`${name} `) || h.startsWith(`${name}(`)));
                return index >= 0 ? String(row[index] ?? '').trim() : '';
            };
        };

        const vehicleRow = sections.vehicle?.rows[0] || [];
        const vehicleCol = reader(sections.vehicle);
        const logCol = reader(sections.log);
        const odoHeader = sections.log.header.find(h => h.startsWith('odo')) || '';
        const distFactor = vehicleCol(vehicleRow, 'distunit') === '1' || odoHeader.includes('(mi') ? 1.609344 : 1;
        const fuelUnitCode = vehicleCol(vehicleRow, 'fuelunit');
        const volFactor = fuelUnitCode === '1' ? 3.78541 : fuelUnitCode === '2' ? 4.54609 : 1;
        const fuelTypeByCode = { 1: 'petrol', 2: 'diesel', 3: 'petrol', 4: 'lpg', 5: 'cng', 6: 'electric' };
        const tankType = vehicleCol(vehicleRow, 'tank1type');

        const vehicle = {
            name: vehicleCol(vehicleRow, 'name') || [vehicleCol(vehicleRow, 'make'), vehicleCol(vehicleRow, 'model')].filter(Boolean).join(' ') || fallbackName,
            fuelType: fuelTypeByCode[tankType.charAt(0)] || 'petrol',
            // Fuelio has no vehicle type, so guess from the names and tank size.
            type: guessFuelioVehicleType(
                ['name', 'description', 'make', 'model'].map(name => vehicleCol(vehicleRow, name)).join(' '),
                parseCsvNumber(vehicleCol(vehicleRow, 'tank1capacity')) * volFactor
            )
        };

        const fuelLogs = sections.log.rows.map(row => {
            const date = parseFlexibleDate(logCol(row, 'data', 'date'));
            const quantity = parseCsvNumber(logCol(row, 'fuel')) * volFactor;
            const unitPrice = parseCsvNumber(logCol(row, 'volumeprice')) / volFactor;
            let total = parseCsvNumber(logCol(row, 'price'));
            if (!total && unitPrice) total = quantity * unitPrice;
            return {
                date,
                odometer: roundTo(parseCsvNumber(logCol(row, 'odo')) * distFactor, 1),
                quantity: roundTo(quantity, 3),
                total: roundTo(total, 2),
                price: unitPrice ? roundTo(unitPrice, 2) : 0,
                full: logCol(row, 'full') !== '0',
                missed: logCol(row, 'missed') === '1',
                station: logCol(row, 'city') || logCol(row, 'notes'),
                paymentMethod: 'cash'
            };
        }).filter(log => log.date);

        const categoryCol = reader(sections.costcategories);
        const categories = {};
        (sections.costcategories?.rows || []).forEach(row => {
            categories[categoryCol(row, 'costtypeid')] = categoryCol(row, 'name');
        });

        const costCol = reader(sections.costs);
        const costs = [];
        const reminders = [];
        (sections.costs?.rows || []).forEach(row => {
            if (costCol(row, 'isincome') === '1' || costCol(row, 'istemplate') === '1') return;
            const date = parseFlexibleDate(costCol(row, 'date'));
            if (!date) return;
            const title = costCol(row, 'costtitle', 'title');
            const categoryName = categories[costCol(row, 'costtypeid')] || '';
            const amount = parseCsvNumber(costCol(row, 'cost'));
            if (amount > 0) {
                costs.push({
                    date,
                    title: title || categoryName,
                    type: mapFuelioCostType(`${categoryName} ${title}`),
                    amount: roundTo(amount, 2),
                    odometer: roundTo(parseCsvNumber(costCol(row, 'odo')) * distFactor, 1),
                    paymentMethod: 'cash'
                });
            }
            // Fuelio stores placeholder remind dates on costs without a reminder; only keep future-dated ones.
            const remindDate = parseFlexibleDate(costCol(row, 'reminddate'));
            const remindOdo = parseCsvNumber(costCol(row, 'remindodo')) * distFactor;
            const hasReminder = (remindDate && remindDate > date) || remindOdo > 0;
            if (hasReminder && costCol(row, 'read') !== '1') {
                reminders.push({
                    title: title || categoryName || 'Reminder',
                    dueDate: remindDate > date ? remindDate : 0,
                    dueOdometer: roundTo(remindOdo, 0),
                    repeatMonths: parseCsvNumber(costCol(row, 'repeatmonths')),
                    repeatKm: roundTo(parseCsvNumber(costCol(row, 'repeatodo')) * distFactor, 0)
                });
            }
        });

        return { vehicle, fuelLogs, costs, reminders };
    }

    function guessFuelioVehicleType(text, tankLitres) {
        const lower = text.toLowerCase();
        if (/scoot|activa|jupiter|access|ntorq|dio|vespa|ather|chetak/.test(lower)) return 'scooter';
        if (/bike|motorcycle|moto|royal enfield|bullet|triumph|ktm|harley|ducati|yamaha r|pulsar|apache|splendor/.test(lower)) return 'bike';
        if (/truck|lorry|tempo|pickup/.test(lower)) return 'truck';
        if (tankLitres > 0 && tankLitres <= 20) return 'bike';
        return 'car';
    }

    function mapFuelioCostType(text) {
        const lower = text.toLowerCase();
        if (/insur/.test(lower)) return 'insurance';
        if (/tyre|tire|wheel/.test(lower)) return 'tyres';
        if (/park/.test(lower)) return 'parking';
        if (/toll|highway|fastag/.test(lower)) return 'toll';
        if (/wash|clean/.test(lower)) return 'wash';
        if (/regist|tax|puc|pollution|licen|permit|inspection/.test(lower)) return 'registration';
        if (/fine|ticket|challan|penalt/.test(lower)) return 'fine';
        if (/repair|accident|damage/.test(lower)) return 'repair';
        if (/service|maint|oil|filter|brake|battery/.test(lower)) return 'service';
        return 'other';
    }

    function mergeFuelioVehicle(parsed) {
        const result = { vehicles: 0, fuel: 0, costs: 0, reminders: 0, skipped: 0 };
        let vehicle = state.vehicles.find(item => item.name.toLowerCase() === parsed.vehicle.name.toLowerCase());
        if (!vehicle) {
            vehicle = normalizeVehicle(parsed.vehicle);
            if (!vehicle) throw new Error('Invalid vehicle');
            state.vehicles.push(vehicle);
            result.vehicles = 1;
        }
        state.activeVehicle = vehicle.id;

        // Re-importing the same export must not create duplicates.
        const dayOf = value => formatInputDate(value);
        const fuelKey = log => `${Math.round(log.odometer)}|${Math.round(log.quantity * 100)}`;
        const costKey = cost => `${dayOf(cost.date)}|${Math.round(cost.amount)}|${cost.title.toLowerCase()}`;
        const reminderKey = reminder => `${reminder.title.toLowerCase()}|${reminder.dueDate}|${reminder.dueOdometer}`;
        const fuelKeys = new Set(state.fuelLogs.filter(log => log.vehicleId === vehicle.id).map(fuelKey));
        const costKeys = new Set(state.vehicleCosts.filter(cost => cost.vehicleId === vehicle.id).map(costKey));
        const reminderKeys = new Set(state.reminders.filter(reminder => reminder.vehicleId === vehicle.id).map(reminderKey));

        parsed.fuelLogs.forEach(raw => {
            const log = normalizeFuelLog({ ...raw, vehicleId: vehicle.id });
            if (!log) return;
            if (fuelKeys.has(fuelKey(log))) {
                result.skipped += 1;
                return;
            }
            fuelKeys.add(fuelKey(log));
            state.fuelLogs.push(log);
            upsertLinkedTx(log, fuelTxPayload(log));
            result.fuel += 1;
        });
        parsed.costs.forEach(raw => {
            const cost = normalizeVehicleCost({ ...raw, vehicleId: vehicle.id });
            if (!cost) return;
            if (costKeys.has(costKey(cost))) {
                result.skipped += 1;
                return;
            }
            costKeys.add(costKey(cost));
            state.vehicleCosts.push(cost);
            upsertLinkedTx(cost, costTxPayload(cost));
            result.costs += 1;
        });
        parsed.reminders.forEach(raw => {
            const reminder = normalizeReminder({ ...raw, vehicleId: vehicle.id });
            if (!reminder || reminderKeys.has(reminderKey(reminder))) return;
            reminderKeys.add(reminderKey(reminder));
            state.reminders.push(reminder);
            result.reminders += 1;
        });
        return result;
    }

    function parseCsvNumber(value) {
        const text = String(value || '').trim();
        const normalized = text.includes('.') ? text.replace(/,/g, '') : text.replace(',', '.');
        const number = Number(normalized);
        return Number.isFinite(number) && number > 0 ? number : 0;
    }

    function parseFlexibleDate(value) {
        const text = String(value || '').trim();
        let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
        if (match) {
            const [, year, month, day, hour = 0, minute = 0] = match.map(Number);
            return new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
        }
        match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (match) {
            const [, day, month, year] = match.map(Number);
            return new Date(year, month - 1, day).getTime();
        }
        const parsed = Date.parse(text);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    async function syncData() {
        const backendUrl = $('inBackend').value.trim();
        localStorage.setItem(STORAGE.backendUrl, backendUrl);
        if (!backendUrl) {
            showToast('Enter backend URL');
            return;
        }

        try {
            showToast('Syncing...');
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildExportData())
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            showToast('Sync complete');
        } catch {
            showToast('Sync failed');
        }
    }

    function toggleDark() {
        document.body.classList.toggle('dark');
        localStorage.setItem(STORAGE.dark, document.body.classList.contains('dark'));
        if (state.currentTab === 2) renderAnalysis();
        if (state.currentTab === 4) renderVehicle();
    }

    function toggleFabMenu() {
        state.fabOpen = !state.fabOpen;
        $('fabSecondaryGroup').classList.toggle('hidden', !state.fabOpen);
    }

    function closeFabMenu() {
        state.fabOpen = false;
        $('fabSecondaryGroup').classList.add('hidden');
    }

    function handleScroll() {
        const fab = document.querySelector('.fab-container');
        if (!fab || document.body.classList.contains('modal-open')) return;
        const currentY = window.scrollY;
        if (currentY > state.lastScrollY + 10) {
            fab.classList.add('auto-hidden');
        } else if (currentY < state.lastScrollY - 10) {
            fab.classList.remove('auto-hidden');
        }
        state.lastScrollY = Math.max(currentY, 0);
    }

    function handleTouchStart(event) {
        const touch = event.changedTouches[0];
        state.touch = {
            x: touch.screenX,
            y: touch.screenY,
            blocked: isSwipeBlocked(event.target)
        };
    }

    function handleTouchEnd(event) {
        if (!state.touch || state.touch.blocked) return;
        const touch = event.changedTouches[0];
        const dx = touch.screenX - state.touch.x;
        const dy = touch.screenY - state.touch.y;
        state.touch = null;

        if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.18) return;
        if (dx < 0 && state.currentTab < TAB_COUNT - 1) switchTab(state.currentTab + 1);
        if (dx > 0 && state.currentTab > 0) switchTab(state.currentTab - 1);
    }

    function isSwipeBlocked(target) {
        if (document.querySelector('.modal.show')) return true;
        return Boolean(target.closest('button,input,textarea,select,a,.tx-item,.chip-row,canvas,.no-swipe'));
    }

    async function installApp() {
        if (!state.deferredPrompt) return;
        state.deferredPrompt.prompt();
        const { outcome } = await state.deferredPrompt.userChoice;
        if (outcome === 'accepted') $('installBtn').style.display = 'none';
        state.deferredPrompt = null;
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        navigator.serviceWorker.register('./sw.js').catch(error => {
            console.log('SW registration failed:', error);
        });
    }

    function getStats() {
        const now = new Date();
        const startMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        return {
            monthTotal: state.transactions.filter(tx => tx.date >= startMonth).reduce((sum, tx) => sum + tx.amount, 0),
            dayTotal: state.transactions.filter(tx => tx.date >= startDay).reduce((sum, tx) => sum + tx.amount, 0)
        };
    }

    function getCategoryTotals(startDate) {
        return state.transactions
            .filter(tx => tx.date >= startDate)
            .reduce((acc, tx) => {
                acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
                return acc;
            }, {});
    }

    function loadMoreTransactions() {
        state.txRenderLimit += 100;
        renderHistory();
    }

    function destroyChart(key) {
        if (state.charts[key]) {
            state.charts[key].destroy();
            state.charts[key] = null;
        }
    }

    function scheduleSliderHeight() {
        cancelAnimationFrame(state.heightRaf);
        state.heightRaf = requestAnimationFrame(setSliderHeight);
    }

    function setSliderHeight() {
        const active = $(`tab${state.currentTab}`);
        if (!active) return;
        fitMiniValues(active);
        $('mainSlider').style.height = `${active.offsetHeight}px`;
    }

    // Shrinks tile and stat values that don't fit their box (long amounts, narrow phones, large system fonts).
    function fitMiniValues(root) {
        root.querySelectorAll('.mini-value, .stat-value').forEach(element => {
            element.style.fontSize = '';
            if (!element.clientWidth) return;
            let size = parseFloat(getComputedStyle(element).fontSize);
            while (element.scrollWidth > element.clientWidth && size > 10) {
                size -= 1;
                element.style.fontSize = `${size}px`;
            }
        });
    }

    function showToast(message) {
        const toast = $('toast');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
    }

    function formatCurrency(value) {
        const number = Number(value) || 0;
        return `₹${number.toLocaleString('en-IN', { maximumFractionDigits: number % 1 ? 2 : 0 })}`;
    }

    // Fits narrow cells: ₹850, ₹1.2k, ₹12k, ₹1.5L, ₹2.3Cr.
    function formatCompactCurrency(value) {
        const number = Math.round(Number(value) || 0);
        const units = [[1e7, 'Cr'], [1e5, 'L'], [1e3, 'k']];
        for (const [size, suffix] of units) {
            if (number >= size) {
                const scaled = number / size;
                return `₹${scaled < 10 ? Number(scaled.toFixed(1)) : Math.round(scaled)}${suffix}`;
            }
        }
        return `₹${number}`;
    }

    function formatDisplayDate(value) {
        const date = new Date(value);
        const options = { day: '2-digit', month: 'short' };
        if (date.getFullYear() !== new Date().getFullYear()) options.year = '2-digit';
        return date.toLocaleDateString('en-IN', options);
    }

    function formatInputDate(value) {
        const date = new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Date inputs are day-precision; keep the original time when an edit leaves the day unchanged.
    function pickDate(inputValue, previous) {
        if (previous && inputValue === formatInputDate(previous)) return previous;
        return parseInputDate(inputValue) || Date.now();
    }

    function parseInputDate(value) {
        if (!value) return 0;
        const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return 0;
        const [, year, month, day] = match.map(Number);
        const date = new Date(year, month - 1, day);
        return Number.isFinite(date.getTime()) ? date.getTime() : 0;
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]);
    }

    function escapeAttr(value) {
        return escapeHtml(value);
    }

    function slugify(value) {
        return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }

    function makeId() {
        return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }

    function roundTo(value, digits) {
        const factor = 10 ** digits;
        return Math.round(value * factor) / factor;
    }

    function formatNumber(value, digits = 0) {
        return (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: digits });
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
})();
