/**
 * Cambia la URL pública del sitio en todos los archivos SEO estáticos.
 *
 *   npm run set-url -- https://www.alquilapty.com
 *
 * Actualiza: <link rel="canonical">, Open Graph, JSON-LD (en frontend/index.html),
 * frontend/robots.txt y frontend/sitemap.xml. En el backend, define la variable
 * de entorno SITE_URL con el mismo valor.
 */
const fs = require('fs');
const path = require('path');

const OLD = 'https://gianmontilla1607.github.io/Alquiler';
const next = (process.argv[2] || '').replace(/\/$/, '');

if (!/^https?:\/\/[^\s/]+/.test(next)) {
  console.error('Uso: npm run set-url -- https://tu-dominio.com');
  process.exit(1);
}

const files = ['index.html', 'robots.txt', 'sitemap.xml'].map((f) => path.join(__dirname, '..', 'frontend', f));
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.split(OLD).join(next);
  fs.writeFileSync(file, after);
  console.log(`${path.basename(file)}: ${before.split(OLD).length - 1} reemplazos`);
}
console.log(`\nListo. Recuerda ejecutar el backend con SITE_URL=${next}`);
