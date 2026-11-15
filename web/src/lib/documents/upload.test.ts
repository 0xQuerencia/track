import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readUpload } from "./read-upload";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  checkUploadContent,
  checkUploadMeta,
  contentDisposition,
  extensionOf,
  sanitizeDisplayName,
} from "./upload";

const enc = (text: string) => new TextEncoder().encode(text);
const bytesOf = (...values: number[]) => new Uint8Array(values);
const PDF = enc("%PDF-1.7\n%test\n");
const PNG = bytesOf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0);
const JPG = bytesOf(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const WEBP = enc("RIFF\u0010\u0000\u0000\u0000WEBPVP8 ");
const ZIP = bytesOf(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);

const typeFor = (extension: string) => {
  const found = ALLOWED_TYPES.find((t) => t.extension === extension);
  assert.ok(found, `no allowed type for ${extension}`);
  return found;
};

describe("upload metadata checks", () => {
  it("accepts each allowed extension with an empty or generic declared type", () => {
    for (const name of ["a.pdf", "a.PNG", "a.jpg", "a.jpeg", "a.webp", "a.txt", "a.md", "a.docx"]) {
      const result = checkUploadMeta({ name, declaredType: "", size: 10 });
      assert.equal(result.ok, true, name);
      const generic = checkUploadMeta({ name, declaredType: "application/octet-stream", size: 10 });
      assert.equal(generic.ok, true, `${name} with octet-stream`);
    }
  });

  it("rejects executable and script extensions, double extensions and names with no extension", () => {
    for (const name of ["setup.exe", "run.sh", "page.html", "invoice.pdf.exe", "README", ".pdf"]) {
      const result = checkUploadMeta({ name, declaredType: "", size: 10 });
      assert.equal(result.ok, false, name);
    }
  });

  it("rejects a declared type that disagrees with the extension", () => {
    const result = checkUploadMeta({ name: "scan.pdf", declaredType: "image/png", size: 10 });
    assert.equal(result.ok, false);
  });

  it("rejects empty files and anything over the 10 MB limit", () => {
    assert.equal(checkUploadMeta({ name: "a.pdf", declaredType: "", size: 0 }).ok, false);
    assert.equal(checkUploadMeta({ name: "a.pdf", declaredType: "", size: MAX_UPLOAD_BYTES }).ok, true);
    const over = checkUploadMeta({ name: "a.pdf", declaredType: "", size: MAX_UPLOAD_BYTES + 1 });
    assert.equal(over.ok, false);
    assert.equal(over.ok === false && over.error, "Files must be 10 MB or smaller.");
  });

  it("returns a sanitised display name and the matching type", () => {
    const result = checkUploadMeta({ name: "Passport scan.PDF", declaredType: "", size: 5 });
    assert.ok(result.ok);
    assert.equal(result.displayName, "Passport scan.PDF");
    assert.equal(result.type.mime, "application/pdf");
  });
});

describe("upload content checks", () => {
  it("accepts bytes that match each binary magic number", () => {
    assert.deepEqual(checkUploadContent(typeFor("pdf"), PDF), { ok: true });
    assert.deepEqual(checkUploadContent(typeFor("png"), PNG), { ok: true });
    assert.deepEqual(checkUploadContent(typeFor("jpg"), JPG), { ok: true });
    assert.deepEqual(checkUploadContent(typeFor("webp"), WEBP), { ok: true });
    assert.deepEqual(checkUploadContent(typeFor("docx"), ZIP), { ok: true });
  });

  it("rejects a file whose bytes do not match its claimed type", () => {
    const text = enc("hello, not a pdf");
    assert.equal(checkUploadContent(typeFor("pdf"), text).ok, false);
    assert.equal(checkUploadContent(typeFor("png"), PDF).ok, false);
    assert.equal(checkUploadContent(typeFor("jpg"), PNG).ok, false);
    assert.equal(checkUploadContent(typeFor("webp"), enc("RIFF....WAVE")).ok, false);
    assert.equal(checkUploadContent(typeFor("docx"), PDF).ok, false);
  });

  it("rejects a PHP or HTML payload renamed to an image", () => {
    const script = enc("<?php system($_GET['c']); ?>");
    assert.equal(checkUploadContent(typeFor("png"), script).ok, false);
    assert.equal(checkUploadContent(typeFor("jpg"), script).ok, false);
  });

  it("accepts UTF-8 text and rejects NUL bytes or invalid UTF-8 in text types", () => {
    assert.deepEqual(checkUploadContent(typeFor("txt"), enc("café notes")), { ok: true });
    assert.deepEqual(checkUploadContent(typeFor("md"), enc("# Heading")), { ok: true });
    assert.equal(checkUploadContent(typeFor("txt"), bytesOf(0x61, 0x00, 0x62)).ok, false);
    assert.equal(checkUploadContent(typeFor("md"), bytesOf(0xc3, 0x28)).ok, false);
  });

  it("rejects empty content", () => {
    assert.equal(checkUploadContent(typeFor("txt"), new Uint8Array()).ok, false);
  });
});

describe("display names and headers", () => {
  it("keeps only the last path segment, so traversal attempts become plain names", () => {
    assert.equal(sanitizeDisplayName("../../etc/passwd.pdf"), "passwd.pdf");
    assert.equal(sanitizeDisplayName("..\\..\\windows\\evil.pdf"), "evil.pdf");
    assert.equal(sanitizeDisplayName("/abs/path/report.pdf"), "report.pdf");
  });

  it("strips control characters and header-breaking punctuation", () => {
    const cleaned = sanitizeDisplayName('bad\r\nname"<>|:*?.pdf');
    assert.equal(/[\r\n"<>|:*?]/.test(cleaned), false);
    assert.equal(cleaned.endsWith(".pdf"), true);
  });

  it("bounds the length and falls back to a default for an empty name", () => {
    assert.ok(sanitizeDisplayName("a".repeat(500)).length <= 120);
    assert.equal(sanitizeDisplayName("...."), "document");
    assert.equal(extensionOf("../x/Report.DOCX"), "docx");
    assert.equal(extensionOf("noext"), "");
  });

  it("builds a Content-Disposition attachment that cannot break the header", () => {
    const header = contentDisposition('résumé\r\nSet-Cookie: x=1 "q".pdf');
    assert.ok(header.startsWith("attachment; filename=\""));
    assert.equal(/[\r\n]/.test(header), false);
    assert.ok(header.includes("filename*=UTF-8''"));
    assert.ok(header.includes(encodeURIComponent("résumé")));
  });
});

describe("readUpload", () => {
  it("returns null when no file was chosen", async () => {
    assert.equal(await readUpload(null), null);
    assert.equal(await readUpload("just text"), null);
    assert.equal(await readUpload(new File([], "")), null);
  });

  it("reads a valid file into a sanitised, typed upload", async () => {
    const file = new File([PDF], "../../scan.pdf", { type: "" });
    const result = await readUpload(file);
    assert.ok(result?.ok);
    assert.equal(result.file.displayName, "scan.pdf");
    assert.equal(result.file.mime, "application/pdf");
    assert.equal(result.file.bytes.byteLength, PDF.byteLength);
  });

  it("refuses a file with the wrong bytes, without returning them", async () => {
    const file = new File([enc("<html>")], "photo.png", { type: "image/png" });
    const result = await readUpload(file);
    assert.ok(result && !result.ok);
    assert.equal(result.error, "The file contents do not match its type.");
  });

  it("refuses an empty file that has a name", async () => {
    const result = await readUpload(new File([], "empty.txt", { type: "text/plain" }));
    assert.ok(result && !result.ok);
  });
});
