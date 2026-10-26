# Simplified Chinese (zh-Hans)

**Status: draft.** Written for Tally 1.4.2 without a native speaker; it awaits a native speaker's review (the
notes at the end list what to check first).

## Tone and address

Natural Mainland Chinese app style: short, friendly, plain words, like a well-made everyday bookkeeping app. The user
is addressed as 你 (never 您, which feels formal and distant in a casual personal tool), and only where an address
is needed; most labels leave the pronoun out, as Chinese apps do. Full-width punctuation (，。：？！“”（）), no
spaces between Chinese and numbers or amounts, a space around Latin words such as Tally, CSV and GitHub. Validation
messages start with 请 (请输入金额), the usual polite-but-light form.

The vocabulary follows common Chinese bookkeeping apps: 支出 / 收入 / 转账 for spending, money in and transfers, and
借入 / 借出 / 还款 / 收回 for loans and lendings, so a Chinese user finds the words they already know.

## Terms

| English | 简体中文 | Note |
|---|---|---|
| entry | 记录（一条记录 / 一笔） | 记一笔 for “add” |
| account | 账户 | |
| balance | 余额 | |
| balance fix | 余额校正 | the home-screen button is the shorter 修正 |
| spending / spent | 支出 / 花了、已花 | |
| money in / received / income | 收入 | one word for all three |
| transfer | 转账 | 转出 / 转入 for from / to |
| fee | 手续费 | |
| loan / borrowed | 借入 | the user received money and owes it |
| lending / lent | 借出 | the user gave money and is owed it |
| payment / paid back / got back | 还款 / 还款、还给 / 收回 | |
| payback day / return by | 还款日 / 归还期限 | |
| due | 到期 / 到期日 | 应还 for an amount due |
| written off / forgiven | 坏账（记为坏账） / 已免还（标记为免还） | |
| cleared | 已结清 | 已还清 for one paid-off draw |
| asset | 资产 | |
| liabilities | 负债 | |
| net worth | 净资产 | |
| category | 分类 | |
| payee (paid to / received from) | 收款方 / 付款方 | |
| archive / archived | 归档 / 已归档 | unarchive: 重新显示 |
| backup / auto backup / restore | 备份 / 自动备份 / 恢复 | |
| evening nudge | 晚间提醒 | |
| balance check | 余额核对 | |
| notebook | 账本 | |
| loan and lending together | 借贷 | used where English says “loan” for both kinds |
| history | 明细 | the usual word for a list of entries |
| emblem | 图标 | |

## For reviewers

- **Loan direction.** 借入 = the user borrowed (owes), 借出 = the user lent (is owed). “{{who}} owes you” is
  {{who}}欠你, “You owe {{who}}” is 你欠{{who}}. Every `loan.*`, `tx.*` and notification text was checked for this.
- **坏账 for “written off”.** Plain and widely understood, but slightly bookkeeping-flavoured; 不要了 or 放弃追回 are
  more casual alternatives.
- **已免还 for “forgiven”.** Short and clear in context; 对方已免除 is longer.
- **红包 for the money-in category “Gift”.** The everyday Mainland word for gifted money; 礼金 is more neutral.
- **买菜 for “Groceries”, 缴费 for “Bills”, 医疗 for “Health”.** Common category names in Chinese apps, chosen for
  being short under icons.
- **银行卡 and 电子钱包** for the account types Bank and Mobile wallet (Alipay, WeChat Pay and similar).
- **还款日 / 归还期限** for the lending’s payback day and the loan’s return-by date; check they read as different.
- **电池无限制** for “Unrestricted battery”: phone makers word this setting differently (无限制, 允许后台运行, …).
- **收入** is both “money in” and the built-in category “Income”, so the money-in sheet can show 收入 next to a
  category also called 收入.
