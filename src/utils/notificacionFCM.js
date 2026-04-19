const admin = require('../config/firebase');
const db = require('../config/db');

function parsearHoraHoy(horaStr) {
    const partes = horaStr.trim().split(/[\s:]+/);
    let h = parseInt(partes[0]) || 0;
    const m = parseInt(partes[1]) || 0;
    const ampm = (partes[2] || '').toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

function formatearFechaSql(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
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

    const base = parsearHoraHoy(horaPrimeraToma);
    const pasoMs = frecuencia * 60 * 60 * 1000;
    const slot = new Date(referencia);
    slot.setHours(base.getHours(), base.getMinutes(), 0, 0);

    while (slot.getTime() > referencia.getTime()) {
        slot.setTime(slot.getTime() - pasoMs);
    }

    return { slot, pasoMs };
}

function calcularProximaSlot(horaPrimeraToma, frecuenciaHoras, inicioVentana, finVentana, diasSemana) {
    const base = calcularSlotInicial(horaPrimeraToma, frecuenciaHoras, inicioVentana);
    if (!base) return null;

    const limiteBusqueda = new Date(finVentana.getTime() + 24 * 60 * 60 * 1000);

    let slot = new Date(base.slot);
    while (slot <= limiteBusqueda) {
        if (
            slot >= inicioVentana &&
            slot <= finVentana &&
            diaSemanaCoincide(diasSemana, slot)
        ) {
            return slot;
        }

        slot = new Date(slot.getTime() + base.pasoMs);
    }

    return null;
}

async function enviarNotificacionMedicamento(idUsuario, idProgramacion, nombreMedicamento, dosis) {
    try {
        const [rows] = await db.query(
            'SELECT fcm_token FROM usuarios WHERE idUsuario = ?',
            [idUsuario]
        );

        if (rows.length === 0 || !rows[0].fcm_token) {
            console.log(`  Usuario ${idUsuario} sin token FCM registrado`);
            return false;
        }

        const fcmToken = rows[0].fcm_token;

        const mensaje = {
            token: fcmToken,
            data: {
                idProgramacion: String(idProgramacion),
                nombre: nombreMedicamento,
                dosis: String(dosis || '')
            },
            android: {
                priority: 'high',
                ttl: 300,
                notification: {
                    channelId: 'medialert_reminders',
                    notificationPriority: 'PRIORITY_MAX',
                    visibility: 'PUBLIC',
                    defaultSound: true,
                    defaultVibrateTimings: true
                }
            }
        };

        const respuesta = await admin.messaging().send(mensaje);
        console.log(` FCM -> usuario=${idUsuario} prog=${idProgramacion} medicamento="${nombreMedicamento}" | ID: ${respuesta}`);
        return true;
    } catch (error) {
        if (
            error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token'
        ) {
            console.log(`  Token FCM invalido para usuario ${idUsuario}, limpiando...`);
            await db.query('UPDATE usuarios SET fcm_token = NULL WHERE idUsuario = ?', [idUsuario]);
        }

        console.error(error);
        console.error(`Error FCM usuario=${idUsuario}:`, error.message);
        return false;
    }
}

async function enviarNotificacionesProximas() {
    try {
        const [programaciones] = await db.query(`
            SELECT
                p.idProgramacion,
                p.hora_primera_toma,
                p.frecuencia_horas,
                p.dias_semana,
                m.nombre_medicamento,
                m.dosis,
                m.id_usuario_fk AS idUsuario
            FROM programacion_horarios p
            INNER JOIN medicamentos m ON p.id_medicamento_fk = m.idMedicamento
            INNER JOIN usuarios u ON m.id_usuario_fk = u.idUsuario
            WHERE m.estado_medicamento = 'Activo'
              AND (p.fecha_fin IS NULL OR p.fecha_fin >= CURDATE())
              AND u.fcm_token IS NOT NULL
        `);

        if (programaciones.length === 0) return;

        const ahora = new Date();
        const en1min = new Date(ahora.getTime() + 60 * 1000);
        let enviadas = 0;

        for (const prog of programaciones) {
            const proximaSlot = calcularProximaSlot(
                prog.hora_primera_toma,
                prog.frecuencia_horas,
                ahora,
                en1min,
                prog.dias_semana
            );

            if (!proximaSlot) continue;

            const fechaSlotSql = formatearFechaSql(proximaSlot);

            const [historialSlot] = await db.query(`
                SELECT estado, fecha_real_dt
                FROM historial_tomas
                WHERE id_programacion_fk = ?
                  AND fecha_programada_dt = ?
                ORDER BY idToma DESC
                LIMIT 1
            `, [prog.idProgramacion, fechaSlotSql]);

            if (historialSlot.length > 0) {
                const ultimoEstado = historialSlot[0].estado;

                if (ultimoEstado === 'Tomado' || ultimoEstado === 'No Tomado') {
                    continue;
                }

                if (ultimoEstado === 'Pospuesto') {
                    const creado = new Date(historialSlot[0].fecha_real_dt);
                    const minutos = (ahora - creado) / (1000 * 60);

                    if (minutos >= 4.5 && minutos <= 6.5) {
                        const ok = await enviarNotificacionMedicamento(
                            prog.idUsuario,
                            prog.idProgramacion,
                            prog.nombre_medicamento,
                            prog.dosis || ''
                        );

                        if (ok) {
                            enviadas++;
                            console.log(` Renotificacion POSPUESTO: "${prog.nombre_medicamento}" (${minutos.toFixed(1)} min despues)`);
                        }
                    }

                    continue;
                }
            }

            const [reciente] = await db.query(`
                SELECT idToma FROM historial_tomas
                WHERE id_programacion_fk = ?
                  AND fecha_real_dt >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
                LIMIT 1
            `, [prog.idProgramacion]);

            if (reciente.length > 0) continue;

            const ok = await enviarNotificacionMedicamento(
                prog.idUsuario,
                prog.idProgramacion,
                prog.nombre_medicamento,
                prog.dosis || ''
            );

            if (ok) enviadas++;
        }

        if (enviadas > 0) {
            console.log(` Cron FCM: ${enviadas} notificacion(es) enviada(s) - ${ahora.toLocaleTimeString('es-MX')}`);
        }
    } catch (err) {
        console.error(' Error en cron FCM:', err.message);
    }
}

module.exports = { enviarNotificacionMedicamento, enviarNotificacionesProximas };
