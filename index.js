process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'secret_key_vaytieudung_2024';

// Middleware bảo mật
app.use(helmet({
    contentSecurityPolicy: false, // Tắt CSP để đơn giản cho demo với nhiều nguồn script
}));
app.use(cors());
app.use(express.json());

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err) => {
    if (err) console.error('Lỗi kết nối database:', err.stack);
    else console.log('Đã kết nối thành công tới Supabase PostgreSQL');
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
        console.error(err);
        res.status(500).json({ message: 'Server error' });
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
        const { is_active } = req.body;
        await pool.query('UPDATE SystemSettings SET is_active = $1 WHERE id = $2', [is_active, req.params.id]);
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

app.put('/api/loans/:id', verifyToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
    try {
        const id = req.params.id;
        const { status, adminNote, startDate, amountPaid, nextPaymentDate } = req.body;
        
        let query = 'UPDATE Loans SET ';
        const setClauses = [];
        const params = [];
        let count = 1;

        if (status) { setClauses.push(`status = $${count++}`); params.push(status); }
        if (adminNote !== undefined) { setClauses.push(`"adminNote" = $${count++}`); params.push(adminNote); }
        if (startDate) { setClauses.push(`"startDate" = $${count++}`); params.push(startDate); }
        if (amountPaid !== undefined) { setClauses.push(`"amountPaid" = $${count++}`); params.push(amountPaid); }
        if (nextPaymentDate) { setClauses.push(`"nextPaymentDate" = $${count++}`); params.push(nextPaymentDate); }

        if (setClauses.length === 0) return res.status(400).json({ message: 'No fields to update' });

        query += setClauses.join(', ') + ` WHERE id = $${count} RETURNING *`;
        params.push(id);

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
