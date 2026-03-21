// customer.js - Integrated with backend

document.addEventListener("DOMContentLoaded", () => {
    // Auth Check
    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (!currentUser || currentUser.role !== 'customer') {
        window.location.href = 'login.html';
        return;
    }
    
    document.body.style.opacity = '1';
    document.getElementById('userNameDisplay').textContent = currentUser.name;
    document.getElementById('welcomeName').textContent = currentUser.name;

    let loans = [];

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const calculateLoanSummary = (amount, rate, months) => {
        const totalInterest = amount * (rate / 100) * (months / 12);
        const totalPayable = amount + totalInterest;
        const monthlyInstallment = totalPayable / months;
        return { totalInterest, totalPayable, monthlyInstallment };
    };

    const getStatusBadge = (status) => {
        const badges = {
            'active': '<span class="badge badge-active">Đang vay</span>',
            'pending': '<span class="badge badge-pending">Chờ duyệt</span>',
            'rejected': '<span class="badge badge-rejected">Từ chối</span>',
            'paid': '<span class="badge badge-paid">Đã tất toán</span>'
        };
        return badges[status] || status;
    };

    const token = localStorage.getItem('token');
    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const fetchAllData = async () => {
        try {
            const res = await fetch(`${Config.BASE_URL}/api/loans?customerId=${currentUser.id}`, { headers });
            loans = await res.json();
            refreshUI();
        } catch (err) {
            console.error(err);
        }
    };

    const refreshUI = () => {
        renderDashboardStats();
        renderUpcomingPayments();
        renderMyLoans();
    };
    const renderDashboardStats = () => {
        let totalDebt = 0;
        let totalPaid = 0;
        let pendingCount = 0;

        loans.forEach(loan => {
            const sum = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths).totalPayable;
            if (loan.status === 'active' || loan.status === 'paid') {
                totalPaid += loan.amountPaid || 0;
            }
            if (loan.status === 'active') {
                totalDebt += (sum - (loan.amountPaid || 0));
            }
            if (loan.status === 'pending') {
                pendingCount++;
            }
        });

        document.getElementById('totalDebtStat').textContent = formatCurrency(totalDebt);
        document.getElementById('totalPaidStat').textContent = formatCurrency(totalPaid);
        document.getElementById('totalLoansCount').textContent = loans.length + (pendingCount > 0 ? ` (${pendingCount} chờ duyệt)` : '');
        
        renderLoanChart(totalPaid, totalDebt);
    };

    let loanChart = null;
    const renderLoanChart = (paid, debt) => {
        const ctx = document.getElementById('loanChart').getContext('2d');
        if (loanChart) loanChart.destroy();
        loanChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Vốn + Lãi đã trả', 'Dư nợ còn lại'],
                datasets: [{
                    data: [paid, debt],
                    backgroundColor: ['#4cc9f0', '#4361ee']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });
    };

    const renderUpcomingPayments = () => {
        const container = document.getElementById('upcomingPayments');
        const activeLoans = loans.filter(l => l.status === 'active' && l.nextPaymentDate);
        
        if (activeLoans.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary);">Không có lịch thanh toán nào sắp tới.</p>';
            return;
        }

        activeLoans.sort((a, b) => new Date(a.nextPaymentDate) - new Date(b.nextPaymentDate));
        
        container.innerHTML = activeLoans.map(loan => {
            const nextPmtDate = new Date(loan.nextPaymentDate).toLocaleDateString('vi-VN');
            const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
            const remaining = summary.totalPayable - (loan.amountPaid || 0);

            return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; background: var(--surface-color); border-radius: 8px; margin-bottom: 0.5rem; border-left: 3px solid var(--warning-color);">
                <div>
                    <strong>Khoản vay ${loan.id}</strong><br>
                    <small style="color: var(--text-secondary);">Hạn tiếp theo: ${nextPmtDate}</small>
                </div>
                <div style="text-align: right;">
                    <strong>${formatCurrency(Math.min(summary.monthlyInstallment, remaining))}</strong><br>
                    <small>Cần thanh toán kỳ này</small>
                </div>
            </div>
            `;
        }).join('');
    };

    const renderMyLoans = () => {
        const tb = document.getElementById('myLoansTableBody');
        
        if (loans.length === 0) {
            tb.innerHTML = '<tr><td colspan="8" style="text-align: center;">Bạn chưa có khoản vay nào.</td></tr>';
            return;
        }

        tb.innerHTML = loans.map(loan => {
            const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
            const remaining = summary.totalPayable - (loan.amountPaid || 0);
            
            let actionBtn = '';
            if (loan.status === 'active' && remaining > 0) {
                actionBtn = `
                    <button class="btn btn-primary btn-sm btn-pay" data-id="${loan.id}" title="Thanh toán"><i class="fas fa-credit-card"></i></button>
                    <button class="btn btn-secondary btn-sm btn-schedule" data-id="${loan.id}" title="Lịch trả nợ"><i class="fas fa-calendar-alt"></i></button>
                `;
            } else if (loan.status === 'pending') {
                actionBtn = `<button class="btn btn-secondary btn-sm btn-cancel" data-id="${loan.id}" style="color:var(--danger-color)" title="Hủy yêu cầu"><i class="fas fa-trash"></i></button>`;
            } else if (loan.status === 'active' || loan.status === 'paid' || loan.status === 'rejected') {
                actionBtn = `<button class="btn btn-secondary btn-sm btn-schedule" data-id="${loan.id}" title="Chi tiết"><i class="fas fa-info-circle"></i></button>`;
            }
            
            return `
            <tr style="${loan.status === 'rejected' ? 'opacity: 0.7; background: rgba(230, 57, 70, 0.02);' : ''}">
                <td><strong style="font-size:0.8rem">${loan.id}</strong></td>
                <td><small>Gốc:</small> ${formatCurrency(loan.amount)}<br><small>Tổng:</small> <strong style="color:var(--primary-color)">${formatCurrency(summary.totalPayable)}</strong></td>
                <td>${loan.interestRate}%</td>
                <td>${loan.durationMonths}t</td>
                <td style="color: var(--success-color);">${formatCurrency(loan.amountPaid || 0)}</td>
                <td style="color: var(--danger-color);">${formatCurrency(remaining)}</td>
                <td>${getStatusBadge(loan.status)}</td>
                <td><small style="font-size:0.75rem; color:var(--text-secondary)">${loan.adminNote || '-'}</small></td>
                <td><div style="display:flex; gap:0.3rem">${actionBtn}</div></td>
            </tr>
        `}).join('');

    };

    // Event Delegation for Table Actions
    document.getElementById('myLoansTableBody').addEventListener('click', (e) => {
        const btnPay = e.target.closest('.btn-pay');
        const btnSchedule = e.target.closest('.btn-schedule');
        const btnCancel = e.target.closest('.btn-cancel');

        if (btnPay) openPaymentModal(btnPay.dataset.id);
        if (btnSchedule) openScheduleModal(btnSchedule.dataset.id);
        if (btnCancel) cancelLoanRequest(btnCancel.dataset.id);
    });

    // Modals & Forms
    let currentPayLoanId = null;
    let currentLoanMaxPay = 0;
    const paymentModal = document.getElementById('paymentModal');

    const openPaymentModal = (id) => {
        currentPayLoanId = id;
        const loan = loans.find(l => l.id == id);
        const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
        currentLoanMaxPay = summary.totalPayable - (loan.amountPaid || 0);

        document.getElementById('payLoanId').textContent = loan.id;
        document.getElementById('payTotalAmount').textContent = formatCurrency(summary.totalPayable);
        document.getElementById('payAmountPaid').textContent = formatCurrency(loan.amountPaid || 0);
        document.getElementById('payRemaining').textContent = formatCurrency(currentLoanMaxPay);
        
        const payInput = document.getElementById('paymentAmountInput');
        payInput.max = currentLoanMaxPay;
        payInput.value = Math.min(summary.monthlyInstallment, currentLoanMaxPay).toFixed(0);
        
        paymentModal.classList.add('active');
    };

    const closeModal = () => {
        paymentModal.classList.remove('active');
        document.getElementById('scheduleModal').classList.remove('active');
        currentPayLoanId = null;
    };

    const openScheduleModal = (id) => {
        const loan = loans.find(l => l.id == id);
        const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
        const tb = document.getElementById('scheduleTableBody');
        document.getElementById('scheduleLoanId').textContent = loan.id;

        let rows = '';
        const monthlyAmt = summary.monthlyInstallment;
        const startDate = loan.startDate ? new Date(loan.startDate) : new Date();

        for (let i = 1; i <= loan.durationMonths; i++) {
            const pmtDate = new Date(startDate);
            pmtDate.setMonth(pmtDate.getMonth() + i);
            
            const isPaid = (loan.amountPaid || 0) >= (pmtDate <= new Date() ? (monthlyAmt * i) : 0); 
            // Simplified logic for demo: consider it paid if totalPaid covers up to this month
            const statusText = (loan.amountPaid || 0) >= (monthlyAmt * i) ? 
                '<span style="color:var(--success-color)">Đã trả</span>' : 
                (loan.status === 'active' ? 'Chưa trả' : '-');

            rows += `
                <tr>
                    <td>Kỳ ${i}</td>
                    <td>${pmtDate.toLocaleDateString('vi-VN')}</td>
                    <td>${formatCurrency(monthlyAmt)}</td>
                    <td>${statusText}</td>
                </tr>
            `;
        }
        tb.innerHTML = rows;
        document.getElementById('scheduleModal').classList.add('active');
    };

    const cancelLoanRequest = async (id) => {
        if (!confirm('Bạn có chắc chắn muốn hủy yêu cầu vay này?')) return;
        try {
            await fetch(`${Config.BASE_URL}/api/users/cancel-loan/${id}`, { method: 'DELETE', headers });
await fetch(`${Config.BASE_URL}/api/loans/cancel/${id}`, { method: 'DELETE', headers });
            alert('Đã hủy yêu cầu.');
            fetchAllData();
        } catch (err) { console.error(err); }
    };

    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', closeModal));
    window.addEventListener('click', (e) => { 
        if (e.target === paymentModal || e.target === document.getElementById('scheduleModal')) closeModal(); 
    });

    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!currentPayLoanId) return;

        const amountToPay = parseFloat(document.getElementById('paymentAmountInput').value);
        if (amountToPay <= 0 || amountToPay > currentLoanMaxPay) return;

        const loan = loans.find(l => l.id == currentPayLoanId);
        const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
        const newPaid = (loan.amountPaid || 0) + amountToPay;
        
        let updateData = { amountPaid: newPaid, status: loan.status };
        
        if (newPaid >= summary.totalPayable || (summary.totalPayable - newPaid) < 1000) {
            updateData.status = 'paid';
            updateData.amountPaid = summary.totalPayable;
        } else {
            // Push date ahead 1 month
            const npd = new Date(loan.nextPaymentDate || new Date());
            npd.setMonth(npd.getMonth() + 1);
            updateData.nextPaymentDate = npd.toISOString();
        }

        updateData.adminNote = document.getElementById('modalAdminNote')?.value || loan.adminNote;

        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/loans/${currentPayLoanId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(updateData)
            });
            closeModal();
            Toast.success('Thanh toán thành công!');
            fetchAllData();
        } catch(err) {
            Toast.error('Lỗi khi thanh toán');
        } finally {
            hideLoader();
        }
    });

    // Apply Form Estimates
    const amountInput = document.querySelector('#applyLoanForm input[name="amount"]');
    const durationInput = document.querySelector('#applyLoanForm select[name="durationMonths"]');
    const estimateDisplay = document.getElementById('loanEstimateDisplay');

    const updateEstimate = () => {
        if (!amountInput) return; // In case we're not on customer applying view
        const amt = parseFloat(amountInput.value);
        const months = parseInt(durationInput.value);
        if (amt >= 1000000) {
            const summary = calculateLoanSummary(amt, 12, months);
            estimateDisplay.innerHTML = `
                <div style="display:flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Tổng lãi dự kiến:</span> <strong>${formatCurrency(summary.totalInterest)}</strong>
                </div>
                <div style="display:flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Tổng Gốc + Lãi phải trả:</span> <strong>${formatCurrency(summary.totalPayable)}</strong>
                </div>
                <div style="display:flex; justify-content: space-between;">
                    <span>Trả góp mỗi tháng:</span> <strong style="color:var(--danger-color)">${formatCurrency(summary.monthlyInstallment)}</strong>
                </div>
            `;
        } else {
            estimateDisplay.innerHTML = 'Vui lòng nhập số tiền hợp lệ để xem ước tính trả góp.';
        }
    };
    
    if (amountInput) amountInput.addEventListener('input', updateEstimate);
    if (durationInput) durationInput.addEventListener('change', updateEstimate);

    // Apply Form
    document.getElementById('applyLoanForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const amount = parseFloat(form.amount.value);
        const durationMonths = parseInt(form.durationMonths.value);

        if (amount < 1000000) return Toast.warn('Tối thiểu 1,000,000 VNĐ');

        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/loans`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    customerId: currentUser.id, 
                    amount, 
                    interestRate: 12, 
                    durationMonths 
                })
            });
            
            Toast.success('Đăng ký khoản vay thành công!');
            form.reset();
            document.querySelector('[data-view="myloans"]').click();
            fetchAllData();
        } catch (err) {
            Toast.error('Lỗi khi gửi yêu cầu');
        } finally {
            hideLoader();
        }
    });

    // Navigation Sidebar
    const navLinks = document.querySelectorAll('.nav-links li');
    const viewSections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            const targetView = link.dataset.view;
            viewSections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === `${targetView}View`) sec.classList.add('active');
            });
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('currentUser');
        window.location.href = 'login.html';
    });

    // Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    themeBtn.addEventListener('click', () => {
        const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('theme', t);
        themeBtn.innerHTML = t==='dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    fetchAllData();
});
