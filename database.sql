-- ============================================================
--  SMART INVENTORY MANAGEMENT FOR RETAIL CHAIN
--  UCS310 – Database Management Systems | Group 2C71
--  THAPAR INSTITUTE OF ENGINEERING AND TECHNOLOGY
-- ============================================================

CREATE DATABASE IF NOT EXISTS Project;
USE Project;

-- ────────────────────────────────────────────────────────────
--  TABLE DEFINITIONS
-- ────────────────────────────────────────────────────────────

CREATE TABLE Category (
    CategoryID   INT          PRIMARY KEY AUTO_INCREMENT,
    CategoryName VARCHAR(100) NOT NULL
);

CREATE TABLE Supplier (
    SupplierID   INT           PRIMARY KEY AUTO_INCREMENT,
    SupplierName VARCHAR(100),
    ContactInfo  VARCHAR(255),
    Rating       DECIMAL(3,2)  DEFAULT 0,
    CONSTRAINT chk_supplier_rating CHECK (Rating BETWEEN 0 AND 5)
);

CREATE TABLE Product (
    ProductID    INT           PRIMARY KEY AUTO_INCREMENT,
    Name         VARCHAR(100),
    CategoryID   INT,
    SupplierID   INT,
    UnitPrice    DECIMAL(10,2),
    ReorderLevel INT,
    FOREIGN KEY (CategoryID) REFERENCES Category(CategoryID),
    FOREIGN KEY (SupplierID) REFERENCES Supplier(SupplierID),
    CONSTRAINT chk_unit_price    CHECK (UnitPrice    >  0),
    CONSTRAINT chk_reorder_level CHECK (ReorderLevel >= 0)
);

CREATE TABLE Branch (
    BranchID   INT          PRIMARY KEY AUTO_INCREMENT,
    BranchName VARCHAR(100),
    Location   VARCHAR(100)
);

CREATE TABLE Inventory (
    BranchID   INT,
    ProductID  INT,
    Quantity   INT  DEFAULT 0,
    ExpiryDate DATE,
    PRIMARY KEY (BranchID, ProductID),
    FOREIGN KEY (BranchID)  REFERENCES Branch(BranchID),
    FOREIGN KEY (ProductID) REFERENCES Product(ProductID),
    CONSTRAINT chk_quantity CHECK (Quantity >= 0)
);

CREATE TABLE Sale (
    SaleID      INT           PRIMARY KEY AUTO_INCREMENT,
    BranchID    INT,
    SaleDate    DATETIME      DEFAULT CURRENT_TIMESTAMP,
    TotalAmount DECIMAL(10,2),
    FOREIGN KEY (BranchID) REFERENCES Branch(BranchID)
);

CREATE TABLE Sale_Item (
    SaleID    INT,
    ProductID INT,
    Quantity  INT,
    UnitPrice DECIMAL(10,2),
    PRIMARY KEY (SaleID, ProductID),
    FOREIGN KEY (SaleID)    REFERENCES Sale(SaleID),
    FOREIGN KEY (ProductID) REFERENCES Product(ProductID),
    CONSTRAINT chk_sale_quantity CHECK (Quantity > 0)
);

CREATE TABLE Purchase_Order (
    OrderID    INT          PRIMARY KEY AUTO_INCREMENT,
    SupplierID INT,
    OrderDate  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    Status     VARCHAR(50),
    FOREIGN KEY (SupplierID) REFERENCES Supplier(SupplierID)
);

CREATE TABLE Order_Item (
    OrderID   INT,
    ProductID INT,
    Quantity  INT,
    UnitPrice DECIMAL(10,2),
    PRIMARY KEY (OrderID, ProductID),
    FOREIGN KEY (OrderID)   REFERENCES Purchase_Order(OrderID),
    FOREIGN KEY (ProductID) REFERENCES Product(ProductID),
    CONSTRAINT chk_order_quantity CHECK (Quantity > 0)
);

CREATE TABLE Inventory_Log (
    LogID       INT         PRIMARY KEY AUTO_INCREMENT,
    BranchID    INT,
    ProductID   INT,
    OldQuantity INT,
    NewQuantity INT,
    ChangeDate  DATETIME    DEFAULT CURRENT_TIMESTAMP,
    ActionType  VARCHAR(50)
);

-- ────────────────────────────────────────────────────────────
--  INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_product_name   ON Product(Name);
CREATE INDEX idx_inventory_expiry ON Inventory(ExpiryDate);
CREATE INDEX idx_sale_date      ON Sale(SaleDate);
CREATE INDEX idx_supplier_rating ON Supplier(Rating);

-- ────────────────────────────────────────────────────────────
--  STORED PROCEDURE: ProcessSale
--  Validates stock → creates Sale + Sale_Item → updates Inventory
--  Wrapped in a transaction (ACID compliant)
-- ────────────────────────────────────────────────────────────

DELIMITER $$

CREATE PROCEDURE ProcessSale(
    IN p_branch   INT,
    IN p_product  INT,
    IN p_quantity INT
)
BEGIN
    DECLARE current_stock  INT;
    DECLARE product_price  DECIMAL(10,2);
    DECLARE new_sale_id    INT;

    START TRANSACTION;

    SELECT Quantity INTO current_stock
    FROM   Inventory
    WHERE  BranchID = p_branch AND ProductID = p_product;

    IF current_stock < p_quantity THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient Stock';
    ELSE
        SELECT UnitPrice INTO product_price
        FROM   Product
        WHERE  ProductID = p_product;

        INSERT INTO Sale (BranchID, TotalAmount)
        VALUES (p_branch, product_price * p_quantity);

        SET new_sale_id = LAST_INSERT_ID();

        INSERT INTO Sale_Item (SaleID, ProductID, Quantity, UnitPrice)
        VALUES (new_sale_id, p_product, p_quantity, product_price);

        UPDATE Inventory
        SET    Quantity = Quantity - p_quantity
        WHERE  BranchID = p_branch AND ProductID = p_product;

        COMMIT;
    END IF;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  STORED PROCEDURE: TransferStock
--  Moves stock between branches atomically
-- ────────────────────────────────────────────────────────────

DELIMITER $$

CREATE PROCEDURE TransferStock(
    IN p_from_branch INT,
    IN p_to_branch   INT,
    IN p_product     INT,
    IN p_quantity    INT
)
BEGIN
    DECLARE available_stock INT;

    START TRANSACTION;

    SELECT Quantity INTO available_stock
    FROM   Inventory
    WHERE  BranchID = p_from_branch AND ProductID = p_product;

    IF available_stock < p_quantity THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Not enough stock in source branch';
    ELSE
        UPDATE Inventory
        SET    Quantity = Quantity - p_quantity
        WHERE  BranchID = p_from_branch AND ProductID = p_product;

        UPDATE Inventory
        SET    Quantity = Quantity + p_quantity
        WHERE  BranchID = p_to_branch AND ProductID = p_product;

        COMMIT;
    END IF;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  FUNCTION: GetSupplierStatus
--  Returns Excellent / Good / Average based on rating
-- ────────────────────────────────────────────────────────────

DELIMITER $$

CREATE FUNCTION GetSupplierStatus(p_rating DECIMAL(3,2))
RETURNS VARCHAR(20)
DETERMINISTIC
BEGIN
    DECLARE result VARCHAR(20);

    IF    p_rating >= 4.5 THEN SET result = 'Excellent';
    ELSEIF p_rating >= 3.5 THEN SET result = 'Good';
    ELSE                        SET result = 'Average';
    END IF;

    RETURN result;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  TRIGGER: AutoReorder
--  After inventory update, if qty < reorder level → create PO
-- ────────────────────────────────────────────────────────────

DELIMITER $$

CREATE TRIGGER AutoReorder
AFTER UPDATE ON Inventory
FOR EACH ROW
BEGIN
    DECLARE reorder_level INT;
    DECLARE supplier_id   INT;
    DECLARE product_price DECIMAL(10,2);
    DECLARE new_order_id  INT;

    SELECT ReorderLevel, SupplierID, UnitPrice
    INTO   reorder_level, supplier_id, product_price
    FROM   Product
    WHERE  ProductID = NEW.ProductID;

    IF NEW.Quantity < reorder_level THEN
        INSERT INTO Purchase_Order (SupplierID, Status)
        VALUES (supplier_id, 'Pending');

        SET new_order_id = LAST_INSERT_ID();

        INSERT INTO Order_Item (OrderID, ProductID, Quantity, UnitPrice)
        VALUES (new_order_id, NEW.ProductID, reorder_level * 2, product_price);
    END IF;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  TRIGGER: LogInventoryChanges
--  Audit trail – records every stock change
-- ────────────────────────────────────────────────────────────

DELIMITER $$

CREATE TRIGGER LogInventoryChanges
AFTER UPDATE ON Inventory
FOR EACH ROW
BEGIN
    IF OLD.Quantity <> NEW.Quantity THEN
        INSERT INTO Inventory_Log
            (BranchID, ProductID, OldQuantity, NewQuantity, ActionType)
        VALUES
            (OLD.BranchID, OLD.ProductID, OLD.Quantity, NEW.Quantity, 'Inventory Updated');
    END IF;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  TRIGGER: CheckStockBeforeSale
--  Validation before Sale_Item insert
-- ────────────────────────────────────────────────────────────

DELIMITER $$

CREATE TRIGGER CheckStockBeforeSale
BEFORE INSERT ON Sale_Item
FOR EACH ROW
BEGIN
    DECLARE available_stock INT;
    DECLARE branch_of_sale  INT;

    SELECT BranchID INTO branch_of_sale
    FROM   Sale WHERE SaleID = NEW.SaleID;

    SELECT Quantity INTO available_stock
    FROM   Inventory
    WHERE  BranchID = branch_of_sale AND ProductID = NEW.ProductID;

    IF available_stock < NEW.Quantity THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'Insufficient stock for this sale';
    END IF;
END $$

DELIMITER ;

-- ────────────────────────────────────────────────────────────
--  VIEWS
-- ────────────────────────────────────────────────────────────

CREATE VIEW LowStockProducts AS
SELECT
    b.BranchName,
    p.Name         AS ProductName,
    i.Quantity,
    p.ReorderLevel,
    (p.ReorderLevel - i.Quantity) AS ShortBy
FROM  Inventory i
JOIN  Branch b  ON i.BranchID  = b.BranchID
JOIN  Product p ON i.ProductID = p.ProductID
WHERE i.Quantity < p.ReorderLevel;


CREATE VIEW ExpiringProducts AS
SELECT
    b.BranchName,
    p.Name     AS ProductName,
    i.Quantity,
    i.ExpiryDate,
    DATEDIFF(i.ExpiryDate, CURDATE()) AS DaysLeft
FROM  Inventory i
JOIN  Branch b  ON i.BranchID  = b.BranchID
JOIN  Product p ON i.ProductID = p.ProductID
WHERE i.ExpiryDate IS NOT NULL
  AND i.ExpiryDate <= CURDATE() + INTERVAL 7 DAY;

-- ────────────────────────────────────────────────────────────
--  SAMPLE DATA
-- ────────────────────────────────────────────────────────────

INSERT INTO Category (CategoryName) VALUES
    ('Beverages'), ('Snacks'), ('Dairy'), ('Personal Care');

INSERT INTO Supplier (SupplierName, ContactInfo, Rating) VALUES
    ('Nestle Supplies',      'nestle@email.com', 4.5),
    ('Amul Distributor',     'amul@email.com',   4.2),
    ('Hindustan Unilever',   'hul@email.com',    4.7),
    ('Pepsi Supplier',       'pepsi@email.com',  4.1);

INSERT INTO Branch (BranchName, Location) VALUES
    ('Patiala Branch',    'Patiala'),
    ('Chandigarh Branch', 'Chandigarh'),
    ('Delhi Branch',      'Delhi');

INSERT INTO Product (Name, CategoryID, SupplierID, UnitPrice, ReorderLevel) VALUES
    ('Pepsi 500ml',    1, 4,  40.00, 20),
    ('Lays Chips',     2, 1,  20.00, 30),
    ('Amul Milk 1L',   3, 2,  60.00, 15),
    ('Shampoo Bottle', 4, 3, 150.00, 10);

INSERT INTO Inventory (BranchID, ProductID, Quantity, ExpiryDate) VALUES
    (1, 1, 50, DATE_ADD(CURDATE(), INTERVAL 18  DAY)),
    (1, 2, 80, DATE_ADD(CURDATE(), INTERVAL 101 DAY)),
    (1, 3, 25, DATE_ADD(CURDATE(), INTERVAL 6   DAY)),
    (1, 4, 15, NULL),
    (2, 1, 30, DATE_ADD(CURDATE(), INTERVAL 20  DAY)),
    (2, 2, 60, DATE_ADD(CURDATE(), INTERVAL 101 DAY)),
    (2, 3, 10, DATE_ADD(CURDATE(), INTERVAL 4   DAY)),
    (2, 4, 12, NULL),
    (3, 1, 20, DATE_ADD(CURDATE(), INTERVAL 20  DAY)),
    (3, 2, 45, DATE_ADD(CURDATE(), INTERVAL 101 DAY)),
    (3, 3,  8, DATE_ADD(CURDATE(), INTERVAL 2   DAY)),
    (3, 4, 18, NULL);

-- ────────────────────────────────────────────────────────────
--  SAMPLE QUERIES (for testing / demonstration)
-- ────────────────────────────────────────────────────────────

-- Process a sale
CALL ProcessSale(1, 1, 5);

-- Transfer stock between branches
CALL TransferStock(1, 2, 2, 10);

-- Supplier status using function
SELECT SupplierName, Rating, GetSupplierStatus(Rating) AS Status
FROM   Supplier;

-- Top selling products
SELECT p.Name AS ProductName, SUM(si.Quantity) AS TotalUnitsSold
FROM   Sale_Item si
JOIN   Product p ON si.ProductID = p.ProductID
GROUP  BY p.Name
ORDER  BY TotalUnitsSold DESC;

-- Branch-wise revenue
SELECT b.BranchName, SUM(s.TotalAmount) AS TotalRevenue
FROM   Sale s
JOIN   Branch b ON s.BranchID = b.BranchID
GROUP  BY b.BranchName;

-- Low stock report
SELECT * FROM LowStockProducts;

-- Expiry report
SELECT * FROM ExpiringProducts;

-- Audit log
SELECT * FROM Inventory_Log;

-- Monthly sales trend
SELECT
    MONTH(SaleDate) AS MonthNumber,
    YEAR(SaleDate)  AS YearNumber,
    SUM(TotalAmount) AS MonthlyRevenue
FROM  Sale
GROUP BY YEAR(SaleDate), MONTH(SaleDate)
ORDER BY YearNumber, MonthNumber;
