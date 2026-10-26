# French (fr)

**Status: draft.** Written for Tally 1.4.2 without a native speaker; it awaits a native speaker's review (the
notes at the end list what to check first).

## Tone and address

Tally addresses the user with “vous”, in standard French meant to read naturally in France, Belgium, Switzerland,
Canada and Africa. “Vous” is what most well-made everyday French apps use (banking, messaging, to-do apps). It is
friendly and polite without being formal, and “tu” would feel too familiar for an app about money. Sentences stay
short and plain (“C’était pour quoi ?”, “Rien de noté pour l’instant.”). Buttons use the infinitive (“Enregistrer”,
“Prêter”); hints and messages address the user directly (“Saisissez un montant”). Typography: the apostrophe is ’,
quotes are « … » with no-break spaces inside, and a no-break space (U+00A0) comes before : ; ? !

## Terms

| English | French |
|---|---|
| entry | opération |
| account | compte |
| balance | solde |
| balance fix | correction de solde (short: correction) |
| spending / spent | dépenses / dépensé (one entry: dépense) |
| money in / received / income | rentrée (d’argent) / reçu / rentrées (category: Revenus) |
| transfer | virement |
| fee | frais (always plural) |
| loan / borrowed | emprunt / emprunté (à …) |
| lending / lent | prêt / prêté (à …) |
| payment / paid back / got back | remboursement / remboursé / récupéré |
| payback day / return by | retour prévu, date de retour (lending) / à rembourser le (loan) |
| due | échéance (“échéance le …”, “dû le …”) |
| written off / forgiven | abandonné / dette effacée |
| cleared | soldé |
| asset | bien (the tab: Avoirs) |
| liabilities | Dettes |
| net worth | patrimoine net |
| category | catégorie |
| payee (paid to / received from) | Payé à / Reçu de |
| archive / archived | archiver / archivé (unarchive: réafficher) |
| backup / auto backup / restore | sauvegarde / sauvegarde auto / restaurer |
| evening nudge | rappel du soir |
| balance check | point sur les soldes |
| notebook | carnet |

## Notes for reviewers

- **Loan direction.** French uses “prêt” for money the user lent (they owe the user) and “emprunt” for money the
  user borrowed (the user owes it). “Emprunter à quelqu’un” means to borrow *from* someone, so “Emprunté à {{who}}”
  and “{{amount}} emprunté à {{who}}” read as the user received the money. Please check every `loan.*` and `tx.*`
  text with this in mind. Where a sentence could be read either way, the person is named again (“S’ajoute à ce que
  vous avez prêté à {{who}} : {{who}} vous doit maintenant {{amount}}”).
- **Home buttons** “Borrow” / “Lend” are both verbs: “Emprunter” / “Prêter”.
- **Forgiven** (a loan the lender let go) is “Dette effacée”, and the action is “Marquer comme effacée” (the debt is
  understood). “Remise de dette” is the legal term; “annulé” could read as deleted. A reviewer may prefer another
  wording.
- **Written off** (a lending the user gave up on) is “Abandonné”; the store listing says “abandons de créance”.
- **Money in** is “rentrée” (Dépense / Rentrée / Virement in quick add), and the built-in category “Income” is
  “Revenus”.
- **Transfer** is “virement”, the everyday banking word, even between one’s own accounts. The save button is
  “Faire le virement”. “ATM” is “DAB” (distributeur automatique de billets), the usual abbreviation in France; Belgium
  and Canada also understand “distributeur”.
- **Payback day / return by.** For a lending (money comes back to the user): “Retour prévu · {{date}}”, “Date de
  retour”. For a loan (the user repays): “À rembourser · {{date}}”, “À rembourser le”.
- **Plurals.** French has the CLDR forms one (0 and 1), many and other. “Many” only applies to round millions
  (“1 000 000 d’opérations”), so those forms use “de/d’”; they will practically never show.
- **Colours.** “Purple” (#a646c9) is “Mauve” and “Violet” (#6a3fb5) is “Violet”, so the two stay distinct; “Teal” is
  “Bleu canard”.
- **Categories:** “Eating out” is “Restaurants”, “Study” is “Études”, “Fun” is “Loisirs”, “Shopping” is “Achats”,
  “Rent” is “Loyer”. “Mobile wallet” is “Portefeuille mobile” (francophone Africa may say “mobile money”).
- **Settings:** “Settings” is “Paramètres” (Android’s own word); the “Feel” section is “Toucher”; theme “Phone” is
  “Téléphone”. “Emblem” is “icône”.
- **“Balances confirmed”** (after confirming the morning balance check) is “Soldes confirmés”.
- **Permissions:** “Alarmes et rappels” is Android’s own French name. “Unrestricted battery” is “Batterie sans
  restriction”; the Android settings screen may say “Non limitée”, worth checking on a French phone.
