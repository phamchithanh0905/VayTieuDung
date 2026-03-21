-- Xóa bảng cũ nếu tồn tại
DROP TABLE IF EXISTS Loans;
DROP TABLE IF EXISTS Users;

-- Tạo bảng Users
CREATE TABLE Users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name TEXT NOT NULL,
    role VARCHAR(50) NOT NULL
);

-- Tạo bảng Loans
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

-- Chèn dữ liệu mẫu
INSERT INTO Users (id, username, password, name, role) VALUES ('U001', 'Admin', '123', 'Quản Trị Viên', 'admin');
INSERT INTO Users (id, username, password, name, role) VALUES ('U002', 'khachhang1', '123', 'Nguyễn Văn A', 'customer');
INSERT INTO Users (id, username, password, name, role) VALUES ('U003', 'khachhang2', '123', 'Trần Thị B', 'customer');

INSERT INTO Loans (id, "customerId", amount, "interestRate", "durationMonths", "startDate", status, "amountPaid", "nextPaymentDate") 
VALUES ('L001', 'U002', 50000000, 12, 12, '2023-01-15 00:00:00', 'active', 25000000, '2023-08-15 00:00:00');

INSERT INTO Loans (id, "customerId", amount, "interestRate", "durationMonths", "startDate", status, "amountPaid", "nextPaymentDate")
VALUES ('L002', 'U003', 100000000, 10, 24, '2023-05-10 00:00:00', 'pending', 0, NULL);
