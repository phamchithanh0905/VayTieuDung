process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_vaytieudung_2024';

// Middleware bảo mật
app.use(helmet({
    contentSecurityPolicy: false, // Tắt CSP để đơn giản cho demo với nhiều nguồn script
}));
app.use(cors());
app.use(express.json());

// Phục vụ file tĩnh an toàn cho Frontend
app.use(express.static(__dirname, {
    index: false, // Tắt tự động bắt index.html để route thủ công bên dưới
    extensions: ['html', 'css', 'js']
}));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/customer.html', (req, res) => res.sendFile(path.join(__dirname, 'customer.html')));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('error', (err) => {
    console.error('LỖI DATABASE BẤT NGỜ:', err.message);
});


pool.connect(async (err) => {
    if (err) {
        console.error('Lỗi kết nối database:', err.stack);
    } else {
        console.log('Đã kết nối thành công tới Supabase PostgreSQL');
        // Auto-seed required rates 5, 6, 8, 10, 15, 17, 20
        try {
            // --- LOGIC TỰ ĐỘNG SỬA CẤU TRÚC DATABASE ---
            try {
                await pool.query("ALTER TABLE SystemSettings RENAME COLUMN name TO \"key\"");
                console.log('Đã đổi tên cột name sang key thành công.');
            } catch (e) { /* Bỏ qua nếu đã có cột key */ }

            try {
                await pool.query("ALTER TABLE SystemSettings ADD COLUMN IF NOT EXISTS value_text TEXT");
                console.log('Đã bổ sung cột value_text thành công.');
            } catch (e) { /* Bỏ qua nếu đã có */ }

            const rates = [5, 6, 8, 10, 15, 17, 20];
            for (const r of rates) {
                await pool.query(
                    'INSERT INTO SystemSettings ("key", value_int, is_active) VALUES ($1, $2, TRUE) ON CONFLICT ("key") DO NOTHING',
                    [`rate_${r}`, r]
                );
            }
            // Auto-seed banking info
            await pool.query('INSERT INTO SystemSettings ("key", value_text) VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING', ['bank_name', 'MBBank']);
            await pool.query('INSERT INTO SystemSettings ("key", value_text) VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING', ['bank_account', '0888101901']);
            await pool.query('INSERT INTO SystemSettings ("key", value_text) VALUES ($1, $2) ON CONFLICT ("key") DO NOTHING', ['bank_holder', 'PHAM CHI THANH']);
            console.log('Seeding database hoàn tất.');




            // Create Payments table if not exists
            await pool.query(`
                CREATE TABLE IF NOT EXISTS Payments (
                    id SERIAL PRIMARY KEY,
                    "loanId" VARCHAR(50) NOT NULL,
                    "amount" DECIMAL(18,2) NOT NULL,
                    "status" VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, rejected
                    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY ("loanId") REFERENCES Loans(id)
                )
            `);
        } catch (seedErr) {
            console.error('Seeding error:', seedErr.message);
        }
    }
});


// --- Hệ thống xử lý lỗi toàn cục để Server tự hồi phục ---
process.on('uncaughtException', (err) => {
    console.error('LỖI NGHIÊM TRỌNG (Uncaught Exception):', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise chưa được xử lý (Unhandled Rejection) tại:', promise, 'Lý do:', reason);
});


// Middleware xác thực Token (Đã đưa lên trên để tránh lỗi Hoisting)
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(403).json({ message: 'Không có token truy cập.' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.' });
    }
};

// --- API System Notifications ---
app.get('/api/notifications', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM Notifications WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 10');
        res.json(result.rows);
    } catch (err) {
        console.error("Notifications table missing or error:", err.message);
        res.json([]); // Graceful fallback
    }
});

app.post('/api/notifications', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    try {
        const { message } = req.body;
        await pool.query('INSERT INTO Notifications (message) VALUES ($1)', [message]);
        res.status(201).json({ message: 'Notification sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/notifications/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    try {
        await pool.query('UPDATE Notifications SET is_active = FALSE WHERE id = $1', [req.params.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API System Settings ---
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM SystemSettings ORDER BY id ASC');
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/settings/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    try {
        const { is_active, value_int, value_text } = req.body;
        let query = 'UPDATE SystemSettings SET ';
        const clauses = [];
        const params = [];
        let count = 1;

        if (is_active !== undefined) { clauses.push(`is_active = $${count++}`); params.push(is_active); }
        if (value_int !== undefined) { clauses.push(`value_int = $${count++}`); params.push(value_int); }
        if (value_text !== undefined) { clauses.push(`value_text = $${count++}`); params.push(value_text); }
        
        if (clauses.length === 0) return res.status(400).json({ message: 'No data' });
        query += clauses.join(', ') + ` WHERE id = $${count}`;
        params.push(req.params.id);

        await pool.query(query, params);
        res.json({ message: 'Updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Auth ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query('SELECT * FROM Users WHERE LOWER(username) = LOWER($1)', [username]);
        
        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'Tên đăng nhập không tồn tại.' });
        }

        const user = result.rows[0];
        // Kiểm tra mật khẩu (hỗ trợ cả text thường cho dữ liệu cũ và hash cho dữ liệu mới)
        let isMatch = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(password, user.password);
        } else {
            isMatch = (password === user.password);
        }

        if (isMatch) {
            const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
            res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
        } else {
            res.status(401).json({ message: 'Mật khẩu không chính xác.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, phone, idCard, address, job, income, username, password } = req.body;
        
        // Ràng buộc Server-side
        if (!/^0[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'Số điện thoại phải đúng 10 chữ số và bắt đầu bằng số 0' });
        if (!/^[0-9]{12}$/.test(idCard)) return res.status(400).json({ message: 'Số CCCD phải đúng 12 chữ số' });

        const checkUser = await pool.query('SELECT * FROM Users WHERE username = $1', [username]);
        if (checkUser.rows.length > 0) return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại.' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const id = 'U' + Date.now();
        await pool.query(
            'INSERT INTO Users (id, username, password, name, role, phone, id_card, address, job, income) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
            [id, username, hashedPassword, name, 'customer', phone, idCard, address, job, income || 0]
        );
            
        res.status(201).json({ message: 'Đăng ký thành công!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Profile ---
app.get('/api/profile', verifyToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT phone, id_card, address, job, income FROM Users WHERE id = $1', [req.user.id]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/profile', verifyToken, async (req, res) => {
    try {
        const { phone, idCard, address, job, income } = req.body;
        
        // Ràng buộc Server-side
        if (!/^0[0-9]{9}$/.test(phone)) return res.status(400).json({ message: 'Số điện thoại không hợp lệ (10 số)' });
        if (!/^[0-9]{12}$/.test(idCard)) return res.status(400).json({ message: 'Số CCCD không hợp lệ (12 số)' });

        await pool.query(
            'UPDATE Users SET phone = $1, id_card = $2, address = $3, job = $4, income = $5 WHERE id = $6',
            [phone, idCard, address, job, income, req.user.id]
        );
        res.json({ message: 'Profile updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Admin (Bảo vệ bởi verifyToken) ---
app.get('/api/users', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Từ chối truy cập.' });
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.username, u.phone, u.id_card, u.address, u.job, u.income, 
            (SELECT COUNT(*) FROM Loans l WHERE l."customerId" = u.id) as "loanCount"
            FROM Users u WHERE u.role = 'customer'
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/users/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Từ chối truy cập.' });
    try {
        const id = req.params.id;
        await pool.query('DELETE FROM Loans WHERE "customerId" = $1', [id]);
        await pool.query('DELETE FROM Users WHERE id = $1', [id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Loans (Bảo vệ bởi verifyToken) ---
app.get('/api/loans', verifyToken, async (req, res) => {
    try {
        const customerId = req.query.customerId;
        // Nếu là customer, chỉ xem được chính mình
        if (req.user.role === 'customer' && req.user.id !== customerId) {
            return res.status(403).json({ message: 'Access denied' });
        }

        let query = `
            SELECT l.id, l."customerId", 
                   l.amount::float as amount, 
                   l."interestRate"::float as "interestRate", 
                   l."durationMonths" as "durationMonths", 
                   l."startDate" as "startDate", 
                   l.status, 
                   l."amountPaid"::float as "amountPaid", 
                   l."nextPaymentDate" as "nextPaymentDate", 
                   l."adminNote" as "adminNote", 
                   u.name as "customerName" 
            FROM Loans l 
            JOIN Users u ON l."customerId" = u.id
        `;
        let params = [];
        if (customerId) {
            query += ' WHERE l."customerId" = $1';
            params.push(customerId);
        }
        query += ' ORDER BY l.id DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/loans', verifyToken, async (req, res) => {
    try {
        const { customerId, amount, interestRate, durationMonths } = req.body;
        const id = 'L' + Date.now();
        await pool.query(
            'INSERT INTO Loans (id, "customerId", amount, "interestRate", "durationMonths", status) VALUES ($1, $2, $3, $4, $5, $6)',
            [id, customerId, amount, interestRate, durationMonths, 'pending']
        );
        res.status(201).json({ id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Payments (Khách gửi yêu cầu, Admin duyệt) ---
app.get('/api/payments', verifyToken, async (req, res) => {
    try {
        let query = `
            SELECT p.*, l."customerId", u.name as "customerName" 
            FROM Payments p 
            JOIN Loans l ON p."loanId" = l.id 
            JOIN Users u ON l."customerId" = u.id
        `;
        let params = [];
        if (req.user.role === 'customer') {
            query += ' WHERE l."customerId" = $1';
            params.push(req.user.id);
        }
        query += ' ORDER BY p."createdAt" DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/payments', verifyToken, async (req, res) => {
    try {
        const { loanId, amount } = req.body;
        // Kiểm tra xem có yêu cầu chuyển khoản nào đang chờ không để tránh spam
        const check = await pool.query('SELECT * FROM Payments WHERE "loanId" = $1 AND status = \'pending\'', [loanId]);
        if (check.rows.length > 0) return res.status(400).json({ message: 'Đã có yêu cầu thanh toán đang chờ duyệt.' });

        await pool.query(
            'INSERT INTO Payments ("loanId", amount, status) VALUES ($1, $2, \'pending\')',
            [loanId, amount]
        );
        res.status(201).json({ message: 'Yêu cầu thanh toán đã được gửi tới Admin.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/payments/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Từ chối truy cập.' });
    try {
        const { status } = req.body; // confirmed or rejected
        const payRes = await pool.query('SELECT * FROM Payments WHERE id = $1', [req.params.id]);
        if (payRes.rows.length === 0) return res.status(404).json({ message: 'Không thấy giao dịch.' });
        
        const payment = payRes.rows[0];
        if (payment.status !== 'pending') return res.status(400).json({ message: 'Giao dịch này đã được xử lý.' });

        if (status === 'confirmed') {
            // Cập nhật số tiền vào khoản vay
            const loanRes = await pool.query('SELECT * FROM Loans WHERE id = $1', [payment.loanId]);
            const loan = loanRes.rows[0];
            const newPaid = parseFloat(loan.amountPaid || 0) + parseFloat(payment.amount);
            
            // Tính tổng tiền cần trả để check xem đã xong chưa
            // Lưu ý: Lấy rates từ settings hoặc lưu trong loan. Ở đây ta dùng công thuc lãi tháng
            const totalPayable = parseFloat(loan.amount) + (parseFloat(loan.amount) * (parseFloat(loan.interestRate)/100) * parseInt(loan.durationMonths));
            
            const newStatus = newPaid >= totalPayable ? 'paid' : loan.status;

            await pool.query(
                'UPDATE Loans SET "amountPaid" = $1, status = $2 WHERE id = $3',
                [newPaid, newStatus, payment.loanId]
            );
        }

        await pool.query('UPDATE Payments SET status = $1 WHERE id = $2', [status, req.params.id]);
        res.json({ message: 'Đã cập nhật giao dịch.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/loans/:id', verifyToken, async (req, res) => {

    try {
        const id = req.params.id;
        const loanRes = await pool.query('SELECT * FROM Loans WHERE id = $1', [id]);
        if (loanRes.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy khoản vay.' });
        
        const loan = loanRes.rows[0];
        if (req.user.role === 'customer' && (String(loan.customerId) !== String(req.user.id) || loan.status !== 'pending')) {
            return res.status(403).json({ message: 'Từ chối truy cập. Chỉ được hủy khoản vay đang chờ duyệt của chính mình.' });
        }
        
        await pool.query('DELETE FROM Loans WHERE id = $1', [id]);
        res.json({ message: 'Đã hủy khoản vay.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/loans/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const { status, adminNote, startDate, amountPaid, nextPaymentDate } = req.body;
        
        // Lấy thông tin hiện tại của khoản vay
        const curRes = await pool.query('SELECT * FROM Loans WHERE id = $1', [id]);
        if (curRes.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy khoản vay.' });
        const curLoan = curRes.rows[0];

        let updates = {};
        if (req.user.role === 'admin') {
            // Admin có quyền tối cao
            updates = { status, adminNote, startDate, amountPaid, nextPaymentDate };
        } else {
            // Khách hàng CHỈ được cập nhật thanh toán và lời nhắn
            if (String(curLoan.customerId) !== String(req.user.id)) {
                return res.status(403).json({ message: 'Bạn không có quyền sửa khoản vay này.' });
            }
            
            updates.adminNote = adminNote || curLoan.adminNote;
            if (amountPaid !== undefined) {
                updates.amountPaid = amountPaid;
                // --- PHẦN CHUYÊN NGHIỆP: Tự động dời ngày hạn trên Server ---
                // Chỉ dời ngày nếu họ thực sự thanh toán thêm (nextPaymentDate không do client gửi)
                if (amountPaid > curLoan.amountPaid) {
                   const oldDate = curLoan.nextPaymentDate ? new Date(curLoan.nextPaymentDate) : new Date();
                   oldDate.setDate(oldDate.getDate() + 30);
                   updates.nextPaymentDate = oldDate.toISOString();
                }
            }
        }

        const setClauses = [];
        const params = [];
        let count = 1;

        Object.keys(updates).forEach(key => {
            if (updates[key] !== undefined) {
                // Ánh xạ camelCase sang snake_case hoặc dấu ngoặc kép cho Postgres
                const pgKey = (key === 'interestRate' || key === 'amountPaid' || key === 'durationMonths' || key === 'nextPaymentDate' || key === 'startDate' || key === 'adminNote' || key === 'customerId') 
                             ? `"${key}"` : key;
                setClauses.push(`${pgKey} = $${count++}`);
                params.push(updates[key]);
            }
        });

        if (setClauses.length === 0) return res.status(400).json({ message: 'Không có dữ liệu thay đổi.' });

        params.push(id);
        const query = `UPDATE Loans SET ${setClauses.join(', ')} WHERE id = $${count} RETURNING *`;
        const result = await pool.query(query, params);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
