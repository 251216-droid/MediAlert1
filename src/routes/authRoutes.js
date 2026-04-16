const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
    const { correo, password } = req.body;
    try {
        const [rows] = await db.query('SELECT * FROM usuarios WHERE correo = ? AND password = ?', [correo, password]);
        if (rows.length > 0) {
            res.json({
                idUsuario: rows[0].idUsuario,
                nombre: rows[0].nombre_completo,
                correo: rows[0].correo
            });
        } else {
            res.status(401).json({ message: 'Credenciales incorrectas' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── REGISTRO ──────────────────────────────────────────────────────────────────
router.post('/registro', async (req, res) => {
    const { nombre_completo, correo, password } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre_completo, correo, password) VALUES (?, ?, ?)',
            [nombre_completo, correo, password]
        );
        res.status(201).json({ idUsuario: result.insertId, nombre: nombre_completo, correo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ACTUALIZAR PERFIL ─────────────────────────────────────────────────────────
router.put('/actualizar/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_completo, correo, password } = req.body;
    try {
        if (password && password !== '') {
            await db.query(
                'UPDATE usuarios SET nombre_completo=?, correo=?, password=? WHERE idUsuario=?',
                [nombre_completo, correo, password, id]
            );
        } else {
            await db.query(
                'UPDATE usuarios SET nombre_completo=?, correo=? WHERE idUsuario=?',
                [nombre_completo, correo, id]
            );
        }
        res.json({ mensaje: 'Perfil actualizado', nombre: nombre_completo, correo });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── GUARDAR TOKEN FCM ─────────────────────────────────────────────────────────
// La app Android llama a este endpoint cada vez que Firebase genera un nuevo token.
// El token se guarda en la BD para poder enviarle notificaciones push al usuario.
router.put('/fcm-token/:id', async (req, res) => {
    const { id } = req.params;
    const { fcm_token } = req.body;
    if (!fcm_token) {
        return res.status(400).json({ error: 'fcm_token requerido' });
    }
    try {
        await db.query(
            'UPDATE usuarios SET fcm_token = ? WHERE idUsuario = ?',
            [fcm_token, id]
        );
        res.json({ mensaje: 'Token FCM actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
