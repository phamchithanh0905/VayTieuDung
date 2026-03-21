// Global Diagnostic & Error Handler
window.addEventListener('error', function(event) {
    const errorMsg = `Lỗi hệ thống: ${event.message} tại ${event.filename}:${event.lineno}`;
    console.error(errorMsg);
    // document.body.innerHTML = `<div style="color:red; padding: 20px;"><h1>Đã xảy ra lỗi nạp trang</h1><p>${errorMsg}</p></div>`;
});
console.log("Diagnostic: data.js is loading...");

const MOCK_USERS = [
    {
        id: "U001",
        username: "admin",
        password: "123", /* In real app, passwords must be hashed */
        name: "Quản Trị Viên",
        role: "admin"
    },
    {
        id: "U002",
        username: "khachhang1",
        password: "123",
        name: "Nguyễn Văn A",
        role: "customer"
    },
    {
        id: "U003",
        username: "khachhang2",
        password: "123",
        name: "Trần Thị B",
        role: "customer"
    }
];

const MOCK_LOANS = [
    {
        id: "L001",
        customerId: "U002",
        amount: 50000000,
        interestRate: 12, /* 12% per year */
        durationMonths: 12,
        startDate: "2023-01-15",
        status: "active", /* active, paid, pending, rejected */
        amountPaid: 25000000,
        nextPaymentDate: "2023-08-15"
    },
    {
        id: "L002",
        customerId: "U003",
        amount: 100000000,
        interestRate: 10,
        durationMonths: 24,
        startDate: "2023-05-10",
        status: "pending",
        amountPaid: 0,
        nextPaymentDate: null
    }
];

// Initialize Data if not exists
if (!localStorage.getItem('users')) {
    localStorage.setItem('users', JSON.stringify(MOCK_USERS));
}
if (!localStorage.getItem('loans')) {
    localStorage.setItem('loans', JSON.stringify(MOCK_LOANS));
}

// Data Utility Functions
const DataService = {
    getUsers: () => JSON.parse(localStorage.getItem('users')),
    
    getLoans: () => JSON.parse(localStorage.getItem('loans')),
    
    saveLoans: (loans) => localStorage.setItem('loans', JSON.stringify(loans)),
    
    saveUsers: (users) => localStorage.setItem('users', JSON.stringify(users)),
    
    getCurrentUser: () => JSON.parse(localStorage.getItem('currentUser')),
    
    login: (username, password) => {
        const users = DataService.getUsers();
        const user = users.find(u => u.username === username && u.password === password);
        if (user) {
            localStorage.setItem('currentUser', JSON.stringify(user));
            return user;
        }
        return null;
    },
    
    logout: () => {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    },

    register: (username, password, name) => {
        const users = DataService.getUsers();
        if (users.find(u => u.username === username)) {
            throw new Error("Tên đăng nhập đã tồn tại.");
        }
        const newUser = {
            id: `U${Date.now()}`,
            username,
            password,
            name,
            role: "customer"
        };
        users.push(newUser);
        DataService.saveUsers(users);
        return newUser;
    }
};

// Protect Routes
const checkAuth = (allowedRoles = []) => {
    const user = DataService.getCurrentUser();
    const token = localStorage.getItem('token');
    console.log("Diagnostic: checkAuth called for roles:", allowedRoles);
    
    // Phải có cả User và Token mới coi là đã đăng nhập
    if (!user || !token) {
        localStorage.removeItem('currentUser');
        localStorage.removeItem('token');
        if (!window.location.href.includes('login.html')) {
            window.location.href = 'login.html';
        }
        return null;
    }
    
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        // Not authorized, redirect based on role
        if (user.role === 'admin') window.location.href = 'admin.html';
        else window.location.href = 'customer.html';
        return null; // Ensure execution stops
    }
    
    return user;
};

// Theme Management
const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
};

initTheme();
