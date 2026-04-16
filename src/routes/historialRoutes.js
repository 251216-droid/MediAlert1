const express = require('express');
const router = express.Router();
const db = require('../config/db');

// ── UTILIDADES ────────────────────────────────────────────────────────────────

function parsearHora(horaStr) {
    if (!horaStr) return { hours: 0, minutes: 0 };
    const partes = horaStr.trim().split(/[\s:]+/);
    let h = parseInt(partes[0]) || 0;
    const m = parseInt(partes[1]) || 0;
    const ampm = (partes[2] || '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return { hours: h, minutes: m };
}

function formato12h(date) {
    let h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

// Calcula el próximo slot FUTURO disponible para un medicamento.
// Reglas:
//   1. Genera todos los slots del día (hora_primera_toma + N * frecuencia)
//   2. De esos slots, busca el próximo que sea FUTURO y no esté registrado como Tomado/No Tomado
//   3. Si no hay ninguno hoy → devuelve la primera toma de mañana
//
// CLAVE: Solo muestra slots FUTUROS, nunca slots del pasado.
// Esto evita que al limpiar historial aparezcan tomas de horas que ya pasaron.
function calcularProximaFutura(horaPrimeraToma, frecuenciaHoras, tomasRegistradasHoy) {
    const now = new Date();
    const { hours, minutes } = parsearHora(horaPrimeraToma);

    const horaBase = new Date(now);
    horaBase.setHours(hours, minutes, 0, 0);

    // Normalizar el set de tomas registradas para comparación
    const registradas = new Set(
        tomasRegistradasHoy.map(t => t.toLowerCase().trim())
    );

    // Generar slots del día de hoy
    const slots = [];
    let slot = new Date(horaBase);
    const finDia = new Date(now);
    finDia.setHours(23, 59, 59, 999);

    while (slot <= finDia) {
        slots.push(new Date(slot));
        slot = new Date(slot.getTime() + frecuenciaHoras * 60 * 60 * 1000);
        if (slots.length > 100) break;
    }

    // Buscar el primer slot FUTURO que NO esté registrado
    for (const s of slots) {
        // Solo slots futuros (con 1 minuto de margen para evitar parpadeo)
        if (s.getTime() > now.getTime() - 60000) {
            const display = formato12h(s).toLowerCase().trim();
            if (!registradas.has(display)) {
                return { fecha: s, display: formato12h(s) };
            }
        }
    }

    // No hay slot disponible hoy → mostrar la primera toma de mañana
    const manana = new Date(horaBase);
    manana.setDate(manana.getDate() + 1);
    return { fecha: manana, display: formato12h(manana) };
}

// ── 1. PRÓXIMAS DOSIS ─────────────────────────────────────────────────────────
router.get('/proximas/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;

    try {
        // Obtener todos los medicamentos activos con programación
        const [programaciones] = await db.query(`
            SELECT
                p.idProgramacion,
                m.nombre_medicamento,
                m.tipo_presentacion,
                m.dosis,
                p.hora_primera_toma,
                p.frecuencia_horas,
                p.fecha_fin
            FROM programacion_horarios p
            INNER JOIN medicamentos m ON p.id_medicamento_fk = m.idMedicamento
            WHERE m.id_usuario_fk = ?
              AND m.estado_medicamento = 'Activo'
              AND (p.fecha_fin IS NULL OR p.fecha_fin >= CURDATE())
        `, [idUsuario]);

        if (programaciones.length === 0) return res.json([]);

        const idsProg = programaciones.map(p => p.idProgramacion);

        // Obtener registros de HOY para cada programación
        // Solo Tomado y No Tomado — Pospuesto no cuenta como "ya hecho"
        const [historialHoy] = await db.query(`
            SELECT id_programacion_fk, fecha_hora_programada
            FROM historial_tomas
            WHERE id_programacion_fk IN (?)
              AND DATE(creado_en) = CURDATE()
              AND estado IN ('Tomado', 'No Tomado')
        `, [idsProg]);

        // Agrupar registros por programación
        const registradasPorProg = {};
        for (const h of historialHoy) {
            if (!registradasPorProg[h.id_programacion_fk]) {
                registradasPorProg[h.id_programacion_fk] = [];
            }
            registradasPorProg[h.id_programacion_fk].push(h.fecha_hora_programada);
        }

        const resultado = [];
        const now = new Date();
        const en24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        for (const prog of programaciones) {
            const registradasHoy = registradasPorProg[prog.idProgramacion] || [];
            const { fecha, display } = calcularProximaFutura(
                prog.hora_primera_toma,
                prog.frecuencia_horas,
                registradasHoy
            );

            // Solo incluir si la próxima toma está dentro de las próximas 24h
            if (fecha <= en24h) {
                resultado.push({
                    idProgramacion:         prog.idProgramacion,
                    nombre_medicamento:     prog.nombre_medicamento,
                    tipo_presentacion:      prog.tipo_presentacion,
                    dosis:                  prog.dosis,
                    hora_primera_toma:      prog.hora_primera_toma,
                    frecuencia_horas:       prog.frecuencia_horas,
                    proxima_toma:           display,
                    proxima_toma_timestamp: fecha.getTime()
                });
            }
        }

        resultado.sort((a, b) => a.proxima_toma_timestamp - b.proxima_toma_timestamp);
        res.json(resultado);

    } catch (err) {
        console.error('Error proximas:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── 2. REGISTRAR TOMA ─────────────────────────────────────────────────────────
router.post('/tomar', async (req, res) => {
    const { id_programacion_fk, fecha_hora_programada, estado } = req.body;
    if (!id_programacion_fk || !estado) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    const ahora = new Date();
    const fecha_real = formato12h(ahora) + ' ' + ahora.toLocaleDateString('es-MX');
    try {
        await db.query(
            'INSERT INTO historial_tomas (id_programacion_fk, fecha_hora_programada, fecha_hora_real, estado) VALUES (?, ?, ?, ?)',
            [id_programacion_fk, fecha_hora_programada || '', fecha_real, estado]
        );
        console.log(`✅ Toma: prog=${id_programacion_fk} estado=${estado} hora=${fecha_hora_programada}`);
        res.status(201).json({ mensaje: 'Registro guardado' });
    } catch (err) {
        console.error('Error tomar:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── 3. HISTORIAL ──────────────────────────────────────────────────────────────
router.get('/usuario/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;
    try {
        const [results] = await db.query(`
            SELECT h.idToma, h.fecha_hora_real, h.estado, m.nombre_medicamento
            FROM historial_tomas h
            JOIN programacion_horarios p ON h.id_programacion_fk = p.idProgramacion
            JOIN medicamentos m ON p.id_medicamento_fk = m.idMedicamento
            WHERE m.id_usuario_fk = ?
            ORDER BY h.idToma DESC
            LIMIT 50
        `, [idUsuario]);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 4. ELIMINAR TOMA ──────────────────────────────────────────────────────────
router.delete('/eliminar/:idToma', async (req, res) => {
    const { idToma } = req.params;
    try {
        await db.query('DELETE FROM historial_tomas WHERE idToma = ?', [idToma]);
        res.json({ mensaje: 'Eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── 5. LIMPIAR HISTORIAL ──────────────────────────────────────────────────────
router.delete('/limpiar/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;
    try {
        await db.query(`
            DELETE h FROM historial_tomas h
            JOIN programacion_horarios p ON h.id_programacion_fk = p.idProgramacion
            JOIN medicamentos m ON p.id_medicamento_fk = m.idMedicamento
            WHERE m.id_usuario_fk = ?
        `, [idUsuario]);
        res.json({ mensaje: 'Historial limpiado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
