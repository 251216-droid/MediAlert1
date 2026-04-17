require('dotenv').config();
const mysql = require('mysql2');

const pool = mysql.createPool({
    host: process.env.DB_HOST, // Esto leerá el 52.71.230.113 de Railway
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Agregar esto ayuda a evitar errores de conexión en nubes
    connectTimeout: 10000 
});

pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error conexión MySQL:', err.message);
    } else {
        console.log('✅ Conexión exitosa a la base de datos de AWS');
        connection.release();
    }
});

module.exports = pool.promise();