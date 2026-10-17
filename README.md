# Compra Clara · versión 0.3

Interfaz y demo para probar en el móvil. Web estática publicada en https://miguitel.github.io/compra-clara-web/ mediante GitHub Pages: rama main, carpeta /docs.

## Conectar los datos privados

1. Pulsa Conectar en la cabecera, o Conectar mis datos en Preferencias.
2. Introduce directamente en la web un token de GitHub con acceso al repositorio privado miGUITel/compra-clara-datos y Contents: lectura y escritura. Un token fine-grained limitado a ese repositorio es suficiente. No pegues el token en mensajes ni archivos.
3. La app carga catálogo, reglas, propuestas y lista. No mezcla la demo con la lista privada.
4. Añade productos, indica cantidades y marca lo comprado. Pulsa Guardar en GitHub para enviar los cambios.
5. En otro dispositivo, conecta y pulsa Actualizar para recuperar la última lista.

Las credenciales del conector del asistente no se comparten con la web. El usuario introduce su propio token. La primera conexión y el primer guardado con ese token requieren comprobación en la web; las pruebas simuladas no acreditan sus permisos personales.

## Datos y guardado

- El repositorio público contiene solo código y datos ficticios de demostración.
- La demo conserva su lista en localStorage. Los datos privados y el token permanecen solo en memoria; no se almacenan en localStorage, sessionStorage, IndexedDB, cookies ni archivos de configuración.
- Recargar o cerrar termina la conexión. Los cambios pendientes se perderían; el navegador avisa y se ofrece Descargar copia.
- Desconectar limpia las referencias a credenciales y datos privados, y vuelve a la demo.
- La app lee las cuatro referencias privadas desde un mismo commit para evitar mezclar versiones.
- Solo escribe estado.json, con el SHA de la versión leída. No modifica el catálogo, las reglas ni las propuestas revisadas por el asistente.
- Después de escribir vuelve a leer el archivo del commit confirmado y comprueba el contenido. Los fallos de red, respuestas incompletas y errores del servidor pueden dejar un resultado incierto: se conserva el borrador y se bloquea el reenvío.
- Si hay conflicto, Revisar GitHub permite comparar ambas listas, descargar el borrador y elegir explícitamente cargar la versión de GitHub. Una lectura fallida conserva lo anterior. No hay reintentos ni sobrescrituras automáticas.
- Se conservan campos adicionales de estado.json, productos añadidos manualmente y correcciones anteriores.

Las propuestas son datos fijos preparados por el asistente. Cambiar fechas no recalcula un menú ni estima existencias. La app no ejecuta IA, no lee Drive, no analiza nuevos tickets y no garantiza funcionamiento sin conexión.

## Interfaz

Filas compactas, contraste reforzado, controles de 44 px y secciones opcionales. Ocultar secciones conserva el recorrido numérico, incluida la sección 3.1 entre 3 y 4.

Se pueden añadir, editar y retirar productos, marcar comprados, filtrar, copiar pendientes, revisar propuestas, indicar Todavía tengo o Ya no lo compro, cambiar fechas y exportar la lista. Los productos sin cantidad confirmada requieren que se indique al añadirlos. Añadir propuestas incorpora las que ya tienen cantidad orientativa; las demás se revisan individualmente.

## Código

- docs/app.mjs: interfaz, separación entre demo y sesión privada.
- docs/logic.mjs: orden, cantidades y validación básica.
- docs/data-model.mjs: validación de los documentos privados.
- docs/github-store.mjs: acceso exclusivo al repositorio privado, UTF-8, SHA y confirmación de guardados.
- docs/private-session.mjs: borrador, operaciones pendientes, bloqueo y revisión.
- docs/data.json: ejemplos públicos ficticios.
- tests/private-data.test.mjs: pruebas sintéticas sin enviar datos a GitHub.

No se usan dependencias externas, CDN ni scripts de terceros. La política CSP limita código y estilos al mismo origen y conexiones al propio origen y api.github.com. Los textos privados se escapan antes de mostrarse.

## Verificación

Ejecutar: node --test tests/private-data.test.mjs

Las pruebas cubren lecturas coherentes, escritura con SHA, dos dispositivos, conservación del borrador, respuestas perdidas, errores de permisos, datos inválidos, campos adicionales, UTF-8, desconexión y bloqueo de envíos simultáneos. No crean productos de prueba en los datos reales.

Documentación de referencia: https://docs.github.com/en/rest/repos/contents y https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
