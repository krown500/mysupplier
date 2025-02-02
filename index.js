const express = require("express");
const xlsx = require("xlsx");
const session = require("express-session");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pool = require("./db.config");

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration for image and Excel uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Use uploadDir instead of 'uploads/'
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === "image") {
    // For image uploads
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("فقط ملفات الصور مسموح بها"), false);
    }
  } else if (file.fieldname === "excelFile") {
    // For Excel uploads
    if (
      file.mimetype === "application/vnd.ms-excel" ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      cb(null, true);
    } else {
      cb(new Error("فقط ملفات Excel مسموح بها"), false);
    }
  } else {
    cb(new Error("نوع الملف غير مدعوم"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

const app = express();
const port = 3000;

// Middleware setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(
  session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(bodyParser.urlencoded({ extended: true }));

// Database helper functions
const dbHelpers = {
  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      pool.query(sql, params, (error, results) => {
        if (error) reject(error);
        resolve(results);
      });
    });
  },

  async getAll(table) {
    return this.query(`SELECT * FROM ${table}`);
  },

  async getById(table, id) {
    const results = await this.query(`SELECT * FROM ${table} WHERE id = ?`, [
      id,
    ]);
    return results[0];
  },

  async create(table, data) {
    const fields = Object.keys(data).join(", ");
    const placeholders = Array(Object.keys(data).length).fill("?").join(", ");
    const values = Object.values(data);

    const results = await this.query(
      `INSERT INTO ${table} (${fields}) VALUES (${placeholders})`,
      values
    );
    return results.insertId;
  },

  async update(table, id, data) {
    const fields = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = [...Object.values(data), id];

    return this.query(`UPDATE ${table} SET ${fields} WHERE id = ?`, values);
  },

  async delete(table, id) {
    return this.query(`DELETE FROM ${table} WHERE id = ?`, [id]);
  },
};

// Middleware
function isAuthenticated(req, res, next) {
  if (req.session.isAuthenticated) return next();
  res.redirect("/login");
}

function isAdmin(req, res, next) {
  if (req.session.user?.type === "admin") return next();
  res.status(403).send("Forbidden");
}

function isSupplier(req, res, next) {
  if (req.session.user?.type === "supplier") return next();
  res.status(403).send("Forbidden");
}

function handleDatabaseError(error, res) {
  console.error("Database error:", error);
  res.status(500).send(`Database error: ${error.message}`);
}

app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Import items from Excel
app.post(
  "/import-items",
  isAuthenticated,
  upload.single("excelFile"),
  async (req, res) => {
    try {
      if (!req.file) {
        throw new Error("لم يتم اختيار ملف");
      }

      console.log("Uploaded file:", req.file);
      const filePath = req.file.path;
      console.log("File path:", filePath);

      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const items = xlsx.utils.sheet_to_json(worksheet);

      // Log the first item to see all columns
      if (items.length > 0) {
        console.log("First item columns:", Object.keys(items[0]));
        console.log("First item values:", items[0]);
      }

      console.log("Parsed items:", items.length);

      for (const item of items) {
        try {
          console.log("\n--- Processing new item ---");
          console.log("Raw item data:", {
            name: item["اسم الصنف"],
            company: item["الشركة"],
            supplier: item["المورد"],
            client: item["العميل"],
            group: item["المجموعة"],
            barcode: item["باركود"],
          });

          // Find or get IDs based on names
          let companyId = null;
          let supplierId = null;
          let clientId = null;
          let groupId = null;

          // Find company by name
          if (item["الشركة"]) {
            const company = await dbHelpers.query(
              "SELECT id FROM companies WHERE TRIM(name) = TRIM(?)",
              [item["الشركة"]]
            );
            if (company && company[0]) {
              companyId = company[0].id;
              console.log("Found company:", item["الشركة"], "ID:", companyId);
            } else {
              console.log("Company not found:", item["الشركة"]);
            }
          }

          // Find supplier by name
          if (item["المورد"]) {
            const supplier = await dbHelpers.query(
              "SELECT id FROM suppliers WHERE TRIM(name) = TRIM(?)",
              [item["المورد"]]
            );
            if (supplier && supplier[0]) {
              supplierId = supplier[0].id;
              console.log("Found supplier:", item["المورد"], "ID:", supplierId);
            } else {
              console.log("Supplier not found:", item["المورد"]);
            }
          }

          // Find client by name and company
          if (item["العميل"]) {
            console.log("Looking for client with name:", item["العميل"], "and company:", companyId);
            const client = await dbHelpers.query(
              "SELECT id FROM clients WHERE TRIM(name) = TRIM(?) AND companyId = ?",
              [item["العميل"], companyId]
            );
            if (client && client[0]) {
              clientId = client[0].id;
              console.log("Found client:", item["العميل"], "ID:", clientId, "for company:", companyId);

              // Get group for this client
              if (item["المجموعة"]) {
                const groupName = item["المجموعة"].trim();
                console.log(
                  "Looking for group:",
                  groupName,
                  "for client:",
                  clientId
                );

                let group = await dbHelpers.query(
                  "SELECT id FROM groups WHERE TRIM(name) = TRIM(?) AND clientId = ?",
                  [groupName, clientId]
                );

                if (group && group[0]) {
                  groupId = group[0].id;
                  console.log(
                    "Found existing group:",
                    groupName,
                    "ID:",
                    groupId
                  );
                } else {
                  console.log(
                    "Creating new group:",
                    groupName,
                    "for client:",
                    clientId
                  );
                  const result = await dbHelpers.query(
                    "INSERT INTO groups (name, clientId) VALUES (?, ?)",
                    [groupName, clientId]
                  );
                  groupId = result.insertId;
                  console.log("Created new group:", groupName, "ID:", groupId);
                }
              }
            } else {
              console.log("Client not found:", item["العميل"]);
              console.log("Will try to find all clients to debug:");
              const allClients = await dbHelpers.query(
                "SELECT id, name FROM clients"
              );
              console.log("Available clients:", allClients);
            }
          }

          // After finding all IDs, check if item exists by barcode
          let existingItem = null;
          if (item["باركود"]) {
            const result = await dbHelpers.query(
              "SELECT id, clientId, groupId FROM items WHERE barcode = ?",
              [item["باركود"]]
            );
            if (result && result[0]) {
              existingItem = result[0];
              console.log("Found existing item:", {
                barcode: item["باركود"],
                id: existingItem.id,
                currentClientId: existingItem.clientId,
                currentGroupId: existingItem.groupId,
                newClientId: clientId,
                newGroupId: groupId,
              });
            }
          }

          const itemData = [
            item["اسم الصنف"] || null,
            item["الصنف (En)"] || null,
            item["باركود"] || null,
            item["رقم الصنف"] || null,
            item["سعر الكرتون"] || null,
            item["سعر الحبة"] || null,
            item["الشد"] || null,
            item["الكمية"] || null,
            item["المنشأ"] || null,
            item["ملاحظات"] || null,
            companyId,
            supplierId,
            clientId,
            groupId,
          ];

          console.log("Item data to insert/update:", {
            name: item["اسم الصنف"],
            companyId,
            supplierId,
            clientId,
            groupId,
            barcode: item["باركود"],
          });

          if (existingItem) {
            // Update existing item
            const updateResult = await dbHelpers.query(
              `UPDATE items SET 
              name = ?,
              nameEn = ?,
              barcode = ?,
              itemNumber = ?,
              cartonPrice = ?,
              unitPrice = ?,
              bundleSize = ?,
              quantity = ?,
              origin = ?,
              notes = ?,
              companyId = ?,
              supplierId = ?,
              clientId = ?,
              groupId = ?
            WHERE id = ?`,
              [...itemData, existingItem.id]
            );
            console.log("Update result:", updateResult);
          } else {
            // Create new item
            const insertResult = await dbHelpers.query(
              `INSERT INTO items (
              name, nameEn, barcode, itemNumber, cartonPrice, unitPrice,
              bundleSize, quantity, origin, notes, companyId, supplierId,
              clientId, groupId
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                item["اسم الصنف"] || null,
                item["الصنف (En)"] || null,
                item["باركود"] || null,
                item["رقم الصنف"] || null,
                item["سعر الكرتون"] || null,
                item["سعر الحبة"] || null,
                item["الشد"] || null,
                item["الكمية"] || null,
                item["المنشأ"] || null,
                item["ملاحظات"] || null,
                companyId,
                supplierId,
                clientId,
                groupId,
              ]
            );
            console.log("Insert result:", insertResult);
          }

          console.log("Operation completed with IDs:", {
            companyId,
            supplierId,
            clientId,
            groupId,
            barcode: item["باركود"],
            operation: existingItem ? "update" : "insert",
          });
        } catch (error) {
          console.error("Error processing item:", item, error);
          throw new Error(
            `خطأ في معالجة الصنف "${item["اسم الصنف"]}": ${error.message}`
          );
        }
      }

      // Delete the uploaded file after processing
      fs.unlinkSync(filePath);

      res.redirect("/items?success=تم استيراد الأصناف بنجاح");
    } catch (error) {
      console.error("Error importing items:", error);
      res.redirect("/items?error=" + encodeURIComponent(error.message));
    }
  }
);

// Route to handle Excel export
app.get("/export-items", isAuthenticated, async (req, res) => {
  try {
    const { search, companyId, clientId, supplierId, status } = req.query;
    const groupIds = Array.isArray(req.query.groupIds) ? req.query.groupIds : req.query.groupIds ? [req.query.groupIds] : [];

    console.log('Export Query Parameters:', {
      search,
      companyId,
      clientId,
      supplierId,
      status,
      groupIds
    });

    // Build base query
    let itemsQuery = `
      SELECT 
        items.id as 'معرف',
        items.name as 'اسم الصنف',
        items.nameEn as 'الصنف (En)',
        items.barcode as 'باركود',
        items.itemNumber as 'رقم الصنف',
        items.cartonPrice as 'سعر الكرتون',
        items.unitPrice as 'سعر الحبة',
        items.bundleSize as 'الشد',
        items.quantity as 'الكمية',
        items.origin as 'المنشأ',
        items.notes as 'ملاحظات',
        items.image as 'الصورة',
        companies.name as 'الشركة',
        suppliers.name as 'المورد',
        clients.name as 'العميل',
        groups.name as 'المجموعة',
        CASE WHEN items.itemNumber IS NOT NULL AND items.itemNumber != 0 THEN 'نشط' ELSE 'غير نشط' END as 'الحالة'
      FROM items
      LEFT JOIN companies ON items.companyId = companies.id
      LEFT JOIN suppliers ON items.supplierId = suppliers.id
      LEFT JOIN clients ON items.clientId = clients.id
      LEFT JOIN groups ON items.groupId = groups.id
      WHERE 1=1
    `;

    const queryParams = [];

    if (search) {
      itemsQuery += ` AND (items.name LIKE ? OR items.barcode LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (companyId) {
      itemsQuery += ` AND items.companyId = ?`;
      queryParams.push(companyId);
    }

    if (clientId) {
      itemsQuery += ` AND items.clientId = ?`;
      queryParams.push(clientId);
    }

    if (groupIds.length > 0) {
      itemsQuery += ` AND items.groupId IN (${groupIds.map(() => '?').join(',')})`;
      queryParams.push(...groupIds);
    }

    if (supplierId) {
      itemsQuery += ` AND items.supplierId = ?`;
      queryParams.push(supplierId);
    }

    if (status === 'active') {
      itemsQuery += ` AND items.itemNumber IS NOT NULL AND items.itemNumber != 0`;
    } else if (status === 'inactive') {
      itemsQuery += ` AND (items.itemNumber IS NULL OR items.itemNumber = 0)`;
    }

    console.log('Final SQL Query:', itemsQuery);
    console.log('Query Parameters:', queryParams);

    const items = await dbHelpers.query(itemsQuery, queryParams);
    
    console.log('Number of items found:', items.length);
    if (items.length > 0) {
      console.log('Sample first item:', items[0]);
    }

    // Create a new workbook
    const wb = xlsx.utils.book_new();

    // Add headers in Arabic
    const headers = {
      'معرف': 'معرف',
      'اسم الصنف': 'اسم الصنف',
      'الصنف (En)': 'الصنف (En)',
      'باركود': 'باركود',
      'رقم الصنف': 'رقم الصنف',
      'سعر الكرتون': 'سعر الكرتون',
      'سعر الحبة': 'سعر الحبة',
      'الشد': 'الشد',
      'الكمية': 'الكمية',
      'المنشأ': 'المنشأ',
      'ملاحظات': 'ملاحظات',
      'الشركة': 'الشركة',
      'المورد': 'المورد',
      'العميل': 'العميل',
      'المجموعة': 'المجموعة',
      'الحالة': 'الحالة'
    };

    // Transform data to include headers
    const excelData = items.map(item => {
      const transformedItem = {};
      for (const [key, value] of Object.entries(headers)) {
        transformedItem[value] = item[key] || '';
      }
      return transformedItem;
    });

    const ws = xlsx.utils.json_to_sheet(excelData, { 
      origin: 'A1',
      skipHeader: false
    });

    // Add the worksheet to the workbook
    xlsx.utils.book_append_sheet(wb, ws, 'Items');

    // Generate Excel file
    const excelBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=items.xlsx');

    // Send the file
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting items:', error);
    res.redirect('/items?error=' + encodeURIComponent('حدث خطأ أثناء تصدير الأصناف'));
  }
});

// Export supplier items
app.get(
  "/export-supplier-items",
  isAuthenticated,
  isSupplier,
  async (req, res) => {
    try {
      const supplierId = req.session.user.id;
      const { search, companyId, status } = req.query;
      const clientIds = req.query.clientIds ? (Array.isArray(req.query.clientIds) ? req.query.clientIds : [req.query.clientIds]) : [];
      const groupIds = req.query.groupIds ? (Array.isArray(req.query.groupIds) ? req.query.groupIds : [req.query.groupIds]) : [];

      // Build base query
      let itemsQuery = `
        SELECT 
          i.id as 'معرف',
          i.name as 'اسم الصنف',
          i.nameEn as 'الصنف (En)',
          i.barcode as 'باركود',
          i.itemNumber as 'رقم الصنف',
          i.cartonPrice as 'سعر الكرتون',
          i.unitPrice as 'سعر الحبة',
          i.bundleSize as 'الشد',
          i.quantity as 'الكمية',
          i.origin as 'المنشأ',
          i.notes as 'ملاحظات',
          i.image as 'الصورة',
          c.name as 'الشركة',
          s.name as 'المورد',
          cl.name as 'العميل',
          g.name as 'المجموعة',
          CASE WHEN i.itemNumber IS NOT NULL AND i.itemNumber != 0 THEN 'نشط' ELSE 'غير نشط' END as 'الحالة'
        FROM items i
        LEFT JOIN companies c ON i.companyId = c.id
        LEFT JOIN suppliers s ON i.supplierId = s.id
        LEFT JOIN clients cl ON i.clientId = cl.id
        LEFT JOIN groups g ON i.groupId = g.id
        WHERE i.supplierId = ?
      `;

      const queryParams = [supplierId];

      // Add filters
      if (search) {
        itemsQuery += " AND (i.name LIKE ? OR i.nameEn LIKE ? OR i.barcode LIKE ?)";
        queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (companyId) {
        itemsQuery += " AND i.companyId = ?";
        queryParams.push(companyId);
      }
      if (clientIds.length > 0) {
        itemsQuery += ` AND i.clientId IN (${clientIds.map(() => "?").join(",")})`;
        queryParams.push(...clientIds);
      }
      if (groupIds.length > 0) {
        itemsQuery += ` AND i.groupId IN (${groupIds.map(() => "?").join(",")})`;
        queryParams.push(...groupIds);
      }
      if (status) {
        itemsQuery += " AND (CASE WHEN i.itemNumber IS NOT NULL AND i.itemNumber != 0 THEN 'active' ELSE 'inactive' END) = ?";
        queryParams.push(status);
      }

      console.log('Export Query:', itemsQuery);
      console.log('Export Params:', queryParams);

      // Get filtered items
      const items = await dbHelpers.query(itemsQuery, queryParams);

      // Transform data for Excel
      const excelData = items.map((item) => ({
        معرف: item["معرف"] || "",
        "اسم الصنف": item["اسم الصنف"] || "",
        "الصنف (En)": item["الصنف (En)"] || "",
        باركود: item["باركود"] || "",
        "رقم الصنف": item["رقم الصنف"] || "",
        "سعر الكرتون": item["سعر الكرتون"] || "",
        "سعر الحبة": item["سعر الحبة"] || "",
        الشد: item["الشد"] || "",
        الكمية: item["الكمية"] || "",
        المنشأ: item["المنشأ"] || "",
        ملاحظات: item["ملاحظات"] || "",
        الصورة: item["الصورة"] || "",
        الشركة: item["الشركة"] || "",
        المورد: item["المورد"] || "",
        العميل: item["العميل"] || "",
        المجموعة: item["المجموعة"] || "",
        الحالة: item["الحالة"] || "",
      }));

      // Create workbook and worksheet
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(excelData, { dateNF: "yyyy-mm-dd" });

      // Add worksheet to workbook
      xlsx.utils.book_append_sheet(wb, ws, "Items");

      // Generate Excel file
      const excelBuffer = xlsx.write(wb, { bookType: "xlsx", type: "buffer" });

      // Set response headers
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader("Content-Disposition", "attachment; filename=supplier-items.xlsx");

      // Send the file
      res.send(excelBuffer);
    } catch (error) {
      console.error("Error exporting supplier items:", error);
      res.status(500).send("Error exporting items");
    }
  }
);

// Companies Routes
app.get("/companies", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const companies = await dbHelpers.query(`
      SELECT 
        c.*,
        (
          SELECT COUNT(DISTINCT i.id) 
          FROM items i 
          WHERE i.companyId = c.id
        ) as itemCount,
        GROUP_CONCAT(DISTINCT cl.name) as clientNames,
        GROUP_CONCAT(DISTINCT g.name) as groupNames
      FROM companies c
      LEFT JOIN clients cl ON cl.companyId = c.id
      LEFT JOIN groups g ON g.clientId = cl.id
      GROUP BY c.id
      ORDER BY c.name
    `);

    console.log("Companies with item counts:", companies); // للتأكد من النتائج

    res.render("companies", {
      companies,
      user: req.session.user,
      flashMessage: req.session.flashMessage,
    });
    req.session.flashMessage = null;
  } catch (error) {
    console.error("Error fetching companies:", error);
    handleDatabaseError(error, res);
  }
});

app.get("/create-company", isAuthenticated, isAdmin, (req, res) => {
  res.render("create-company");
});

app.post(
  "/create-company",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.image = `/uploads/${req.file.filename}`;
      }
      await dbHelpers.create("companies", data);
      res.redirect("/companies");
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);

app.get("/edit-company/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const company = await dbHelpers.getById("companies", req.params.id);
    if (!company) return res.status(404).send("Company not found");
    res.render("edit-company", { company });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post(
  "/edit-company/:id",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      // Create a copy of the request body and remove deleteImage
      const { deleteImage, ...data } = req.body;
      
      const company = await dbHelpers.getById("companies", req.params.id);
      
      if (deleteImage === 'on') {
        // If delete image is checked, remove the image
        data.image = null;
        // Delete the actual file if it exists
        if (company.image) {
          const imagePath = path.join(__dirname, 'public', company.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      } else if (req.file) {
        // If new image uploaded
        data.image = `/uploads/${req.file.filename}`;
        // Delete old image if exists
        if (company.image) {
          const oldImagePath = path.join(__dirname, 'public', company.image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }
      
      await dbHelpers.update("companies", req.params.id, data);
      res.redirect("/companies");
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);

app.post("/delete-company/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await dbHelpers.delete("companies", req.params.id);
    res.redirect("/companies");
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// Clients Routes
app.post(
  "/clients",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, companyId } = req.body;
      const image = req.file ? req.file.filename : null;

      // Create client
      const clientId = await dbHelpers.create("clients", {
        name,
        companyId: companyId || null,
        image,
      });

      res.redirect("/clients");
    } catch (error) {
      console.error("Error creating client:", error);
      res.status(500).send("Error creating client");
    }
  }
);

app.get("/clients", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const clients = await dbHelpers.query(`
      SELECT 
        c.*,
        comp.name as companyName,
        COUNT(DISTINCT i.id) as itemCount,
        GROUP_CONCAT(DISTINCT g.name) as groupNames
      FROM clients c
      LEFT JOIN companies comp ON c.companyId = comp.id
      LEFT JOIN items i ON i.clientId = c.id
      LEFT JOIN groups g ON g.clientId = c.id
      GROUP BY c.id
    `);

    const companies = await dbHelpers.getAll("companies");

    res.render("clients", {
      clients,
      companies,
      user: req.user,
    });
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).send("Error fetching clients");
  }
});

app.get("/create-client", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const companies = await dbHelpers.getAll("companies");
    res.render("create-client", { companies });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post(
  "/create-client",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.image = `/uploads/${req.file.filename}`;
      }
      // إذا كان companyId فارغاً، نجعله null
      if (data.companyId === "") {
        data.companyId = null;
      }
      await dbHelpers.create("clients", data);
      res.redirect("/clients");
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);

app.get("/edit-client/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const client = await dbHelpers.getById("clients", req.params.id);
    const companies = await dbHelpers.getAll("companies");
    if (!client) return res.status(404).send("Client not found");
    res.render("edit-client", { client, companies });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post(
  "/edit-client/:id",
  isAuthenticated,
  upload.single("image"),
  async (req, res) => {
    try {
      const clientId = req.params.id;
      const { name, companyId, deleteImage } = req.body;

      // تحديث بيانات العميل
      const updateData = {
        name,
        companyId: companyId || null,
      };

      // إذا تم تحميل صورة جديدة
      if (req.file) {
        updateData.image = "/uploads/" + req.file.filename;
      }

      // إذا تم تحديد حذف الصورة
      if (deleteImage === 'on') {
        updateData.image = null;
        // Delete the actual file if it exists
        const client = await dbHelpers.getById("clients", clientId);
        if (client.image) {
          const imagePath = path.join(__dirname, 'public', client.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      }

      await dbHelpers.query("UPDATE clients SET ? WHERE id = ?", [
        updateData,
        clientId,
      ]);

      res.redirect("/clients");
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);

app.delete("/clients/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const clientId = req.params.id;

    // Delete client
    await dbHelpers.query("DELETE FROM clients WHERE id = ?", [clientId]);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ error: "Error deleting client" });
  }
});

app.put(
  "/clients/:id",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const clientId = req.params.id;
      const { name, companyId } = req.body;
      const image = req.file ? req.file.filename : undefined;

      // Update client
      const updateData = {
        name,
        companyId: companyId || null,
        ...(image && { image }),
      };

      await dbHelpers.update("clients", clientId, updateData);

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Error updating client" });
    }
  }
);

app.get("/client/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const clientId = req.params.id;

    // Get client details with company name
    const [client] = await dbHelpers.query(
      `
      SELECT c.*, comp.name as companyName
      FROM clients c
      LEFT JOIN companies comp ON c.companyId = comp.id
      WHERE c.id = ?
    `,
      [clientId]
    );

    if (!client) {
      return res.status(404).send("Client not found");
    }

    // Get items for this client
    const items = await dbHelpers.query(
      `
      SELECT i.*, 
             c.name as companyName,
             s.name as supplierName,
             g.name as groupName
      FROM items i
      LEFT JOIN companies c ON i.companyId = c.id
      LEFT JOIN suppliers s ON i.supplierId = s.id
      LEFT JOIN groups g ON i.groupId = g.id
      WHERE i.clientId = ?
    `,
      [clientId]
    );

    // Get all companies for the dropdown
    const companies = await dbHelpers.getAll("companies");

    res.render("client-details", {
      client,
      items,
      companies,
      user: req.user,
    });
  } catch (error) {
    console.error("Error fetching client details:", error);
    res.status(500).send("Error fetching client details");
  }
});

// Groups Routes
app.get("/groups", isAuthenticated, async (req, res) => {
  try {
    // Get groups with item counts
    const groups = await dbHelpers.query(
      `SELECT g.*, c.name as clientName, comp.name as companyName,
        COALESCE((
          SELECT COUNT(1) 
          FROM items 
          WHERE items.groupId = g.id
        ), 0) as itemCount
       FROM groups g
       LEFT JOIN clients c ON g.clientId = c.id
       LEFT JOIN companies comp ON c.companyId = comp.id
       ORDER BY g.name`,
      []
    );

    // Get all clients for reference
    const clients = await dbHelpers.query(
      `SELECT * FROM clients ORDER BY name`
    );

    res.render("groups", {
      groups,
      user: req.user,
      clients,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("حدث خطأ في عرض المجموعات");
  }
});

app.post(
  "/groups",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, description } = req.body;
      const image = req.file ? req.file.filename : null;

      // Create group
      await dbHelpers.create("groups", {
        name,
        description: description || null,
        image,
      });

      res.redirect("/groups");
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).send("Error creating group");
    }
  }
);

app.delete("/groups/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const groupId = req.params.id;

    // Delete group
    await dbHelpers.query("DELETE FROM groups WHERE id = ?", [groupId]);

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ error: "Error deleting group" });
  }
});

app.put(
  "/groups/:id",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const groupId = req.params.id;
      const { name, description } = req.body;
      const image = req.file ? req.file.filename : undefined;

      // Update group
      const updateData = {
        name,
        description: description || null,
        ...(image && { image }),
      };

      await dbHelpers.update("groups", groupId, updateData);

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating group:", error);
      res.status(500).json({ error: "Error updating group" });
    }
  }
);

app.get("/group/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const groupId = req.params.id;

    // Get group details
    const [group] = await dbHelpers.query(
      `
      SELECT g.*
      FROM groups g
      WHERE g.id = ?
    `,
      [groupId]
    );

    if (!group) {
      return res.status(404).send("Group not found");
    }

    // Get items for this group
    const items = await dbHelpers.query(
      `
      SELECT i.*, 
             c.name as companyName,
             s.name as supplierName,
             cl.name as clientName
      FROM items i
      LEFT JOIN companies c ON i.companyId = c.id
      LEFT JOIN suppliers s ON i.supplierId = s.id
      LEFT JOIN clients cl ON i.clientId = cl.id
      WHERE i.groupId = ?
    `,
      [groupId]
    );

    res.render("group-details", {
      group,
      items,
      user: req.user,
    });
  } catch (error) {
    console.error("Error fetching group details:", error);
    res.status(500).send("Error fetching group details");
  }
});

// Suppliers Routes
app.get("/suppliers", isAuthenticated, isAdmin, async (req, res) => {
  try {
    // Get suppliers with their companies
    const suppliers = await dbHelpers.query(`
      SELECT 
        s.*,
        GROUP_CONCAT(DISTINCT c.name) as companyNames
      FROM suppliers s
      LEFT JOIN items i ON s.id = i.supplierId
      LEFT JOIN companies c ON i.companyId = c.id
      GROUP BY s.id
      ORDER BY s.name
    `);

    // Get all companies for the filter dropdown
    const companies = await dbHelpers.getAll("companies");

    res.render("suppliers", { suppliers, companies, user: req.session.user });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/create-supplier", isAuthenticated, isAdmin, (req, res) => {
  res.render("create-supplier");
});

app.post("/create-supplier", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await dbHelpers.create("suppliers", req.body);
    res.redirect("/suppliers");
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// Delete Supplier Route
app.post("/delete-supplier/:id", isAuthenticated, isAdmin, async (req, res) => {
  try {
    await dbHelpers.delete("suppliers", req.params.id);
    res.redirect("/suppliers");
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

// Items Routes
app.get("/items", isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";
    const companyId = req.query.companyId;
    const clientId = req.query.clientId;
    const supplierId = req.query.supplierId;
    const status = req.query.status;
    
    // تحسين معالجة المجموعات المتعددة
    let groupIds = [];
    if (req.query.groupIds) {
      groupIds = Array.isArray(req.query.groupIds) ? 
                req.query.groupIds.filter(id => id && id !== '') : 
                [req.query.groupIds].filter(id => id && id !== '');
    }

    let whereClause = "1=1";
    let queryParams = [];

    if (search) {
      whereClause += " AND (items.name LIKE ? OR items.barcode LIKE ?)";
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    if (companyId) {
      whereClause += " AND items.companyId = ?";
      queryParams.push(companyId);
    }

    if (clientId) {
      whereClause += " AND items.clientId = ?";
      queryParams.push(clientId);
    }

    if (supplierId) {
      whereClause += " AND items.supplierId = ?";
      queryParams.push(supplierId);
    }

    if (groupIds.length > 0) {
      whereClause += ` AND items.groupId IN (${groupIds.map(() => '?').join(',')})`;
      queryParams.push(...groupIds);
    }

    if (status) {
      whereClause += " AND (CASE WHEN items.itemNumber IS NOT NULL AND items.itemNumber != 0 THEN 'active' ELSE 'inactive' END) = ?";
      queryParams.push(status);
    }

    // Get total count
    const [{ total }] = await dbHelpers.query(
      `SELECT COUNT(*) as total FROM items WHERE ${whereClause}`,
      queryParams
    );

    // Get active and inactive counts
    const [itemCounts] = await dbHelpers.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN itemNumber IS NOT NULL AND itemNumber != 0 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN itemNumber IS NULL OR itemNumber = 0 THEN 1 ELSE 0 END) as inactive
      FROM items 
      WHERE ${whereClause}`,
      queryParams
    );

    // Get items with related data
    const items = await dbHelpers.query(
      `SELECT 
        items.*,
        companies.name as companyName,
        suppliers.name as supplierName,
        clients.name as clientName,
        groups.name as groupName
      FROM items
      LEFT JOIN companies ON items.companyId = companies.id
      LEFT JOIN suppliers ON items.supplierId = suppliers.id
      LEFT JOIN clients ON items.clientId = clients.id
      LEFT JOIN groups ON items.groupId = groups.id
      WHERE ${whereClause}
      ORDER BY items.name
      LIMIT ? OFFSET ?`,
      [...queryParams, limit, offset]
    );

    // Get all companies for filter
    const companies = await dbHelpers.query(
      "SELECT * FROM companies ORDER BY name"
    );

    // Get suppliers based on selected company
    let suppliersQuery = `
      SELECT DISTINCT s.* 
      FROM suppliers s
      INNER JOIN items i ON s.id = i.supplierId
      WHERE 1=1
    `;
    const suppliersParams = [];
    
    if (companyId) {
      suppliersQuery += " AND i.companyId = ?";
      suppliersParams.push(companyId);
    }
    
    suppliersQuery += " ORDER BY s.name";
    const suppliers = await dbHelpers.query(suppliersQuery, suppliersParams);

    // Get all clients for filter
    const clients = await dbHelpers.query(
      "SELECT c.*, comp.name as companyName FROM clients c LEFT JOIN companies comp ON c.companyId = comp.id ORDER BY c.name"
    );

    // Get all groups for filter
    const groups = await dbHelpers.query(
      "SELECT g.*, c.name as clientName FROM groups g LEFT JOIN clients c ON g.clientId = c.id ORDER BY g.name"
    );

    const { totalPages, hasPreviousPage, hasNextPage } = getPagination(
      page,
      limit,
      total
    );

    res.render("items", {
      items,
      companies,
      suppliers,
      clients,
      groups,
      search,
      currentPage: page,
      totalPages,
      hasPreviousPage,
      hasNextPage,
      itemCounts: {
        total,
        active: itemCounts.active || 0,
        inactive: itemCounts.inactive || 0,
      },
      req,
    });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.get("/create-item", isAuthenticated, isAdmin, async (req, res) => {
  try {
    const clients = await dbHelpers.getAll("clients");
    const groups = await dbHelpers.getAll("groups");
    const suppliers = await dbHelpers.getAll("suppliers");
    const companies = await dbHelpers.getAll("companies");

    res.render("create-item", { clients, groups, suppliers, companies });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post(
  "/create-item",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.image = `/uploads/${req.file.filename}`;
      }
      // Handle the clientIds and groupIds which will come as string.
      if (data.clientIds) {
        if (typeof data.clientIds == "string") {
          data.clientIds = data.clientIds.split(",");
        }
        data.clientIds = data.clientIds.map((id) => parseInt(id));
      }
      if (data.groupIds) {
        if (typeof data.groupIds == "string") {
          data.groupIds = data.groupIds.split(",");
        }
        data.groupIds = data.groupIds.map((id) => parseInt(id));
      }

      const itemData = { ...data };
      delete itemData.clientIds;
      delete itemData.groupIds;

      const itemId = await dbHelpers.create("items", itemData);

      if (data.clientIds) {
        for (const clientId of data.clientIds) {
          await dbHelpers.create("item_clients", { itemId, clientId });
        }
      }

      if (data.groupIds) {
        for (const groupId of data.groupIds) {
          await dbHelpers.create("item_groups", { itemId, groupId });
        }
      }
      res.redirect("/items");
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);
// Edit Item Route
app.get("/edit-item/:id", isAuthenticated, async (req, res) => {
  try {
    const item = await dbHelpers.getById("items", req.params.id);
    if (!item) {
      return res.status(404).send("الصنف غير موجود");
    }

    // التحقق من أن المورد يملك هذا الصنف
    if (
      req.session.user.type === "supplier" &&
      item.supplierId !== req.session.user.id
    ) {
      return res.status(403).send("غير مصرح لك بتعديل هذا الصنف");
    }

    let companies, clients, groups, suppliers;

    if (req.session.user.type === "supplier") {
      // جلب الشركات المرتبطة بالمورد
      companies = await dbHelpers.query(
        `SELECT DISTINCT c.* 
         FROM companies c
         INNER JOIN items i ON c.id = i.companyId
         WHERE i.supplierId = ?
         ORDER BY c.name`,
        [req.session.user.id]
      );

      // جلب العملاء المرتبطين بالمورد
      clients = await dbHelpers.query(
        `SELECT DISTINCT cl.*, c.name as companyName 
         FROM clients cl
         INNER JOIN companies c ON cl.companyId = c.id
         WHERE c.id IN (
           SELECT DISTINCT companyId 
           FROM items 
           WHERE supplierId = ?
         )
         ORDER BY cl.name`,
        [req.session.user.id]
      );

      // جلب المجموعات المرتبطة بالمورد
      groups = await dbHelpers.query(
        `SELECT DISTINCT g.*, g.clientId 
         FROM groups g
         INNER JOIN items i ON i.groupId = g.id
         WHERE i.supplierId = ?
         ORDER BY g.name`,
        [req.session.user.id]
      );
    } else {
      // للمدير، جلب كل البيانات
      companies = await dbHelpers.query(
        "SELECT * FROM companies ORDER BY name"
      );
      clients = await dbHelpers.query(
        `SELECT cl.*, c.name as companyName 
         FROM clients cl
         LEFT JOIN companies c ON cl.companyId = c.id
         ORDER BY cl.name`
      );
      groups = await dbHelpers.query("SELECT * FROM groups ORDER BY name");
      suppliers = await dbHelpers.query(
        "SELECT * FROM suppliers ORDER BY name"
      );
    }

    res.render("edit-item", {
      user: req.session.user,
      item,
      companies,
      clients,
      groups,
      suppliers,
    });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.post(
  "/edit-item/:id",
  isAuthenticated,
  upload.single("image"),
  async (req, res) => {
    try {
      const itemId = req.params.id;
      const {
        name,
        nameEn,
        barcode,
        itemNumber,
        cartonPrice,
        unitPrice,
        bundleSize,
        quantity,
        origin,
        notes,
        companyId,
        clientId,
        groupId,
        supplierId,
      } = req.body;

      // تحديث بيانات الصنف
      const updateData = {
        name,
        nameEn: nameEn || null,
        barcode: barcode || null,
        itemNumber: itemNumber || null,
        cartonPrice: cartonPrice || null,
        unitPrice: unitPrice || null,
        bundleSize: bundleSize || null,
        quantity: quantity || null,
        origin: origin || null,
        notes: notes || null,
        companyId: companyId || null,
        clientId: clientId || null,
        groupId: groupId || null,
      };

      // إضافة supplierId فقط إذا كان المستخدم مدير
      if (req.session.user.type === "admin") {
        updateData.supplierId = supplierId || null;
      }

      // إذا تم تحميل صورة جديدة
      if (req.file) {
        updateData.image = req.file.filename;
      }

      await dbHelpers.update("items", itemId, updateData);

      // إعادة التوجيه حسب نوع المستخدم
      if (req.session.user.type === "admin") {
        res.redirect("/items");
      } else {
        res.redirect("/supplier-dashboard");
      }
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);
// Delete Item Route
app.post("/delete-item/:id", isAuthenticated, async (req, res) => {
  try {
    const itemId = req.params.id;

    // حذف الصنف مباشرة لأن العلاقات مع الجداول الأخرى تستخدم ON DELETE SET NULL
    await dbHelpers.query("DELETE FROM items WHERE id = ?", [itemId]);

    res.redirect("/items?success=تم حذف الصنف بنجاح");
  } catch (error) {
    console.error("Database error:", error);
    res.redirect(
      "/items?error=" + encodeURIComponent("حدث خطأ أثناء حذف الصنف")
    );
  }
});
// View Item Route
// View Item Route
app.get("/item/:id", isAuthenticated, async (req, res) => {
  try {
    // Get item with all its relationships
    const [item] = await dbHelpers.query(
      `
      SELECT i.*,
        c.name as companyName,
        s.name as supplierName,
        cl.name as clientName,
        cl.id as clientId,
        g.name as groupName,
        g.id as groupId
      FROM items i
      LEFT JOIN companies c ON i.companyId = c.id
      LEFT JOIN suppliers s ON i.supplierId = s.id
      LEFT JOIN clients cl ON i.clientId = cl.id
      LEFT JOIN groups g ON i.groupId = g.id
      WHERE i.id = ?
    `,
      [req.params.id]
    );

    if (!item) {
      return res.status(404).send("Item not found");
    }

    // Get all available clients with their companies
    const clients = await dbHelpers.query(`
      SELECT c.*, comp.name as companyName 
      FROM clients c
      LEFT JOIN companies comp ON c.companyId = comp.id
      ORDER BY c.name
    `);

    // Get all available groups with their clients
    const groups = await dbHelpers.query(`
      SELECT g.*, c.name as clientName
      FROM groups g
      LEFT JOIN clients c ON g.clientId = c.id
      ORDER BY g.name
    `);

    // Get all companies
    const companies = await dbHelpers.getAll("companies");

    // Get all suppliers
    const suppliers = await dbHelpers.getAll("suppliers");

    res.render("item", {
      item,
      clients,
      groups,
      companies,
      suppliers,
      user: req.session.user,
    });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});
// supplier dashboard
app.get(
  "/supplier-dashboard",
  isAuthenticated,
  isSupplier,
  async (req, res) => {
    try {
      // Check if supplier has accepted terms
      const supplier = await dbHelpers.query(
        "SELECT terms_accepted FROM suppliers WHERE id = ?",
        [req.session.user.id]
      );

      if (!supplier[0].terms_accepted) {
        return res.render("supplier-dashboard", { 
          showTerms: true,
          companies: [],
          clients: [],
          groups: [],
          items: [],
          search: "",
          companyId: "",
          clientId: "",
          groupIds: [],
          status: "",
          currentPage: 1,
          totalPages: 1,
          itemCounts: { total: 0, active: 0, inactive: 0 },
          req: req
        });
      }

      const supplierId = req.session.user.id;
      const search = req.query.search || "";
      const companyId = req.query.companyId;
      const clientId = req.query.clientId;
      const groupIds = Array.isArray(req.query.groupIds) ? req.query.groupIds : req.query.groupIds ? [req.query.groupIds] : [];
      const status = req.query.status;
      const page = parseInt(req.query.page) || 1;
      const itemsPerPage = 10;
      const offset = (page - 1) * itemsPerPage;

      let whereClause = "items.supplierId = ?";
      let queryParams = [supplierId];

      if (search) {
        whereClause += " AND (items.name LIKE ? OR items.barcode LIKE ?)";
        queryParams.push(`%${search}%`, `%${search}%`);
      }

      if (companyId) {
        whereClause += " AND items.companyId = ?";
        queryParams.push(companyId);
      }

      if (clientId) {
        whereClause += " AND items.clientId = ?";
        queryParams.push(clientId);
      }

      if (groupIds.length > 0) {
        whereClause += ` AND items.groupId IN (${groupIds.map(() => '?').join(',')})`;
        queryParams.push(...groupIds);
      }

      if (status) {
        whereClause += " AND (CASE WHEN items.itemNumber IS NOT NULL AND items.itemNumber != 0 THEN 'active' ELSE 'inactive' END) = ?";
        queryParams.push(status);
      }

      // Get counts for statistics
      const countResult = await dbHelpers.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN itemNumber IS NOT NULL AND itemNumber != 0 THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN itemNumber IS NULL OR itemNumber = 0 THEN 1 ELSE 0 END) as inactive
         FROM items 
         WHERE ${whereClause}`,
        queryParams
      );

      // Get items with related data
      const items = await dbHelpers.query(
        `SELECT items.*, 
                companies.name as companyName,
                clients.name as clientName,
                groups.name as groupName
         FROM items 
         LEFT JOIN companies ON items.companyId = companies.id
         LEFT JOIN clients ON items.clientId = clients.id
         LEFT JOIN groups ON items.groupId = groups.id
         WHERE ${whereClause}
         ORDER BY items.name ASC
         LIMIT ? OFFSET ?`,
        [...queryParams, itemsPerPage, offset]
      );

      // Get total count for pagination
      const totalCount = countResult[0].total;
      const totalPages = Math.ceil(totalCount / itemsPerPage);

      // Get all available companies for this supplier
      const companies = await dbHelpers.query(
        `SELECT DISTINCT c.* 
         FROM companies c
         INNER JOIN items i ON c.id = i.companyId
         WHERE i.supplierId = ?
         ORDER BY c.name`,
        [supplierId]
      );

      // Get all available clients for this supplier
      const clients = await dbHelpers.query(
        `SELECT DISTINCT c.*, c2.name as companyName 
         FROM clients c
         INNER JOIN items i ON c.id = i.clientId
         LEFT JOIN companies c2 ON c.companyId = c2.id
         WHERE i.supplierId = ?
         ORDER BY c2.name, c.name`,
        [supplierId]
      );

      // Get all available groups for this supplier
      const groups = await dbHelpers.query(
        `SELECT DISTINCT g.*, c.name as clientName 
         FROM groups g
         INNER JOIN items i ON g.id = i.groupId
         LEFT JOIN clients c ON g.clientId = c.id
         WHERE i.supplierId = ?
         ORDER BY c.name, g.name`,
        [supplierId]
      );

      res.render("supplier-dashboard", {
        items,
        companies,
        clients,
        groups,
        search,
        companyId,
        clientId,
        groupIds,
        status,
        currentPage: page,
        totalPages,
        itemCounts: {
          total: countResult[0].total || 0,
          active: countResult[0].active || 0,
          inactive: countResult[0].inactive || 0,
        },
        showTerms: false,
        req,
      });
    } catch (error) {
      console.error("Error in supplier dashboard:", error);
      res.status(500).send("حدث خطأ في عرض لوحة التحكم");
    }
  }
);
// ... (بقية الكود كما هي)

// Restock Request Route
// ... (بقية الكود كما هي)

// Restock Request Route
// ... (بقية الكود كما هي)

// Restock Request Route
app.get(
  "/create-restock-request",
  isAuthenticated,
  isSupplier,
  async (req, res) => {
    try {
      const supplierId = req.session.user.id;
      const companyId = req.query.companyId;
      const selectedClientId = req.query.clientId || null;
      
      // Get supplier info
      const supplier = await dbHelpers.getById("suppliers", supplierId);
      
      // Get company info if companyId is provided
      let company = null;
      let clients = [];
      let clientNames = [];
      let selectedClient = null;

      if (companyId) {
        company = await dbHelpers.getById("companies", companyId);
        
        // Get unique clients from items only if companyId is provided
        clients = await dbHelpers.query(
          `SELECT DISTINCT c.* 
           FROM clients c
           INNER JOIN items i ON c.id = i.clientId
           WHERE i.supplierId = ? AND i.companyId = ?`,
          [supplierId, companyId]
        );
      }

      // Get client details if client ID is provided
      if (selectedClientId) {
        const clientResult = await dbHelpers.query(
          `SELECT * FROM clients WHERE id = ?`,
          [selectedClientId]
        );
        if (clientResult && clientResult.length > 0) {
          selectedClient = clientResult[0];
          clientNames = [selectedClient.name];
        }
      }
      
      // Get items for this supplier and company
      let itemsQuery = `
        SELECT i.*, c.name as companyName, cl.name as clientName, g.name as groupName 
        FROM items i
        LEFT JOIN companies c ON i.companyId = c.id
        LEFT JOIN clients cl ON i.clientId = cl.id
        LEFT JOIN groups g ON i.groupId = g.id
        WHERE i.supplierId = ? 
        ${companyId ? 'AND i.companyId = ?' : ''}
        ${selectedClientId ? 'AND i.clientId = ?' : ''}`;

      let itemsParams = [supplierId];
      if (companyId) itemsParams.push(companyId);
      if (selectedClientId) itemsParams.push(selectedClientId);

      const items = await dbHelpers.query(itemsQuery, itemsParams);

      res.render("create-restock-request", {
        user: req.session.user,
        items: items,
        supplier: supplier,
        supplierName: supplier.name,
        supplierId: supplierId,
        company: company,
        companyName: company ? company.name : null,
        companyId: companyId,
        clients: clients,
        clientNames: clientNames,
        selectedClientId: selectedClientId,
        selectedClient: selectedClient
      });
    } catch (error) {
      console.error("Error in restock request page:", error);
      res.status(500).send("حدث خطأ في عرض صفحة طلب تزويد البضاعة");
    }
  }
);

// Auth routes

app.get("/login", (req, res) => res.render("login", { error: null }));

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  if (username === "admin" && password === "admin330") {
    req.session.isAuthenticated = true;
    req.session.user = { type: "admin", username: "admin" };
    return res.redirect("/companies");
  }

  try {
    const suppliers = await dbHelpers.query(
      "SELECT * FROM suppliers WHERE username = ? AND password = ?",
      [username, password]
    );

    if (suppliers.length > 0) {
      const supplier = suppliers[0];
      req.session.isAuthenticated = true;
      req.session.user = {
        type: "supplier",
        username: supplier.username,
        id: supplier.id,
      };
      return res.redirect("/supplier-dashboard");
    }

    res.render("login", { error: "اسم المستخدم أو كلمة المرور غير صحيحة" });
  } catch (error) {
    handleDatabaseError(error, res);
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/login");
});

app.get("/", (req, res) => res.redirect("/login"));

// Create Group Route
app.get("/create-group", isAuthenticated, async (req, res) => {
  try {
    // Get all clients with their company information
    const clients = await dbHelpers.query(`
      SELECT 
        clients.*,
        companies.name as companyName
      FROM clients
      LEFT JOIN companies ON clients.companyId = companies.id
      ORDER BY companies.name, clients.name
    `);

    res.render("create-group", { clients });
  } catch (error) {
    console.error("Error fetching clients:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post(
  "/create-group",
  isAuthenticated,
  upload.single("image"),
  async (req, res) => {
    try {
      const { name, description, clientId } = req.body;
      const image = req.file ? req.file.filename : null;

      // Create group
      const groupId = await dbHelpers.create("groups", {
        name,
        description: description || null,
        clientId: clientId || null,
        image,
      });

      res.redirect("/groups");
    } catch (error) {
      console.error("Error creating group:", error);
      res.status(500).send("Error creating group");
    }
  }
);

// Edit Group Route
app.get("/edit-group/:id", isAuthenticated, async (req, res) => {
  try {
    const [group] = await dbHelpers.query(
      `SELECT g.*, c.name as clientName 
       FROM groups g
       LEFT JOIN clients c ON g.clientId = c.id
       WHERE g.id = ?`,
      [req.params.id]
    );

    if (!group) {
      return res.status(404).send("المجموعة غير موجودة");
    }

    // Get all clients with their company information
    const clients = await dbHelpers.query(`
      SELECT 
        clients.*,
        companies.name as companyName
      FROM clients
      LEFT JOIN companies ON clients.companyId = companies.id
      ORDER BY companies.name, clients.name
    `);

    res.render("edit-group", {
      group,
      clients,
    });
  } catch (error) {
    console.error("Error fetching group:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post(
  "/edit-group/:id",
  isAuthenticated,
  isAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      const { deleteImage, ...data } = req.body;
      
      const group = await dbHelpers.getById("groups", req.params.id);
      
      if (deleteImage === 'on') {
        // If delete image is checked, remove the image
        data.image = null;
        // Delete the actual file if it exists
        if (group.image) {
          const imagePath = path.join(__dirname, 'public', group.image);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        }
      } else if (req.file) {
        // If new image uploaded
        data.image = `/uploads/${req.file.filename}`;
        // Delete old image if exists
        if (group.image) {
          const oldImagePath = path.join(__dirname, 'public', group.image);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }
      }
      
      await dbHelpers.update("groups", req.params.id, data);
      res.redirect("/groups");
    } catch (error) {
      handleDatabaseError(error, res);
    }
  }
);

// Delete Group Route
app.post("/delete-group/:id", isAuthenticated, async (req, res) => {
  try {
    await dbHelpers.delete("groups", req.params.id);
    res.redirect("/groups");
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Edit Client Route
app.get("/edit-client/:id", isAuthenticated, async (req, res) => {
  try {
    const client = await dbHelpers.getById("clients", req.params.id);
    if (!client) return res.status(404).send("Client not found");

    const companies = await dbHelpers.getAll("companies");

    res.render("edit-client", { client, companies });
  } catch (error) {
    console.error("Error fetching client:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.post(
  "/edit-client/:id",
  isAuthenticated,
  upload.single("image"),
  async (req, res) => {
    try {
      const data = { ...req.body };
      if (req.file) {
        data.image = `/uploads/${req.file.filename}`;
      }

      await dbHelpers.update("clients", req.params.id, {
        name: data.name,
        companyId: data.companyId || null,
        ...(data.image && { image: data.image }),
      });

      res.redirect("/clients");
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).send("Internal Server Error");
    }
  }
);

// Delete Client Route
app.post("/delete-client/:id", isAuthenticated, async (req, res) => {
  try {
    await dbHelpers.delete("clients", req.params.id);
    res.redirect("/clients");
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Helper function for pagination
function getPagination(page, limit, total) {
  const totalPages = Math.ceil(total / limit);
  const currentPage = parseInt(page) || 1;
  const start = (currentPage - 1) * limit;

  return {
    start,
    limit,
    currentPage,
    totalPages,
  };
}

app.get("/supplier/:id", isAuthenticated, async (req, res) => {
  try {
    const supplierId = req.params.id || req.session.user.id;
    const searchQuery = req.query.search || "";
    const companyId = req.query.companyId;
    const clientId = req.query.clientId;
    const groupIds = req.query.groupIds ? req.query.groupIds.split(",") : [];
    const status = req.query.status;

    console.log("Filter params:", {
      supplierId,
      searchQuery,
      companyId,
      clientId,
      groupIds,
      status,
    });

    // Get supplier info
    const supplierResult = await dbHelpers.query(
      "SELECT * FROM suppliers WHERE id = ?",
      [supplierId]
    );

    if (!supplierResult || !supplierResult[0]) {
      return res.status(404).send("المورد غير موجود");
    }

    const supplier = supplierResult[0];

    // Get items statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as totalItems,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeItems,
        SUM(CASE WHEN isActive = 0 THEN 1 ELSE 0 END) as inactiveItems
      FROM items
      WHERE supplierId = ?
    `;
    const [stats] = await dbHelpers.query(statsQuery, [supplierId]);

    // Build WHERE clause
    let whereClause = "WHERE i.supplierId = ?";
    let queryParams = [supplierId];

    if (clientId) {
      whereClause += " AND i.clientId = ?";
      queryParams.push(clientId);
    }
    if (groupId) {
      whereClause += " AND i.groupId = ?";
      queryParams.push(groupId);
    }

    if (status === "active") {
      whereClause +=
        " AND items.itemNumber IS NOT NULL AND items.itemNumber != ''";
    } else if (status === "inactive") {
      whereClause += " AND (items.itemNumber IS NULL OR items.itemNumber = '')";
    }

    if (searchQuery) {
      whereClause +=
        " AND (i.name LIKE ? OR i.nameEn LIKE ? OR i.barcode LIKE ?)";
      queryParams.push(`%${searchQuery}%`, `%${searchQuery}%`, `%${searchQuery}%`);
    }

    // Get filtered items statistics
    const filteredStatsQuery = `
      SELECT 
        COUNT(*) as filteredTotal,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as filteredActive,
        SUM(CASE WHEN isActive = 0 THEN 1 ELSE 0 END) as filteredInactive
      FROM items i
      ${whereClause}
    `;
    const [filteredStats] = await dbHelpers.query(
      filteredStatsQuery,
      queryParams
    );

    // Get items with related info
    const items = await dbHelpers.query(
      `SELECT i.*, 
              c.name as companyName,
              cl.name as clientName,
              g.name as groupName
       FROM items i
       LEFT JOIN companies c ON i.companyId = c.id
       LEFT JOIN clients cl ON i.clientId = cl.id
       LEFT JOIN groups g ON i.groupId = g.id
       ${whereClause}
       ORDER BY i.name ASC`,
      queryParams
    );

    // Get all companies for filter
    const companies = await dbHelpers.query(
      `SELECT DISTINCT c.* 
       FROM companies c
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ?
       ORDER BY c.name`,
      [supplierId]
    );

    // Get all clients for filter
    let clientsQuery = `
      SELECT DISTINCT cl.* 
      FROM clients cl
      INNER JOIN items i ON cl.id = i.clientId
      WHERE i.supplierId = ?
    `;
    let clientsParams = [supplierId];

    if (companyId) {
      clientsQuery += " AND i.companyId = ?";
      clientsParams.push(companyId);
    }

    clientsQuery += " ORDER BY cl.name";
    const clients = await dbHelpers.query(clientsQuery, clientsParams);

    // Get all groups for filter
    let groupsQuery = `
      SELECT DISTINCT g.* 
      FROM groups g
      INNER JOIN items i ON g.id = i.groupId
      WHERE i.supplierId = ?
    `;
    let groupsParams = [supplierId];

    if (clientId) {
      groupsQuery += " AND i.clientId = ?";
      groupsParams.push(clientId);
    }

    groupsQuery += " ORDER BY g.name";
    const groups = await dbHelpers.query(groupsQuery, groupsParams);

    res.render("supplier", {
      user: req.session.user,
      supplier: supplier,
      items: items,
      companies: companies,
      clients: clients,
      groups: groups,
      searchQuery: searchQuery,
      selectedClient: clientId,
      selectedGroup: groupId,
      stats: stats,
      filteredStats: filteredStats,
    });
  } catch (error) {
    console.error("Error in supplier details:", error);
    res.status(500).send("حدث خطأ في الخادم: " + error.message);
  }
});

// عرض شركات المورد
app.get(
  "/supplier-companies",
  isAuthenticated,
  isSupplier,
  async (req, res) => {
    try {
      if (!req.session.user) {
        return res.redirect("/login");
      }

      const supplierId = req.session.user.id;
      const search = req.query.search || "";
      const page = parseInt(req.query.page) || 1;
      const itemsPerPage = 10;
      const offset = (page - 1) * itemsPerPage;

      // Get total count for pagination
      const countResult = await dbHelpers.query(
        `SELECT COUNT(DISTINCT c.id) as total 
       FROM companies c
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ? AND c.name LIKE ?`,
        [supplierId, `%${search}%`]
      );

      const totalItems = countResult[0].total;
      const totalPages = Math.ceil(totalItems / itemsPerPage);

      // Get companies for current page
      const companies = await dbHelpers.query(
        `SELECT DISTINCT c.*, COUNT(DISTINCT i.id) as itemCount
       FROM companies c
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ? AND c.name LIKE ?
       GROUP BY c.id, c.name
       ORDER BY c.name ASC
       LIMIT ? OFFSET ?`,
        [supplierId, `%${search}%`, itemsPerPage, offset]
      );

      // Get items count for each company
      const companiesWithItemsCount = await Promise.all(
        companies.map(async (company) => {
          const countResult = await dbHelpers.query(
            `SELECT COUNT(*) as count 
           FROM items i 
           WHERE i.supplierId = ? AND i.companyId = ?`,
            [supplierId, company.id]
          );
          return {
            ...company,
            itemsCount: countResult[0].count,
          };
        })
      );

      res.render("supplier-companies", {
        user: req.session.user,
        companies: companiesWithItemsCount,
        currentPage: page,
        totalPages: totalPages,
        search: search,
        req: req,
      });
    } catch (error) {
      console.error("Error in supplier companies:", error);
      res.status(500).send("حدث خطأ في الخادم: " + error.message);
    }
  }
);

// عرض عملاء المورد
app.get("/supplier-clients", isAuthenticated, isSupplier, async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const supplierId = req.session.user.id;
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = 10;
    const offset = (page - 1) * itemsPerPage;

    // Get total count for pagination
    const countResult = await dbHelpers.query(
      `SELECT COUNT(DISTINCT cl.id) as total 
       FROM clients cl
       INNER JOIN companies c ON cl.companyId = c.id
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ? AND cl.name LIKE ?`,
      [supplierId, `%${search}%`]
    );
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Get clients for current page with company names
    const clients = await dbHelpers.query(
      `SELECT DISTINCT cl.*, c.name as companyName, COUNT(DISTINCT i.id) as itemCount
       FROM clients cl
       INNER JOIN companies c ON cl.companyId = c.id
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ? AND cl.name LIKE ?
       GROUP BY cl.id, cl.name, c.name
       ORDER BY cl.name ASC
       LIMIT ? OFFSET ?`,
      [supplierId, `%${search}%`, itemsPerPage, offset]
    );

    // Get all companies for the filter dropdown
    const companies = await dbHelpers.query(
      `SELECT DISTINCT c.* 
       FROM companies c
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ?
       ORDER BY c.name ASC`,
      [supplierId]
    );

    res.render("supplier-clients", {
      user: req.session.user,
      clients: clients,
      companies: companies,
      currentPage: page,
      totalPages: totalPages,
      search: search,
      req: req,
    });
  } catch (error) {
    console.error("Error in supplier clients:", error);
    res.status(500).send("حدث خطأ في الخادم: " + error.message);
  }
});

// عرض مجموعات المورد
app.get("/supplier-groups", isAuthenticated, isSupplier, async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const supplierId = req.session.user.id;
    console.log("Current supplier ID:", supplierId);

    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const itemsPerPage = 10;
    const offset = (page - 1) * itemsPerPage;

    // Get total count for pagination
    const countResult = await dbHelpers.query(
      `SELECT COUNT(DISTINCT g.id) as total 
       FROM groups g
       INNER JOIN items i ON g.id = i.groupId
       WHERE i.supplierId = ? AND g.name LIKE ?`,
      [supplierId, `%${search}%`]
    );
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // First, let's check what items this supplier has
    const supplierItems = await dbHelpers.query(
      `SELECT id, name, groupId FROM items WHERE supplierId = ?`,
      [supplierId]
    );
    console.log("Supplier items:", supplierItems);

    // Get groups for current page with company and client names and item count
    const groups = await dbHelpers.query(
      `SELECT g.*, 
              cl.name as clientName, 
              c.name as companyName,
              cl.id as clientId, 
              c.id as companyId,
              (
                SELECT COUNT(*) 
                FROM items i 
                WHERE i.groupId = g.id 
                AND i.supplierId = ?
              ) as itemCount
       FROM groups g
       INNER JOIN items i ON i.groupId = g.id
       LEFT JOIN clients cl ON g.clientId = cl.id
       LEFT JOIN companies c ON cl.companyId = c.id
       WHERE i.supplierId = ? AND g.name LIKE ?
       GROUP BY g.id, g.name, cl.name, c.name, cl.id, c.id
       ORDER BY g.name ASC
       LIMIT ? OFFSET ?`,
      [supplierId, supplierId, `%${search}%`, itemsPerPage, offset]
    );

    console.log("Groups with counts:", groups);

    // Get companies for filter dropdown
    const companies = await dbHelpers.query(
      `SELECT DISTINCT c.* 
       FROM companies c
       INNER JOIN items i ON c.id = i.companyId
       WHERE i.supplierId = ?
       ORDER BY c.name`,
      [supplierId]
    );

    // Get clients for filter dropdown
    const clients = await dbHelpers.query(
      `SELECT DISTINCT cl.* 
       FROM clients cl
       INNER JOIN items i ON cl.id = i.clientId
       WHERE i.supplierId = ?
       ORDER BY cl.name`,
      [supplierId]
    );

    res.render("supplier-groups", {
      user: req.session.user,
      groups: groups,
      companies: companies,
      groups: groups,
      companies: companies,
      clients: clients,
      currentPage: page,
      totalPages: totalPages,
      search: search,
      req: req,
    });
  } catch (error) {
    console.error("Error in supplier groups:", error);
    res.status(500).send("حدث خطأ في الخادم: " + error.message);
  }
});

// Add new endpoint for accepting terms
app.post("/accept-terms", isAuthenticated, isSupplier, async (req, res) => {
  try {
    await dbHelpers.query(
      "UPDATE suppliers SET terms_accepted = 1 WHERE id = ?",
      [req.session.user.id]
    );
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error accepting terms:", error);
    res.status(500).json({ error: "Failed to save terms acceptance" });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
