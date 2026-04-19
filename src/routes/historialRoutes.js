const express = require('express');
const router = express.Router();
const db = require('../config/db');

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

function normalizarTexto(valor) {
    return String(valor || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();
}

function diaSemanaCoincide(diasSemana, fecha) {
    if (!diasSemana || normalizarTexto(diasSemana) === 'todos') return true;

    const diasMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const diaActual = diasMap[fecha.getDay()];

    return String(diasSemana)
        .split(',')
        .map(normalizarTexto)
        .some(dia => dia === diaActual);
}

function calcularSlotInicial(horaPrimeraToma, frecuenciaHoras, referencia) {
    const frecuencia = Number(frecuenciaHoras);
    if (!Number.isFinite(frecuencia) || frecuencia <= 0) return null;

    const { hours, minutes } = parsearHora(horaPrimeraToma);
    const pasoMs = frecuencia * 60 * 60 * 1000;
    const slot = new Date(referencia);
    slot.setHours(hours, minutes, 0, 0);

    while (slot.getTime() > referencia.getTime()) {
        slot.setTime(slot.getTime() - pasoMs);
    }

    return { slot, pasoMs };
}

function calcularProximaFutura(horaPrimeraToma, frecuenciaHoras, tomasRegistradas, diasSemana) {
    const now = new Date();
    const base = calcularSlotInicial(horaPrimeraToma, frecuenciaHoras, now);
    if (!base) return null;

    const registradas = new Set(
        tomasRegistradas.map(t => new Date(t).getTime())
    );

    let slot = new Date(base.slot);
    const limiteBusqueda = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    while (slot <= limiteBusqueda) {
        const slotTime = slot.getTime();

        if (
            slotTime > now.getTime() - 60000 &&
            diaSemanaCoincide(diasSemana, slot) &&
            !registradas.has(slotTime)
        ) {
            return {
                fecha: new Date(slot),
                display: formato12h(slot)
            };
        }

        slot = new Date(slotTime + base.pasoMs);
    }

    return null;
}

router.get('/proximas/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;

    try {
        const [programaciones] = await db.query(`
            SELECT
                p.idProgramacion,
                m.nombre_medicamento,
                m.tipo_presentacion,
                m.dosis,
                p.hora_primera_toma,
                p.frecuencia_horas,
                p.dias_semana,
                p.fecha_fin
            FROM programacion_horarios p
            INNER JOIN medicamentos m ON p.id_medicamento_fk = m.idMedicamento
            WHERE m.id_usuario_fk = ?
              AND m.estado_medicamento = 'Activo'
              AND (p.fecha_fin IS NULL OR p.fecha_fin >= CURDATE())
        `, [idUsuario]);

        if (programaciones.length === 0) return res.json([]);

        const idsProg = programaciones.map(p => p.idProgramacion);

        const [historialProgramadas] = await db.query(`
            SELECT id_programacion_fk, fecha_hora_programada, fecha_programada_dt
            FROM historial_tomas
            WHERE id_programacion_fk IN (?)
              AND fecha_programada_dt >= DATE_SUB(NOW(), INTERVAL 1 DAY)
              AND fecha_programada_dt <= DATE_ADD(NOW(), INTERVAL 7 DAY)
              AND estado IN ('Tomado', 'No Tomado')
        `, [idsProg]);

        const registradasPorProg = {};
        for (const h of historialProgramadas) {
            if (!registradasPorProg[h.id_programacion_fk]) {
                registradasPorProg[h.id_programacion_fk] = [];
            }

            registradasPorProg[h.id_programacion_fk].push(
                new Date(h.fecha_programada_dt).getTime()
            );
        }

        const resultado = [];
        const now = new Date();
        const en24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        for (const prog of programaciones) {
            const registradas = registradasPorProg[prog.idProgramacion] || [];
            const proxima = calcularProximaFutura(
                prog.hora_primera_toma,
                prog.frecuencia_horas,
                registradas,
                prog.dias_semana
            );

            if (!proxima) continue;

            const { fecha, display } = proxima;

            if (fecha <= en24h) {
                resultado.push({
                    idProgramacion: prog.idProgramacion,
                    nombre_medicamento: prog.nombre_medicamento,
                    tipo_presentacion: prog.tipo_presentacion,
                    dosis: prog.dosis,
                    hora_primera_toma: prog.hora_primera_toma,
                    frecuencia_horas: prog.frecuencia_horas,
                    proxima_toma: display,
                    proxima_toma_fecha: fecha.toISOString(),
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

router.post('/tomar', async (req, res) => {
    const { id_programacion_fk, fecha_hora_programada, fecha_programada_dt, estado } = req.body;
    if (!id_programacion_fk || !estado) {
        return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    const fecha_real = new Date();
    const fecha_programada = fecha_programada_dt
        ? new Date(fecha_programada_dt)
        : (
            fecha_hora_programada
                ? new Date(`${new Date().toDateString()} ${fecha_hora_programada}`)
                : null
        );

    try {
        await db.query(
            `INSERT INTO historial_tomas
            (id_programacion_fk, fecha_hora_programada, fecha_hora_real, estado, fecha_programada_dt, fecha_real_dt)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                id_programacion_fk,
                fecha_hora_programada || '',
                '',
                estado,
                fecha_programada,
                fecha_real
            ]
        );

        console.log(` Toma: prog=${id_programacion_fk} estado=${estado} hora=${fecha_hora_programada}`);
        res.status(201).json({ mensaje: 'Registro guardado' });
    } catch (err) {
        console.error('Error tomar:', err.message);
        res.status(500).json({ error: err.message });
    }
});

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

router.delete('/eliminar/:idToma', async (req, res) => {
    const { idToma } = req.params;
    try {
        await db.query('DELETE FROM historial_tomas WHERE idToma = ?', [idToma]);
        res.json({ mensaje: 'Eliminado' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
