const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 1. REGISTRO DE USUARIO
const registrarUsuario = async (req, res) => {
    try {
        const { nombre_completo, correo, password } = req.body;

        // Verificar si el correo ya existe en la BD
        const [usuariosExistentes] = await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        if (usuariosExistentes.length > 0) {
            return res.status(400).json({ mensaje: 'El correo ya está registrado' });
        }

        // Encriptar la contraseña (¡Magia de seguridad!)
        const salt = await bcrypt.genSalt(10);
        const passwordEncriptada = await bcrypt.hash(password, salt);

        // Guardar usuario en MySQL con la contraseña encriptada
        const [resultado] = await db.query(
            'INSERT INTO usuarios (nombre_completo, correo, password) VALUES (?, ?, ?)',
            [nombre_completo, correo, passwordEncriptada]
        );

        res.status(201).json({ 
            mensaje: 'Usuario registrado exitosamente', 
            idUsuario: resultado.insertId 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error en el servidor al registrar' });
    }
};

// 2. INICIO DE SESIÓN (LOGIN)
const loginUsuario = async (req, res) => {
    try {
        const { correo, password } = req.body;

        // Buscar al usuario por su correo
        const [usuarios] = await db.query('SELECT * FROM usuarios WHERE correo = ?', [correo]);
        if (usuarios.length === 0) {
            return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
        }

        const usuario = usuarios[0];

        // Comparar la contraseña que escribió el usuario con la encriptada en la BD
        const passwordValida = await bcrypt.compare(password, usuario.password);
        if (!passwordValida) {
            return res.status(401).json({ mensaje: 'Credenciales incorrectas' });
        }

        // Si todo está bien, generamos el Token JWT (El "Gafete") válido por 24 horas
        const token = jwt.sign(
            { idUsuario: usuario.idUsuario, correo: usuario.correo },
            process.env.JWT_SECRET,
            { expiresIn: '24h' } 
        );

        res.status(200).json({
            mensaje: 'Login exitoso',
            token: token,
            usuario: {
                idUsuario: usuario.idUsuario,
                nombre_completo: usuario.nombre_completo,
                correo: usuario.correo
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ mensaje: 'Error en el servidor al iniciar sesión' });
    }
};

module.exports = { registrarUsuario, loginUsuario };