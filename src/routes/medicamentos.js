const express = require('express');
const router = express.Router();
const db = require('../config/db');

// AGREGAR MEDICAMENTO
router.post('/agregar', async (req, res) => {
    const { idUsuario, nombre_medicamento, tipo_presentacion, dosis, categoria, estado_medicamento } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO medicamentos (id_usuario_fk, nombre_medicamento, tipo_presentacion, dosis, categoria, estado_medicamento) VALUES (?, ?, ?, ?, ?, ?)',
            [idUsuario, nombre_medicamento, tipo_presentacion, dosis, categoria, estado_medicamento]
        );
        res.status(201).json({
            idMedicamento: result.insertId,
            id_usuario_fk: idUsuario,
            nombre_medicamento,
            tipo_presentacion,
            dosis,
            categoria,
            estado_medicamento
        });
    } catch (err) {
        console.error('Error agregar medicamento:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// OBTENER LISTA con programacion incluida
router.get('/usuario/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;
    try {
        const [results] = await db.query(`
            SELECT m.*, p.idProgramacion, p.hora_primera_toma, p.frecuencia_horas, p.dias_semana, p.fecha_fin
            FROM medicamentos m
            LEFT JOIN programacion_horarios p ON p.id_medicamento_fk = m.idMedicamento
            WHERE m.id_usuario_fk = ?
            ORDER BY m.idMedicamento DESC
        `, [idUsuario]);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EDITAR MEDICAMENTO (solo campos del medicamento)
router.put('/editar/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre_medicamento, tipo_presentacion, dosis, categoria, estado_medicamento } = req.body;
    try {
        await db.query(
            'UPDATE medicamentos SET nombre_medicamento=?, tipo_presentacion=?, dosis=?, categoria=?, estado_medicamento=? WHERE idMedicamento=?',
            [nombre_medicamento, tipo_presentacion, dosis, categoria, estado_medicamento, id]
        );
        res.json({ mensaje: 'Medicamento actualizado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ACTUALIZAR PROGRAMACION (frecuencia, hora) — para cuando el usuario edita el horario
router.put('/programacion/:idMedicamento', async (req, res) => {
    const { idMedicamento } = req.params;
    const { hora_primera_toma, frecuencia_horas, dias_semana, duracion_dias } = req.body;

    let fecha_fin = null;
    if (duracion_dias && parseInt(duracion_dias) > 0) {
        const hoy = new Date();
        hoy.setDate(hoy.getDate() + parseInt(duracion_dias));
        fecha_fin = hoy.toISOString().slice(0, 10);
    }

    try {
        // Verificar si existe programacion
        const [existing] = await db.query('SELECT idProgramacion FROM programacion_horarios WHERE id_medicamento_fk = ?', [idMedicamento]);
        if (existing.length > 0) {
            await db.query(
                'UPDATE programacion_horarios SET hora_primera_toma=?, frecuencia_horas=?, dias_semana=?, fecha_fin=? WHERE id_medicamento_fk=?',
                [hora_primera_toma, frecuencia_horas, dias_semana || 'Todos', fecha_fin, idMedicamento]
            );
        } else {
            await db.query(
                'INSERT INTO programacion_horarios (id_medicamento_fk, hora_primera_toma, frecuencia_horas, dias_semana, fecha_fin) VALUES (?, ?, ?, ?, ?)',
                [idMedicamento, hora_primera_toma, frecuencia_horas, dias_semana || 'Todos', fecha_fin]
            );
        }
        res.json({ mensaje: 'Programacion actualizada', fecha_fin });
    } catch (err) {
        console.error('Error actualizar programacion:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ELIMINAR MEDICAMENTO (en cascada: historial → programacion → medicamento)
router.delete('/eliminar/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query(`DELETE h FROM historial_tomas h JOIN programacion_horarios p ON h.id_programacion_fk = p.idProgramacion WHERE p.id_medicamento_fk = ?`, [id]);
        await db.query('DELETE FROM programacion_horarios WHERE id_medicamento_fk = ?', [id]);
        await db.query('DELETE FROM medicamentos WHERE idMedicamento = ?', [id]);
        res.json({ mensaje: 'Eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
