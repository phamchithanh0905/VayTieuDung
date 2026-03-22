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
    let userProfile = null;

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
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout (Render cold start)

            const [loansRes, settingsRes, notifRes, profileRes] = await Promise.all([
                fetch(`${Config.BASE_URL}/api/loans?customerId=${currentUser.id}`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/settings`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/notifications`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/profile`, { headers, signal: controller.signal })
            ]);

            clearTimeout(timeoutId);
            
            if (loansRes.status === 401 || profileRes.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html?session=expired';
                return;
            }

            loans = await loansRes.json();
            updateDurationOptions(await settingsRes.json());
            renderNotifications(await notifRes.json());
            userProfile = await profileRes.json();
            
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

        let options = '';
        if (Array.isArray(settings)) {
            settings.forEach(s => {
                if (s.is_active) {
                    options += `<option value="${s.value_int}">${s.value_int}% / Tháng</option>`;
                }
            });
        }

        if (options === '') {
            options = '<option value="">Hiện tại không có mức lãi khả dụng</option>';
        }
        rateSelect.innerHTML = options;
        updateEstimate(); // Trigger re-calc
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

        // Cập nhật QR động theo số tiền
        const qrImg = document.getElementById('paymentQR');
        if (qrImg) {
            qrImg.src = `https://img.vietqr.io/image/MB-0888101901-compact.jpg?amount=${payAmount}&addInfo=Thanh%20toan%20${loan.id}&accountName=PHAM%20CHI%20THANH`;
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

        if (!amountInput || !rateSelect) return;

        // Gỡ bỏ dấu chấm/phẩy để lấy số gốc
        const rawAmt = amountInput.value.replace(/\./g, "").replace(/,/g, "");
        const amt = parseFloat(rawAmt);
        const months = parseInt(durationInput.value);
        const interest = parseFloat(rateSelect.value);

        if (amt >= 1000000 && !isNaN(interest)) {
            const summary = calculateLoanSummary(amt, interest, months);
            estimateDisplay.innerHTML = `
                <div style="display:flex; justify-content: space-between; color: var(--danger-color); font-weight:700; margin-bottom: 8px; font-size: 1.1rem;">
                    <span>Trả góp hàng tháng:</span> <strong>${formatCurrency(Math.round(summary.totalPayable / months))}</strong>
                </div>
                <div style="display:flex; justify-content: space-between; margin-bottom: 5px;">
                    <span>Tổng tiền dự kiến tất toán:</span> <strong>${formatCurrency(summary.totalPayable)}</strong>
                </div>
                <div style="display:flex; justify-content: space-between;">
                    <span>Lãi phải trả:</span> <strong>${formatCurrency(summary.totalInterest)}</strong>
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
                qrImg.src = `https://img.vietqr.io/image/MB-0888101901-compact.jpg?amount=${amount}&addInfo=Thanh%20toan%20${currentPayLoanId}&accountName=PHAM%20CHI%20THANH`;
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

    fetchAllData();
    // Kích hoạt view mặc định (Tổng quan) ngay lập tức
    const defaultView = document.querySelector('.nav-links li.active');
    if (defaultView) {
        setTimeout(() => defaultView.click(), 100);
    }
});
