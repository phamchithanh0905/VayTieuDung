-- Update Schema for Supabase PostgreSQL
DROP TABLE IF EXISTS "Notifications" CASCADE;
DROP TABLE IF EXISTS "SystemSettings" CASCADE;
DROP TABLE IF EXISTS "Loans" CASCADE;
DROP TABLE IF EXISTS "Users" CASCADE;
DROP TABLE IF EXISTS Notifications CASCADE;
DROP TABLE IF EXISTS SystemSettings CASCADE;
DROP TABLE IF EXISTS Loans CASCADE;
DROP TABLE IF EXISTS Users CASCADE;

-- Tạo bảng Users
CREATE TABLE Users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    role VARCHAR(50) NOT NULL,
    phone VARCHAR(20),
    id_card VARCHAR(20),
    address TEXT,
    job TEXT,
    income DECIMAL(18,2) DEFAULT 0
);

-- Tạo bảng Loans (Giữ quotes cho các cột camelCase vì server.js sử dụng quotes)
CREATE TABLE Loans (
    id VARCHAR(50) PRIMARY KEY,
    "customerId" VARCHAR(50) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    "interestRate" DECIMAL(5,2) NOT NULL,
    "durationMonths" INT NOT NULL,
    "startDate" TIMESTAMP,
    status VARCHAR(50) NOT NULL,
    "amountPaid" DECIMAL(18,2) DEFAULT 0,
    "nextPaymentDate" TIMESTAMP,
    "adminNote" TEXT,
    FOREIGN KEY ("customerId") REFERENCES Users(id)
);

-- Tạo bảng Notifications
CREATE TABLE Notifications (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tạo bảng SystemSettings
CREATE TABLE SystemSettings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value_text TEXT,
    value_int INT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Chèn dữ liệu mẫu
INSERT INTO Users (id, username, password, name, role) VALUES ('U001', 'Admin', '123', 'Quản Trị Viên', 'admin');
INSERT INTO Users (id, username, password, name, role) VALUES ('U002', 'khachhang1', '123', 'Nguyễn Văn A', 'customer');
INSERT INTO Users (id, username, password, name, role) VALUES ('U003', 'khachhang2', '123', 'Trần Thị B', 'customer');

INSERT INTO Loans (id, "customerId", amount, "interestRate", "durationMonths", "startDate", status, "amountPaid", "nextPaymentDate") 
VALUES ('L001', 'U002', 50000000, 12, 12, '2023-01-15 00:00:00', 'active', 25000000, '2023-08-15 00:00:00');

INSERT INTO Loans (id, "customerId", amount, "interestRate", "durationMonths", "startDate", status, "amountPaid", "nextPaymentDate")
VALUES ('L002', 'U003', 100000000, 10, 24, '2023-05-10 00:00:00', 'pending', 0, NULL);

INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_5', 5, TRUE);
INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_6', 6, TRUE);
INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_8', 8, TRUE);
INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_10', 10, TRUE);
INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_15', 15, TRUE);
INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_17', 17, TRUE);
INSERT INTO SystemSettings (key, value_int, is_active) VALUES ('rate_20', 20, TRUE);

INSERT INTO Notifications (message) VALUES ('Chào mừng bạn đến với MyFinance v2.0');
INSERT INTO Notifications (message) VALUES ('Bảo mật tài khoản đã được kích hoạt.');
