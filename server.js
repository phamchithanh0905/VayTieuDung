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
    contentSecurityPolicy: false,
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
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS Payments (
                    id SERIAL PRIMARY KEY,
                    "loanId" VARCHAR(50) NOT NULL,
                    "customerId" VARCHAR(50) NOT NULL,
                    amount DECIMAL(18,2) NOT NULL,
                    status VARCHAR(50) DEFAULT 'pending',
                    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
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
        } catch (seedErr) {
            console.error('Seeding error:', seedErr.message);
        }
    }
});

// Middleware xác thực Token
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
        res.json([]);
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

// --- API Admin Users ---
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

// --- API Loans ---
app.get('/api/loans', verifyToken, async (req, res) => {
    try {
        const customerId = req.query.customerId;
        if (req.user.role === 'customer' && String(req.user.id) !== String(customerId)) {
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
            updates = { status, adminNote, startDate, amountPaid, nextPaymentDate };
        } else {
            if (String(curLoan.customerId) !== String(req.user.id)) return res.status(403).json({ message: 'Không có quyền.' });
            updates.adminNote = adminNote || curLoan.adminNote;
            if (amountPaid !== undefined) {
                updates.amountPaid = amountPaid;
                if (amountPaid > (curLoan.amountPaid || 0)) {
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
                const pgKey = (key === 'amountPaid' || key === 'nextPaymentDate' || key === 'startDate' || key === 'adminNote') 
                             ? `"${key}"` : key;
                setClauses.push(`${pgKey} = $${count++}`);
                params.push(updates[key]);
            }
        });

        if (setClauses.length === 0) return res.status(400).json({ message: 'No fields to update' });
        params.push(id);
        const query = `UPDATE Loans SET ${setClauses.join(', ')} WHERE id = $${count} RETURNING *`;
        const result = await pool.query(query, params);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Payments ---
app.get('/api/payments', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    try {
        const result = await pool.query(`
            SELECT p.*, u.name as "customerName" 
            FROM Payments p 
            JOIN Users u ON p."customerId" = u.id 
            ORDER BY p."createdAt" DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/payments', verifyToken, async (req, res) => {
    try {
        const { loanId, amount } = req.body;
        const customerId = req.user.id; 
        
        await pool.query(
            'INSERT INTO Payments ("loanId", "customerId", amount) VALUES ($1, $2, $3)',
            [loanId, customerId, amount]
        );
        res.status(201).json({ message: 'Payment request created' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/payments/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    try {
        const { status } = req.body; 
        const paymentId = req.params.id;

        const pRes = await pool.query('SELECT * FROM Payments WHERE id = $1', [paymentId]);
        if (pRes.rows.length === 0) return res.status(404).json({ message: 'Giao dịch không tồn tại' });
        const payment = pRes.rows[0];

        if (status === 'confirmed') {
            await pool.query(
                'UPDATE Loans SET "amountPaid" = COALESCE("amountPaid", 0) + $1 WHERE id = $2',
                [payment.amount, payment.loanId]
            );
        }

        await pool.query('UPDATE Payments SET status = $1 WHERE id = $2', [status, paymentId]);
        res.json({ message: 'Updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- Hệ thống xử lý lỗi toàn cục để Server tự hồi phục ---
process.on('uncaughtException', (err) => {
    console.error('LỖI NGHIÊM TRỌNG (Uncaught Exception):', err);
    // Lưu ý: PM2 sẽ tự restart nếu process thoát, nhưng ta bắt ở đây để log lại
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Promise chưa được xử lý (Unhandled Rejection) tại:', promise, 'Lý do:', reason);
});

app.delete('/api/loans/cancel/:id', verifyToken, async (req, res) => {
    try {
        const id = req.params.id;
        const check = await pool.query('SELECT * FROM Loans WHERE id = $1', [id]);
        if (check.rows.length === 0) return res.status(404).json({ message: 'Không tìm thấy khoản vay' });
        
        if (req.user.role !== 'admin' && String(check.rows[0].customerId) !== String(req.user.id)) {
            return res.status(403).json({ message: 'Từ chối truy cập' });
        }
        
        await pool.query("DELETE FROM Loans WHERE id = $1 AND status = 'pending'", [id]);
        res.json({ message: 'Hủy khoản vay thành công' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
