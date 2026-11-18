# Techcombank Business fixtures: SYNTHETIC

These files are **synthetic**. They are not bank exports, and every name,
account number and transfer in them is made up: none belongs to a real
person, company or account.

| File                          | What it is                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `synthetic.ts`                | The source: rows, header block and the two file builders                        |
| `tcb-business-synthetic.xlsx` | XLSX built from it: native numbers and date cells, newest row first             |
| `tcb-business-synthetic.csv`  | CSV built from it: UTF-8 with a byte order mark, text amounts, oldest row first |

The layout follows Techcombank's public guides (the "Tải sao kê" header
block and the monthly statement's columns; see
`docs/research/bank-statements.md`, section 6.2). The table header of the
real CSV/XLSX export is **unconfirmed**: no public source shows it.

The rows cover every case of research section 7.1:

- an incoming transfer from the same bank;
- an incoming NAPAS transfer from another bank;
- an incoming VietQR transfer with the test code `GIVETEST01`;
- two incoming transfers on the same day with the same amount and content;
- an outgoing transfer, with its fee and VAT;
- a fee row added by the bank;
- content with Vietnamese diacritics;
- content longer than 100 characters.

`../index.test.ts` checks that both files still match `synthetic.ts`. To
rebuild them after changing it:

```bash
UPDATE_FIXTURES=1 pnpm --filter @give/web exec vitest run src/server/statement-parsers/techcombank-business
```

When JOY's anonymized samples from the Techcombank Business account arrive
(research section 7), they replace these files, and the parser's header
labels and flags are settled from them. Never commit a raw statement:
anonymize it first, following research section 7.
