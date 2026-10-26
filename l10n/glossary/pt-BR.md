# Português (Brasil): term choices

**Status: draft.** Written for Tally 1.4.2 without a native speaker; it awaits a native speaker's review (the
notes at the end list what to check first).

## Tone and address

Tally speaks to the user as **“você”**, in Brazilian Portuguese, the way well-made everyday apps in Brazil do
(Nubank, Google, Android itself): friendly, direct, short sentences, no “o senhor”, no “tu”. Verbs are in the
imperative of “você” (“Toque”, “Escolha”, “Digite”). Words follow Android’s own pt-BR wording where it exists
(“Salvar”, “Excluir”, “Configurações”, “Alarmes e lembretes”, “arquivo”, “celular”).

The same text is shown in Portugal, so slang that only works in Brazil is avoided; standard Brazilian vocabulary
(celular, arquivo, salvar, aluguel) is kept, since Portuguese users read it without trouble.

## Terms

| English | Português (Brasil) |
|---|---|
| entry | lançamento |
| account | conta |
| balance | saldo |
| balance fix | ajuste de saldo |
| spending / spent | gastos / gasto, gastou |
| money in / received / income | entrada / recebido / entrada (category: Ganhos) |
| transfer | transferência (button and verb: Transferir) |
| fee | taxa |
| loan / borrowed | dívida / pegou emprestado (“Peguei emprestado”) |
| lending / lent | empréstimo / emprestou, emprestado |
| payment / paid back / got back | pagamento / devolvido, pagou / recebido de volta |
| payback day / return by | dia de receber / devolver até |
| due | vencimento, vence |
| written off / forgiven | dado como perdido / perdoada |
| cleared | quitado, tudo pago |
| asset | bem (tab: Ativos; “Outros bens”) |
| liabilities | Passivos |
| net worth | patrimônio líquido |
| category | categoria |
| payee (paid to / received from) | Pago a / Recebido de |
| archive / archived | arquivar / arquivada |
| backup / auto backup / restore | backup / backup automático / restaurar |
| evening nudge | lembrete da noite |
| balance check | conferir saldos (“Seus saldos ainda conferem?”) |
| notebook | caderno |

## Notes for reviewers

- **Loan direction.** Portuguese “empréstimo” works both ways, so Tally keeps the two apart with two nouns:
  **empréstimo** is always money the user lent (they owe the user), **dívida** is always money the user borrowed
  (the user owes it). Every loan and lending text was written with that split; please check it holds.
- **Gender.** “dívida” is feminine and “empréstimo” masculine, but some texts are shared by both kinds. Those use
  neutral wording: status “Em aberto”, “Pago em parte”, “Em atraso”, “Tudo pago”; “De volta em aberto”;
  “Mostrar o que foi pago”. “Dado como perdido” only applies to lendings, “Perdoada” only to loans (dívidas).
- **Home buttons** “Dívida” / “Emprestar”: the buttons are narrow (about 116 px of text at a larger font), so
  “Pegar emprestado” didn’t fit.
- **Assets / Liabilities** as “Ativos” / “Passivos”: standard and short, slightly formal. “Bens” is used for single
  items (a gold ring, a laptop).
- **“celular”** for “phone” (Portugal says “telemóvel”); **“Aluguel”** for Rent (Portugal: “Renda”, which in Brazil
  means income, so “Renda” is avoided for income too: the income category is “Ganhos”).
- **“Contas”** (bills) as a spending category is the everyday Brazilian word but is the same word as “conta”
  (account); the icon tells them apart.
- **Plurals.** CLDR gives Portuguese the forms one/many/other, and “one” covers 0 as well as 1 (“0 selecionado”).
  The “many” form (for very large round numbers) is the same as “other”.
- **“Página de hoje aberta”** (after confirming the morning balances) keeps the notebook-page picture of the English.
