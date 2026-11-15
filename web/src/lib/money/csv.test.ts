import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCsv, escapeCsvCell, transactionsCsv } from "./csv";
import { addMonthsToMonth, formatMoney, isMonth, monthRange, toPaise } from "./format";

describe("escapeCsvCell", () => {
  it("prefixes cells that a spreadsheet would read as formulas", () => {
    assert.equal(escapeCsvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
    assert.equal(escapeCsvCell("+1-800"), "'+1-800");
    assert.equal(escapeCsvCell("-5"), "'-5");
    assert.equal(escapeCsvCell("@SUM(A1)"), "'@SUM(A1)");
    assert.equal(escapeCsvCell("\tcmd"), "'\tcmd");
    assert.equal(escapeCsvCell("\rcmd"), "\"'\rcmd\"");
  });

  it("leaves ordinary text alone", () => {
    assert.equal(escapeCsvCell("Groceries"), "Groceries");
    assert.equal(escapeCsvCell(250.5), "250.5");
  });

  it("quotes cells with commas, quotes or line breaks and doubles inner quotes", () => {
    assert.equal(escapeCsvCell("lunch, with \"friends\""), "\"lunch, with \"\"friends\"\"\"");
    assert.equal(escapeCsvCell("line one\nline two"), "\"line one\nline two\"");
  });

  it("writes null and undefined as empty cells", () => {
    assert.equal(escapeCsvCell(null), "");
    assert.equal(escapeCsvCell(undefined), "");
  });
});

describe("buildCsv", () => {
  it("uses CRLF line endings and ends with one", () => {
    assert.equal(buildCsv(["a", "b"], [[1, "x"]]), "a,b\r\n1,x\r\n");
  });
});

describe("transactionsCsv", () => {
  it("writes amounts with two decimals from integer paise, and project names", () => {
    const csv = transactionsCsv([
      { date: "2026-11-02", kind: "Income", amount: 1000.1, category: "Allowance", note: "Monthly", project: null },
      { date: "2026-11-05", kind: "Income", amount: 0.1 + 0.2, category: "Project", note: "Invoice, part 1", project: "TableTap" },
    ]);
    assert.equal(
      csv,
      [
        "date,type,amount_inr,category,note,project",
        "2026-11-02,Income,1000.10,Allowance,Monthly,",
        "2026-11-05,Income,0.30,Project,\"Invoice, part 1\",TableTap",
        "",
      ].join("\r\n"),
    );
  });

  it("neutralises a note that starts with a formula", () => {
    const csv = transactionsCsv([
      { date: "2026-11-02", kind: "Expense", amount: 10, category: "Other", note: "=cmd|' /C calc'!A0", project: null },
    ]);
    assert.ok(csv.includes("'=cmd|' /C calc'!A0"), csv);
  });
});

describe("money format helpers", () => {
  it("converts to paise without float drift", () => {
    assert.equal(toPaise(0.1 * 3), 30);
    assert.equal(toPaise(19.99), 1999);
    assert.equal(toPaise(0.29), 29);
  });

  it("validates months and computes their ranges", () => {
    assert.equal(isMonth("2026-11"), true);
    assert.equal(isMonth("2026-13"), false);
    assert.equal(isMonth("2026-1"), false);
    assert.equal(isMonth("2026-11-01"), false);
    assert.deepEqual(monthRange("2026-02"), { start: "2026-02-01", end: "2026-03-01" });
    assert.deepEqual(monthRange("2026-12"), { start: "2026-12-01", end: "2027-01-01" });
    assert.throws(() => monthRange("2026-99"));
  });

  it("steps months across year boundaries", () => {
    assert.equal(addMonthsToMonth("2026-12", 1), "2027-01");
    assert.equal(addMonthsToMonth("2027-01", -1), "2026-12");
  });

  it("formats rupees with Indian digit grouping", () => {
    assert.equal(formatMoney(123456.5), "₹1,23,456.50");
    assert.equal(formatMoney(123456, { paise: true }), "₹1,234.56");
  });
});
