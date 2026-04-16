require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '1234',
    database: 'medialert_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection((err, connection) => {
    if (err) console.error('❌ Error MySQL:', err.message);
    else {
        console.log('✅ Conectado a MySQL: medialert_db');
        connection.release();
    }
});

module.exports = pool.promise();