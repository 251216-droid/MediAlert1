# 1. Usamos Node 18
FROM node:18-slim

# 2. Directorio de trabajo
WORKDIR /app

# 3. Copiamos los archivos de dependencias
COPY package*.json ./

# 4. Instalamos las librerías (limpiando caché para que sea más rápido)
RUN npm install --production

# 5. Copiamos el resto del código
COPY . .

# 6. Railway asigna el puerto dinámicamente, pero exponemos el 3000 por defecto
EXPOSE 3000

# 7. Usamos el script de arranque oficial que pusimos en el package.json
CMD ["npm", "start"]