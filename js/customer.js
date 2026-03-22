/* global Config, Toast, checkAuth, Chart, DataService, showLoader, hideLoader */
// customer.js - Integrated with backend

document.addEventListener("DOMContentLoaded", () => {
    console.log("Diagnostic 2: DOMContentLoaded in customer.js");
    // alert("Hệ thống Dashboard đang nạp bộ não...");

    // Auth Check
    const currentUser = checkAuth(['customer']);
    if (!currentUser) {
        console.error("Diagnostic Error: No current user found!");
        return;
    }
    
    console.log("Diagnostic: Current User found:", currentUser);
    // alert("Xin chào: " + currentUser.name);

    document.getElementById('userNameDisplay').textContent = currentUser.name || "Người dùng";
    if (document.getElementById('welcomeName')) {
        document.getElementById('welcomeName').textContent = currentUser.name || "Bạn";
    }

    let loans = [];
    let savings = [];
    let userProfile = null;
    let systemSettings = [];

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const calculateLoanSummary = (amount, rate, months) => {
        const totalInterest = amount * (rate / 100) * months;
        const totalPayable = amount + totalInterest;
        const monthlyInstallment = totalPayable / months;
        return { totalInterest, totalPayable, monthlyInstallment };
    };


    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return '<span class="badge badge-pending">Đang xử lý</span>';
            case 'approved': return '<span class="badge badge-active">Chờ nạp tiền</span>';
            case 'verifying': return '<span class="badge" style="background:#f39c12; color:white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Đang xác minh</span>';
            case 'transferring': return '<span class="badge" style="background:#3498db; color:white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Đang chuyển tiền</span>';
            case 'active': return '<span class="badge badge-active">Đang hoạt động</span>';
            case 'paid': return '<span class="badge badge-paid">Thành công</span>';
            case 'rejected': return '<span class="badge badge-rejected">Đã hủy</span>';
            default: return status;
        }
    };


    const token = localStorage.getItem('token');
    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    const fetchAllData = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout (Render cold start)

            const [loansRes, settingsRes, notifRes, profileRes, savingsRes] = await Promise.all([
                fetch(`${Config.BASE_URL}/api/loans?customerId=${currentUser.id}`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/settings`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/notifications`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/profile`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/savings?customerId=${currentUser.id}`, { headers, signal: controller.signal })
            ]);

            clearTimeout(timeoutId);
            
            if (loansRes.status === 401 || profileRes.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html?session=expired';
                return;
            }

            loans = await loansRes.json();
            systemSettings = await settingsRes.json();
            updateDurationOptions(systemSettings);
            renderNotifications(await notifRes.json());
            userProfile = await profileRes.json();
            savings = await savingsRes.json();
            
            renderProfile();
            refreshUI();
            console.log("Diagnostic: Data loaded successfully!");
            document.body.style.opacity = '1'; // Ensure visible after data load
        } catch (err) {
            console.error('Error fetching data, retrying in 5s...', err);
            if (err.name === 'AbortError') {
                Toast.error('Hệ thống đang khởi động (Render Cold Start), vui lòng chờ 30-60s...');
            } else {
                Toast.error('Lỗi kết nối Server! Đang thử lại...');
            }
            setTimeout(fetchAllData, 5000); // Retry
        }
    };

    const isProfileComplete = () => {
        if (!userProfile) return false;
        // Kiểm tra đơn giản: Chỉ cần có dữ liệu trong tất cả các ô là ok
        return !!(userProfile.phone && userProfile.id_card && userProfile.address && userProfile.job && userProfile.income);
    };

    const renderProfile = () => {
        if (!userProfile) return;
        
        const summaryView = document.getElementById('profileSummaryView');
        const editView = document.getElementById('profileEditView');
        if (!summaryView || !editView) return;

        const isComplete = isProfileComplete();

        if (isComplete) {
            summaryView.style.display = 'block';
            editView.style.display = 'none';
            
            document.getElementById('s_phone').textContent = userProfile.phone;
            document.getElementById('s_idCard').textContent = userProfile.id_card;
            document.getElementById('s_address').textContent = userProfile.address;
            document.getElementById('s_job').textContent = userProfile.job;
            document.getElementById('s_income').textContent = formatCurrency(userProfile.income);
        } else {
            summaryView.style.display = 'none';
            editView.style.display = 'block';
            
            const form = document.getElementById('updateProfileForm');
            if (form) {
                form.phone.value = userProfile.phone || '';
                form.idCard.value = userProfile.id_card || '';
                form.address.value = userProfile.address || '';
                form.job.value = userProfile.job || '';
                
                const incomeInput = document.getElementById('incomeInput');
                if (incomeInput && userProfile.income) {
                    incomeInput.value = new Intl.NumberFormat('vi-VN').format(userProfile.income);
                }
            }
        }
    };

    document.getElementById('btnEditProfile')?.addEventListener('click', () => {
        document.getElementById('profileSummaryView').style.display = 'none';
        document.getElementById('profileEditView').style.display = 'block';
    });
    
    document.getElementById('btnGoToApply')?.addEventListener('click', () => {
        const applyLink = document.querySelector('.nav-links li[data-view="apply"]');
        if (applyLink) applyLink.click();
    });

    // Formatter cho ô thu nhập
    document.getElementById('incomeInput')?.addEventListener('input', (e) => {
        let value = e.target.value.replace(/\D/g, "");
        if (value) {
            e.target.value = new Intl.NumberFormat('vi-VN').format(value);
        }
    });

    document.getElementById('updateProfileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        
        // Gỡ bỏ dấu phẩy/chấm để lấy số gốc
        const rawIncome = form.income.value.replace(/\./g, "").replace(/,/g, "");

        const profileData = {
            phone: form.phone.value,
            idCard: form.idCard.value,
            address: form.address.value,
            job: form.job.value,
            income: parseFloat(rawIncome) || 0
        };

        showLoader();
        try {
            const res = await fetch(`${Config.BASE_URL}/api/profile`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(profileData)
            });

            if (res.ok) {
                Toast.success('Cập nhật hồ sơ thành công!');
                await fetchAllData(); // Ensure userProfile is updated
                renderProfile(); // Switch to summary view
            } else {
                const errorData = await res.json();
                Toast.error(errorData.message || 'Cập nhật thất bại');
            }
        } catch (err) {
            Toast.error('Lỗi khi cập nhật hồ sơ');
        } finally {
            hideLoader();
        }
    });

    const renderNotifications = (notifs) => {
        const container = document.getElementById('notifListContainer');
        if (!container) return;

        if (notifs.length === 0) {
            container.innerHTML = '<div class="glass-panel" style="padding:2rem; text-align:center; color:var(--text-secondary);">Hiện tại hệ thống không có thông báo mới nào.</div>';
            return;
        }

        container.innerHTML = notifs.map(n => `
            <div class="glass-panel" style="padding:1.5rem; border-left: 4px solid var(--primary-color);">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span style="color:var(--primary-color); font-weight:700;"><i class="fas fa-info-circle"></i> THÔNG BÁO</span>
                    <small style="color:var(--text-secondary);">${new Date(n.created_at).toLocaleString('vi-VN')}</small>
                </div>
                <p style="font-size:1.1rem; line-height:1.6;">${n.message}</p>
            </div>
        `).join('');
    };

    const updateDurationOptions = (settings) => {
        const rateSelect = document.getElementById('interestRateSelect');
        if (!rateSelect) return;

        let options = '<option value="" disabled selected>-- Chọn mức lãi suất --</option>';
        if (Array.isArray(settings)) {
            // Lọc bỏ những giá trị rác hoặc null
            const validRates = settings.filter(s => s.is_active && s.value_int !== null && s.key.startsWith('rate_'));
            validRates.forEach(s => {
                options += `<option value="${s.value_int}">${s.value_int}% / Tháng</option>`;
            });
        }

        if (options === '') {
            options = '<option value="">Hiện tại không có mức lãi khả dụng</option>';
        }
        rateSelect.innerHTML = options;
        updateEstimate(); 
    };

    const refreshUI = () => {
        renderDashboardStats();
        renderUpcomingPayments();
        renderMyLoans();
        renderSavings();
    };

    const renderSavings = () => {
        const container = document.getElementById('savingsListGrid');
        if (!container) return;

        if (savings.length === 0) {
            container.innerHTML = `
                <div class="text-center p-5" style="width: 100%; color: var(--text-secondary);">
                    <i class="fas fa-piggy-bank fa-3x mb-3" style="opacity: 0.3"></i>
                    <p>Bạn chưa có khoản tiết kiệm nào.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = savings.map(s => {
            const startDate = new Date(s.createdAt);
            const maturityDate = new Date(startDate);
            maturityDate.setMonth(maturityDate.getMonth() + parseInt(s.term_months));

            // Tính lợi nhuận dự kiến
            const monthlyRate = s.rate / 100 / 12;
            const expectedProfit = s.amount * monthlyRate * s.term_months;

            let actionHtml = '';
            if (s.status === 'approved') {
                actionHtml = `<button class="btn btn-primary btn-deposit-savings w-100" data-id="${s.id}" style="margin-top: 1rem; border-radius: 12px; padding: 12px;"><i class="fas fa-wallet"></i> Nạp Tiền Ngay</button>`;
            } else if (s.status === 'transferring') {
                actionHtml = `<button class="btn btn-success btn-confirm-received w-100" data-id="${s.id}" style="margin-top: 1rem; border-radius: 12px; padding: 12px; background: #27ae60; animation: pulse 2s infinite;"><i class="fas fa-check-circle"></i> Xác Nhận Đã Nhận Tiền</button>`;
            }

            return `
                <div class="savings-card glass-panel" style="padding: 1.5rem; margin-bottom: 1.5rem; border-left: 5px solid ${s.status === 'active' || s.status === 'paid' ? 'var(--success-color)' : (s.status === 'transferring' ? '#3498db' : 'var(--border-color)')}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <div>
                            <span style="font-size: 0.8rem; color: var(--text-secondary);">Mã: #TK${s.id}</span>
                            <h4 style="font-size: 1.5rem; margin: 0.5rem 0; color: var(--success-color);">${formatCurrency(s.amount)}</h4>
                        </div>
                        ${getStatusBadge(s.status)}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 12px;">
                        <div>
                            <small style="display: block; color: var(--text-secondary); margin-bottom: 4px;">Lãi suất</small>
                            <strong style="color: var(--success-color);">${s.rate}%/Năm</strong>
                        </div>
                        <div>
                            <small style="display: block; color: var(--text-secondary); margin-bottom: 4px;">Lợi nhuận dự kiến</small>
                            <strong style="color: #f1c40f;">+${formatCurrency(expectedProfit)}</strong>
                        </div>
                        <div>
                            <small style="display: block; color: var(--text-secondary); margin-bottom: 4px;">Ngày gửi</small>
                            <strong>${startDate.toLocaleDateString('vi-VN')}</strong>
                        </div>
                        <div>
                            <small style="display: block; color: var(--text-secondary); margin-bottom: 4px;">Ngày đáo hạn</small>
                            <strong>${maturityDate.toLocaleDateString('vi-VN')}</strong>
                        </div>
                    </div>
                    
                    ${actionHtml}
                </div>
            `;
        }).join('');

        // Thêm CSS pulse animation nếu chưa có
        if (!document.getElementById('savingsCustomStyles')) {
            const style = document.createElement('style');
            style.id = 'savingsCustomStyles';
            style.innerHTML = `
                @keyframes pulse {
                    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(39, 174, 96, 0.4); }
                    70% { transform: scale(1.02); box-shadow: 0 0 0 10px rgba(39, 174, 96, 0); }
                    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(39, 174, 96, 0); }
                }
                .savings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
                .savings-card { transition: all 0.3s ease; }
                .savings-card:hover { transform: translateY(-5px); background: rgba(255,255,255,0.1); }
            `;
            document.head.appendChild(style);
        }
    };

    // Event Delegation for Savings grid Actions
    document.getElementById('savingsListGrid')?.addEventListener('click', (e) => {
        const btnDeposit = e.target.closest('.btn-deposit-savings');
        if (btnDeposit) openSavingsDepositModal(btnDeposit.dataset.id);

        const btnConfirm = e.target.closest('.btn-confirm-received');
        if (btnConfirm) {
            const id = btnConfirm.dataset.id;
            if (confirm('Bạn xác nhận đã nhận đủ tiền và lãi từ Admin cho khoản tích lũy này?')) {
                confirmReceived(id);
            }
        }
    });

    const openSavingsDepositModal = (id) => {
        const s = savings.find(item => item.id == id);
        if(!s) return;

        document.getElementById('depositSavingsId').textContent = 'TK' + s.id;
        document.getElementById('depositAmount').textContent = formatCurrency(s.amount);
        document.getElementById('depositRate').textContent = s.rate + '% / Năm';
        
        const bName = systemSettings.find(st => st.key === 'bank_name')?.value_text || 'MBBank';
        const bAcc = systemSettings.find(st => st.key === 'bank_account')?.value_text || '0888101901';
        const bHolder = systemSettings.find(st => st.key === 'bank_holder')?.value_text || 'PHAM CHI THANH';
        const note = `Nap tiet kiem TK${s.id}`;

        document.getElementById('sBankName').textContent = bName;
        document.getElementById('sBankAccount').textContent = bAcc;
        document.getElementById('sBankHolder').textContent = bHolder;
        document.getElementById('sTransferNote').textContent = note;

        const qrImg = document.getElementById('savingsQR');
        if (qrImg) {
            qrImg.src = `https://img.vietqr.io/image/${bName}-${bAcc}-compact.jpg?amount=${s.amount}&addInfo=${encodeURIComponent(note)}&accountName=${encodeURIComponent(bHolder)}`;
        }

        const modal = document.getElementById('savingsDepositModal');
        modal.classList.add('active');
        
        modal.querySelector('.close-btn').onclick = () => modal.classList.remove('active');

        const confirmBtn = document.getElementById('btnConfirmSavingsTransfer');
        if (confirmBtn) {
            confirmBtn.onclick = async () => {
                if (!confirm('Bạn chắc chắn đã chuyển tiền cho khoản tích lũy này?')) return;
                
                showLoader();
                try {
                    const res = await fetch(`${Config.BASE_URL}/api/savings/${id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ status: 'verifying' })
                    });

                    if (res.ok) {
                        Toast.success('Đã gửi thông báo cho Admin! Vui lòng chờ xác nhận.');
                        modal.classList.remove('active');
                        fetchAllData();
                    } else {
                        Toast.error('Lỗi khi gửi xác nhận.');
                    }
                } catch (err) {
                    Toast.error('Lỗi kết nối.');
                } finally {
                    hideLoader();
                }
            };
        }
    };

    const confirmReceived = async (id) => {
        showLoader();
        try {
            const res = await fetch(`${Config.BASE_URL}/api/savings/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ status: 'paid' })
            });

            if (res.ok) {
                Toast.success('Cập nhật trạng thái thành công!');
                // Chuyển hướng sang view Khoản tiết kiệm của tôi
                const mysavingsLink = document.querySelector('.nav-links li[data-view="mysavings"]');
                if (mysavingsLink) mysavingsLink.click();
                
                fetchAllData();
            } else {
                Toast.error('Lỗi khi xác nhận.');
            }
        } catch (err) {
            Toast.error('Lỗi kết nối.');
        } finally {
            hideLoader();
        }
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
            
            if (loan.status === 'active' && loan.nextPaymentDate) {
                const dueDate = new Date(loan.nextPaymentDate);
                const diffDays = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
                if (diffDays <= 3 && diffDays >= 0) {
                    setTimeout(() => {
                        Toast.warn(`Khoản vay ${loan.id} sắp đến ngày thanh toán (còn ${diffDays} ngày)!`, 10000);
                    }, 1000);
                } else if (diffDays < 0) {
                    setTimeout(() => {
                        Toast.error(`Khoản vay ${loan.id} đã quá hạn ${Math.abs(diffDays)} ngày! Vui lòng thanh toán ngay.`, 15000);
                    }, 1500);
                }
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
            } else if (loan.status === 'active' || loan.status === 'paid') {
                actionBtn = `<button class="btn btn-secondary btn-sm btn-schedule" data-id="${loan.id}" title="Xem Lịch Trả Nợ"><i class="fas fa-calendar-alt"></i></button>`;
            } else {
                actionBtn = `<span class="text-secondary">-</span>`;
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
        document.querySelectorAll('.pay-loan-id-text').forEach(el => el.textContent = loan.id);
        document.getElementById('payTotalAmount').textContent = formatCurrency(summary.totalPayable);
        document.getElementById('payAmountPaid').textContent = formatCurrency(loan.amountPaid || 0);
        document.getElementById('payRemaining').textContent = formatCurrency(currentLoanMaxPay);
        
        const payAmount = Math.round(Math.min(summary.monthlyInstallment, currentLoanMaxPay));
        const payInput = document.getElementById('paymentAmountInput');
        payInput.max = currentLoanMaxPay;
        payInput.value = payAmount;

        const bName = systemSettings.find(s => s.key === 'bank_name')?.value_text || 'MBBank';
        const bAcc = systemSettings.find(s => s.key === 'bank_account')?.value_text || '0888101901';
        const bHolder = systemSettings.find(s => s.key === 'bank_holder')?.value_text || 'PHAM CHI THANH';

        document.getElementById('bankNameDisplay').textContent = bName;
        document.getElementById('bankAccountDisplay').textContent = bAcc;
        document.getElementById('bankHolderDisplay').textContent = bHolder;

        // Cập nhật QR động theo số tiền và thông tin bank mới nhất
        const qrImg = document.getElementById('paymentQR');
        if (qrImg) {
            qrImg.src = `https://img.vietqr.io/image/${bName}-${bAcc}-compact.jpg?amount=${payAmount}&addInfo=Thanh%20toan%20${loan.id}&accountName=${encodeURIComponent(bHolder)}`;
        }
        
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
        showLoader();
        try {
            const res = await fetch(`${Config.BASE_URL}/api/loans/${id}`, { method: 'DELETE', headers });
            if (res.ok) {
                Toast.success('Đã hủy yêu cầu.');
                fetchAllData();
            } else {
                const errorData = await res.json();
                Toast.error(errorData.message || 'Không thể hủy khoản vay này.');
            }
        } catch (err) { 
            console.error(err);
            Toast.error('Lỗi kết nối server.');
        } finally {
            hideLoader();
        }
    };

    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', closeModal));
    window.addEventListener('click', (e) => { 
        if (e.target === paymentModal) paymentModal.classList.remove('active');
        if (e.target === document.getElementById('scheduleModal')) document.getElementById('scheduleModal').classList.remove('active');
    });

    document.getElementById('paymentForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!currentPayLoanId) return;

        const amountToPay = parseFloat(document.getElementById('paymentAmountInput').value);
        if (amountToPay <= 0 || amountToPay > currentLoanMaxPay) return;

        const loan = loans.find(l => l.id == currentPayLoanId);
        const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
        const newPaid = (loan.amountPaid || 0) + amountToPay;
        
        let updateData = { 
            amountPaid: newPaid, 
            status: newPaid >= summary.totalPayable ? 'paid' : loan.status,
            adminNote: document.getElementById('modalAdminNote')?.value || loan.adminNote
        };

        if (updateData.status === 'paid') {
            updateData.amountPaid = summary.totalPayable;
        }

        showLoader();
        try {
            const res = await fetch(`${Config.BASE_URL}/api/payments`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    loanId: currentPayLoanId, 
                    amount: amountToPay 
                })
            });

            if (res.ok) {
                closeModal();
                Toast.success('Yêu cầu thanh toán đã được gửi. Vui lòng chờ Admin duyệt!');
                fetchAllData();
            } else {
                const errData = await res.json();
                Toast.error(errData.message || 'Lỗi khi gửi yêu cầu');
            }
        } catch(err) {
            Toast.error('Lỗi kết nối server');
        } finally {
            hideLoader();
        }
    });


    // Apply Form Estimates
    const amountInput = document.querySelector('#applyLoanForm input[name="amount"]');
    const durationInput = document.querySelector('#applyLoanForm select[name="durationMonths"]');
    const estimateDisplay = document.getElementById('loanEstimateDisplay');

    // Formatter cho ô Số tiền vay
    const amountInputEl = document.getElementById('loanAmountInput');
    if (amountInputEl) {
        amountInputEl.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, "");
            if (value) {
                e.target.value = new Intl.NumberFormat('vi-VN').format(value);
            }
            updateEstimate();
        });
    }

    const updateEstimate = () => {
        const amountInput = document.getElementById('loanAmountInput');
        const durationInput = document.querySelector('select[name="durationMonths"]');
        const rateSelect = document.querySelector('select[name="interestRate"]');
        const estimateDisplay = document.getElementById('loanEstimateDisplay');

        if (!amountInput || !rateSelect || !estimateDisplay) return;

        const rawAmt = amountInput.value.replace(/\D/g, "");
        const amt = parseFloat(rawAmt);
        const months = parseInt(durationInput.value);
        const interest = parseFloat(rateSelect.value);

        if (amt >= 1000000 && !isNaN(interest)) {
            const summary = calculateLoanSummary(amt, interest, months);
            const principalPerMonth = amt / months;
            const interestPerMonth = amt * (interest / 100);

            estimateDisplay.innerHTML = `
                <div style="margin-bottom: 1.5rem; text-align:center;">
                    <div style="color: var(--text-secondary); font-size: 0.9rem;">SỐ TIỀN TRẢ GÓP HÀNG THÁNG</div>
                    <div style="font-size: 2.2rem; font-weight: 800; color: var(--primary-color); text-shadow: 0 0 20px rgba(67, 97, 238, 0.2); line-height:1.2;">
                        ${formatCurrency(Math.round(summary.monthlyInstallment))}
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 5px;">
                        (Gốc: ${formatCurrency(Math.round(principalPerMonth))} + Lãi: ${formatCurrency(Math.round(interestPerMonth))})
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div>
                        <small style="color: var(--text-secondary);">Tổng nợ gốc</small>
                        <div style="font-weight: 700;">${formatCurrency(amt)}</div>
                    </div>
                    <div>
                        <small style="color: var(--text-secondary);">Tổng lãi (${months} tháng)</small>
                        <div style="font-weight: 700; color: var(--danger-color);">${formatCurrency(Math.round(summary.totalInterest))}</div>
                    </div>
                    <div style="grid-column: span 2; margin-top: 5px; padding: 0.8rem; background: rgba(255,255,255,0.05); border-radius: 8px;">
                        <small style="color: var(--text-secondary);">Tổng số tiền dự kiến thanh toán</small>
                        <div style="font-size: 1.1rem; font-weight: 700; color: var(--success-color);">
                            ${formatCurrency(Math.round(summary.totalPayable))}
                        </div>
                    </div>
                </div>
            `;
        } else {
            estimateDisplay.innerHTML = 'Vui lòng nhập số tiền và chọn lãi suất.';
        }
    };

    if(document.querySelector('form[id="applyLoanForm"]')){
        // Event listeners handled by amountInputEl above for 'input'
        document.querySelector('select[name="durationMonths"]').addEventListener('change', updateEstimate);
        document.querySelector('select[name="interestRate"]').addEventListener('change', updateEstimate);
    }

    document.getElementById('applyLoanForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        
        const rawAmt = form.amount.value.replace(/\./g, "").replace(/,/g, "");
        const amount = parseFloat(rawAmt);
        const durationMonths = parseInt(form.durationMonths.value);
        const interestRate = parseFloat(form.interestRate.value);

        if (amount < 1000000) return Toast.warn('Tối thiểu 1,000,000 VNĐ');
        if (!interestRate) return Toast.warn('Vui lòng chọn lãi suất');

        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/loans`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ 
                    customerId: currentUser.id, 
                    amount, 
                    interestRate, 
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

    const paymentAmountInput = document.getElementById('paymentAmountInput');
    if (paymentAmountInput) {
        paymentAmountInput.addEventListener('input', (e) => {
            const amount = e.target.value;
            const qrImg = document.getElementById('paymentQR');
            if (qrImg && currentPayLoanId) {
                const bName = systemSettings.find(s => s.key === 'bank_name')?.value_text || 'MBBank';
                const bAcc = systemSettings.find(s => s.key === 'bank_account')?.value_text || '0888101901';
                const bHolder = systemSettings.find(s => s.key === 'bank_holder')?.value_text || 'PHAM CHI THANH';
                qrImg.src = `https://img.vietqr.io/image/${bName}-${bAcc}-compact.jpg?amount=${amount}&addInfo=Thanh%20toan%20${currentPayLoanId}&accountName=${encodeURIComponent(bHolder)}`;
            }
        });
    }

    // Navigation Sidebar
    const navLinks = document.querySelectorAll('.nav-links li');
    const viewSections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            const targetView = link.dataset.view;

            // Ràng buộc: Phải đầy đủ thông tin mới được vào mục Đăng ký vay
            if (targetView === 'apply' && !isProfileComplete()) {
                Toast.warn('Vui lòng khai báo đầy đủ thông tin cá nhân trước khi sử dụng tính năng vay!');
                // Tự động nhảy sang trang Profile
                const profileLink = Array.from(navLinks).find(l => l.dataset.view === 'profile');
                if (profileLink) profileLink.click();
                return;
            }

            if (link.classList.contains('active')) return;
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            
            viewSections.forEach(sec => {
                sec.classList.remove('active');
                if (sec.id === `${targetView}View`) sec.classList.add('active');
            });
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('currentUser');
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    });

    // Mobile Menu Toggle Logic
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if(menuToggle && sidebar) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
        
        // Cụm logic click ra ngoài (hoặc click link) để tự đóng menu trên mobile
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => {
                if(window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                }
            });
        });
    }

    // Theme Toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    themeBtn.addEventListener('click', () => {
        const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('theme', t);
        themeBtn.innerHTML = t==='dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    // Savings Logic
    const calculateSavingsRate = (amount, months) => {
        // Bảng lãi suất từ hình ảnh:
        // < 10tr: 12% (6th), 16% (12th)
        // 10-50tr: 10% (6th), 14% (12th)
        // > 50tr: 9% (6th), 12% (12th)
        if (months == 6) {
            if (amount < 10000000) return 12;
            if (amount <= 50000000) return 10;
            return 9;
        } else {
            if (amount < 10000000) return 16;
            if (amount <= 50000000) return 14;
            return 12;
        }
    };

    const updateSavingsEstimate = () => {
        const amountInput = document.getElementById('savingsAmountInput');
        const termInput = document.querySelector('input[name="termMonths"]:checked');
        const display = document.getElementById('savingsEstimateDisplay');
        if (!amountInput || !termInput || !display) return;

        const rawVal = amountInput.value.replace(/\D/g, "");
        const amount = parseFloat(rawVal);
        const months = parseInt(termInput.value);

        if (amount >= 1000000) {
            const rate = calculateSavingsRate(amount, months);
            const interest = amount * (rate / 100) * (months / 12);
            const total = amount + interest;

            display.innerHTML = `
                <div style="text-align:center; margin-bottom:1rem;">
                    <div style="color:var(--text-secondary); font-size:0.8rem;">LÃI SUẤT ÁP DỤNG</div>
                    <div style="font-size:1.8rem; font-weight:800; color:var(--success-color);">${rate}% <small style="font-size:0.9rem;">/ Năm</small></div>
                </div>
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span>Tiền lãi dự kiến:</span>
                    <strong style="color:var(--primary-color)">+ ${formatCurrency(Math.round(interest))}</strong>
                </div>
                <div style="display:flex; justify-content:space-between;">
                    <span>Tổng tiền nhận (gốc+lãi):</span>
                    <strong style="color:var(--success-color)">${formatCurrency(Math.round(total))}</strong>
                </div>
            `;
        } else {
            display.innerHTML = '<div style="text-align:center; color:var(--text-secondary);">Nhập tối thiểu 1.000.000 VNĐ để xem lợi nhuận...</div>';
        }
    };

    document.getElementById('savingsAmountInput')?.addEventListener('input', (e) => {
        let val = e.target.value.replace(/\D/g, "");
        if (val) e.target.value = new Intl.NumberFormat('vi-VN').format(val);
        updateSavingsEstimate();
    });

    document.querySelectorAll('input[name="termMonths"]').forEach(input => {
        input.addEventListener('change', updateSavingsEstimate);
    });

    document.getElementById('savingsForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rawAmt = document.getElementById('savingsAmountInput').value.replace(/\D/g, "");
        const amount = parseFloat(rawAmt);
        const termMonths = parseInt(document.querySelector('input[name="termMonths"]:checked').value);
        const rate = calculateSavingsRate(amount, termMonths);

        if (amount < 1000000) return Toast.warn('Số tiền gửi tối thiểu là 1,000,000 VNĐ');

        showLoader();
        try {
            const res = await fetch(`${Config.BASE_URL}/api/savings`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ amount, termMonths, rate })
            });

            if (res.ok) {
                Toast.success('Yêu cầu gửi tiết kiệm đã được gửi! Vui lòng chờ Admin duyệt.');
                document.getElementById('savingsForm').reset();
                updateSavingsEstimate();
                fetchAllData();
            } else {
                Toast.error('Lỗi khi gửi yêu cầu.');
            }
        } catch (err) {
            Toast.error('Lỗi kết nối server.');
        } finally {
            hideLoader();
        }
    });

    fetchAllData();
    // Kích hoạt view mặc định (Tổng quan) ngay lập tức
    const defaultView = document.querySelector('.nav-links li.active');
    if (defaultView) {
        setTimeout(() => defaultView.click(), 100);
    }
});
