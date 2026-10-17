# Compra Clara · pruebas móviles

Web estática sin compilación, dependencias externas, analítica ni IA en el navegador. Solo contiene datos ficticios. Versión 0.2.

## Publicación prevista

Repositorio: miGUITel/compra-clara-web (público).

1. Crear el repositorio con una rama main.
2. Subir este directorio conservando docs/.
3. En Settings → Pages, elegir Deploy from a branch, main y /docs; pulsar Save.
4. Esperar el despliegue y comprobar la URL que GitHub muestre. La URL prevista es https://miGUITel.github.io/compra-clara-web/; no está activa hasta que se publique correctamente.

Referencia oficial: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Uso de la demo

Añadir y editar productos, marcar comprados, filtrar, copiar pendientes, añadir propuestas, indicar existencias, excluir productos, cambiar fechas, exportar JSON y restablecer. El botón Secciones muestra u oculta los encabezados y recuerda la elección; se mantiene el orden numérico, incluida la sección 3.1.

Los cambios permanecen en localStorage de ese navegador y origen. El portátil y el móvil tienen listas independientes. Las propuestas son ejemplos fijos. La app no lee tickets, no envía compras a GitHub y no funciona sin conexión garantizada. Exportar copia antes de borrar datos del navegador.

## Estructura

- docs/index.html: interfaz.
- docs/styles.css: estilos con fuentes del sistema, contraste reforzado y filas compactas.
- docs/app.mjs: interacción y guardado local.
- docs/logic.mjs: orden, cantidades y validación.
- docs/data.json: catálogo y propuestas ficticios.
- docs/.nojekyll: publicación estática directa.

## Próxima fase: datos privados

El repositorio privado miGUITel/compra-clara-datos está reservado para la siguiente fase, separado de esta web. Mantener catálogo, reglas y propuestas revisadas en JSON versionados y el estado diario en un archivo independiente. Si se replica el acceso de la app de UT/Módulos, el token irá solo en memoria y las escrituras comprobarán el SHA antes de guardar. Esa integración aún no está implementada.

El análisis periódico prepara datos y explica propuestas; la app aplica esas reglas fijas. Nunca incluir tokens, tickets, precios pagados ni historiales personales en el repositorio público.

## Comprobación en móvil después de publicar

- Abrir a 320–430 px: ninguna fila debe obligar a desplazarse horizontalmente.
- Añadir un producto, cambiar cantidad, marcarlo y comprobar los tres filtros.
- Activar/desactivar Secciones: mismo orden y misma lista; recargar y comprobar la preferencia.
- Probar Añadir, Tengo, fechas y copia de pendientes.
- Recargar y comprobar que se conserva la lista.
- Comprobar texto legible en las tarjetas de propuestas y fecha.

## Cambios 0.2

Corregido el empaquetado de estilos del HTML portátil: el import de Google Fonts incluía puntos y coma dentro de la URL y el recorte anterior eliminaba las variables CSS. Ahora se usan fuentes del sistema. Textos secundarios más oscuros, controles de 44 px, filas más compactas, menos cabecera en móvil y secciones opcionales, ocultas al iniciar.
