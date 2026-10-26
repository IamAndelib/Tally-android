# Türkçe (tr)

**Status: draft.** Written for Tally 1.4.2 without a native speaker; it awaits a native speaker's review (the
notes at the end list what to check first).

## Tone and address

Tally speaks to the user with the informal “sen” (*ekle*, *seç*, *harcadın*, *borcun var*), as everyday Turkish apps
do (wallet and banking apps and the phone's own settings use it). It fits a personal pocket notebook: friendly, short and calm. Questions to the user are mostly written as polite
passives (*Bu hesap silinsin mi?*), the usual Turkish way to ask for a confirmation without sounding stiff.

Names, accounts and amounts are never followed directly by a case suffix, because the right ending depends on the
value (*Ali’ye* / *Ayşe’ye* / *Can’a*). The texts use a colon (*Borç verdin: {{who}}*), a neutral word that takes
the suffix instead (*{{account}} hesabından*, *{{cur}} hesabı*, *{{date}} tarihli*), or word order that needs none
(*{{who}} sana {{amount}} borçlu*).

## Terms

| English | Türkçe |
|---|---|
| entry | kayıt |
| account | hesap |
| balance | bakiye |
| balance fix | bakiye düzeltme(si) |
| spending / spent | harcama / harcandı, harcadın |
| money in / received / income | gelen para / gelen / gelir |
| transfer | transfer (verb: aktar, transfer et) |
| fee | masraf |
| loan / borrowed | borç / borç aldın (Liabilities list: *Aldığın borçlar*) |
| lending / lent | alacak / borç verdin (Assets list: *Alacakların*) |
| payment / paid back / got back | ödeme / geri ödedin / geri aldın |
| payback day / return by | geri ödeme günü (lending) / son ödeme günü (loan) |
| due | vade (*Vade yok*, *Vadeyi değiştir*) |
| written off / forgiven | vazgeçildi (*Kalanından vazgeç*) / affedildi (*Affedildi say*) |
| cleared | kapandı (*borç kapandı*, *alacak kapandı*) |
| asset | varlık |
| liabilities | borçlar |
| net worth | net varlık |
| category | kategori |
| archive / archived | arşivle / arşivde, arşivlendi |
| backup / auto backup / restore | yedek / otomatik yedek / geri yükle |
| evening nudge | akşam hatırlatması |
| balance check | bakiye kontrolü |
| notebook | defter |

Loan direction: *{{who}} sana {{amount}} borçlu* = they owe the user; *{{who}}: {{amount}} borcun var* = the user owes
them. *Borç* is always what the user owes, *alacak* always what is owed to the user.

## For reviewers

- **Borç / alacak**: using *alacak* for a lending keeps the two directions apart in short labels (*Alacağı kaydet*,
  *Borcu sil*). Check it reads naturally to everyday users, not like accounting.
- **“You owe {{who}}”** is written *{{who}}: {{amount}} borcun var* (also in the notification *%1$s: %2$s borcun
  var*) to avoid a dative suffix on the name. A smoother wording without a suffix would be welcome.
- **Written off / forgiven**: *Vazgeçildi* (the user gave up on a lending) and *Affedildi* (the lender let a loan
  go). *Helal edildi* is more idiomatic for the second but carries a religious tone; check which feels right.
- **Payback day / return by**: *Geri ödeme günü* for lendings, *Son ödeme günü* for loans, so the two stay distinct.
- **Fee → masraf** (*ATM masrafı*, *transfer masrafı*); *ücret* or *komisyon* are also common.
- **Transfer** is kept as is; *havale* would suggest a bank-to-bank wire only.
- **cat.food → Yeme-içme** (as in bank spending reports) instead of the longer *Dışarıda yemek*.
- **Since {{date}}** is *{{date}} itibarıyla*, which works with “Bugün” and with dates.
- **Feel / strength** (vibration settings): *Dokunuş* / *Şiddet*.
- **Teal** is *Petrol mavisi*; colour names are only read by screen readers.
