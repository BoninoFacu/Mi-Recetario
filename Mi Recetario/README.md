# Mi recetario

App local para guardar, consultar, cocinar e imprimir recetas.

## Archivos principales

- `Recetario_V5m.html`: estructura de la app. Abrir este archivo en el navegador.
- `styles.css`: colores, layout, tarjetas, modales, modo cocina y responsive.
- `app.js`: datos, renderizado, formularios, sincronizacion, importacion, compras y eventos.
- `assets/logo.jpg`: logo que se muestra en la cabecera.

## Donde cambiar cosas comunes

- Nombre visible de la app: `Recetario_V5m.html`.
- Colores principales: variables `:root` al inicio de `styles.css`.
- Textos, botones y estructura: `Recetario_V5m.html`.
- Comportamiento de recetas: secciones comentadas de `app.js`.
- Google Sheets: seccion de sincronizacion y constante `SCRIPT` en `app.js`.

## Notas de mantenimiento

- Mantener los archivos en UTF-8 para que acentos y emojis no se rompan.
- Evitar volver a pegar CSS o JS dentro del HTML salvo que sea algo muy puntual.
- Si se agregan nuevos archivos JS, cargarlos al final de `Recetario_V5m.html` y respetar el orden de dependencias.
