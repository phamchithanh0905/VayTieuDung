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

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    };

    const calculateLoanSummary = (amount, rate, months) => {
        const totalInterest = amount * (rate / 100) * (months / 12);
        const totalPayable = amount + totalInterest;
        return { totalPayable };
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
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

            const [usersRes, loansRes, settingsRes, notifRes] = await Promise.all([
                fetch(`${Config.BASE_URL}/api/users`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/loans`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/settings`, { headers, signal: controller.signal }),
                fetch(`${Config.BASE_URL}/api/notifications`, { headers, signal: controller.signal })
            ]);
            
            clearTimeout(timeoutId);

            if (usersRes.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('currentUser');
                window.location.href = 'login.html?session=expired';
                return;
            }
            
            if (usersRes.ok) users = await usersRes.json();
            if (loansRes.ok) loans = await loansRes.json();
            
            refreshUI();

            if (settingsRes.ok) renderSettings(await settingsRes.json());
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

    const renderSettings = (settings) => {
        const container = document.getElementById('settingsList');
        if (!container) return;
        
        if (!Array.isArray(settings)) {
            container.innerHTML = '<p style="color:var(--text-secondary)">Lỗi nạp dữ liệu cài đặt.</p>';
            return;
        }

        container.innerHTML = settings.map(s => `
            <div style="display:flex; justify-content: space-between; align-items: center; padding: 1rem; border-bottom: 1px solid var(--border-color);">
                <div>
                    <strong style="display:block;">${s.name || `Gói Lãi suất ${s.value_int}%`}</strong>
                    <small style="color: var(--text-secondary)">Lãi suất: ${s.value_int}%/tháng</small>
                </div>
                <div class="form-check form-switch">
                    <input class="form-check-input setting-toggle" type="checkbox" data-id="${s.id}" ${s.is_active ? 'checked' : ''} style="width: 50px; height: 25px; cursor: pointer;">
                </div>
            </div>
        `).join('');

        document.querySelectorAll('.setting-toggle').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const id = e.target.dataset.id;
                const isActive = e.target.checked;
                try {
                    await fetch(`${Config.BASE_URL}/api/settings/${id}`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify({ is_active: isActive })
                    });
                    Toast.success('Đã cập nhật cài đặt');
                } catch (err) {
                    Toast.error('Lỗi cập nhật');
                }
            });
        });
    };

    const refreshUI = () => {
        renderDashboardStats();
        renderRecentLoans();
        renderAllLoans();
        renderUsers();
    };

    const renderDashboardStats = () => {
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
                actionBtn = `<button class="btn btn-primary btn-sm btn-action-loan" data-id="${loan.id}"><i class="fas fa-cog"></i> Phê Duyệt</button>`;
            } else if (loan.status === 'active') {
                actionBtn = `<button class="btn btn-secondary btn-sm btn-action-loan" style="border-color: var(--success-color); color: var(--success-color);" data-id="${loan.id}"><i class="fas fa-check-double"></i> Tất Toán</button>`;
            } else {
                actionBtn = `<span class="text-secondary">-</span>`;
            }
            
            return `
            <tr>
                <td>${loan.id}</td>
                <td>${loan.customerName}</td>
                <td><small>Gốc:</small> ${formatCurrency(loan.amount)}<br><small>Tổng (Lãi+Gốc):</small> <strong style="color:var(--primary-color)">${formatCurrency(calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths).totalPayable)}</strong></td>
                <td>${loan.interestRate}%</td>
                <td>${loan.durationMonths} Tháng</td>
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
        
        const btnApprove = document.getElementById('btnApprove');
        const btnReject = document.getElementById('btnReject');
        
        if (loan.status === 'pending') {
            btnApprove.innerHTML = '<i class="fas fa-check"></i> Duyệt Vay';
            btnApprove.style.background = 'var(--success-color)';
            btnReject.style.display = 'inline-block';
        } else if (loan.status === 'active') {
            btnApprove.innerHTML = '<i class="fas fa-check-double"></i> Xác Nhận Tất Toán Toàn Bộ';
            btnApprove.style.background = 'var(--primary-color)';
            btnReject.style.display = 'none';
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
        
        let updateData = {};
        if (currentLoanStatus === 'pending') {
            updateData = { 
                status: 'active', 
                startDate: new Date().toISOString(),
                nextPaymentDate: new Date(Date.now() + 30*24*60*60*1000).toISOString()
            };
        } else if (currentLoanStatus === 'active') {
            const loan = loans.find(l => l.id == currentActionLoanId);
            const summary = calculateLoanSummary(loan.amount, loan.interestRate, loan.durationMonths);
            updateData = { 
                status: 'paid',
                amountPaid: summary.totalPayable
            };
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
        showLoader();
        try {
            await fetch(`${Config.BASE_URL}/api/loans/${currentActionLoanId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({ 
                    status: 'rejected',
                    adminNote: document.getElementById('modalAdminNote').value
                })
            });
            closeModal();
            Toast.warn('Đã từ chối khoản vay');
            fetchAllData();
        } catch (err) {
            Toast.error('Lỗi khi từ chối');
        } finally {
            hideLoader();
        }
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

    // Init
    fetchAllData();
    // Kích hoạt view mặc định (Tổng quan) ngay lập tức
    const defaultView = document.querySelector('.nav-links li.active');
    if (defaultView) {
        setTimeout(() => defaultView.click(), 100);
    }
});
