IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'QuanLyKhoanVay')
BEGIN
    CREATE DATABASE QuanLyKhoanVay;
END
GO

USE QuanLyKhoanVay;
GO

-- Xoá mảng và bảng cũ nếu đã tồn tại để tránh lỗi
IF OBJECT_ID('Loans', 'U') IS NOT NULL DROP TABLE Loans;
IF OBJECT_ID('Users', 'U') IS NOT NULL DROP TABLE Users;
GO

CREATE TABLE Users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name NVARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL
);

CREATE TABLE Loans (
    id VARCHAR(50) PRIMARY KEY,
    customerId VARCHAR(50) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    interestRate DECIMAL(5,2) NOT NULL,
    durationMonths INT NOT NULL,
    startDate DATETIME,
    status VARCHAR(50) NOT NULL,
    amountPaid DECIMAL(18,2) DEFAULT 0,
    nextPaymentDate DATETIME,
    adminNote NVARCHAR(500),
    FOREIGN KEY (customerId) REFERENCES Users(id)
);
GO

INSERT INTO Users (id, username, password, name, role) VALUES ('U001', 'Admin', '123', N'Quản Trị Viên', 'admin');
INSERT INTO Users (id, username, password, name, role) VALUES ('U002', 'khachhang1', '123', N'Nguyễn Văn A', 'customer');
INSERT INTO Users (id, username, password, name, role) VALUES ('U003', 'khachhang2', '123', N'Trần Thị B', 'customer');

INSERT INTO Loans (id, customerId, amount, interestRate, durationMonths, startDate, status, amountPaid, nextPaymentDate) 
VALUES ('L001', 'U002', 50000000, 12, 12, '2023-01-15', 'active', 25000000, '2023-08-15');

INSERT INTO Loans (id, customerId, amount, interestRate, durationMonths, startDate, status, amountPaid, nextPaymentDate)
VALUES ('L002', 'U003', 100000000, 10, 24, '2023-05-10', 'pending', 0, NULL);
GO
