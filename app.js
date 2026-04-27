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
        backendUrl: 'backendUrl'
    };

    const state = {
        categories: {},
        transactions: [],
        budgets: {},
        recurring: [],
        incomes: [],
        filters: { period: 'month', search: '' },
        charts: {},
        currentTab: 0,
        fabOpen: false,
        txMode: 'add',
        incomeMode: 'add',
        txRenderLimit: 100,
        calendarDate: new Date(),
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

        $('fabMain').addEventListener('click', toggleFabMenu);
        $('saveTxBtn').addEventListener('click', saveTransaction);
        $('quickAddBtn').addEventListener('click', quickAddTransaction);
        $('parseTxBtn').addEventListener('click', parseSmsTransaction);
        $('saveBudgetsBtn').addEventListener('click', saveBudgets);
        $('addRecBtn').addEventListener('click', addRecurring);
        $('addCatBtn').addEventListener('click', addCategory);
        $('saveIncomeBtn').addEventListener('click', saveIncomeRecord);
        $('syncBtn').addEventListener('click', syncData);
        $('installBtn').addEventListener('click', installApp);

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

    function handleDocumentClick(event) {
        const closeButton = event.target.closest('[data-close]');
        if (closeButton) {
            closeModal(closeButton.dataset.close);
            return;
        }

        const periodButton = event.target.closest('[data-period]');
        if (periodButton) {
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
            'load-more': loadMoreTransactions
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
        sortRecords();
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
            notes: raw.notes ? String(raw.notes) : ''
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
            nextDue: normalizeDate(raw.nextDue)
        };
    }

    function normalizeDate(value) {
        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : Date.now();
    }

    function persistCore() {
        localStorage.setItem(STORAGE.categories, JSON.stringify(state.categories));
        localStorage.setItem(STORAGE.transactions, JSON.stringify(state.transactions));
        localStorage.setItem(STORAGE.budgets, JSON.stringify(state.budgets));
        localStorage.setItem(STORAGE.recurring, JSON.stringify(state.recurring));
    }

    function persistIncome() {
        localStorage.setItem(STORAGE.incomes, JSON.stringify(state.incomes));
    }

    function persistAll() {
        persistCore();
        persistIncome();
    }

    function sortRecords() {
        state.transactions.sort((a, b) => b.date - a.date);
        state.incomes.sort((a, b) => b.date - a.date);
    }

    function switchTab(index) {
        const nextTab = clamp(Number(index), 0, 4);
        if (Number.isNaN(nextTab)) return;
        state.currentTab = nextTab;
        $('mainSlider').style.transform = `translate3d(-${nextTab * 20}%, 0, 0)`;
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
        if (tabIndex === 4) scheduleSliderHeight();
    }

    function renderHome() {
        const stats = getStats();
        $('statMonth').textContent = formatCurrency(stats.monthTotal);
        $('statToday').textContent = formatCurrency(stats.dayTotal);
        renderMonthlySummary();
        renderBudgetOverview(stats.monthTotal);
        renderTransactionList('recentList', state.transactions, { limit: 5, actions: false });
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
            html += `<div class="mini-card"><div class="mini-label">${escapeHtml(label)}</div><div class="mini-value">${formatCurrency(total)}</div></div>`;
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
        if (state.filters.period === 'today') {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
            filtered = filtered.filter(tx => tx.date >= start);
        } else if (state.filters.period === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            filtered = filtered.filter(tx => tx.date >= start);
        }
        if (state.filters.search) {
            filtered = filtered.filter(tx => tx.merchant.toLowerCase().includes(state.filters.search));
        }

        $('periodChips').innerHTML = ['all', 'month', 'today'].map(period => {
            const label = period.charAt(0).toUpperCase() + period.slice(1);
            const active = state.filters.period === period ? ' active' : '';
            return `<button class="chip${active}" data-period="${period}" type="button">${label}</button>`;
        }).join('');

        renderIncomeList();
        renderTransactionList('txList', filtered, { actions: true, paged: true });
        scheduleSliderHeight();
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
                    ${actionHtml}
                </div>
            `;
        }).join('');

        const more = paged && list.length > effectiveLimit
            ? '<button class="btn btn-s" data-action="load-more" type="button">Load more</button>'
            : '';
        container.innerHTML = rows + more;
    }

    function renderIncomeList() {
        const container = $('incomeList');
        if (!state.incomes.length) {
            container.innerHTML = '<div class="empty">No income records</div>';
            return;
        }

        container.innerHTML = state.incomes.map(income => `
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

    function renderAnalysis() {
        const insights = getInsights();
        $('insightsContent').innerHTML = `
            • Top spend: <b>${escapeHtml(insights.topName)}</b> (${formatCurrency(insights.topValue)})<br>
            • Daily avg: <b>${formatCurrency(insights.dailyAverage)}</b><br>
            • Count: <b>${insights.count}</b>
        `;

        if (!window.Chart) {
            $('insightsContent').innerHTML += '<br>• Charts need one online load so Chart.js can be cached.';
            scheduleSliderHeight();
            return;
        }

        const isDark = document.body.classList.contains('dark');
        Chart.defaults.color = isDark ? '#a1a1aa' : '#6b7280';
        Chart.defaults.borderColor = isDark ? '#3f3f46' : '#e5e7eb';
        renderTrendChart();
        renderIncomeExpenseChart();
        renderCategoryChart();
        scheduleSliderHeight();
        setTimeout(scheduleSliderHeight, 80);
    }

    function renderTrendChart() {
        const now = new Date();
        const labels = [];
        const data = [];
        for (let i = 5; i >= 0; i -= 1) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            labels.push(start.toLocaleDateString('en-IN', { month: 'short' }));
            data.push(state.transactions
                .filter(tx => tx.date >= start.getTime() && tx.date < end.getTime())
                .reduce((sum, tx) => sum + tx.amount, 0));
        }

        destroyChart('trend');
        state.charts.trend = new Chart($('chartTrend').getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{ label: 'Spend', data, backgroundColor: '#10b981', borderRadius: 4 }]
            },
            options: {
                plugins: { legend: { display: false } },
                responsive: true,
                scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
            }
        });
    }

    function renderIncomeExpenseChart() {
        const now = new Date();
        const labels = [];
        const expenseData = [];
        const incomeData = [];
        for (let i = 5; i >= 0; i -= 1) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            labels.push(start.toLocaleDateString('en-IN', { month: 'short' }));
            expenseData.push(state.transactions
                .filter(tx => tx.date >= start.getTime() && tx.date < end.getTime())
                .reduce((sum, tx) => sum + tx.amount, 0));
            incomeData.push(state.incomes
                .filter(income => income.date >= start.getTime() && income.date < end.getTime())
                .reduce((sum, income) => sum + income.amount, 0));
        }

        destroyChart('incomeExpense');
        state.charts.incomeExpense = new Chart($('chartIncomeExpense').getContext('2d'), {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: 'Expense', data: expenseData, borderColor: '#f43f5e', backgroundColor: 'transparent', tension: 0.3 },
                    { label: 'Income', data: incomeData, borderColor: '#22c55e', backgroundColor: 'transparent', tension: 0.3 }
                ]
            },
            options: {
                plugins: { legend: { position: 'bottom' } },
                responsive: true,
                scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
            }
        });
    }

    function renderCategoryChart() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const totals = getCategoryTotals(start);
        const entries = Object.entries(totals).filter(([, value]) => value > 0);
        const labels = entries.length ? entries.map(([key]) => state.categories[key]?.name || key) : ['No data'];
        const data = entries.length ? entries.map(([, value]) => value) : [1];
        const colors = entries.length
            ? ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#94a3b8']
            : ['#d1d5db'];

        destroyChart('category');
        state.charts.category = new Chart($('chartCat').getContext('2d'), {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: document.body.classList.contains('dark') ? '#27272a' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: { plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11 } } } } }
        });
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
        closeFabMenu();
        openModal('txModal');
    }

    function saveTransaction() {
        const amount = Number($('txAmount').value);
        const merchant = $('txMerchant').value.trim();
        if (!Number.isFinite(amount) || amount <= 0 || !merchant) {
            showToast('Fill amount & merchant');
            return;
        }

        const date = parseInputDate($('txDate').value) || Date.now();
        const category = autoCategory($('txCategory').value, merchant);
        const payload = {
            amount,
            merchant,
            category,
            paymentMethod: $('txPayment').value,
            date
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
        if (!confirm('Delete transaction?')) return;
        state.transactions = state.transactions.filter(item => item.id !== id);
        persistCore();
        render(state.currentTab);
        showToast('Deleted');
    }

    function quickAddTransaction() {
        const text = $('quickInput').value.trim();
        const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)/);
        if (!amountMatch) {
            showToast('No amount found');
            return;
        }

        const amount = Number(amountMatch[1]);
        const merchant = text.replace(amountMatch[0], '').replace(/[,\-:]+/g, ' ').trim() || 'Quick Expense';
        state.transactions.unshift({
            id: makeId(),
            amount,
            merchant,
            category: autoCategory('other', text),
            paymentMethod: 'cash',
            date: Date.now(),
            source: 'quick',
            notes: text
        });
        sortRecords();
        persistCore();
        $('quickInput').value = '';
        closeModal('quickAddModal');
        showToast('Added');
        render(state.currentTab);
    }

    function parseSmsTransaction() {
        const text = $('inParse').value.trim();
        const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (!amountMatch) {
            showToast('Could not find amount');
            return;
        }
        const amount = Number(amountMatch[1].replace(/,/g, ''));
        state.transactions.unshift({
            id: makeId(),
            amount,
            merchant: 'Parsed SMS',
            category: autoCategory('other', text),
            paymentMethod: 'upi',
            date: Date.now(),
            source: 'sms',
            notes: text
        });
        sortRecords();
        persistCore();
        $('inParse').value = '';
        closeModal('parseModal');
        showToast('Parsed & added');
        render(state.currentTab);
    }

    function autoCategory(selected, text) {
        if (selected && selected !== 'other') return selected;
        const lower = String(text || '').toLowerCase();
        for (const [id, category] of Object.entries(state.categories)) {
            if (id !== 'other' && lower.includes(category.name.toLowerCase())) return id;
        }
        if (/swiggy|zomato|restaurant|cafe|food|hotel|lunch|dinner/.test(lower)) return 'food';
        if (/uber|ola|rapido|fuel|petrol|metro|bus|cab/.test(lower)) return 'transport';
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
            date: parseInputDate($('incomeDate').value) || Date.now()
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
            nextDue
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
        state.recurring = state.recurring.filter(item => item.id !== id);
        persistCore();
        render(3);
    }

    function processRecurring() {
        const today = Date.now();
        let changed = false;
        state.recurring.forEach(item => {
            if (item.nextDue > today) return;
            state.transactions.unshift({
                id: makeId(),
                amount: item.amount,
                merchant: item.description,
                category: item.category,
                paymentMethod: 'auto',
                date: today,
                source: 'recurring',
                notes: ''
            });
            item.nextDue = nextRecurringDate(item.nextDue, item.frequency);
            changed = true;
        });
        if (changed) {
            sortRecords();
            persistCore();
            showToast('Recurring processed');
        }
    }

    function nextRecurringDate(dateValue, frequency) {
        const date = new Date(dateValue);
        if (frequency === 'monthly') date.setMonth(date.getMonth() + 1);
        else if (frequency === 'weekly') date.setDate(date.getDate() + 7);
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
        const id = slugify(name);
        if (!id) {
            showToast('Invalid name');
            return;
        }
        if (state.categories[id]) {
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
        renderCalendar();
        openModal('calendarModal');
    }

    function changeCalendarMonth(delta) {
        state.calendarDate.setMonth(state.calendarDate.getMonth() + delta);
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
        for (let day = 1; day <= daysInMonth; day += 1) {
            const total = dailyTotals[day] || 0;
            html += `
                <div class="calendar-day">
                    <div class="calendar-num">${day}</div>
                    <div class="calendar-total">${total ? formatCurrency(total) : ''}</div>
                </div>
            `;
        }
        $('calendarGrid').innerHTML = html;
    }

    function openDatePicker(input) {
        state.datePicker.input = input;
        state.datePicker.selected = input.value || formatInputDate(Date.now());
        state.datePicker.date = input.value ? new Date(parseInputDate(input.value)) : new Date();
        state.datePicker.lastValue = '';
        state.datePicker.lastTap = 0;
        renderDatePicker();
        openModal('datePickerModal');
    }

    function changeDatePickerMonth(delta) {
        state.datePicker.date.setMonth(state.datePicker.date.getMonth() + delta);
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

    function exportJSON() {
        const data = buildExportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `expense_backup_${formatInputDate(Date.now())}.json`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function buildExportData() {
        return {
            version: 2,
            exportedAt: new Date().toISOString(),
            transactions: state.transactions,
            budgets: state.budgets,
            recurring: state.recurring,
            categories: state.categories,
            incomes: state.incomes
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
            reader.onload = event => {
                try {
                    const data = JSON.parse(event.target.result);
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
        sortRecords();
        persistAll();
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

        if (Math.abs(dx) < 75 || Math.abs(dx) < Math.abs(dy) * 1.45) return;
        if (dx < 0 && state.currentTab < 4) switchTab(state.currentTab + 1);
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

    function getInsights() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const monthTransactions = state.transactions.filter(tx => tx.date >= start);
        const totals = getCategoryTotals(start);
        const highest = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
        const monthTotal = monthTransactions.reduce((sum, tx) => sum + tx.amount, 0);
        return {
            topName: highest ? (state.categories[highest[0]]?.name || highest[0]) : 'None',
            topValue: highest ? highest[1] : 0,
            dailyAverage: monthTotal / now.getDate(),
            count: monthTransactions.length
        };
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
        $('mainSlider').style.height = `${active.offsetHeight}px`;
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

    function formatDisplayDate(value) {
        return new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }

    function formatInputDate(value) {
        const date = new Date(value);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
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

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }
})();
