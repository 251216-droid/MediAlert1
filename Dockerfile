# Usa una versión de Node.js (la 18 es estable y recomendada)
FROM node:18

# Crea la carpeta de trabajo dentro del servidor
WORKDIR /app

# Copia los archivos de configuración de dependencias
COPY package*.json ./

# Instala las librerías de tu proyecto
RUN npm install

# Copia todo el resto de tu código a la carpeta /app
COPY . .

# Expone el puerto que usa tu app (según tu código es el 3000)
EXPOSE 3000

# Comando para arrancar tu aplicación
CMD ["node", "index.js"]