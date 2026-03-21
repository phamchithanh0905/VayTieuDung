require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json());

// Kết nối PostgreSQL (Supabase) thông qua biến môi trường DATABASE_URL
// Ví dụ: postgresql://postgres:[password]@db.wgmyfcwcqykmujzsongk.supabase.co:5432/postgres
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Cần thiết cho Supabase/Render
    }
});

pool.connect((err, client, release) => {
    if (err) {
        return console.error('Lỗi kết nối database:', err.stack);
    }
    console.log('Đã kết nối thành công tới Supabase PostgreSQL');
});

// --- API Auth ---
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.query(
            'SELECT * FROM Users WHERE username = $1 AND password = $2',
            [username, password]
        );
        
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.status(401).json({ message: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { username, password, name } = req.body;
        
        const checkUser = await pool.query('SELECT * FROM Users WHERE username = $1', [username]);
            
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại.' });
        }
        
        const id = 'U' + Date.now();
        await pool.query(
            'INSERT INTO Users (id, username, password, name, role) VALUES ($1, $2, $3, $4, $5)',
            [id, username, password, name, 'customer']
        );
            
        res.status(201).json({ id, username, password, name, role: 'customer' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Admin ---
app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT u.id, u.name, u.username, 
            (SELECT COUNT(*) FROM Loans l WHERE l."customerId" = u.id) as "loanCount"
            FROM Users u WHERE u.role = 'customer'
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
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

app.delete('/api/loans/cancel/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.query("DELETE FROM Loans WHERE id = $1 AND status = 'pending'", [id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

// --- API Loans ---
app.get('/api/loans', async (req, res) => {
    try {
        const customerId = req.query.customerId;
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

app.post('/api/loans', async (req, res) => {
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

app.put('/api/loans/:id', async (req, res) => {
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
