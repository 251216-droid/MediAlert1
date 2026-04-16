const admin = require('../config/firebase');
const db    = require('../config/db');

// ── Parsear "1:30 PM" → Date de hoy ──────────────────────────────────────────
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

// ── Calcular próximo slot futuro ──────────────────────────────────────────────
function calcularProximaSlot(horaPrimeraToma, frecuenciaHoras) {
    const base   = parsearHoraHoy(horaPrimeraToma);
    const ahora  = new Date();
    const finDia = new Date();
    finDia.setHours(23, 59, 59, 999);

    let slot = new Date(base);
    while (slot <= finDia) {
        if (slot > ahora) return slot;
        slot = new Date(slot.getTime() + frecuenciaHoras * 60 * 60 * 1000);
    }
    return null;
}

// ── Enviar notificación FCM ───────────────────────────────────────────────────
// Usamos data-only payload para que onMessageReceived sea llamado SIEMPRE,
// incluso cuando la app está en background o cerrada.
// Esto garantiza que la app construya la notificación con los botones.
async function enviarNotificacionMedicamento(idUsuario, idProgramacion, nombreMedicamento, dosis) {
    try {
        const [rows] = await db.query(
            'SELECT fcm_token FROM usuarios WHERE idUsuario = ?',
            [idUsuario]
        );

        if (rows.length === 0 || !rows[0].fcm_token) {
            console.log(`⚠️  Usuario ${idUsuario} sin token FCM registrado`);
            return false;
        }

        const fcmToken = rows[0].fcm_token;

        const mensaje = {
            token: fcmToken,

            // DATA-ONLY payload: onMessageReceived es llamado siempre
            // (foreground, background, app cerrada)
            data: {
                idProgramacion: String(idProgramacion),
                nombre:         nombreMedicamento,
                dosis:          String(dosis || '')
            },

            // Configuración Android para garantizar entrega inmediata
            android: {
                priority: 'high',           // Prioridad alta = entrega inmediata
                ttl:      300,              // TTL en segundos (5 minutos)
                // Configuración de la notificación que ayuda al sistema a priorizar
                // el mensaje aunque la app esté cerrada (Doze mode)
                notification: {
                    channelId:             'medialert_reminders',
                    notificationPriority:  'PRIORITY_MAX',
                    visibility:            'PUBLIC',
                    defaultSound:          true,
                    defaultVibrateTimings: true,
                    // clickAction vacío para que lo maneje la app
                }
            }
        };

        const respuesta = await admin.messaging().send(mensaje);
        console.log(`✅ FCM → usuario=${idUsuario} prog=${idProgramacion} medicamento="${nombreMedicamento}" | ID: ${respuesta}`);
        return true;

    } catch (error) {
        if (error.code === 'messaging/registration-token-not-registered' ||
            error.code === 'messaging/invalid-registration-token') {
            console.log(`⚠️  Token FCM inválido para usuario ${idUsuario}, limpiando...`);
            await db.query('UPDATE usuarios SET fcm_token = NULL WHERE idUsuario = ?', [idUsuario]);
        }
        console.error(`❌ Error FCM usuario=${idUsuario}:`, error.message);
        return false;
    }
}

// ── Cron: ejecutado cada minuto ───────────────────────────────────────────────
// Reglas:
//   • Tomado / No Tomado hoy  → no notificar más
//   • Pospuesto               → renotificar si pasaron ~5 min desde el último Pospuesto
//   • Sin registro + slot próximo en 5 min → notificar primera vez
async function enviarNotificacionesProximas() {
    try {
        const [programaciones] = await db.query(`
            SELECT
                p.idProgramacion,
                p.hora_primera_toma,
                p.frecuencia_horas,
                m.nombre_medicamento,
                m.dosis,
                m.id_usuario_fk AS idUsuario
            FROM programacion_horarios p
            INNER JOIN medicamentos m  ON p.id_medicamento_fk = m.idMedicamento
            INNER JOIN usuarios u      ON m.id_usuario_fk = u.idUsuario
            WHERE m.estado_medicamento = 'Activo'
              AND (p.fecha_fin IS NULL OR p.fecha_fin >= CURDATE())
              AND u.fcm_token IS NOT NULL
        `);

        if (programaciones.length === 0) return;

        const ahora  = new Date();
        // Ventana de 1 minuto: notificar solo cuando el slot ya llegó o está a ≤60s
        // Esto evita que el cron dispare 3-5 min antes de la hora real.
        const en1min = new Date(ahora.getTime() + 60 * 1000);
        let enviadas = 0;

        for (const prog of programaciones) {
            // Último registro de hoy para esta programación
            const [ultimoHoy] = await db.query(`
                SELECT estado, creado_en
                FROM historial_tomas
                WHERE id_programacion_fk = ?
                  AND DATE(creado_en) = CURDATE()
                ORDER BY idToma DESC
                LIMIT 1
            `, [prog.idProgramacion]);

            const ultimoEstado = ultimoHoy.length > 0 ? ultimoHoy[0].estado : null;

            if (ultimoEstado === 'Tomado' || ultimoEstado === 'No Tomado') {
                continue;
            }

            if (ultimoEstado === 'Pospuesto') {
                const creado = new Date(ultimoHoy[0].creado_en);
                const minutos = (ahora - creado) / (1000 * 60);
                if (minutos >= 4.5 && minutos <= 6.5) {
                    const ok = await enviarNotificacionMedicamento(
                        prog.idUsuario, prog.idProgramacion,
                        prog.nombre_medicamento, prog.dosis || ''
                    );
                    if (ok) {
                        enviadas++;
                        console.log(`⏰ Renotificación POSPUESTO: "${prog.nombre_medicamento}" (${minutos.toFixed(1)} min después)`);
                    }
                }
                continue;
            }

            // ── Normal: slot próximo en los próximos 5 min → notificar ────
            const proximaSlot = calcularProximaSlot(prog.hora_primera_toma, prog.frecuencia_horas);
            if (!proximaSlot) continue;

            if (proximaSlot >= ahora && proximaSlot <= en1min) {
                // Evitar duplicados: ¿ya se mandó notificación en los últimos 2 min?
                const [reciente] = await db.query(`
                    SELECT idToma FROM historial_tomas
                    WHERE id_programacion_fk = ?
                      AND creado_en >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
                    LIMIT 1
                `, [prog.idProgramacion]);

                if (reciente.length > 0) continue;

                const ok = await enviarNotificacionMedicamento(
                    prog.idUsuario, prog.idProgramacion,
                    prog.nombre_medicamento, prog.dosis || ''
                );
                if (ok) enviadas++;
            }
        }

        if (enviadas > 0) {
            console.log(`📬 Cron FCM: ${enviadas} notificación(es) enviada(s) — ${ahora.toLocaleTimeString('es-MX')}`);
        }

    } catch (err) {
        console.error('❌ Error en cron FCM:', err.message);
    }
}

module.exports = { enviarNotificacionMedicamento, enviarNotificacionesProximas };