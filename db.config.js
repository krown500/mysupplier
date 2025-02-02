const mysql = require('mysql');

const pool = mysql.createPool({
  host: 'mysql.hostinger.com',
  user: 'krown',
  password: 'AAkrown00@@@',
  database: 'krown',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
});

module.exports = pool;