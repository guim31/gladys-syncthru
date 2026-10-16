# Samsung SyncThru

## Presentación

Esta integración sigue sus **impresoras Samsung** (Xpress, ProXpress, MultiXpress, CLP, CLX, SCX,
ML… y los modelos HP de la antigua gama Samsung que conservaron la misma interfaz web) a través de
su servicio web integrado **SyncThru**: el estado de la impresora, el nivel de cada tóner, las
unidades de imagen (tambores), las bandejas de papel y el contador de páginas. Todo se queda en su
red local: sin nube, sin cuenta, sin contraseña.

Es de **solo lectura**: no imprime nada, no cambia ningún ajuste de la impresora y no ofrece nada
que encender o apagar.

Completa la integración **IPP Printers**, para los modelos Samsung cuyo servicio IPP no informa de
los consumibles.

> **Desarrollada sin el hardware: sus comentarios son bienvenidos.** La integración se escribió y
> se probó con respuestas reales de SyncThru publicadas por los proyectos pysyncthru y Home
> Assistant, no con una impresora. Si falta algo o un valor es incorrecto en la suya, abra una
> issue en el repositorio de GitHub con el resultado del botón **Probar una impresora**.

Sin relación con Samsung ni con HP.

## Requisitos

- Gladys Assistant 5.1 o posterior.
- Una impresora Samsung conectada a su red (Ethernet o Wi-Fi), cuya página **SyncThru** se abre en
  un navegador en `http://<dirección de la impresora>/`. La integración lee
  `http://<dirección de la impresora>/sws/app/information/home/home.json`: si esta dirección
  muestra una página de texto en su navegador, la impresora es compatible.
- Mejor: una dirección fija para la impresora (una reserva DHCP en su router). La integración busca
  una impresora que cambió de dirección, pero una dirección fija es más fiable.

## Configuración

1. Instale la integración desde la tienda (o **Integraciones → Instalar desde GitHub** con la
   dirección del repositorio).
2. Abra su pestaña **Configuración**:
   - **Impresoras (lista manual)**: opcional. Las direcciones IP o nombres de host de sus
     impresoras, separados por comas (`192.168.1.20, impresora.local`). También sirve una dirección
     `http://` o `https://` con puerto. Rellénela cuando la impresora no se encuentra
     automáticamente.
   - **Idioma de los nombres**: el idioma de los nombres de las funciones (fijados al añadir la
     impresora) y de los textos enviados a Gladys (estado, variables de escena). Francés por
     defecto.
   - **Intervalo de lectura**: la frecuencia de lectura de cada impresora, 60 segundos por defecto
     (30 a 3600).
   - **Umbral de consumible bajo**: el nivel, en %, al que se activa **Consumible casi agotado**
     (10 % por defecto). También colorea los indicadores del widget.
3. Guarde, abra la pestaña **Descubrir** y añada sus impresoras a Gladys.

Las impresoras que responden a la búsqueda de red (SSDP, como las encuentra Windows) aparecen en la
pestaña Descubrir sin escribir nada: Gladys envía la búsqueda y pasa las respuestas a la
integración, que solo conserva las que realmente ofrecen SyncThru.

Uso de la red: una pequeña solicitud por impresora en cada intervalo de lectura, los contadores de
páginas cada 15 minutos, y una búsqueda de red al iniciar, al abrir la pestaña Descubrir y como
mucho cada 30 minutos mientras una impresora no responde. Solo los valores que cambian se envían a
Gladys, y los estables de nuevo cada 6 horas.

## Dispositivos

Un dispositivo por impresora, con el nombre de su modelo y su ubicación (`Samsung C430W (Salón)`).
Sus funciones dependen de lo que indica la impresora:

| Función                                              | Tipo                        | Valor                                                                                                                       |
| ---------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Estado                                               | texto                       | Lista, Imprimiendo, En reposo, Calentando, Ocupada, Tóner bajo, Advertencia, Atasco de papel, Sin papel, Error, Inaccesible |
| En línea                                             | sensor de presencia (sí/no) | 1 cuando la impresora responde, 0 si no                                                                                     |
| Tóner negro / cian / magenta / amarillo              | nivel (%)                   | el tóner restante de cada cartucho                                                                                          |
| Tambor negro / …, Tambor de color                    | nivel (%)                   | la vida restante de la unidad de imagen, cuando la impresora la indica                                                      |
| Bandeja 1 … 5, Bandeja multiuso, Alimentación manual | texto                       | Lista, Vacía, o Alerta con el código de la impresora                                                                        |
| Papel bandeja                                        | nivel (%)                   | solo en los modelos que indican un nivel de papel                                                                           |
| Páginas impresas, Páginas copiadas                   | contador                    | los contadores de páginas, en los modelos que los ofrecen                                                                   |

Cuando la impresora no responde, **Estado** pasa a **Inaccesible** y **En línea** a 0; los demás
valores conservan su última lectura.

El **Estado** procede del estado que indica la impresora y del texto de su panel de control, en
inglés, francés, alemán o español: un atasco o una bandeja vacía se reconocen en el panel («Paper
Jam», «Bourrage», «Papierstau», «Atasco»…) y por los códigos de error de Samsung (`M1-1110`,
`M1-5112`).

## Widget

El widget **Impresora** muestra una impresora (la primera añadida si no se elige ninguna en sus
ajustes):

- hasta cinco indicadores, primero los tóneres y luego los tambores, coloreados según el umbral;
- el estado, el texto del panel, las bandejas, el contador de páginas y la hora de la última
  lectura;
- un botón **Actualizar** que lee la impresora en el acto.

## Disparadores de escena

Dos disparadores, en la categoría **Integraciones** del editor de escenas:

- **Consumible casi agotado**: un tóner o un tambor baja al umbral de la configuración. Filtro por
  impresora y por tipo de consumible (tóner, tambor). Transmite el nombre de la impresora, el
  consumible (`Tóner negro`) y su nivel.
- **Atasco o sin papel**: una impresora indica un atasco de papel o se ha quedado sin papel. Filtro
  por impresora y por problema. Transmite el nombre de la impresora, el problema en palabras y el
  texto del panel.

Cada uno se activa una vez, cuando empieza la situación. No se vuelve a activar tras un reinicio de
la integración o de Gladys para una situación ya presente.

Los niveles también son funciones normales de Gladys: el disparador del núcleo **Cambio de estado
del dispositivo** funciona con ellos, para un cartucho.

## Acción de configuración

**Probar una impresora**, en la pestaña Configuración: introduzca una dirección, la integración lee
la impresora en el acto y le indica lo que encontró (modelo, estado, niveles), o por qué no obtuvo
respuesta.

## Ejemplos de escenas

- **Pedir tóner a tiempo**: disparador _Consumible casi agotado_ (tipo: tóner) → acción _Enviar
  mensaje_ con las variables **Impresora**, **Consumible** y **Nivel (%)** (escriba `{{` en el
  mensaje para insertarlas): «Impresora de la oficina: Tóner negro al 10 %».
- **La impresora está bloqueada**: disparador _Atasco o sin papel_ → acción _Enviar mensaje_ con el
  problema y el texto del panel, a la persona más cercana.
- **Impresora olvidada encendida**: disparador _Cambio de estado del dispositivo_ en **En línea** a
  1, condición _después de las 22 h_ → un recordatorio, o apagar el enchufe inteligente de la
  impresora.

## Solución de problemas

- **Ninguna impresora en la pestaña Descubrir**: introduzca su dirección en la lista manual y luego
  use **Probar una impresora**. «No hay servicio JSON SyncThru» significa que la impresora no tiene
  página JSON de SyncThru: los modelos antiguos solo tienen páginas HTML, no compatibles.
- **«Sin respuesta»**: compruebe la dirección, que la impresora está encendida y no en reposo
  profundo, y que está en la misma red que Gladys. Algunas impresoras apagan su red en reposo
  profundo.
- **Una impresora con el número de serie oculto** (algunos firmwares muestran `xxxxxxxx`) se
  reconoce por su dirección MAC, o por su dirección: asígnele una dirección fija.
- **Más detalles**: ponga la variable de entorno `LOG_LEVEL` de la integración en `debug`.

## Limitaciones

- **Desarrollada sin el hardware**: los valores se comprobaron con respuestas publicadas de las
  M2070, C430W y C480FW, no con una impresora real. Los modelos HP no están comprobados.
- El **formato de papel** de las bandejas no se muestra: SyncThru da un código numérico cuyo
  significado no está documentado.
- El **nivel de papel** de una bandeja solo se lee en los modelos que lo indican, y se supone en %.
- La detección del atasco y de la bandeja vacía se basa en el texto del panel y en los códigos de
  error de Samsung: un panel configurado en otro idioma distinto de los cuatro anteriores puede
  mostrar solo **Advertencia** o **Error**.
- Las impresoras que solo tienen las antiguas páginas HTML de SyncThru (sin `home.json`) no son
  compatibles.
- Solo lectura: sin impresión, sin ajustes, sin reinicio a distancia.
- Los nombres de las funciones se fijan al añadir la impresora: cambiar el idioma después cambia
  los textos de estado, no los nombres.
