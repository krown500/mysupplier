const mysql = require('mysql');

const pool = mysql.createPool({
  host: 'localhost', // أو عنوان السيرفر المقدم من الاستضافة
  user: 'zero',
  password: 'AAkrown00@@@',
  database: 'zero',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
});

module.exports = pool;
