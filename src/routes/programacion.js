const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.post('/agregar', async (req, res) => {
    const { id_medicamento_fk, hora_primera_toma, frecuencia_horas, dias_semana, duracion_dias } = req.body;
    
    // Calcular fecha_fin si se especificó duración
    let fecha_fin = null;
    if (duracion_dias && duracion_dias > 0) {
        const hoy = new Date();
        hoy.setDate(hoy.getDate() + parseInt(duracion_dias));
        fecha_fin = hoy.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    
    const query = 'INSERT INTO programacion_horarios (id_medicamento_fk, hora_primera_toma, frecuencia_horas, dias_semana, fecha_fin) VALUES (?, ?, ?, ?, ?)';
    try {
        await db.query(query, [id_medicamento_fk, hora_primera_toma, frecuencia_horas, dias_semana, fecha_fin]);
        
        // Si tiene duración, programar para marcar como inactivo cuando expire
        if (fecha_fin) {
            // Actualizamos estado_medicamento en la fecha fin (esto lo hace la query de próximas dosis)
        }
        
        res.status(201).json({ mensaje: 'Programación guardada', fecha_fin });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
