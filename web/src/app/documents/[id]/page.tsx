import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmActionButton } from "@/components/track/confirm-action";
import { Markdown } from "@/components/track/markdown";
import { Page, Panel, SplitPanels } from "@/components/track/page";
import { RelatedLinks } from "@/components/track/related-links";
import { listLinks } from "@/lib/links";
import { getDocument } from "@/lib/documents/queries";
import { shortDay, todayStr } from "@/lib/dates";
import {
  attachDocumentFileAction,
  deleteDocumentAction,
  removeDocumentFileAction,
  updateDocumentAction,
} from "../actions";
import { AttachFileForm } from "../_components/attach-file-form";
import { DocumentForm } from "../_components/document-form";
import { ExpiryChip, formatBytes } from "../_components/document-views";
import "@/styles/documents.css";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const doc = getDocument(id);
  if (!doc) notFound();
  const today = todayStr();
  const hasFile = Boolean(doc.file_key);

  return (
    <Page kicker={doc.category ?? "Document"} title={doc.title} lede={doc.tags ?? undefined}>
      <p className="docs-back">
        <Link href="/documents">← All documents</Link>
      </p>

      <section className="tk-panel docs-summary" aria-label="Summary">
        <dl className="docs-facts">
          <div>
            <dt>Issued</dt>
            <dd>{doc.issued_on ? shortDay(doc.issued_on) : "—"}</dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              {doc.expires_on ? shortDay(doc.expires_on) : "—"}{" "}
              <ExpiryChip expiresOn={doc.expires_on} today={today} />
            </dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>
              {hasFile ? (
                <>
                  <a href={`/api/documents/${doc.id}/file`} className="docs-download">
                    Download {doc.file_name ?? "file"}
                  </a>
                  <span className="docs-muted">
                    {formatBytes(doc.file_size)} · {doc.file_mime ?? "unknown type"}
                  </span>
                </>
              ) : (
                <span className="docs-muted">No file attached</span>
              )}
            </dd>
          </div>
          <div>
            <dt>SHA-256</dt>
            <dd className="docs-checksum" title={doc.checksum ?? undefined}>
              {doc.checksum ? `${doc.checksum.slice(0, 16)}…` : "—"}
            </dd>
          </div>
        </dl>
        <div className="docs-notes">
          {doc.notes ? <Markdown source={doc.notes} /> : <p className="tk-empty-small">No notes.</p>}
        </div>
      </section>

      <SplitPanels>
        <Panel title="File" description="Stored privately. Only a signed-in session can download it.">
          <div className="docs-file-actions">
            <AttachFileForm action={attachDocumentFileAction.bind(null, doc.id)} hasFile={hasFile} />
            {hasFile ? (
              <ConfirmActionButton
                label={`the file of ${doc.title}`}
                action={removeDocumentFileAction.bind(null, doc.id)}
              />
            ) : null}
          </div>
        </Panel>
        <Panel title="Details" description="Edit the details. The file is managed separately.">
          <DocumentForm
            action={updateDocumentAction.bind(null, doc.id)}
            submitLabel="Save details"
            defaults={{
              title: doc.title,
              category: doc.category ?? "Other",
              tags: doc.tags,
              issued_on: doc.issued_on,
              expires_on: doc.expires_on,
              notes: doc.notes,
            }}
          />
          <div className="docs-danger">
            <ConfirmActionButton
              label={doc.title}
              action={deleteDocumentAction.bind(null, doc.id)}
            />
            <p className="docs-muted">Deleting removes the record and its file.</p>
          </div>
        </Panel>
      </SplitPanels>

      <RelatedLinks
        type="documents"
        id={doc.id}
        links={listLinks("documents", doc.id)}
        title="Related records"
      />
    </Page>
  );
}
