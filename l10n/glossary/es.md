# Spanish (es)

**Status: draft.** Written for Tally 1.4.2 without a native speaker; it awaits a native speaker's review (the
notes at the end list what to check first).

## Tone and address

Informal “tú” throughout (“Elige una cuenta”, “Ayer gastaste…”), as everyday Spanish apps do: Tally is a personal
notebook, and “usted” would sound distant. The Spanish is neutral and international, meant to read naturally in Spain
and in Latin America: no regional words (“teléfono”, never “móvil” or “celular”), no vosotros, past events in the
simple past (“No anotaste nada”), which is natural everywhere. Quotes are “ ”. Amounts and dates come from the phone's
locale, so texts only say “el {{date}}” and never assume a format.

## Terms

| English | Spanish | Notes |
|---|---|---|
| entry | movimiento | the usual banking word for one line in a statement |
| account | cuenta | |
| balance | saldo | |
| balance fix | ajuste de saldo | verb: ajustar |
| spending / spent | gasto / gastado | “Gastos” for the summary and the donut |
| money in / received / income | ingreso / recibido / ingresos | |
| transfer | transferencia (verb: transferir) | |
| fee | comisión | |
| loan / borrowed | deuda / recibido, “te prestó” | money the user borrowed and owes |
| lending / lent | préstamo / prestado, “prestaste” | money the user lent; they owe the user |
| payment / paid back / got back | pago / devuelto, “devolviste” / cobrado, “cobraste” | |
| payback day / return by | día de cobro / plazo de pago | “Cobro el {{date}}” / “Plazo: {{date}}” |
| due | fecha de pago; “vence” in notifications | |
| written off / forgiven | dado por perdido / perdonada | “perdonada” agrees with “deuda” |
| cleared | saldado; status tag “Todo pagado” | |
| asset | bien (tab: Activos) | “Otros bienes” for things that aren't accounts |
| liabilities | pasivos | tab name; the total line says “Debes” |
| net worth | patrimonio | |
| category | categoría | |
| payee (paid to / received from) | Pagado a / Recibido de | |
| archive / archived | archivar / archivada | agrees with “cuenta” |
| backup / auto backup / restore | copia / copia automática / restaurar | short for “copia de seguridad” |
| evening nudge | aviso de la noche | |
| balance check | revisión de saldos | |
| notebook | cuaderno | |

## Notes for reviewers

- **Loan vs lending.** Spanish has one word, “préstamo”, for both directions. To keep them apart everywhere (rows,
  buttons, titles), money the user borrowed is a **deuda** and money the user lent is a **préstamo**, as several
  Spanish finance apps do. Please check that this reads naturally; everyday speech also uses “préstamo” for a bank
  loan the user took.
- **Loan status tags** (`loan.st.*`) are shared by deudas (feminine) and préstamos (masculine), so they avoid
  gendered adjectives: “En curso”, “Pago parcial”, “Con retraso”, “Todo pagado”. Only “Dado por perdido” (lendings
  only) and “Perdonada” (loans only) agree with their noun. “Mostrar lo pagado” avoids the same problem.
- **Icon search** only knows English names, so the search placeholder says so: “Busca en inglés: coffee, car, gift…”.
  If the emblem names are ever translated, change it to Spanish examples.
- **Regional words chosen for both sides of the Atlantic:** “Añadir” (Latin America often says “Agregar”),
  “Billetera móvil” (Spain may say “monedero”), “Cantidad” instead of “Importe” (Spain) or “Monto” (Latin America),
  “Promedio”, “mantén presionado”, “retiro” (cash-out; Spain says “retirada”), “Marrón”.
- **Categories:** “Súper” (groceries, colloquial but common everywhere), “Comer fuera” (eating out), “Vivienda” for
  `cat.housing` (its English label is Rent, but “Alquiler”, “Renta” and “Arriendo” are each regional), “Facturas”
  for bills (Latin America also says “Servicios” or “Cuentas”, the latter clashing with accounts).
- **Tabs “Activos” / “Pasivos”** are understood but a little bookish; “Tienes” / “Debes” would be plainer if a native
  speaker prefers.
- `settings.themes.system` is “Sistema”, the word Spanish Android uses, rather than a literal “Teléfono”.
