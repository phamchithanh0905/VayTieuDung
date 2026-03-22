/* global Config, Toast, checkAuth, Chart, DataService, showLoader, hideLoader */
// admin.js - Logic for Admin Dashboard integrated with backend

document.addEventListener("DOMContentLoaded", () => {
    // Auth Check
    // Gác cổng bảo vệ Admin
    const currentUser = checkAuth(['admin']);
    if (!currentUser) return;
    
    document.body.style.opacity = '1';
    document.getElementById('userNameDisplay').textContent = currentUser.name;

    let loans = [];
    let users = [];
    let systemSettings = [];
    let savings = [];
    let payments = [];


    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const calculateLoanSummary = (amount, rate, months) => {
        const totalInterest = amount * (rate / 100) * months;
        const totalPayable = amount + totalInterest;
        return { totalPayable };
    };


    const getStatusBadge = (status) => {
        const badges = {
            'pending': '<span class="badge badge-pending">Chờ duyệt</span>',
            'approved': '<span class="badge badge-pending" style="background:#5a189a; color:white;">Chờ nạp tiền</span>',
            'verifying': '<span class="badge" style="background:#f39c12; color:white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Đang xác minh tiền</span>',
            'active': '<span class="badge badge-paid">Đang hoạt động</span>',
            'transferring': '<span class="badge" style="background:#3498db; color:white; padding: 4px 8px; border-radius: 4px; font-size: 0.75rem;">Đang chuyển tiền</span>',
            'rejected': '<span class="badge badge-rejected">Đã hủy</span>',
            'paid': '<span class="badge badge-paid">Đã tất toán</span>'
        };
        return badges[status] || `<span class="badge">${status}</span>`;
    };


    const token = localStorage.getItem('token');
    const headers = { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
    const fetchAllData = async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

            const [loansRes, settingsRes, usersRes, paymentsRes, savingsRes, notifRes] = await Promise.all([
                fetch(`${Config.BASE_URL}/api/loans`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/settings`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/users`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/payments`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/savings`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/notifications`, { headers, signal: controller.signal })
            ]);

            
            clearTimeout(timeoutId);

            if (usersRes.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html?session=expired';
                return;
            }
            
            if (loansRes.ok) loans = await loansRes.json();
            if (settingsRes.ok) systemSettings = await settingsRes.json();
            if (usersRes.ok) users = await usersRes.json();
            if (paymentsRes.ok) payments = await paymentsRes.json();
            if (savingsRes.ok) savings = await savingsRes.json();
            
            refreshUI();

            if (notifRes.ok) renderNotifHistory(await notifRes.json());

                
        } catch (err) {
            console.error('Admin fetching error, retrying...', err);
            if (err.name === 'AbortError') {
                Toast.error('Server đang khởi động (Render Cold Start), vui lòng chờ 30-60s...');
            } else {
                Toast.error('Lỗi kết nối Server Admin! Đang thử lại...');
            }
            setTimeout(fetchAllData, 5000);
        }
    };

    const renderNotifHistory = (notifs) => {
        const container = document.getElementById('notifHistoryList');
        if (!container) return;
        
        if (!Array.isArray(notifs)) {
            container.innerHTML = '<p style="color:var(--text-secondary)">Lỗi nạp dữ liệu thông báo.</p>';
            return;
        }
        
        container.innerHTML = notifs.map(n => `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border-color); position:relative;">
                <p style="margin-bottom:5px; padding-right: 30px;">${n.message}</p>
                <small style="color: var(--text-secondary)">${new Date(n.created_at).toLocaleString('vi-VN')}</small>
                <button class="btn-delete-notif" data-id="${n.id}" style="position:absolute; right:0; top:1rem; border:none; background:none; color:var(--danger-color); cursor:pointer;"><i class="fas fa-times"></i></button>
            </div>
        `).join('') || '<p style="color:var(--text-secondary)">Chưa có thông báo nào.</p>';

        document.querySelectorAll('.btn-delete-notif').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                await fetch(`${Config.BASE_URL}/api/notifications/${id}`, { method: 'DELETE', headers });
                fetchAllData();
            });
        });
    };

    document.getElementById('sendNotificationForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const message = document.getElementById('notifMessage').value;
        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/notifications`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ message })
            });
            Toast.success('Đã phát hành thông báo!');
            document.getElementById('notifMessage').value = '';
            fetchAllData();
        } catch (err) {
            Toast.error('Lỗi khi gửi thông báo');
        } finally {
            hideLoader();
        }
    });

    const renderSettings = () => {
        const ratesContainer = document.getElementById('ratesContainer');
        const bankContainer = document.getElementById('bankSettingsContainer');
        if (!ratesContainer || !bankContainer) return;
        
        if (!Array.isArray(systemSettings)) {
            ratesContainer.innerHTML = '<p style="color:var(--text-secondary)">Lỗi nạp dữ liệu cài đặt.</p>';
            return;
        }

        const ratesHtml = systemSettings.filter(s => !s.key.startsWith('bank_')).map(s => `
            <div style="display:flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border-color);">
                <div>
                    <strong style="display:block;">${s.name || `Gói Lãi suất ${s.value_int || 0}%`}</strong>
                    <small style="color: var(--text-secondary)">Lãi suất: ${s.value_int}%/tháng</small>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input setting-toggle" type="checkbox" data-id="${s.id}" ${s.is_active ? 'checked' : ''} style="width: 50px; height: 25px; cursor: pointer;">
                </div>
            </div>`).join('');

        const bankHtml = systemSettings.filter(s => s.key.startsWith('bank_')).map(s => {
            let name = s.key;
            if (s.key === 'bank_name') name = 'Tên Ngân Hàng';
            if (s.key === 'bank_account') name = 'Số Tài Khoản';
            if (s.key === 'bank_holder') name = 'Chủ Tài Khoản';
            
            return `
                <div style="display:flex; flex-direction: column; padding: 1rem; border-bottom: 1px solid var(--border-color);">
                    <label style="font-weight: bold; margin-bottom: 5px;">${name}</label>
                    <input type="text" class="form-control bank-setting-input" data-id="${s.id}" value="${s.value_text || ''}" style="background: rgba(255,255,255,0.05); color: #fff; border: 1px solid var(--border-color);">
                </div>`;
        }).join('');

        ratesContainer.innerHTML = ratesHtml || '<p class="text-center">Chưa có gói lãi suất.</p>';
        bankContainer.innerHTML = bankHtml || '<p class="text-center">Chưa cấu hình ngân hàng.</p>';

        // Event Listeners cho Toggles Lãi suất
        document.querySelectorAll('.setting-toggle').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const id = e.target.dataset.id;
                await fetch(`${Config.BASE_URL}/api/settings/${id}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify({ is_active: e.target.checked })
                });
                Toast.success('Đã cập nhật trạng thái');
            });
        });

        // Event Listeners cho Input Ngân hàng
        document.querySelectorAll('.bank-setting-input').forEach(input => {
            input.addEventListener('blur', async (e) => {
                const id = e.target.dataset.id;
                const value = e.target.value;
                try {
                    await fetch(`${Config.BASE_URL}/api/settings/${id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ value_text: value })
                    });
                    Toast.success('Đã lưu thông tin ngân hàng');
                } catch (err) { Toast.error('Lỗi khi lưu'); }
            });
        });
    };

    const renderPayments = () => {
        const tb = document.getElementById('paymentsTableBody');
        if (!tb) return;
        if (!Array.isArray(payments) || payments.length === 0) {
            tb.innerHTML = '<tr><td colspan="7" style="text-align:center">Chưa có yêu cầu thanh toán nào.</td></tr>';
            return;
        }

        tb.innerHTML = payments.map(p => {
            const statusText = p.status === 'pending' ? '<span class="badge badge-pending">Chờ duyệt</span>' : 
                               (p.status === 'confirmed' ? '<span class="badge badge-paid">Thành công</span>' : '<span class="badge badge-rejected">Đã hủy</span>');
            
            let actions = '';
            if (p.status === 'pending') {
                actions = `
                    <button class="btn btn-primary btn-sm btn-confirm-pay" data-id="${p.id}" style="background:var(--success-color); color:#121212"><i class="fas fa-check"></i> Xác nhận</button>
                    <button class="btn btn-primary btn-sm btn-reject-pay" data-id="${p.id}" style="background:var(--danger-color);"><i class="fas fa-times"></i> Hủy</button>
                `;
            } else {
                actions = '-';
            }

            return `
                <tr>
                    <td>#P${p.id}</td>
                    <td>${p.customerName}</td>
                    <td>${p.loanId}</td>
                    <td style="color:var(--success-color); font-weight:700;">${formatCurrency(p.amount)}</td>
                    <td>${new Date(p.createdAt).toLocaleString('vi-VN')}</td>
                    <td>${statusText}</td>
                    <td><div style="display:flex; gap:0.5rem">${actions}</div></td>
                </tr>
            `;
        }).join('');

        document.querySelectorAll('.btn-confirm-pay').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if(confirm('Xác nhận đã nhận đủ số tiền và cộng vào dư nợ?')) {
                    await updatePaymentStatus(id, 'confirmed');
                }
            });
        });

        document.querySelectorAll('.btn-reject-pay').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if(confirm('Bạn sẽ hủy yêu cầu này vì chưa nhận được tiền?')) {
                    await updatePaymentStatus(id, 'rejected');
                }
            });
        });
    };

    const updatePaymentStatus = async (id, status) => {
        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/payments/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ status })
            });
            Toast.success('Đã cập nhật giao dịch');
            fetchAllData();
        } catch (err) { Toast.error('Lỗi khi cập nhật giao dịch'); }
        finally { hideLoader(); }
    };

    const refreshUI = () => {
        renderStats();
        renderUsers();
        renderAllLoans();
        renderSettings(); // Restore this call
        renderSavingsAdmin();
        renderSavingsManage();
        renderPayments();
    };

    const renderStats = () => {
        document.getElementById('totalUsersStat').textContent = Array.isArray(users) ? users.length : 0;
        
        const statusCounts = { active: 0, pending: 0, rejected: 0, paid: 0 };
        let totalDebtAmt = 0;

        if (Array.isArray(loans)) {
            loans.forEach(loan => {
                statusCounts[loan.status]++;
                if (loan.status === 'active') {
                    const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
                    totalDebtAmt += (summary.totalPayable - (loan.amountPaid || 0));
                }
            });
        }

        document.getElementById('pendingLoansStat').textContent = statusCounts.pending;
        document.getElementById('totalDebtStat').textContent = formatCurrency(totalDebtAmt);
        
        renderCharts(statusCounts, totalDebtAmt);
    };

    let statusChart = null;
    let debtChart = null;

    const renderCharts = (statusCounts, totalDebtAmt) => {
        const ctxStatus = document.getElementById('adminStatusChart').getContext('2d');
        if (statusChart) statusChart.destroy();
        statusChart = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['Đang vay', 'Chờ duyệt', 'Từ chối', 'Tất toán'],
                datasets: [{
                    data: [statusCounts.active, statusCounts.pending, statusCounts.rejected, statusCounts.paid],
                    backgroundColor: ['#4361ee', '#fca311', '#e63946', '#4cc9f0']
                }]
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
        });

        const ctxDebt = document.getElementById('adminDebtChart').getContext('2d');
        if (debtChart) debtChart.destroy();
        debtChart = new Chart(ctxDebt, {
            type: 'bar',
            data: {
                labels: ['Tổng Dư Nợ Hiện Tại'],
                datasets: [{
                    label: 'VNĐ',
                    data: [totalDebtAmt],
                    backgroundColor: '#4361ee'
                }]
            },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        });
    };

    const renderRecentLoans = () => {
        const tb = document.getElementById('recentLoansTableBody');
        const recent = [...loans].slice(0, 5); // Assuming ordered by DESC
        
        tb.innerHTML = recent.map(loan => `
            <tr>
                <td>${loan.id}</td>
                <td>${loan.customerName}</td>
                <td>${formatCurrency(loan.amount)}</td>
                <td>${loan.interestRate}%/năm</td>
                <td>${getStatusBadge(loan.status)}</td>
            </tr>
        `).join('');
    };

    const renderAllLoans = () => {
        const tb = document.getElementById('allLoansTableBody');
        if (!Array.isArray(loans)) {
            tb.innerHTML = '<tr><td colspan="7" style="text-align: center;">Lỗi nạp dữ liệu khoản vay.</td></tr>';
            return;
        }

        tb.innerHTML = loans.map(loan => {
            let actionBtn = '';
            // Admin can process pending or close active
            if (loan.status === 'pending') {
                actionBtn = `<button class="btn btn-primary btn-sm btn-action-loan" data-id="${loan.id}"><i class="fas fa-check"></i> Phê Duyệt</button>`;
            } else if (loan.status === 'approved') {
                actionBtn = `<button class="btn btn-sm btn-action-loan" data-id="${loan.id}" style="background:#5a189a; color:#fff"><i class="fas fa-paper-plane"></i> Giải Ngân</button>`;
            } else if (loan.status === 'active') {
                actionBtn = `<button class="btn btn-secondary btn-sm btn-action-loan" style="border-color: var(--success-color); color: var(--success-color);" data-id="${loan.id}"><i class="fas fa-check-double"></i> Tất Toán</button>`;
            } else {
                actionBtn = `<span class="text-secondary">-</span>`;
            }

            
            const nextDate = loan.nextPaymentDate ? new Date(loan.nextPaymentDate).toLocaleDateString('vi-VN') : '-';
            const isOverdue = loan.status === 'active' && loan.nextPaymentDate && new Date(loan.nextPaymentDate) < new Date();
            
            return `
            <tr style="${isOverdue ? 'background: rgba(230, 57, 70, 0.05); border-left: 2px solid var(--danger-color);' : ''}">
                <td>${loan.id}</td>
                <td>${loan.customerName}</td>
                <td><small>Gốc:</small> ${formatCurrency(loan.amount)}<br><small>Tổng (Lãi+Gốc):</small> <strong style="color:var(--primary-color)">${formatCurrency(calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths).totalPayable)}</strong></td>
                <td>${loan.interestRate}%</td>
                <td>${loan.durationMonths} Tháng</td>
                <td><span style="${isOverdue ? 'color: var(--danger-color); font-weight: bold;' : ''}">${nextDate}</span></td>
                <td>${getStatusBadge(loan.status)}</td>
                <td>${actionBtn}</td>
            </tr>
        `}).join('');
    };

    document.getElementById('allLoansTableBody').addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-action-loan');
        if (btn) openLoanActionModal(btn.dataset.id);
    });

    const renderUsers = () => {
        const tb = document.getElementById('usersTableBody');
        if (!Array.isArray(users)) {
            tb.innerHTML = '<tr><td colspan="5" style="text-align: center;">Lỗi nạp dữ liệu người dùng.</td></tr>';
            return;
        }

        tb.innerHTML = users.map(u => `
            <tr>
                <td>${u.id}</td>
                <td><a href="#" class="view-user-details" data-id="${u.id}" style="color:var(--primary-color); font-weight:600;">${u.name}</a></td>
                <td>${u.username}</td>
                <td style="font-family: monospace; color: var(--success-color);">${u.password}</td>
                <td>${u.loanCount} khoản vay</td>
                <td>
                    <button class="btn btn-secondary btn-sm btn-delete-user" data-id="${u.id}" style="color: var(--danger-color); border-color: var(--danger-color);"><i class="fas fa-trash"></i> Xóa KH</button>
                </td>
            </tr>
        `).join('');

        // Chi tiết người dùng
        document.querySelectorAll('.view-user-details').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                showUserDetails(e.target.dataset.id);
            });
        });

        document.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.dataset.id;
                if(confirm('Bạn có chắc chắn muốn xóa khách hàng này? Mọi khoản vay của họ sẽ bị xóa sạch.')) {
                    await fetch(`${Config.BASE_URL}/api/users/${id}`, { method: 'DELETE', headers });
                    fetchAllData();
                }
            });
        });
    };

    const showUserDetails = (id) => {
        const user = users.find(u => u.id == id);
        if (!user) return;

        const body = document.getElementById('userDetailBody');
        body.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <p><strong>Mã KH:</strong><br>${user.id}</p>
                <p><strong>Tên ĐN:</strong><br>${user.username}</p>
                <p><strong>Họ Tên:</strong><br>${user.name}</p>
                <p><strong>Mật khẩu:</strong><br><span style="color:var(--success-color); font-family:monospace;">${user.password}</span></p>
                <p><strong>SĐT:</strong><br>${user.phone || 'Chưa cập nhật'}</p>
                <p><strong>Số CCCD:</strong><br>${user.id_card || 'Chưa cập nhật'}</p>
                <p><strong>Thu nhập:</strong><br>${user.income ? formatCurrency(user.income) : 'Chưa cập nhật'}</p>
                <p style="grid-column: span 2;"><strong>Địa chỉ:</strong><br>${user.address || 'Chưa cập nhật'}</p>
                <p style="grid-column: span 2;"><strong>Nghề nghiệp:</strong><br>${user.job || 'Chưa cập nhật'}</p>
            </div>
            <button class="btn btn-primary" style="width:100%; margin-top:1.5rem;" onclick="document.getElementById('userDetailsModal').style.display='none'">Đóng</button>
        `;
        document.getElementById('userDetailsModal').style.display = 'block';
    };

    // Action Modal
    let currentActionLoanId = null;
    let currentLoanStatus = null;
    const loanModal = document.getElementById('loanActionModal');
    
    const openLoanActionModal = (id) => {
        currentActionLoanId = id;
        const loan = loans.find(l => l.id == id);
        currentLoanStatus = loan.status;
        
        document.getElementById('modalLoanId').textContent = loan.id;
        document.getElementById('modalCustomerName').textContent = loan.customerName;
        document.getElementById('modalAmount').textContent = formatCurrency(calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths).totalPayable) + ' (Tổng Gốc + Lãi)';
        document.getElementById('modalAdminNote').value = loan.adminNote || '';
        
        const activeFields = document.getElementById('modalActiveFields');
        const startDateInput = document.getElementById('modalStartDate');
        const nextDateInput = document.getElementById('modalNextDate');
        
        if (loan.status === 'pending') {
            btnApprove.innerHTML = '<i class="fas fa-check"></i> Phê Duyệt Vay';
            btnApprove.style.background = 'var(--primary-color)';
            btnReject.style.display = 'inline-block';
            activeFields.style.display = 'none';
        } else if (loan.status === 'approved') {
            btnApprove.innerHTML = '<i class="fas fa-paper-plane"></i> XÁC NHẬN ĐÃ CHUYỂN TIỀN';
            btnApprove.style.background = 'var(--success-color)';
            btnReject.style.display = 'none';
            activeFields.style.display = 'none';
        } else if (loan.status === 'active') {
            btnApprove.innerHTML = '<i class="fas fa-save"></i> Cập Nhật Hạn & Lưu';
            btnApprove.style.background = 'var(--primary-color)';
            btnReject.innerHTML = '<i class="fas fa-check-double"></i> Xác Nhận Tất Toán Toàn Bộ';
            btnReject.style.background = 'var(--success-color)';
            btnReject.style.display = 'inline-block';
            activeFields.style.display = 'block';
            
            if (loan.startDate) {
                startDateInput.value = new Date(loan.startDate).toISOString().split('T')[0];
            } else {
                startDateInput.value = '';
            }

            if (loan.nextPaymentDate) {
                nextDateInput.value = new Date(loan.nextPaymentDate).toISOString().split('T')[0];
            } else {
                nextDateInput.value = '';
            }
        }

        
        loanModal.classList.add('active');
    };

    const closeModal = () => {
        loanModal.classList.remove('active');
        document.getElementById('userDetailsModal').style.display = 'none';
        currentActionLoanId = null;
    };

    document.querySelectorAll('.close-btn').forEach(btn => btn.addEventListener('click', closeModal));
    window.addEventListener('click', (e) => { 
        if (e.target === loanModal) closeModal(); 
        if (e.target === document.getElementById('userDetailsModal')) closeModal();
    });

    document.getElementById('btnApprove').addEventListener('click', async () => {
        if(!currentActionLoanId) return;
        
        const startDateVal = document.getElementById('modalStartDate').value;
        const nextDateVal = document.getElementById('modalNextDate').value;
        let updateData = {};

        if (currentLoanStatus === 'pending') {
            updateData = { status: 'approved' };
        } else if (currentLoanStatus === 'approved') {
            updateData = { 
                status: 'active', 
                startDate: new Date().toISOString(),
                nextPaymentDate: new Date(Date.now() + 30*24*60*60*1000).toISOString()
            };
        } else if (currentLoanStatus === 'active') {
            // Cập nhật ngày hạn hoặc ghi chú hoặc ngày bắt đầu
            updateData = { status: 'active' };
            if (startDateVal) updateData.startDate = new Date(startDateVal).toISOString();
            if (nextDateVal) updateData.nextPaymentDate = new Date(nextDateVal).toISOString();
        }


        updateData.adminNote = document.getElementById('modalAdminNote').value;

        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/loans/${currentActionLoanId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(updateData)
            });
            closeModal();
            Toast.success('Đã cập nhật trạng thái khoản vay');
            fetchAllData();
        } catch (err) {
            Toast.error('Lỗi khi cập nhật');
        } finally {
            hideLoader();
        }
    });

    document.getElementById('btnReject').addEventListener('click', async () => {
        if(!currentActionLoanId) return;
        
        let updateData = { adminNote: document.getElementById('modalAdminNote').value };
        let msg = 'Đã thực hiện';
        let isReject = true;
        
        if (currentLoanStatus === 'pending') {
            updateData.status = 'rejected';
            msg = 'Đã từ chối khoản vay';
        } else if (currentLoanStatus === 'active') {
            const loan = loans.find(l => l.id == currentActionLoanId);
            const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
            updateData.status = 'paid';
            updateData.amountPaid = summary.totalPayable;
            msg = 'Đã tất toán toàn bộ khoản vay';
            isReject = false;
        }

        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/loans/${currentActionLoanId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(updateData)
            });
            closeModal();
            if(isReject) Toast.warn(msg); else Toast.success(msg);
            fetchAllData();
        } catch (err) { Toast.error('Lỗi khi thực hiện'); }
        finally { hideLoader(); }
    });

    // Navigation & Logic
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
        
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => {
                if(window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                }
            });
        });
    }

    // Theme logic
    const themeBtn = document.getElementById('themeToggleBtn');
    themeBtn.addEventListener('click', () => {
        const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('theme', t);
        themeBtn.innerHTML = t==='dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    });

    // Savings Admin Logic
    const renderSavingsAdmin = () => {
        const tb = document.getElementById('savingsAdminTableBody');
        if (!tb) return;

        if (savings.length === 0) {
            tb.innerHTML = '<tr><td colspan="7" class="text-center">Không có yêu cầu nào.</td></tr>';
            return;
        }

        tb.innerHTML = savings.map(s => `
            <tr>
                <td style="padding: 1.2rem 0.5rem;">#${s.id}</td>
                <td style="padding: 1.2rem 0.5rem;"><strong>${s.customerName || 'N/A'}</strong></td>
                <td style="padding: 1.2rem 0.5rem;">${formatCurrency(s.amount)}</td>
                <td style="padding: 1.2rem 0.5rem;"><span style="color:var(--success-color); font-weight:700;">${s.rate}%</span></td>
                <td style="padding: 1.2rem 0.5rem;">${s.term_months} Tháng</td>
                <td style="padding: 1.2rem 0.5rem;">${getStatusBadge(s.status)}</td>
                <td style="padding: 1.2rem 0.5rem;">
                    ${(s.status === 'pending' || s.status === 'verifying' || s.status === 'approved') ? `
                        <button class="btn btn-primary btn-sm btn-action-savings" data-id="${s.id}" style="padding: 6px 12px; font-size: 0.75rem;">
                            <i class="fas fa-edit"></i> Xử lý
                        </button>
                    ` : '<span class="text-secondary">-</span>'}
                </td>
            </tr>
        `).join('');
    };

    const renderSavingsManage = () => {
        const tb = document.getElementById('savingsManageTableBody');
        if (!tb) return;

        if (savings.length === 0) {
            tb.innerHTML = '<tr><td colspan="8" class="text-center">Chưa có dữ liệu tích lũy.</td></tr>';
            return;
        }

        tb.innerHTML = savings.map(s => {
            const startDate = new Date(s.createdAt);
            const maturityDate = new Date(startDate);
            maturityDate.setMonth(maturityDate.getMonth() + parseInt(s.term_months));

            return `
            <tr>
                <td style="padding: 1.2rem 0.5rem;">#${s.id}</td>
                <td style="padding: 1.2rem 0.5rem;">${startDate.toLocaleDateString('vi-VN')}</td>
                <td style="padding: 1.2rem 0.5rem;">${maturityDate.toLocaleDateString('vi-VN')}</td>
                <td style="padding: 1.2rem 0.5rem;"><strong>${s.customerName || 'N/A'}</strong></td>
                <td style="padding: 1.2rem 0.5rem;">${formatCurrency(s.amount)}</td>
                <td style="padding: 1.2rem 0.5rem;"><span style="color:var(--success-color); font-weight:700;">${s.rate}%</span></td>
                <td style="padding: 1.2rem 0.5rem;">${s.term_months} Tháng</td>
                <td style="padding: 1.2rem 0.5rem;">${getStatusBadge(s.status)}</td>
                <td style="padding: 1.2rem 0.5rem;">
                    <button class="btn btn-secondary btn-sm btn-action-savings" data-id="${s.id}" style="padding: 6px 12px; font-size: 0.75rem;">
                        <i class="fas fa-cog"></i> Sửa
                    </button>
                </td>
            </tr>
        `}).join('');
    };

    let currentActionSavingsId = null;
    const savingsModal = document.getElementById('savingsActionModal');

    // Event delegation for BOTH tables
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-action-savings');
        if (btn) openSavingsModal(btn.dataset.id);
    });

    const openSavingsModal = (id) => {
        const item = savings.find(s => s.id == id);
        if (!item) return;

        currentActionSavingsId = id;
        document.getElementById('savingsModalId').textContent = '#' + item.id;
        document.getElementById('savingsModalCustomer').textContent = item.customerName;
        document.getElementById('savingsModalAmount').textContent = formatCurrency(item.amount);
        document.getElementById('savingsModalRate').textContent = item.rate + '% / Năm';
        document.getElementById('savingsModalNote').value = item.adminNote || '';
        
        // Populate date field (YYYY-MM-DD)
        const dateInput = document.getElementById('savingsModalDate');
        if (dateInput) {
            dateInput.value = new Date(item.createdAt).toISOString().split('T')[0];
        }

        // Dynamic buttons based on status
        const btnApprove = document.getElementById('btnApproveSavings');
        const btnReject = document.getElementById('btnRejectSavings');
        
        if (item.status === 'pending') {
            btnApprove.innerHTML = '<i class="fas fa-check"></i> Chấp Thuận Yêu Cầu';
            btnApprove.className = 'btn btn-primary';
            btnApprove.style.display = 'block';
            btnReject.style.display = 'block';
        } else if (item.status === 'verifying') {
            btnApprove.innerHTML = '<i class="fas fa-money-bill-wave"></i> Xác Nhận Đã Nhận Tiền';
            btnApprove.className = 'btn btn-success';
            btnApprove.style.display = 'block';
            btnReject.style.display = 'block';
        } else if (item.status === 'approved') {
            btnApprove.innerHTML = '<i class="fas fa-play"></i> Kích Hoạt Thủ Công';
            btnApprove.className = 'btn btn-secondary';
            btnApprove.style.display = 'block';
            btnReject.style.display = 'block';
        } else if (item.status === 'active') {
            btnApprove.innerHTML = '<i class="fas fa-paper-plane"></i> Chuyển Tiền Cho Khách';
            btnApprove.className = 'btn btn-primary'; // Assuming primary for payout action
            btnApprove.style.display = 'block';
            btnReject.style.display = 'none';
        } else {
            btnApprove.style.display = 'none';
            btnReject.style.display = 'none';
        }

        savingsModal.classList.add('active');
    };

    const closeSavingsModal = () => savingsModal.classList.remove('active');
    savingsModal?.querySelector('.close-btn').addEventListener('click', closeSavingsModal);

    const updateSavingsStatus = async (status) => {
        if (!currentActionSavingsId) return;
        const note = document.getElementById('savingsModalNote').value;
        const createdAt = document.getElementById('savingsModalDate')?.value;
        
        showLoader();
        try {
            const res = await fetch(`${Config.BASE_URL}/api/savings/${currentActionSavingsId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ status, adminNote: note, createdAt })
            });

            if (res.ok) {
                Toast.success('Cập nhật trạng thái tích lũy thành công!');
                closeSavingsModal();
                fetchAllData();
            } else {
                Toast.error('Lỗi khi cập nhật.');
            }
        } catch (err) {
            Toast.error('Lỗi kết nối.');
        } finally {
            hideLoader();
        }
    };

    document.getElementById('btnApproveSavings')?.addEventListener('click', () => {
        const item = savings.find(s => s.id == currentActionSavingsId);
        if (!item) return;

        if (item.status === 'pending') {
            updateSavingsStatus('approved');
        } else if (item.status === 'verifying' || item.status === 'approved') {
            updateSavingsStatus('active');
        } else if (item.status === 'active') {
            // Admin bấm chuyển tiền cho khách
            updateSavingsStatus('transferring');
        }
    });
    document.getElementById('btnRejectSavings')?.addEventListener('click', () => updateSavingsStatus('rejected'));

    // Init
    fetchAllData();
    // Kích hoạt view mặc định (Tổng quan) ngay lập tức
    const defaultView = document.querySelector('.nav-links li.active');
    if (defaultView) {
        setTimeout(() => defaultView.click(), 100);
    }
});
