const express = require('express');
const cors = require('cors');
const sql = require('mssql/msnodesqlv8');

const app = express();
app.use(cors());
app.use(express.json());

const dbConfig = {
    driver: 'msnodesqlv8',
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=localhost;Database=QuanLyKhoanVay;Trusted_Connection=yes;'
};

let pool;
async function initializeDatabase() {
    try {
        pool = await sql.connect(dbConfig);
        console.log("Database connected via Windows Authentication.");
    } catch (err) {
        console.error("Database connection failed:", err);
    }
}
initializeDatabase();

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await pool.request()
            .input('username', sql.VarChar, username)
            .input('password', sql.VarChar, password)
            .query('SELECT * FROM Users WHERE username = @username AND password = @password');
        
        if (result.recordset.length > 0) {
            res.json(result.recordset[0]);
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
        
        const checkUser = await pool.request()
            .input('username', sql.VarChar, username)
            .query('SELECT * FROM Users WHERE username = @username');
            
        if (checkUser.recordset.length > 0) {
            return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại.' });
        }
        
        const id = 'U' + Date.now();
        await pool.request()
            .input('id', sql.VarChar, id)
            .input('username', sql.VarChar, username)
            .input('password', sql.VarChar, password)
            .input('name', sql.NVarChar, name)
            .input('role', sql.VarChar, 'customer')
            .query('INSERT INTO Users (id, username, password, name, role) VALUES (@id, @username, @password, @name, @role)');
            
        res.status(201).json({ id, username, password, name, role: 'customer' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.request()
            .query(`
                SELECT u.id, u.name, u.username, 
                (SELECT COUNT(*) FROM Loans l WHERE l.customerId = u.id) as loanCount
                FROM Users u WHERE u.role = 'customer'
            `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.request().input('id', sql.VarChar, id).query('DELETE FROM Loans WHERE customerId = @id');
        await pool.request().input('id', sql.VarChar, id).query('DELETE FROM Users WHERE id = @id');
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.delete('/api/loans/cancel/:id', async (req, res) => {
    try {
        const id = req.params.id;
        await pool.request().input('id', sql.VarChar, id).query("DELETE FROM Loans WHERE id = @id AND status = 'pending'");
        res.json({ message: 'Deleted' });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/api/loans', async (req, res) => {
    try {
        const customerId = req.query.customerId;
        let query = `
            SELECT l.id, l.customerId, CAST(l.amount AS FLOAT) as amount, 
                   CAST(l.interestRate AS FLOAT) as interestRate, l.durationMonths, 
                   l.startDate, l.status, CAST(l.amountPaid AS FLOAT) as amountPaid, 
                   l.nextPaymentDate, l.adminNote, u.name as customerName 
            FROM Loans l 
            JOIN Users u ON l.customerId = u.id
        `;
        const request = pool.request();
        if (customerId) {
            query += ' WHERE l.customerId = @customerId';
            request.input('customerId', sql.VarChar, customerId);
        }
        query += ' ORDER BY l.id DESC';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/api/loans', async (req, res) => {
    try {
        const { customerId, amount, interestRate, durationMonths } = req.body;
        const id = 'L' + Date.now();
        await pool.request()
            .input('id', sql.VarChar, id)
            .input('customerId', sql.VarChar, customerId)
            .input('amount', sql.Decimal(18,2), amount)
            .input('interestRate', sql.Decimal(5,2), interestRate)
            .input('durationMonths', sql.Int, durationMonths)
            .input('status', sql.VarChar, 'pending')
            .query(`
                INSERT INTO Loans (id, customerId, amount, interestRate, durationMonths, status, amountPaid) 
                VALUES (@id, @customerId, @amount, @interestRate, @durationMonths, @status, 0)
            `);
        res.status(201).json({ message: 'Created' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

app.put('/api/loans/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { status, amountPaid, nextPaymentDate, adminNote } = req.body;
        
        let queryStr = 'UPDATE Loans SET status = @status';
        let reqSql = pool.request()
            .input('status', sql.VarChar, status)
            .input('id', sql.VarChar, id);
            
        if (amountPaid !== undefined) {
            queryStr += ', amountPaid = @amountPaid';
            reqSql.input('amountPaid', sql.Decimal(18,2), amountPaid);
        }
        if (nextPaymentDate !== undefined) {
             queryStr += ', nextPaymentDate = @nextPaymentDate';
             reqSql.input('nextPaymentDate', sql.DateTime, nextPaymentDate ? new Date(nextPaymentDate) : null);
        }
        if (adminNote !== undefined) {
             queryStr += ', adminNote = @adminNote';
             reqSql.input('adminNote', sql.NVarChar, adminNote);
        }
        if (status === 'active' && req.body.startDate) {
            queryStr += ', startDate = @startDate';
            reqSql.input('startDate', sql.DateTime, new Date(req.body.startDate));
        }
        
        queryStr += ' WHERE id = @id';
        await reqSql.query(queryStr);
        res.json({ message: 'Updated' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Backend Server running at http://localhost:${PORT}`);
});
