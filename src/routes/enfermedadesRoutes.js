const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ── AGREGAR ───────────────────────────────────────────────────────────────────
router.post('/agregar', async (req, res) => {
    const { id_usuario_fk, nombre_enfermedad, descripcion, fecha_diagnostico } = req.body;

    console.log('📥 Agregar enfermedad recibido:', req.body);

    // Validar que llegaron los datos mínimos
    if (!id_usuario_fk || !nombre_enfermedad) {
        return res.status(400).json({ error: 'Faltan campos obligatorios: id_usuario_fk y nombre_enfermedad' });
    }

    try {
        const [result] = await db.query(
            'INSERT INTO enfermedades (id_usuario_fk, nombre_enfermedad, descripcion, fecha_diagnostico) VALUES (?, ?, ?, ?)',
            [id_usuario_fk, nombre_enfermedad, descripcion || '', fecha_diagnostico || '']
        );

        console.log('✅ Enfermedad insertada con ID:', result.insertId);

        res.status(201).json({
            idEnfermedad:     result.insertId,
            id_usuario_fk:    id_usuario_fk,
            nombre_enfermedad: nombre_enfermedad,
            descripcion:       descripcion || '',
            fecha_diagnostico: fecha_diagnostico || '',
            mensaje:           'Enfermedad agregada correctamente'
        });
    } catch (err) {
        console.error('❌ Error agregar enfermedad:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── OBTENER ───────────────────────────────────────────────────────────────────
router.get('/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;
    try {
        const [results] = await db.query(
            'SELECT * FROM enfermedades WHERE id_usuario_fk = ? ORDER BY idEnfermedad DESC',
            [idUsuario]
        );
        res.json(results);
    } catch (err) {
        console.error('❌ Error obtener enfermedades:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── EDITAR ────────────────────────────────────────────────────────────────────
router.put('/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_enfermedad, descripcion, fecha_diagnostico } = req.body;
    try {
        await db.query(
            'UPDATE enfermedades SET nombre_enfermedad=?, descripcion=?, fecha_diagnostico=? WHERE idEnfermedad=?',
            [nombre_enfermedad, descripcion || '', fecha_diagnostico || '', id]
        );
        res.json({ mensaje: 'Enfermedad actualizada' });
    } catch (err) {
        console.error('❌ Error editar enfermedad:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── ELIMINAR ──────────────────────────────────────────────────────────────────
router.delete('/eliminar/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM enfermedades WHERE idEnfermedad = ?', [id]);
        res.json({ mensaje: 'Enfermedad eliminada' });
    } catch (err) {
        console.error('❌ Error eliminar enfermedad:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
